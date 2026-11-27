> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md)

# 📐 Specification 19: Bilingual Documentation Architecture Plan (English-Primary `.md` + Spanish Mirror `.es.md`)

**Project:** QA Testing Blueprints (QA-11X Corporate Standard)  
**Target Version:** QA-11X v3.0 / v3.1 (`v3.0.0` – `v3.1.0`, Phases A–D Completed)  
**Status:** IMPLEMENTED AND CERTIFIED IN QA-11X v3.1 (Phases A–D Completed)  
**Audience:** 11X Standard Maintainers, Human Engineers, and AI Agents

---

## 1. Purpose and Strict Scope

This specification defines the detailed technical roadmap for migrating all human-facing and public governance documentation of **`qa-testing-blueprints`** to an **English-Primary (`*.md`) + 1:1 Spanish Mirror (`*.es.md`)** architecture while preserving backwards compatibility with historical links and optimizing token economy for AI Agents.

> **EXECUTION STATUS IN QA-11X v3.1:** All **4 phases (A, B, C, and D)** of the **English-Primary (`*.md`) + 1:1 Spanish Mirror (`*.es.md`)** bilingual architecture are implemented and certified: root documentation, all 10 stacks (`<stack>/README.{md,es.md}`), `architecture/`, `docs/specs/README.{md,es.md}`, `docs/specs/19..20+.{md,es.md}`, deep operational manuals under `docs/` (including `docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.{md,es.md}`), dynamic MCP `?lang=es|en` negotiation (`resourceLang.ts`), `readme_es` / `readme_sha256` / `readme_es_sha256` fields in `manifest.json`, and automated parity validation across `verify_docs_invariants.py`, `verify_roadmap_consistency.py`, and `bump_version_11x.py` (preserving only historical Specs `01..18` in Spanish per §3 Rule 4).

---

## 2. Historical Baseline Inventory (Pre-v3.0) and Current Metrics

> **Historical Note (Pre-v3.0 Baseline vs. Current Metrics):** This section preserves the **pre-`v3.0.0` diagnostic inventory** that motivated all 4 phases. In the active implemented state (`v3.0.0` + `v3.1–v3.10` evolution), the repository includes **12** `.agents/skills/*/SKILL.md`, full normalization of `docs/agent-setup.md` ↔ `docs/agent-setup.es.md` (with the legacy `docs/agent-setup.en.md` stub retired after the transition cycle), EN+ES bilingual parity across root docs, `docs/` manuals (`01..05`), all 10 stacks, and Specs `19..20+`, plus **20** MCP Tools and **13** `blueprint://*` Resources.

| Category | Observed Files (Pre-v3.0 Baseline / Current State) | Baseline Language | Bilingual Status |
| :--- | :--- | :--- | :--- |
| **Bilingual Entry Points** | `README.md` ↔ `README.es.md`<br>`mcp-server/README.md` ↔ `mcp-server/README.es.md`<br>`docs/agent-setup.md` ↔ `docs/agent-setup.es.md` *(pre-v3.0 baseline: `.en.md` vs `.md`)* | EN + ES | Normalized in Phase A (legacy `docs/agent-setup.en.md` stub retired in v3.1) |
| **English-Only Public Artifacts** | `catalogs/agenticskills-submission.md`, `mcp-server/package.json` | EN | International registries only |
| **AI Governance & Skills (`.agents/`)** | `AGENTS.md`, `.agents/README.md`, `8` `.agents/rules/*.md`, `12` `.agents/skills/*/SKILL.md` + `references/*.md` | EN (with `.agents/scripts/*` CLI diagnostics in ES) | Optimal monolingual EN for LLMs (~35% token savings) |
| **Root Documents (Pre-v3.0 Baseline)** | `RESOURCES.md`, `TESTING.md`, `SECURITY.md`, `CONTRIBUTING.md`, `FAQ.md`, `AI_MASTER_PROMPT.md`, `ROADMAP.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md` (template), `mcp-server/CHANGELOG.md`, `mcp-server/example/README.md` | ES *(pre-v3.0 baseline)* | Migrated to EN+ES pairs in Phase A (`v3.0.0`) |
| **Master Manuals (Pre-v3.0 `docs/` Baseline)** | `docs/01_ARQUITECTURA_PIRAMIDE_11X.md`, `docs/02_BUENAS_PRACTICAS_PROGRAMACION_11X.md`, `docs/03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md`, `docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`, `docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md` *(renumbered from `01_` in v3.1)*, `docs/ai-integration.md`, `docs/ci-cd-pipelines.md`, `docs/docker-troubleshooting.md`, `docs/qa-philosophy.md`, `docs/ARCHITECTURE_C4.md` | ES *(pre-v3.0 baseline)* | Migrated to EN+ES pairs in Phase C (`v3.0.0`) |
| **Stacks & Architecture (Pre-v3.0 `<stack>/README.md` Baseline)** | `architecture/README.md`, `fastapi/README.md`, `vue3/README.md`, `react-frontend/README.md`, `node-backend/README.md`, `python/README.md`, `php/README.md`, `bash-scripts/README.md`, `ai-evals/README.md`, `mobile-appium/README.md`, `vibe-rescue/README.md` | ES *(pre-v3.0 baseline)* | Migrated to EN+ES pairs in Phase B (`v3.0.0`) |
| **Technical Specifications (`docs/specs/`)** | `docs/specs/01_*.md` through `18_*.md` (historical ES ADRs) + `docs/specs/19..20_*.{md,es.md}` | ES (`01..18`) / EN+ES (`19..20+`) | Historical ADRs `01..18` preserved in ES; `19..20+` bilingual EN+ES |

