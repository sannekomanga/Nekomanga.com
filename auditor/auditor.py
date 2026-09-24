#!/usr/bin/env python3
"""
Auditor Automático v2
Auditoría de solo lectura con:
- Escaneo de secretos (gitleaks + heurísticas)
- Redacción de secretos antes de enviar a LLM
- Priorización de archivos críticos
- Análisis de diff en Pull Requests
- Historial de auditorías
- Métricas
- Configuración externa (YAML + env)
"""

from __future__ import annotations

import fnmatch
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

ROOT = Path(".")
REPORT = ROOT / "AUDITORIA.md"
CONFIG_PATH = ROOT / "auditor" / "config.yaml"
PR_SUMMARY_PATH = ROOT / "auditor" / "pr_summary.md"

DEFAULT_CONFIG: dict[str, Any] = {
    "model": "gpt-4o",
    "max_tokens": 8000,
    "max_input_chars": 120000,
    "provider": "openai",
    "ignored_dirs": {
        ".git", ".github", "node_modules", "vendor", "dist", "build",
        ".next", ".cache", "__pycache__", ".venv", "venv", "coverage",
        ".turbo", ".nuxt",
    },
    "text_extensions": {
        ".html", ".htm", ".css", ".scss", ".js", ".mjs", ".cjs", ".ts", ".tsx",
        ".jsx", ".json", ".md", ".yml", ".yaml", ".toml", ".ini", ".env.example",
        ".sql", ".py", ".php", ".java", ".kt", ".go", ".rs", ".txt", ".sh",
        ".bash", ".dockerfile",
    },
    "critical_patterns": [
        "**/auth*", "**/login*", "**/supabase*", "**/*rls*", "**/*policy*",
        "**/middleware*", "**/security*", "package.json", "package-lock.json",
        "pnpm-lock.yaml", "yarn.lock", "requirements.txt", "pyproject.toml",
        "Cargo.toml", "go.mod", ".env.example", "**/Dockerfile*",
        "**/docker-compose*", "**/*secret*", "**/*credential*", "**/config*",
    ],
    "max_file_bytes": 150_000,
    "max_total_bytes": 1_800_000,
    "max_critical_file_bytes": 300_000,
    "history_keep": 5,
    "enable_gitleaks": True,
    "enable_local_heuristics": True,
}


