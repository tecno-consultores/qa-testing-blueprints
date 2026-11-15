# 📐 Especificación 19: Plan de Arquitectura Documental Bilingüe (Inglés Primario `.md` + Espejo Español `.es.md`)

**Proyecto:** QA Testing Blueprints (Estándar Corporativo QA-11X)  
**Versión Objetivo:** QA-11X v3.0 (`v3.0.0` — Implementación ejecutada)  
**Estado:** IMPLEMENTADO Y CERTIFICADO EN QA-11X v3.0  
**Audiencia:** Mantenedores del Estándar 11X, Ingenieros Humanos y Agentes de IA

---

## 1. Propósito y Alcance Estricto

Esta especificación define la planificación técnica detallada para migrar toda la documentación humana y de gobernanza visible de **`qa-testing-blueprints`** hacia una arquitectura **English-Primary (`*.md`) + 1:1 Spanish Mirror (`*.es.md`)**, preservando compatibilidad hacia atrás con enlaces históricos y optimizando la economía de tokens para Agentes de IA.

> **ESTADO DE EJECUCIÓN EN QA-11X v3.0:** Las **4 fases (A, B, C y D)** de la arquitectura bilingüe **English-Primary (`*.md`) + 1:1 Spanish Mirror (`*.es.md`)** están implementadas: documentación raíz, los 10 stacks (`<stack>/README.{md,es.md}`), `architecture/`, `docs/specs/README.{md,es.md}`, manuales operativos en `docs/`, resolución dinámica MCP `?lang=es|en` (`resourceLang.ts`), campos `readme_es` / `readme_sha256` / `readme_es_sha256` en `manifest.json` y paridad automatizada en `verify_docs_invariants.py`, `verify_roadmap_consistency.py` y `bump_version_11x.py` (manteniendo las Specs históricas `01..20` en español conforme al §3.4).

---

## 2. Inventario Real de Documentación y Estado Lingüístico Actual

| Categoría | Archivos Observados | Idioma Actual | Estado Bilingüe |
| :--- | :--- | :--- | :--- |
| **Puntos de Entrada ya Bilingües** | `README.md` ↔ `README.es.md`<br>`mcp-server/README.md` ↔ `mcp-server/README.es.md`<br>`docs/agent-setup.en.md` ↔ `docs/agent-setup.md` | EN + ES | Paridad activa (inconsistencia de sufijo `.en.md` vs `.md` en `agent-setup`) |
| **Artefactos Públicos Solo Inglés** | `catalogs/agenticskills-submission.md`, `mcp-server/package.json` | EN | Exclusivo registros internacionales |
| **Gobernanza y Skills IA (`.agents/`)** | `AGENTS.md`, `.agents/README.md`, `8` `.agents/rules/*.md`, `10` `.agents/skills/*/SKILL.md` + `references/*.md` | EN (+ notas ES en `.agents/README.md` y cabecera `AGENTS.md`) | Monolítico EN óptimo para LLM (~35% ahorro de tokens) |
| **Documentos Raíz Solo Español** | `RESOURCES.md`, `TESTING.md`, `SECURITY.md`, `CONTRIBUTING.md`, `FAQ.md`, `AI_MASTER_PROMPT.md`, `ROADMAP.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md` (plantilla), `mcp-server/CHANGELOG.md`, `mcp-server/example/README.md` | ES | Sin espejo `.md` en inglés |
| **Manuales Maestros Solo Español (`docs/`)** | `docs/01_ARQUITECTURA_PIRAMIDE_11X.md`, `docs/01_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`, `docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`, `docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`, `docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`, `docs/ai-integration.md`, `docs/ci-cd-pipelines.md`, `docs/docker-troubleshooting.md`, `docs/qa-philosophy.md`, `docs/ARCHITECTURE_C4.md` | ES | Sin espejo en inglés |
| **Entornos y Arquitectura (`<stack>/README.md`)** | `architecture/README.md`, `fastapi/README.md`, `vue3/README.md`, `react-frontend/README.md`, `node-backend/README.md`, `python/README.md`, `php/README.md`, `bash-scripts/README.md`, `ai-evals/README.md`, `mobile-appium/README.md`, `vibe-rescue/README.md` | ES | Consumen prompts para agentes en español sin variante EN para repositorios anglófonos |
| **Especificaciones Técnicas (`docs/specs/`)** | `docs/specs/01_*.md` a `20_*.md` | ES (título 14/15 mixto) | Decisiones internas (ADRs/Specs) |

---

## 3. Convención Canónica Objetivo (`*.md` EN + `*.es.md` ES)

```
<ruta>/<DOCUMENTO>.md       -> Versión Canónica Primaria en Inglés (International Default)
<ruta>/<DOCUMENTO>.es.md    -> Espejo Humano 1:1 en Español (Exact Section & Rule Parity)
```

### Reglas de Diseño Lingüístico
1. **Exención Explícita de `.agents/**` (Economía Cognitiva LLM):**
   - Los archivos en `.agents/rules/*.md` y `.agents/skills/**` permanecen **exclusivamente en inglés técnico compacto** como fuente única de verdad para todos los LLMs (~35% de ahorro de ventana de contexto y cero riesgo de divergencia entre reglas gemelas).
   - Se mantiene el **Espejo Dinámico de Idioma**: el servidor MCP y los conectores responden e interactúan en el idioma del usuario (`--lang auto|es|en`), consumiendo instrucciones internas en inglés.
2. **Normalización de `docs/agent-setup*`:**
   - Convertir `docs/agent-setup.md` al archivo en **inglés** y crear/renombrar `docs/agent-setup.es.md` como espejo español, manteniendo un *stub* temporal o enlace en `docs/agent-setup.en.md` durante un ciclo menor antes de deprecar el sufijo `.en.md`.
