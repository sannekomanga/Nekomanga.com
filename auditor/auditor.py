#!/usr/bin/env python3
"""
Auditor Automático v2.1
Auditoría de solo lectura con:
- Escaneo de secretos (gitleaks + heurísticas)
- Análisis estático (semgrep)
- Redacción de secretos antes de enviar a LLM
- Proveedores: OpenAI + Anthropic (Claude)
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
    "enable_semgrep": True,
    "enable_local_heuristics": True,
    "semgrep_config": "p/security-audit",
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
    env_map = {
        "AUDITOR_MODEL": ("model", str),
        "AUDITOR_MAX_TOKENS": ("max_tokens", int),
        "AUDITOR_MAX_INPUT_CHARS": ("max_input_chars", int),
        "AUDITOR_PROVIDER": ("provider", str),
        "AUDITOR_SEMGREP_CONFIG": ("semgrep_config", str),
    }
    for env_key, (cfg_key, caster) in env_map.items():
        val = os.getenv(env_key)
        if val is not None:
            try:
                cfg[cfg_key] = caster(val)
            except ValueError:
                pass

    for flag, key in (
        ("AUDITOR_ENABLE_GITLEAKS", "enable_gitleaks"),
        ("AUDITOR_ENABLE_SEMGREP", "enable_semgrep"),
        ("AUDITOR_ENABLE_HEURISTICS", "enable_local_heuristics"),
    ):
        if os.getenv(flag) is not None:
            cfg[key] = os.getenv(flag, "true").lower() in ("1", "true", "yes")

    return cfg


CFG = load_config()

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def run(cmd: list[str], timeout: int = 180) -> subprocess.CompletedProcess:
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


def map_severity(raw: str | None) -> str:
    if not raw:
        return "MEDIO"
    r = raw.upper()
    if r in ("ERROR", "CRITICAL", "CRÍTICO", "CRITICO"):
        return "CRÍTICO"
    if r in ("WARNING", "HIGH", "ALTO"):
        return "ALTO"
    if r in ("INFO", "INFORMATIONAL", "INFORMATIVO", "LOW", "BAJO"):
        return "BAJO"
    return "MEDIO"


# ---------------------------------------------------------------------------
# Recolección de archivos
# ---------------------------------------------------------------------------

def collect_files(only_paths: set[str] | None = None) -> list[tuple[str, str, bool]]:
    items: list[tuple[str, str, bool]] = []
    total = 0

    candidates: list[Path] = []
    for p in ROOT.rglob("*"):
        if not p.is_file():
            continue
        if is_ignored(p):
            continue
        if p.name in ("AUDITORIA.md", "pr_summary.md"):
            continue
        if p.suffix.lower() not in CFG["text_extensions"] and p.name.lower() not in ("dockerfile", "makefile"):
            continue
        rel = str(p).replace("\\", "/")
        if only_paths is not None and rel not in only_paths:
            continue
        candidates.append(p)

    candidates.sort(key=lambda p: (0 if is_critical(str(p).replace("\\", "/")) else 1, str(p)))

    for p in candidates:
        rel = str(p).replace("\\", "/")
        crit = is_critical(rel)
        try:
            size = p.stat().st_size
            limit = CFG["max_critical_file_bytes"] if crit else CFG["max_file_bytes"]
            if size > limit:
                continue
            if total + size > CFG["max_total_bytes"] and not crit:
                continue
            data = p.read_text(encoding="utf-8", errors="replace")
            items.append((rel, data, crit))
            total += size
        except Exception:
            pass

    return items


def get_changed_files() -> set[str] | None:
    event = os.getenv("GITHUB_EVENT_NAME", "")
    if event != "pull_request":
        return None

    base = os.getenv("GITHUB_BASE_REF") or "main"
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
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----", re.DOTALL | re.IGNORECASE),
     "[REDACTED PRIVATE KEY]"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
     "[REDACTED JWT]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED AWS_ACCESS_KEY]"),
    (re.compile(r"(?i)(aws_secret_access_key|secret_access_key)\s*[=:]\s*['\"]?[A-Za-z0-9/+=]{30,}['\"]?"),
     r"\1=[REDACTED]"),
    (re.compile(r"(?i)(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret[_-]?key|client[_-]?secret|private[_-]?key|service[_-]?role)\s*[=:]\s*['\"][^'\"]{8,}['\"]"),
     r"\1=[REDACTED]"),
    (re.compile(r"(?i)(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret[_-]?key|client[_-]?secret)\s*[=:]\s*[A-Za-z0-9_\-]{16,}"),
     r"\1=[REDACTED]"),
    (re.compile(r"(?i)bearer\s+[A-Za-z0-9\-._~+/]+=*"), "Bearer [REDACTED]"),
    (re.compile(r"(?i)(postgres|mysql|mongodb|redis)://[^:]+:[^@\s]+@"),
     r"\1://[REDACTED]@"),
    (re.compile(r"(?i)(password|passwd|pwd)\s*[=:]\s*['\"][^'\"]{4,}['\"]"),
     r"\1=[REDACTED]"),
]


def redact_secrets(text: str) -> str:
    for pattern, repl in SECRET_PATTERNS:
        text = pattern.sub(repl, text)
    return text


# ---------------------------------------------------------------------------
# Escaneos locales: gitleaks, semgrep, heurísticas
# ---------------------------------------------------------------------------

def run_gitleaks() -> list[dict]:
    findings: list[dict] = []
    if not CFG.get("enable_gitleaks", True):
        return findings

    gitleaks = None
    r = run(["which", "gitleaks"])
    if r.returncode == 0:
        gitleaks = "gitleaks"
    elif Path("/usr/local/bin/gitleaks").exists():
        gitleaks = "/usr/local/bin/gitleaks"

    if not gitleaks:
        print("[info] gitleaks no encontrado; se omite")
        return findings

    out_file = Path("/tmp/gitleaks-report.json")
    cmd = [
        gitleaks, "detect",
        "--source", ".",
        "--report-format", "json",
        "--report-path", str(out_file),
        "--no-git",
        "--exit-code", "0",
    ]
    run(cmd, timeout=180)
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
    return findings


def run_semgrep() -> list[dict]:
    findings: list[dict] = []
    if not CFG.get("enable_semgrep", True):
        return findings

    r = run(["which", "semgrep"])
    if r.returncode != 0:
        print("[info] semgrep no encontrado; se omite")
        return findings

    config = CFG.get("semgrep_config") or "p/security-audit"
    out_file = Path("/tmp/semgrep-report.json")

    # --config puede recibir varios; separamos por espacio
    configs = config.split()
    cmd = ["semgrep", "scan", "--json", "--quiet", "--no-git-ignore"]
    for c in configs:
        cmd.extend(["--config", c])
    cmd.append(".")

    print(f"[info] Ejecutando semgrep con config: {config}")
    proc = run(cmd, timeout=300)

    # semgrep escribe JSON en stdout cuando --json
    raw = proc.stdout or ""
    if not raw.strip() and out_file.exists():
        raw = out_file.read_text(encoding="utf-8")

    if not raw.strip():
        if proc.stderr:
            print(f"[info] semgrep stderr: {proc.stderr[:300]}")
        return findings

    try:
        data = json.loads(raw)
        results = data.get("results") or []
        for item in results:
            path = item.get("path") or "?"
            check_id = item.get("check_id") or item.get("check-id") or "semgrep"
            extra = item.get("extra") or {}
            msg = extra.get("message") or check_id
            sev = map_severity(extra.get("severity") or item.get("severity"))
            start = (item.get("start") or {}).get("line")
            findings.append({
                "tool": "semgrep",
                "severity": sev,
                "file": path,
                "rule": f"{check_id}: {msg[:120]}",
                "match": "",
                "line": start,
            })
        print(f"[info] semgrep: {len(findings)} hallazgos")
    except Exception as e:
        print(f"[warn] Error parseando semgrep: {e}", file=sys.stderr)
        print(f"[debug] stdout[:500]={raw[:500]}", file=sys.stderr)

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
# Snapshot para LLM
# ---------------------------------------------------------------------------

def build_snapshot(files: list[tuple[str, str, bool]], max_chars: int) -> str:
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
    marker = "## Historial"
    if marker not in existing:
        return ""
    idx = existing.find(marker)
    hist = existing[idx:]
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
        tool = f.get("tool", "")
        rows.append(
            f"| AUD-{i:03d} | {f['severity']} | {f['file']} | [{tool}] {f['rule']} {match} | PENDIENTE |"
        )
    if not rows:
        rows.append("| — | — | — | No se detectaron indicadores básicos. | INFORMATIVO |")

    mode = "Pull Request (solo cambios)" if is_pr else "Repositorio completo"
    return f"""# AUDITORÍA DEL REPOSITORIO