def load_config() -> dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists() and yaml is not None:
        try:
            with CONFIG_PATH.open(encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            for k, v in data.items():
                if k in ("ignored_dirs", "text_extensions") and isinstance(v, list):
                    cfg[k] = set(v)
                else:
                    cfg[k] = v
        except Exception as e:
            print(f"[warn] No se pudo cargar config.yaml: {e}", file=sys.stderr)

    # Overrides por entorno
    if os.getenv("AUDITOR_MODEL"):
        cfg["model"] = os.getenv("AUDITOR_MODEL")
    if os.getenv("AUDITOR_MAX_TOKENS"):
        cfg["max_tokens"] = int(os.getenv("AUDITOR_MAX_TOKENS", "8000"))
    if os.getenv("AUDITOR_MAX_INPUT_CHARS"):
        cfg["max_input_chars"] = int(os.getenv("AUDITOR_MAX_INPUT_CHARS", "120000"))
    if os.getenv("AUDITOR_PROVIDER"):
        cfg["provider"] = os.getenv("AUDITOR_PROVIDER")
    if os.getenv("AUDITOR_ENABLE_GITLEAKS"):
        cfg["enable_gitleaks"] = os.getenv("AUDITOR_ENABLE_GITLEAKS", "true").lower() in ("1", "true", "yes")
    return cfg


CFG = load_config()

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def run(cmd: list[str], timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=timeout)


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def is_ignored(path: Path) -> bool:
    return any(part in CFG["ignored_dirs"] for part in path.parts)


def is_critical(path: str) -> bool:
    for pat in CFG["critical_patterns"]:
        if fnmatch.fnmatch(path, pat) or fnmatch.fnmatch(Path(path).name, pat):
            return True
    return False


# ---------------------------------------------------------------------------
# Recolección de archivos
# ---------------------------------------------------------------------------

def collect_files(only_paths: set[str] | None = None) -> list[tuple[str, str, bool]]:
    """
    Devuelve lista de (ruta, contenido, es_crítico).
    Si only_paths está definido (modo PR), solo se incluyen esas rutas.
    """
    items: list[tuple[str, str, bool]] = []
    total = 0
    critical_budget = CFG["max_critical_file_bytes"]

    candidates: list[Path] = []
    for p in ROOT.rglob("*"):
        if not p.is_file():
            continue
        if is_ignored(p):
            continue
        if p.name == "AUDITORIA.md" or p.name == "pr_summary.md":
            continue
        if p.suffix.lower() not in CFG["text_extensions"] and p.name.lower() not in ("dockerfile", "makefile"):
            continue
        rel = str(p).replace("\\", "/")
        if only_paths is not None and rel not in only_paths:
            continue
        candidates.append(p)

    # Priorizar críticos primero
    candidates.sort(key=lambda p: (0 if is_critical(str(p).replace("\\", "/")) else 1, str(p)))

    for p in candidates:
        rel = str(p).replace("\\", "/")
        crit = is_critical(rel)
        try:
            size = p.stat().st_size
            limit = CFG["max_critical_file_bytes"] if crit else CFG["max_file_bytes"]
            if size > limit:
                continue
            if total + size > CFG["max_total_bytes"]:
                if not crit:
                    continue
                if total + size > critical_budget + CFG["max_total_bytes"]:
                    continue
            data = p.read_text(encoding="utf-8", errors="replace")
            items.append((rel, data, crit))
            total += size
        except Exception:
            pass

    return items


def get_changed_files() -> set[str] | None:
    """En PRs devuelve el set de archivos modificados respecto a base. Si no es PR, None."""
    event = os.getenv("GITHUB_EVENT_NAME", "")
    if event != "pull_request":
        return None

    base = os.getenv("GITHUB_BASE_REF") or "main"
    # Intentar diff contra origen/base
    for cmd in (
        ["git", "diff", "--name-only", f"origin/{base}...HEAD"],
        ["git", "diff", "--name-only", f"{base}...HEAD"],
        ["git", "diff", "--name-only", "HEAD~1"],
    ):
        r = run(cmd)
        if r.returncode == 0 and r.stdout.strip():
            files = {line.strip().replace("\\", "/") for line in r.stdout.splitlines() if line.strip()}
            if files:
                print(f"[info] Modo PR: {len(files)} archivos cambiados")
                return files
    print("[warn] No se pudo obtener lista de archivos del PR; se analiza todo el repo")
    return None


# ---------------------------------------------------------------------------
# Redacción de secretos
# ---------------------------------------------------------------------------

SECRET_PATTERNS = [
    # Private keys
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----", re.DOTALL | re.IGNORECASE),
     "[REDACTED PRIVATE KEY]"),
    # JWT-like
    (re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
     "[REDACTED JWT]"),
    # AWS
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED AWS_ACCESS_KEY]"),
    (re.compile(r"(?i)(aws_secret_access_key|secret_access_key)\s*[=:]\s*['\"]?[A-Za-z0-9/+=]{30,}['\"]?"),
     r"\1=[REDACTED]"),
    # Generic API keys / tokens
    (re.compile(r"(?i)(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret[_-]?key|client[_-]?secret|private[_-]?key|service[_-]?role)\s*[=:]\s*['\"][^'\"]{8,}['\"]"),
     r"\1=[REDACTED]"),
    (re.compile(r"(?i)(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret[_-]?key|client[_-]?secret)\s*[=:]\s*[A-Za-z0-9_\-]{16,}"),
     r"\1=[REDACTED]"),
    # Bearer
    (re.compile(r"(?i)bearer\s+[A-Za-z0-9\-._~+/]+=*"), "Bearer [REDACTED]"),
    # Connection strings with passwords
    (re.compile(r"(?i)(postgres|mysql|mongodb|redis)://[^:]+:[^@\s]+@"),
     r"\1://[REDACTED]@"),
    # Generic password assignments
    (re.compile(r"(?i)(password|passwd|pwd)\s*[=:]\s*['\"][^'\"]{4,}['\"]"),
     r"\1=[REDACTED]"),
]