3. **Banner Bidireccional Obligatorio:**
   - Todo documento primario EN incluirá en las primeras 5 líneas:
     `> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](<DOCUMENTO>.es.md)`
   - Todo espejo ES incluirá en las primeras 5 líneas:
     `> 🌐 **Idioma:** [🇺🇸 English (Canonical)](<DOCUMENTO>.md) · **Español (Espejo 1:1)**`
4. **Especificaciones Históricas (`docs/specs/01..18`):**
   - Por ROI de mantenimiento, las Specs `01..18` pueden permanecer como registros históricos en español (indexadas desde un `docs/specs/README.md` + `README.es.md` en inglés/español), exigiendo formato bilingüe (`NN_SPEC_*.md` + `.es.md`) o inglés canónico únicamente a partir de nuevas especificaciones v3.x+.

---

## 4. Hoja de Ruta en 4 Fases (Zero-Breakage Rollout)

| Fase | Alcance y Entregables | Compatibilidad y Contratos | Criterio de Salida |
| :--- | :--- | :--- | :--- |
| **Fase A: Raíz, Gobernanza Pública y Onboarding** | `RESOURCES.md` + `.es.md`, `TESTING.md` + `.es.md`, `SECURITY.md` + `.es.md`, `CONTRIBUTING.md` + `.es.md`, `FAQ.md` + `.es.md`, `AI_MASTER_PROMPT.md` + `.es.md`, `ROADMAP.md` + `.es.md`, `CHANGELOG.md` + `.es.md`, normalización de `docs/agent-setup.md` / `.es.md`, y actualización de `AGENTS.md` (sección *Output Language Constraint*). | Actualizar `verify_docs_invariants.py` (`HUMAN_CORE_MANUALS` y `BILINGUAL_TRIGGER_DOCS`) y escenarios Karate BDD en el mismo PR (`QA-TEST-SYNC-01`). | `0` enlaces rotos; `100%` paridad de IDs `SEC-01..QA-SSR-HYDRATION-01` entre `SECURITY.md` y `SECURITY.es.md`. |
| **Fase B: 10 Entornos (`<stack>/README.md`) + `architecture/README.md` + MCP `blueprint://*`** | Generar pareja `<stack>/README.md` (EN) + `<stack>/README.es.md` (ES) en los 10 stacks y `architecture/README.md` / `.es.md`. Extender `blueprint-resources.ts` y `manifest.json` (`scripts/generar-manifiesto.py`) para exponer recursos EN por defecto y variantes ES (`?lang=es` o URI espejo sin romper URIs `blueprint://<stack>/readme`). | Actualizar `mcp-server/src/cli/quickstart.ts`, `stackBlueprints.ts`, `tests/meta_qa/` y `live-mcp-protocol.test.ts` para verificar fallback determinista ES <-> EN cuando un proyecto solicite `--lang es` o `--lang en`. | `make test-mcp`, `make test-py` y `make test-karate` al 100% sobre ambas variantes lingüísticas. |
| **Fase C: Manuales Profundos (`docs/01..04*`, `ai-integration`, `ci-cd`, `docker-troubleshooting`, `qa-philosophy`, `ARCHITECTURE_C4`)** | Traducir los 10 manuales de `docs/` a inglés canónico (`*.md`) manteniendo espejos `*.es.md` con bloques de código, diagramas Mermaid y comandos Docker verificados idénticos. | Actualizar referencias en `llms.txt`, `manifest.json`, `catalogs/agenticskills-submission.md` y `AGENTS.md` sin romper anclas históricas de Specs `01..20`. | Cero divergencia de tablas/comandos (`karatelabs:1.5.1`, `base-python-uv:3.15`, `18` tools, `12` resources, `11` reglas UAT). |
| **Fase D: Compuerta Automatizada de Paridad Bilingüe y Política `AGENTS.md`** | Añadir validador `check_bilingual_pair_parity()` en `.agents/scripts/verify_docs_invariants.py` + cambio oficial de política en `AGENTS.md`: nuevos PRs documentales requieren pareja `.md` + `.es.md` en el mismo commit. | Integrar en `make lint-docs` y `./.agents/scripts/certify_task_completion.sh`. | Compuerta `10/10` bloqueante ante desincronización EN/ES. |

---

## 5. Diseño del Validador Automatizado de Paridad (`verify_docs_invariants.py`)

En la Fase D, `check_bilingual_pair_parity(root: Path)` aplicará cuatro comprobaciones deterministas **Zero-LLM** sobre cada pareja declarada `(doc.md, doc.es.md)`:
1. **Existencia Mutua y Banner:** Ambas rutas existen, tienen `size > 0` y enlazan recíprocamente a su contraparte en las primeras 10 líneas.
2. **Paridad Estructural (`H2`/`H3`):** La cantidad de encabezados `##` y `###` coincide exactamente entre `.md` y `.es.md` (`abs(len_en - len_es) == 0`).
3. **Paridad de Identificadores Normativos:** Todos los códigos estables (`SEC-\d+`, `QA-[A-Z0-9-]+`, `VIBE-[A-Z]+-\d+`, `UI-11X-\d+`, nombres de herramientas MCP y URIs `blueprint://*`) presentes en un idioma aparecen idénticos en el otro.
4. **Higiene de Enlaces Internos:** Los enlaces relativos dentro de `doc.md` apuntan preferentemente a hermanos `.md` y los de `doc.es.md` a hermanos `.es.md` (cuando exista espejo).