---

## 3. Target Canonical Convention (`*.md` EN + `*.es.md` ES)

```
<path>/<DOCUMENT>.md        -> English Canonical Primary Version (International Default)
<path>/<DOCUMENT>.es.md     -> 1:1 Spanish Human Mirror (Exact Section & Rule Parity)
```

### Linguistic Design Rules
1. **Explicit `.agents/**` Exemption (LLM Cognitive Economy) and `.agents/scripts/*` CLI Diagnostics:**
   - Directive files in `.agents/README.md`, `.agents/rules/*.md`, and `.agents/skills/**` remain **exclusively in compact technical English** as the single source of truth for all LLMs (~35% context-window savings and zero twin-rule drift risk).
   - Terminal/`stderr` diagnostic outputs from `.agents/scripts/*` (and human-facing projections such as `.agents/ACTIVE_TASK.md` / `PR_VERDICT.md`) remain intentionally in Spanish for human operators without penalizing LLM prompt token budgets.
   - **Dynamic Language Mirroring** applies across runtime interfaces: the MCP server and connectors respond in the user's language (`--lang auto|es|en`) while consuming internal English directives.
2. **Normalization of `docs/agent-setup*`:**
   - Convert `docs/agent-setup.md` into the **English** canonical file and create/rename `docs/agent-setup.es.md` as the Spanish mirror, keeping a temporary stub in `docs/agent-setup.en.md` for one minor cycle before deprecating and removing the `.en.md` suffix (completed in v3.1).
3. **Mandatory Bidirectional Banner:**
   - Every canonical EN document must include within its first 10 lines (validated by `verify_docs_invariants.py`):
     `> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](<DOCUMENT>.es.md)`
   - Every ES mirror must include within its first 10 lines:
     `> 🌐 **Idioma:** [🇺🇸 English (Canonical)](<DOCUMENT>.md) · **Español (Espejo 1:1)**`
4. **Historical Specifications (`docs/specs/01..18`):**
   - For maintenance ROI, Specs `01..18` remain preserved in Spanish as immutable historical records (indexed from [`docs/specs/README.md`](README.md) and its counterpart `docs/specs/README.es.md` with an explicit archival notice), requiring bilingual pairs (`NN_SPEC_*.md` + `.es.md`) starting from v3.x+ specifications (`19_SPEC`, `20_SPEC`, and beyond).
5. **External English-Only Catalog Submissions (`catalogs/agenticskills-submission.md`):**
   - Registry submission templates targeting international English-only catalogs (`catalogs/agenticskills-submission.md`) are explicitly exempt from requiring a `.es.md` mirror.

---

## 4. 4-Phase Rollout Roadmap (Zero-Breakage Rollout)