def redact_secrets(text: str) -> str:
    for pattern, repl in SECRET_PATTERNS:
        text = pattern.sub(repl, text)
    return text


# ---------------------------------------------------------------------------
# Escaneos locales
# ---------------------------------------------------------------------------

def run_gitleaks() -> list[dict]:
    findings: list[dict] = []
    if not CFG.get("enable_gitleaks", True):
        return findings

    # Buscar binario gitleaks
    gitleaks = None
    for candidate in ("gitleaks", "/usr/local/bin/gitleaks", "./gitleaks"):
        r = run(["which", candidate] if candidate == "gitleaks" else ["test", "-x", candidate])
        if candidate == "gitleaks" and r.returncode == 0:
            gitleaks = "gitleaks"
            break
        if candidate != "gitleaks" and r.returncode == 0:
            gitleaks = candidate
            break

    if not gitleaks:
        # Intentar descarga rápida (el workflow normalmente lo instala)
        print("[info] gitleaks no encontrado en PATH; se omite escaneo gitleaks")
        return findings

    out_file = Path("/tmp/gitleaks-report.json")
    cmd = [
        gitleaks, "detect",
        "--source", ".",
        "--report-format", "json",
        "--report-path", str(out_file),
        "--no-git",  # más simple y evita problemas de historial
        "--exit-code", "0",
    ]
    r = run(cmd, timeout=180)
    if out_file.exists():
        try:
            data = json.loads(out_file.read_text(encoding="utf-8") or "[]")
            if isinstance(data, list):
                for item in data:
                    findings.append({
                        "tool": "gitleaks",
                        "severity": "CRÍTICO",
                        "file": item.get("File") or item.get("file") or "?",
                        "rule": item.get("RuleID") or item.get("Description") or "secret",
                        "match": (item.get("Match") or item.get("Secret") or "")[:80],
                        "line": item.get("StartLine") or item.get("line"),
                    })
        except Exception as e:
            print(f"[warn] Error parseando gitleaks: {e}", file=sys.stderr)
    else:
        print(f"[info] gitleaks exit={r.returncode} stderr={r.stderr[:200] if r.stderr else ''}")
    return findings


