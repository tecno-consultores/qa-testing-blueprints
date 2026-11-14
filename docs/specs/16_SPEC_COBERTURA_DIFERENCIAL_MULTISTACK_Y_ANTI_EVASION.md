# 🎯 Especificación Técnica 16: Cobertura Diferencial Multi-Stack y Bloqueo Anti-Evasión (Hito 21)

**Proyecto:** QA Testing Blueprints (`tecno-consultores/qa-testing-blueprints`)  
**Componentes Objetivo (`Hito 21`):** `.agents/scripts/verify_diff_coverage.py`, `tests/test_verify_diff_coverage.unit.py`, `Makefile`, `.agents/scripts/certify_task_completion.sh`, `mcp-server/src/tools/ephemeral-runner.ts`  
**Superficie Pública MCP:** Se mantienen intactas las **18 Tools** y **12 Resources** vigentes  
**Estado:** PLANIFICADO (HITO 21 — ENTREGA 1 DE 3)

---

## 1. Propósito y Brecha que Resuelve (`Efector Colchón 98%`)

En bases de código maduras con cobertura global `>= 95%`, un cambio de decenas de líneas nuevas en un servicio o controlador crítico puede ingresar con `0%` de cobertura propia sin que la métrica global caiga por debajo del umbral. El validador `verify_diff_coverage.py` elimina este *efecto colchón* auditando el **delta exacto de líneas y ramas ejecutables** modificadas o agregadas en Git frente a los reportes generados por los instrumentadores reales en contenedores efímeros (**Rule Zero**).

```text
  Contenedor Efímero (Pytest-Cov / Vitest V8 / PHP PCOV / Bash Kcov)
       │
       │  [1. Exportación pre-teardown] -> .agents/.cache/coverage/{stack}.{xml|info}
       ▼
  verify_diff_coverage.py (--network none, stdlib Python 3.12+)
       │
       ├──> [Fast-Path DOCS_ONLY] (*.md / docs/**) -> exit 0 (< 100 ms)
       ├──> [Anti-XXE Guard] (<!DOCTYPE / <!ENTITY) -> exit 12
       ├──> [Anti-Evasión Diff] (no cover / v8 ignore sin QA11X-APPROVED-EXCLUSION) -> exit 11
       └──> [Cruce Git Diff vs executable_lines]
               ├── Líneas == 100.0% y Ramas >= 90.0% -> [PASS] 1 línea (exit 0)
               └── Déficit o archivo nuevo sin reporte -> Tabla Fail-Verbose (exit 10 / 12)
```

---

## 2. Persistencia Efímera Pre-`--rm` y Limpieza Segura

Actualmente, los targets efímeros de prueba destruyen los reportes al finalizar (`rm -rf coverage` en `Makefile` o `COVERAGE_FILE=/tmp/.coverage` dentro de contenedores `--rm`). Para habilitar la auditoría diferencial sin contaminar el árbol versionado:

1. **Directorio Efímero Unificado:** Exportar `coverage.xml` (Cobertura XML para Python/FastAPI, PHP PCOV y Bash Kcov) y `lcov.info` (LCOV para Node.js, Vue 3, React y `mcp-server`) hacia `.agents/.cache/coverage/` antes del cierre del contenedor en `Makefile` (`test-mcp`, `test-py`) y `mcp-server/src/tools/ephemeral-runner.ts`.
2. **Higiene Git y Saneamiento:** Registrar `.agents/.cache/` y `.agents/artifacts/` en `.gitignore` y añadir su purga segura en `scripts/limpieza.sh` (`make clean`), garantizando permisos restrictivos (`0700` en caché local).

---

## 3. Firma CLI Congelada, Umbrales Calibrados y Códigos de Salida

| Elemento | Contrato Congelado |
| :--- | :--- |
| **Comando Canónico** | `python3 .agents/scripts/verify_diff_coverage.py --workspace <path> [--base-ref <git_ref>] [--min-line-cov 100.0] [--min-branch-cov 90.0] [--reports-dir .agents/.cache/coverage]` |
| **Umbrales 11X** | **`100.0%` en líneas ejecutables delta** y **`>= 90.0%` en ramas delta** (evita falsos bloqueos por ramas implícitas V8 en `?.`, `??` y guardas *Fail-Secure*). |
| **Exit `0`** | Cumplimiento total (emite 1 línea *Pass-Quiet*) o modo `DOCS_ONLY` (`< 100 ms` sin levantar Docker). |
| **Exit `10`** | Cobertura de líneas o ramas delta por debajo del umbral exigido (imprime tabla compacta `Archivo \| Líneas \| Ramas`). |
| **Exit `11`** | Directiva de evasión detectada en líneas `+` del diff (`# pragma: no cover`, `/* v8 ignore`, `/* c8 ignore`, `@codeCoverageIgnore`) sin marcador `QA11X-APPROVED-EXCLUSION(<motivo>)`. |
| **Exit `12`** | Reporte XML inseguro (`<!DOCTYPE` / `<!ENTITY` — Anti-XXE `APSC-DV-002390/002550`) o archivo fuente productivo nuevo ausente en todos los reportes. |