| Phase | Scope & Deliverables | Compatibility & Contracts | Exit Criteria |
| :--- | :--- | :--- | :--- |
| **Phase A: Root, Public Governance & Onboarding** | `RESOURCES.{md,es.md}`, `TESTING.{md,es.md}`, `SECURITY.{md,es.md}`, `CONTRIBUTING.{md,es.md}`, `CODE_OF_CONDUCT.{md,es.md}`, `FAQ.{md,es.md}`, `AI_MASTER_PROMPT.{md,es.md}`, `ROADMAP.{md,es.md}`, `CHANGELOG.{md,es.md}`, `mcp-server/{README,CHANGELOG}.{md,es.md}`, `mcp-server/example/{README,CHANGELOG,TESTING}.{md,es.md}`, `docs/agent-setup.{md,es.md}` normalization, `docs/specs/{README,19..20+}.{md,es.md}`, and `AGENTS.md` update (*OUTPUT LANGUAGE & DYNAMIC MIRRORING (Spec 19)* section). | Update `verify_docs_invariants.py` (`BILINGUAL_DOC_PAIRS`, `HUMAN_CORE_MANUALS`, `BILINGUAL_TRIGGER_DOCS`) and Karate BDD scenarios in the same PR (`QA-TEST-SYNC-01`). | `0` broken links; `100%` normative ID parity (`SEC-*`, `QA-*`, `UI-11X-*`, `VIBE-*`, covering `SEC-03..QA-SSR-HYDRATION-01` in `SECURITY.{md,es.md}`). |
| **Phase B: 10 Stacks (`<stack>/README.md`) + `architecture/README.md` + MCP `blueprint://*`** | Generate `<stack>/README.md` (EN) + `<stack>/README.es.md` (ES) pairs across all 10 stacks and `architecture/README.md` / `.es.md`. Extend `blueprint-resources.ts` and `manifest.json` (`scripts/generar-manifiesto.py`) to serve EN resources by default and ES variants (`?lang=es` or mirror URI without breaking `blueprint://<stack>/readme`). | Update `mcp-server/src/cli/quickstart.ts`, `stackBlueprints.ts`, `tests/meta_qa/`, and `live-mcp-protocol.test.ts` to verify deterministic ES <-> EN fallback when projects pass `--lang es` or `--lang en`. | `make test-mcp`, `make test-py`, and `make test-karate` at 100% across both language variants. |
| **Phase C: Deep Manuals (`docs/01..05*`, `ai-integration`, `ci-cd`, `docker-troubleshooting`, `qa-philosophy`, `ARCHITECTURE_C4`)** | Translate all 10 `docs/` manuals into canonical English (`*.md`) while maintaining `*.es.md` mirrors with identical verified code blocks, Mermaid diagrams, and Docker commands. | Update references across `llms.txt`, `manifest.json`, `catalogs/agenticskills-submission.md`, and `AGENTS.md` without breaking historical anchors from Specs `01..18`. | Zero drift in tables/commands (`karatelabs:1.5.1`, `base-python-uv:3.15`, `19` tools, `13` resources, `11` UAT rules). |
| **Phase D: Automated Bilingual Parity Gate & `AGENTS.md` Policy** | Add `check_bilingual_pair_parity()` validator in `.agents/scripts/verify_docs_invariants.py` + official policy enforcement in `AGENTS.md`: new documentation PRs require `.md` + `.es.md` pairs in the same commit. | Integrate into `make lint-docs` and `./.agents/scripts/certify_task_completion.sh`. | `10/10` gate blocking on EN/ES desynchronization. |

---

## 5. Automated Parity Validator Design (`verify_docs_invariants.py`)

In Phase D, `check_bilingual_pair_parity(root: Path)` executes four deterministic **Zero-LLM** checks on every declared pair `(doc.md, doc.es.md)`:
1. **Mutual Existence & Banner:** Both paths exist, have `size > 0`, and reciprocally link to their counterpart within the first 10 lines.
2. **Structural Parity (`H2`/`H3`):** The count of `##` and `###` headings matches exactly between `.md` and `.es.md` (`abs(len_en - len_es) == 0`).
3. **Normative Identifier Parity:** All stable codes (`SEC-\d+`, `QA-[A-Z0-9-]+`, `VIBE-[A-Z]+-\d+`, `UI-11X-\d+`, MCP tool names, and `blueprint://*` URIs) present in one language appear identically in the other.
4. **Internal Link Hygiene:** Relative links inside `doc.md` point preferably to `.md` siblings, and links inside `doc.es.md` point to `.es.md` siblings (whenever a mirror exists).