**Fecha:** {now}  
**Auditor:** Auditor Automático v2.1  
**Modo:** Solo lectura — {mode}  
**Estado:** COMPLETADA CON LIMITACIONES

## Resumen

La revisión local (gitleaks + semgrep + heurísticas) se ejecutó correctamente.  
El análisis de IA no pudo completarse: `{reason}`

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
- Configurar `OPENAI_API_KEY` o `ANTHROPIC_API_KEY` en GitHub Actions Secrets.
- No colocar claves privadas ni tokens directamente en el repositorio.

## Regla del auditor

Este proceso **informa** sobre hallazgos y **no modifica** el código del proyecto (solo actualiza `AUDITORIA.md`).
"""


def call_openai(prompt: str, model: str, max_tokens: int) -> tuple[str, dict]:
    from openai import OpenAI

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("No existe OPENAI_API_KEY.")

    kwargs: dict[str, Any] = {"api_key": api_key}
    base_url = os.getenv("OPENAI_BASE_URL")
    if base_url:
        kwargs["base_url"] = base_url

    client = OpenAI(**kwargs)
    usage: dict[str, Any] = {}

    try:
        response = client.responses.create(
            model=model,
            input=prompt,
            max_output_tokens=max_tokens,
        )
        text = (response.output_text or "").strip()
        if hasattr(response, "usage") and response.usage:
            usage = {
                "input_tokens": getattr(response.usage, "input_tokens", None),
                "output_tokens": getattr(response.usage, "output_tokens", None),
            }
    except Exception:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Eres un auditor de software defensivo. Responde solo en Markdown válido."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=max_tokens,
        )
        text = (response.choices[0].message.content or "").strip()
        if response.usage:
            usage = {
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens,
            }

    return text, usage


def call_anthropic(prompt: str, model: str, max_tokens: int) -> tuple[str, dict]:
    from anthropic import Anthropic

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("No existe ANTHROPIC_API_KEY.")

    client = Anthropic(api_key=api_key)
    message = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system="Eres un auditor de software defensivo experto. Responde solo en Markdown válido.",
        messages=[{"role": "user", "content": prompt}],
    )

    text_parts = []
    for block in message.content:
        if hasattr(block, "text"):
            text_parts.append(block.text)
    text = "\n".join(text_parts).strip()

    usage = {}
    if message.usage:
        usage = {
            "input_tokens": getattr(message.usage, "input_tokens", None),
            "output_tokens": getattr(message.usage, "output_tokens", None),
        }
    return text, usage


def ai_report(
    files: list[tuple[str, str, bool]],
    local_findings: list[dict],
    metrics: dict,
    is_pr: bool,
) -> tuple[str, dict]:
    snapshot = build_snapshot(files, CFG["max_input_chars"])
    mode = "Pull Request (solo archivos cambiados)" if is_pr else "repositorio completo"
    local_json = json.dumps(local_findings, ensure_ascii=False, indent=2)[:12000]

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
- Integra y prioriza los hallazgos de las herramientas locales (gitleaks, semgrep, heurísticas).

Hallazgos detectados por herramientas locales:
```json
{local_json}
```

Contenido del repositorio (secretos redactados):
{snapshot}
"""

    provider = (CFG.get("provider") or "openai").lower().strip()
    model = CFG["model"]
    max_tokens = int(CFG["max_tokens"])

    if provider == "anthropic":
        # Default razonable si el usuario no cambió el modelo de OpenAI
        if model in ("gpt-4o", "gpt-4.1", "gpt-4o-mini", "gpt-5.6-luna"):
            model = "claude-sonnet-4-5"
        text, usage = call_anthropic(prompt, model, max_tokens)
    else:
        text, usage = call_openai(prompt, model, max_tokens)

    now = now_utc()
    extra = {"tokens": usage, "provider": provider, "model_used": model}

    report = f"""# AUDITORÍA DEL REPOSITORIO

**Fecha:** {now}  
**Auditor:** Auditor Automático v2.1  
**Proveedor:** {provider}  
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
    crit = sum(1 for f in local_findings if f.get("severity") == "CRÍTICO")
    high = sum(1 for f in local_findings if f.get("severity") == "ALTO")
    total_local = len(local_findings)

    status = "✅ Sin hallazgos críticos locales"
    if crit:
        status = f"🚨 {crit} hallazgo(s) CRÍTICO(s) detectado(s)"
    elif high:
        status = f"⚠️ {high} hallazgo(s) de severidad ALTA"

    by_tool: dict[str, int] = {}
    for f in local_findings:
        t = f.get("tool") or "otro"
        by_tool[t] = by_tool.get(t, 0) + 1
    tool_line = ", ".join(f"{k}: {v}" for k, v in sorted(by_tool.items())) or "ninguno"

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
| Hallazgos locales | {total_local} ({tool_line}) |
| Duración | {metrics.get('duration_s', 0):.1f}s |

{table}

> Informe completo disponible en `AUDITORIA.md` (se actualiza en la rama por defecto).  
> Herramientas: gitleaks + semgrep + heurísticas + IA.  
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
    local_findings.extend(run_semgrep())
    local_findings.extend(local_heuristics(files))

    # Deduplicar
    seen: set[tuple] = set()
    unique: list[dict] = []
    for f in local_findings:
        key = (f.get("file"), f.get("rule"), f.get("tool"))
        if key not in seen:
            seen.add(key)
            unique.append(f)
    local_findings = unique

    metrics: dict[str, Any] = {
        "files": len(files),
        "critical": sum(1 for _, _, c in files if c),
        "bytes": sum(len(c.encode("utf-8", errors="replace")) for _, c, _ in files),
        "event": event,
        "duration_s": 0.0,
    }

    try:
        report, extra = ai_report(files, local_findings, metrics, is_pr)
        metrics.update(extra.get("tokens") or {})
        metrics["provider"] = extra.get("provider")
        metrics["model_used"] = extra.get("model_used")
    except Exception as exc:
        report = fallback_report(files, local_findings, str(exc), metrics, is_pr)

    metrics["duration_s"] = time.time() - start

    # Historial
    history = ""
    if REPORT.exists():
        try:
            history = extract_history(REPORT.read_text(encoding="utf-8"), CFG.get("history_keep", 5))
        except Exception:
            pass

    if history:
        summary_line = f"- Archivos: {metrics['files']} | Hallazgos locales: {len(local_findings)} | Evento: {event}"
        new_entry = f"\n### {now_utc()}\n{summary_line}\n"
        if "## Historial" not in report:
            report = report.rstrip() + "\n\n## Historial\n"
        pre, _, _ = report.partition("## Historial")
        report = pre + history
        if new_entry.strip() not in report:
            report = report.rstrip() + new_entry

    REPORT.write_text(report, encoding="utf-8")
    print(f"Auditoría escrita en {REPORT}")
    print(f"Métricas: {json.dumps(metrics, ensure_ascii=False)}")

    if is_pr:
        summary = build_pr_summary(report, local_findings, metrics)
        PR_SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
        PR_SUMMARY_PATH.write_text(summary, encoding="utf-8")
        print(f"Resumen PR escrito en {PR_SUMMARY_PATH}")


if __name__ == "__main__":
    main()