---

## 4. Algoritmo de Cruce sin Falsos Positivos y Controles DevSecOps

1. **Cero Dependencias Externas y Complejidad `CC <= 5`:** Implementado en librería estándar Python 3.12+ (`xml.etree.ElementTree`, `subprocess`, `pathlib`, `re`, `argparse`) con tipado estricto (`mypy --strict`) y funciones pequeñas de responsabilidad única.
2. **Ejecución Segura de Git (`shell=False`):** Resuelve `merge-base` y ejecuta `subprocess.run(["git", "diff", "--unified=0", "--no-color", "--no-ext-diff", target_ref], shell=False, check=True)` validando que `base_ref` cumpla `/^[a-zA-Z0-9._\/~^-]+$/` y confinando rutas con `Path.resolve()`.
3. **Intersección Real contra `executable_lines`:**
   - Una línea `+` del diff solo se audita si pertenece al conjunto de líneas ejecutables reportadas por el instrumentador (`<line number="N" hits="H"/>` en Cobertura XML o `DA:<line>,<hits>` / `BRDA:<line>,...` en LCOV). De este modo se ignoran comentarios, docstrings, declaraciones `interface`/`type` en TypeScript y bloques `TYPE_CHECKING` sin heurísticas frágiles.
   - Normaliza prefijos de montaje de contenedores (`/app/`, `/workspace/`) hacia la raíz relativa del `--workspace`.
   - Excepción de seguridad: si un archivo de código productivo nuevo (`*.py`, `*.ts`, `*.tsx`, `*.vue`, `*.php`, `*.sh` fuera de `tests/` y migraciones declarativas) no figura en ningún reporte recolectado, el 100% de sus líneas añadidas se computa como descubierto (`exit 12` / `10`).

---

## 5. Desglose en Micro-Tareas Atómicas (`Hito 21`) y Verificación Rule Zero

| Micro-Tarea | Alcance Exacto | Verificación Efímera (`Rule Zero`) |
| :--- | :--- | :--- |
| **`21.1`** | Añadir `.agents/.cache/` y `.agents/artifacts/` a `.gitignore` + `scripts/limpieza.sh`; exportar `coverage.xml`/`lcov.info` en `Makefile` y `ephemeral-runner.ts`. | `make test-mcp && make test-py` generando reportes en `.agents/.cache/coverage/`. |
| **`21.2`** | Crear `.agents/scripts/verify_diff_coverage.py` (parte 1: guardia Anti-XXE `exit 12`, adaptador Cobertura XML y adaptador LCOV con normalización de rutas). | Verificación estática con `ruff` (`CC <= 5`) y `mypy --strict` en `sinfallas/base-python-uv:3.15`. |
| **`21.3`** | Completar `verify_diff_coverage.py` (parte 2: `git diff --unified=0` con `shell=False`, fast-path `DOCS_ONLY`, detector `exit 11` y salida *Pass-Quiet* / *Fail-Verbose*). | Prueba CLI offline (`--network none`) sobre fixtures sintéticos. |
| **`21.4`** | Crear `tests/test_verify_diff_coverage.unit.py` (`>= 95%` cobertura) cubriendo XXE, LCOV ramas `>= 90%`, Cobertura XML, evasión y `DOCS_ONLY`. | `docker run --rm --network none -e COVERAGE_FILE=/tmp/.coverage -u "$(id -u):$(id -g)" -v "$(pwd):/app" -w /app sinfallas/base-python-uv:3.15 uv run --with pytest --with pytest-cov pytest tests/test_verify_diff_coverage.unit.py` |
| **`21.5`** | Exponer target `make diff-cov` en `Makefile` e integrar ejecución condicional en `.agents/scripts/certify_task_completion.sh`. | `make diff-cov` y `make certify` con evidencia de cobertura fresca. |
| **`21.6`** | Sincronizar directiva *Dual-Consumer* en `.agents/rules/mandatory_qa_pyramid_and_doc_sync.md` y `docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md` (sin añadir nuevos archivos en `.agents/rules/`). | `./scripts/actualizar-grafos-graphify.sh`, `make sync-governance`, `make lint-docs` y `make certify`. |