def local_heuristics(files: list[tuple[str, str, bool]]) -> list[dict]:
    findings: list[dict] = []
    if not CFG.get("enable_local_heuristics", True):
        return findings

    patterns = [
        (re.compile(r"service_role|supabase_service_role", re.I), "MEDIO", "Posible referencia a service_role de Supabase"),
        (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", re.I), "CRÍTICO", "Posible clave privada embebida"),
        (re.compile(r"(?i)(password|passwd)\s*=\s*['\"][^'\"]{4,}['\"]"), "ALTO", "Posible contraseña hardcodeada"),
        (re.compile(r"(?i)(api[_-]?key|secret[_-]?key)\s*=\s*['\"][^'\"]{8,}['\"]"), "ALTO", "Posible API key / secret hardcodeado"),
        (re.compile(r"(?i)(sk-[A-Za-z0-9]{20,}|sk_live_|sk_test_)"), "CRÍTICO", "Posible clave de API de proveedor de pagos/LLM"),
        (re.compile(r"(?i)AKIA[0-9A-Z]{16}"), "CRÍTICO", "Posible AWS Access Key ID"),
        (re.compile(r"(?i)(xox[baprs]-|ghp_|gho_|github_pat_)"), "CRÍTICO", "Posible token de Slack/GitHub"),
    ]

    for path, text, _ in files:
        # Evitar .env.example y archivos de documentación de ejemplo
        if "example" in path.lower() or path.endswith(".md"):
            continue
        for rx, sev, msg in patterns:
            if rx.search(text):
                findings.append({
                    "tool": "heuristics",
                    "severity": sev,
                    "file": path,
                    "rule": msg,
                    "match": "",
                    "line": None,
                })
    return findings


# ---------------------------------------------------------------------------
# Snapshot para LLM (con redacción y priorización)
# ---------------------------------------------------------------------------

def build_snapshot(files: list[tuple[str, str, bool]], max_chars: int) -> str:
    # Primero críticos, luego el resto
    critical = [(p, c) for p, c, crit in files if crit]
    normal = [(p, c) for p, c, crit in files if not crit]

    chunks: list[str] = []
    used = 0

    def add(path: str, content: str, label: str = "") -> bool:
        nonlocal used
        redacted = redact_secrets(content)
        header = f"\n===== FILE: {path} {label}=====\n"
        block = header + redacted
        if used + len(block) > max_chars:
            # Truncar contenido si es necesario
            remaining = max_chars - used - len(header) - 50
            if remaining < 200:
                return False
            block = header + redacted[:remaining] + "\n...[TRUNCATED]...\n"
        chunks.append(block)
        used += len(block)
        return True

    for path, content in critical:
        if not add(path, content, "[CRÍTICO] "):
            break
    for path, content in normal:
        if not add(path, content):
            break

    return "".join(chunks)


# ---------------------------------------------------------------------------
# Informes
# ---------------------------------------------------------------------------

def extract_history(existing: str, keep: int) -> str:
    """Conserva las últimas secciones de historial."""
    marker = "## Historial"
    if marker not in existing:
        return ""
    idx = existing.find(marker)
    hist = existing[idx:]
    # Dividir por ### fechas
    parts = re.split(r"(?=### \d{4}-\d{2}-\d{2})", hist)
    header = parts[0] if parts else marker + "\n"
    entries = [p for p in parts[1:] if p.strip()]
    kept = entries[-keep:] if keep > 0 else []
    return header + "".join(kept)


def fallback_report(
    files: list[tuple[str, str, bool]],
    local_findings: list[dict],
    reason: str,
    metrics: dict,
    is_pr: bool,
) -> str:
    now = now_utc()
    rows = []
    for i, f in enumerate(local_findings, 1):
        match = (f.get("match") or "")[:40].replace("|", "/")
        rows.append(
            f"| AUD-{i:03d} | {f['severity']} | {f['file']} | {f['rule']} {match} | PENDIENTE |"
        )
    if not rows:
        rows.append("| — | — | — | No se detectaron indicadores básicos. | INFORMATIVO |")

    mode = "Pull Request (solo cambios)" if is_pr else "Repositorio completo"
    return f"""# AUDITORÍA DEL REPOSITORIO

**Fecha:** {now}  
**Auditor:** Auditor Automático v2  
**Modo:** Solo lectura — {mode}  
**Estado:** COMPLETADA CON LIMITACIONES

## Resumen

La revisión local se ejecutó correctamente. El análisis de IA no pudo completarse: `{reason}`

## Métricas

| Métrica | Valor |
|---------|-------|
| Archivos analizados | {metrics.get('files', 0)} |
| Archivos críticos | {metrics.get('critical', 0)} |
| Bytes leídos | {metrics.get('bytes', 0):,} |
| Hallazgos locales | {len(local_findings)} |
| Duración | {metrics.get('duration_s', 0):.1f}s |
| Evento | {metrics.get('event', 'local')} |

## Hallazgos preliminares (herramientas locales)

| ID | Severidad | Archivo | Hallazgo | Estado |
|---|---|---|---|---|
{chr(10).join(rows)}

## Recomendaciones

- Revisar manualmente los indicadores anteriores.
- Configurar `OPENAI_API_KEY` en GitHub Actions Secrets para activar el análisis de IA.
- No colocar claves privadas ni tokens directamente en el repositorio.
- Ejecutar `gitleaks detect` localmente de forma periódica.

## Regla del auditor

Este proceso **informa** sobre hallazgos y **no modifica** el código del proyecto (solo actualiza `AUDITORIA.md`).
"""


def ai_report(
    files: list[tuple[str, str, bool]],
    local_findings: list[dict],
    metrics: dict,
    is_pr: bool,
) -> tuple[str, dict]:
    """Devuelve (markdown_informe, extra_metrics)."""
    from openai import OpenAI

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("No existe el secreto OPENAI_API_KEY.")

    base_url = os.getenv("OPENAI_BASE_URL")  # para proveedores compatibles
    client_kwargs: dict[str, Any] = {"api_key": api_key}
    if base_url:
        client_kwargs["base_url"] = base_url

    client = OpenAI(**client_kwargs)

    snapshot = build_snapshot(files, CFG["max_input_chars"])
    mode = "Pull Request (solo archivos cambiados)" if is_pr else "repositorio completo"

    local_json = json.dumps(local_findings, ensure_ascii=False, indent=2)[:8000]

    prompt = f"""Eres un auditor de software defensivo experto en seguridad de aplicaciones web, autenticación, Supabase, RLS, frontend y secretos.

Analiza el contenido proporcionado del {mode}.

REGLAS ESTRICTAS:
- Solo analiza; NO propongas ejecutar cambios automáticamente.
- No inventes archivos ni vulnerabilidades.
- Distingue claramente evidencia de sospechas.
- Usa severidades: CRÍTICO, ALTO, MEDIO, BAJO, INFORMATIVO.
- Presta especial atención a: autenticación, autorización, Supabase/RLS, secretos, CORS, headers de seguridad, inyección, control de acceso, almacenamiento de tokens y configuración de producción.
- Devuelve Markdown válido y bien estructurado.
- Incluye una tabla de hallazgos con columnas: ID, Severidad, Archivo, Evidencia, Explicación, Estado.
- Si no hay evidencia suficiente, dilo claramente.
- Los secretos ya han sido redactados como [REDACTED ...]; no intentes recuperarlos.

Hallazgos detectados por herramientas locales (gitleaks + heurísticas):
```json
{local_json}
```

Contenido del repositorio (secretos redactados):
{snapshot}
"""

    model = CFG["model"]
    max_tokens = CFG["max_tokens"]

    # Responses API (preferida)
    try:
        response = client.responses.create(
            model=model,
            input=prompt,
            max_output_tokens=max_tokens,
        )
        text = (response.output_text or "").strip()
        usage = {}
        if hasattr(response, "usage") and response.usage:
            usage = {
                "input_tokens": getattr(response.usage, "input_tokens", None),
                "output_tokens": getattr(response.usage, "output_tokens", None),
            }
    except Exception:
        # Fallback a Chat Completions
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Eres un auditor de software defensivo. Responde solo en Markdown válido."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=max_tokens,
        )
        text = (response.choices[0].message.content or "").strip()
        usage = {}
        if response.usage:
            usage = {
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens,
            }

    now = now_utc()
    extra = {"tokens": usage}

    report = f"""# AUDITORÍA DEL REPOSITORIO

**Fecha:** {now}  
**Auditor:** Auditor Automático v2  
**Modelo:** {model}  
**Modo:** Solo lectura — {mode}  
**Estado:** COMPLETADA

## Métricas

| Métrica | Valor |
|---------|-------|
| Archivos analizados | {metrics.get('files', 0)} |
| Archivos críticos | {metrics.get('critical', 0)} |
| Bytes leídos | {metrics.get('bytes', 0):,} |
| Hallazgos locales | {len(local_findings)} |
| Tokens entrada (aprox.) | {usage.get('input_tokens', '—')} |
| Tokens salida (aprox.) | {usage.get('output_tokens', '—')} |
| Duración | {metrics.get('duration_s', 0):.1f}s |
| Evento | {metrics.get('event', 'local')} |

{text}

---

## Regla del auditor

Este proceso **informa** sobre hallazgos y **no modifica** el código del proyecto (solo actualiza `AUDITORIA.md`).
"""
    return report, extra


