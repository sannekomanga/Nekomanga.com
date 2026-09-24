# Auditor Automático v2.1

Auditoría de **solo lectura** para repositorios GitHub. Combina herramientas locales de detección de secretos y análisis estático con IA (OpenAI o Anthropic Claude).

## Qué hace

| Capacidad | Descripción |
|-----------|-------------|
| Triggers | `push` (main/master), Pull Requests, manual y diario |
| Secretos | **gitleaks** + heurísticas locales |
| SAST | **Semgrep** (reglas de seguridad configurables) |
| Redacción | Los secretos se **redactan** antes de enviarse a la API de IA |
| Proveedores IA | **OpenAI** (o compatible) y **Anthropic Claude** |
| PRs | Analiza **solo el diff** y deja un comentario con el resumen |
| Priorización | Archivos críticos (auth, Supabase, RLS, configs…) se priorizan |
| Historial | Conserva las últimas N auditorías dentro de `AUDITORIA.md` |
| Métricas | Archivos, bytes, tokens, duración, hallazgos por herramienta |
| Config | `auditor/config.yaml` + variables de entorno / GitHub Variables |

El único archivo que el workflow modifica es `AUDITORIA.md`. **Nunca edita el código del proyecto.**

---

## Instalación rápida

1. Copia esta estructura a la raíz de tu repositorio:

```
auditor/
  auditor.py
  config.yaml
.github/workflows/
  auditor.yml
AUDITORIA.md
README.md
```

2. En GitHub → **Settings → Secrets and variables → Actions**:

   | Nombre | Tipo | Obligatorio | Descripción |
   |--------|------|-------------|-------------|
   | `OPENAI_API_KEY` | Secret | Si usas OpenAI | Clave de OpenAI o proveedor compatible |
   | `ANTHROPIC_API_KEY` | Secret | Si usas Anthropic | Clave de Anthropic |
   | `OPENAI_BASE_URL` | Secret | No | URL base si usas otro proveedor compatible con OpenAI |
   | `AUDITOR_PROVIDER` | Variable | No | `openai` (default) o `anthropic` |
   | `AUDITOR_MODEL` | Variable | No | Modelo (default: `gpt-4o` / con Anthropic se usa `claude-sonnet-4-5` si no cambias) |
   | `AUDITOR_MAX_TOKENS` | Variable | No | Tokens máximos de salida (default: 8000) |
   | `AUDITOR_SEMGREP_CONFIG` | Variable | No | Reglas Semgrep (default: `p/security-audit`) |

3. Sube los archivos y ejecuta:

   **Actions → Auditor Automático → Run workflow**

4. Revisa `AUDITORIA.md` y, en PRs, el comentario automático.

---

## Elegir proveedor de IA

### OpenAI (por defecto)

```
AUDITOR_PROVIDER = openai
AUDITOR_MODEL    = gpt-4o          # o gpt-4.1, gpt-4o-mini...
Secret: OPENAI_API_KEY
```

### Anthropic Claude

```
AUDITOR_PROVIDER = anthropic
AUDITOR_MODEL    = claude-sonnet-4-5   # o claude-opus-4-5, claude-haiku-4-5...
Secret: ANTHROPIC_API_KEY
```

Si pones `provider: anthropic` y dejas el modelo por defecto de OpenAI (`gpt-4o`), el auditor cambia automáticamente a `claude-sonnet-4-5`.

---

## Semgrep

Por defecto usa el ruleset `p/security-audit`.

Puedes cambiarlo en `config.yaml` o con la variable `AUDITOR_SEMGREP_CONFIG`:

```yaml
semgrep_config: "p/security-audit p/owasp-top-ten"
```

Otros rulesets útiles: `p/cwe-top-25`, `p/ci`, `auto`.

Semgrep se instala vía `pip` en el runner; no requiere cuenta ni token.

---

## Comportamiento según el evento

| Evento | Qué analiza | Qué escribe |
|--------|-------------|-------------|
| `push` / `schedule` / `workflow_dispatch` | Repo completo | Actualiza `AUDITORIA.md` y hace commit |
| `pull_request` | Solo archivos del diff | Comentario en el PR (no toca `AUDITORIA.md`) |

---

## Si no configuras ninguna API key

El workflow sigue funcionando: ejecuta **gitleaks + semgrep + heurísticas** y genera un informe limitado. No habrá análisis de IA, pero sí detección local de secretos y problemas de código.

---

## Permisos del workflow

```yaml
permissions:
  contents: write          # solo para actualizar AUDITORIA.md
  pull-requests: write     # para comentar en PRs
```

---

## Mejoras v2 → v2.1

- ✅ **Semgrep** integrado (SAST real)
- ✅ **Anthropic Claude** nativo (`ANTHROPIC_API_KEY` + `provider: anthropic`)
- ✅ Hallazgos etiquetados por herramienta (gitleaks / semgrep / heuristics)
- ✅ Resumen de PR muestra conteo por herramienta

---

## Requisitos

- Repositorio en GitHub
- Python 3.12 (se instala en el runner)
- Opcional: cuenta de OpenAI y/o Anthropic

---

**Regla:** este auditor informa; no aplica correcciones automáticamente.