def build_pr_summary(report: str, local_findings: list[dict], metrics: dict) -> str:
    """Resumen corto para comentar en el PR."""
    crit = sum(1 for f in local_findings if f.get("severity") == "CRÍTICO")
    high = sum(1 for f in local_findings if f.get("severity") == "ALTO")
    total_local = len(local_findings)

    status = "✅ Sin hallazgos críticos locales"
    if crit:
        status = f"🚨 {crit} hallazgo(s) CRÍTICO(s) detectado(s)"
    elif high:
        status = f"⚠️ {high} hallazgo(s) de severidad ALTA"

    # Extraer tabla de hallazgos del informe si existe
    table_match = re.search(r"\| ID \|.*?\n\|[-\s|]+\n(.*?)(?=\n\n|\n## |\Z)", report, re.DOTALL)
    table = ""
    if table_match:
        rows = table_match.group(1).strip().splitlines()[:8]
        if rows:
            table = "\n| ID | Severidad | Archivo | Hallazgo | Estado |\n|---|---|---|---|---|\n" + "\n".join(rows)

    return f"""## 🔍 Auditoría automática (PR)

**{status}**

| Métrica | Valor |
|---------|-------|
| Archivos cambiados analizados | {metrics.get('files', 0)} |
| Hallazgos locales | {total_local} |
| Duración | {metrics.get('duration_s', 0):.1f}s |

{table}

> Informe completo disponible en `AUDITORIA.md` (se actualiza en la rama por defecto).
> Este auditor es de **solo lectura** y no modifica el código.
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    start = time.time()
    event = os.getenv("GITHUB_EVENT_NAME", "local")
    is_pr = event == "pull_request"

    only_paths = get_changed_files()
    files = collect_files(only_paths)

    local_findings: list[dict] = []
    local_findings.extend(run_gitleaks())
    local_findings.extend(local_heuristics(files))

    # Deduplicar por archivo+regla
    seen = set()
    unique_findings = []
    for f in local_findings:
        key = (f.get("file"), f.get("rule"))
        if key not in seen:
            seen.add(key)
            unique_findings.append(f)
    local_findings = unique_findings

    metrics = {
        "files": len(files),
        "critical": sum(1 for _, _, c in files if c),
        "bytes": sum(len(c.encode("utf-8", errors="replace")) for _, c, _ in files),
        "event": event,
        "duration_s": 0.0,
    }

    try:
        report, extra = ai_report(files, local_findings, metrics, is_pr)
        metrics.update(extra.get("tokens") or {})
    except Exception as exc:
        report = fallback_report(files, local_findings, str(exc), metrics, is_pr)

    metrics["duration_s"] = time.time() - start

    # Historial: conservar entradas anteriores
    history = ""
    if REPORT.exists():
        try:
            history = extract_history(REPORT.read_text(encoding="utf-8"), CFG.get("history_keep", 5))
        except Exception:
            pass

    if history:
        # Añadir entrada nueva al historial
        summary_line = f"- Archivos: {metrics['files']} | Hallazgos locales: {len(local_findings)} | Evento: {event}"
        new_entry = f"\n### {now_utc()}\n{summary_line}\n"
        if "## Historial" in report:
            report = report.rstrip() + "\n" + new_entry
        else:
            report = report.rstrip() + "\n\n## Historial\n" + new_entry
        # Reemplazar historial completo por el conservado + nuevo
        if "## Historial" in report:
            pre, _, _ = report.partition("## Historial")
            report = pre + history
            if new_entry.strip() not in report:
                report = report.rstrip() + new_entry

    REPORT.write_text(report, encoding="utf-8")
    print(f"Auditoría escrita en {REPORT}")
    print(f"Métricas: {json.dumps(metrics, ensure_ascii=False)}")

    # Resumen para PR
    if is_pr:
        summary = build_pr_summary(report, local_findings, metrics)
        PR_SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
        PR_SUMMARY_PATH.write_text(summary, encoding="utf-8")
        print(f"Resumen PR escrito en {PR_SUMMARY_PATH}")


if __name__ == "__main__":
    main()
