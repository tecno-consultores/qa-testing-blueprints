> 🌐 **Language:** **English** (Canonical) · [🇪🇸 Leer en Español](README.es.md)

# 📐 Technical Specifications Index (ADRs & Specs `01..20`)

Central bilingual index of all **20 technical specifications** governing **QA Testing Blueprints (`QA-11X v3.0`)**. Under the policy established in Spec 19 (§3.4), historical specifications `01..18` remain in Spanish as immutable architectural records, while v3.0+ documentation adopts the **English-Primary (`*.md`) + 1:1 Spanish Mirror (`*.es.md`)** architecture.

---

## 1. Specifications Catalog (`01` – `20`)

| # | Specification File | Technical Purpose | Status |
| :---: | :--- | :--- | :--- |
| `01` | [`01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md`](01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md) | Zero-Clone remote hydration from GitHub and cryptographic `SHA-256` manifest (`manifest.json`). | `IMPLEMENTED & CERTIFIED` |
| `02` | [`02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md`](02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md) | Modular cognitive skill (`qa-11x-architect`) and universal installer (`scripts/install-skill.sh`). | `IMPLEMENTED & CERTIFIED` |
| `03` | [`03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md`](03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md) | Node.js / TypeScript MCP server (`@sinfallas/mcp-qa-11x`) core, resources, and tools 1–4. | `IMPLEMENTED & CERTIFIED` |
| `04` | [`04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md`](04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md) | Token-saving parsers, DISA STIG / OWASP security auditor (`audit_security_stig_owasp`), and 11X gate. | `IMPLEMENTED & CERTIFIED` |
| `05` | [`05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md`](05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md) | Sovereign npm publishing workflow and ephemeral Docker automation without external CI dependencies. | `IMPLEMENTED & CERTIFIED` |
| `06` | [`06_SPEC_AUDITOR_BRECHAS_PIRAMIDE_PRUEBAS_11X.md`](06_SPEC_AUDITOR_BRECHAS_PIRAMIDE_PRUEBAS_11X.md) | 11X testing pyramid gap auditor (`audit_test_pyramid_gaps`) and remediation playbook. | `IMPLEMENTED & CERTIFIED (HITO 7)` |
| `07` | [`07_SPEC_AUTODETECCION_AGENTES_CLI_Y_RESILIENCIA_CDN_NPM.md`](07_SPEC_AUTODETECCION_AGENTES_CLI_Y_RESILIENCIA_CDN_NPM.md) | Smart CLI AI agent auto-detection in `install-skill` (`npx`/`curl`) and npm CDN propagation resilience. | `IMPLEMENTED & CERTIFIED (HITO 8)` |
| `08` | [`08_SPEC_CONECTOR_AGENTS_MD_THIN_REPO_Y_MIGRACION.md`](08_SPEC_CONECTOR_AGENTS_MD_THIN_REPO_Y_MIGRACION.md) | Additive, non-destructive `AGENTS.md` Thin-Repo connector injector (`init-agents`). | `IMPLEMENTED & CERTIFIED (HITO 9)` |
| `09` | [`09_SPEC_DETECCION_PLAYWRIGHT_MCP_Y_PR_EVOLUCION_CONTINUA.md`](09_SPEC_DETECCION_PLAYWRIGHT_MCP_Y_PR_EVOLUCION_CONTINUA.md) | Browser / Playwright MCP readiness detection and Zero-Trust continuous evolution PRs (`propose_skill_evolution_pr`). | `IMPLEMENTED & CERTIFIED (HITO 10)` |
| `10` | [`10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md`](10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md) | PHP 8.2–8.5 ecosystem (`sinfallas/basephpcomposer`), 11X blueprints, and MCP server integration. | `IMPLEMENTED & CERTIFIED (HITO 11)` |
| `11` | [`11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md`](11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md) | Automated auditors for Anti-Silo cross-module propagation, 3-phase temporal lifecycle, anti-UUID audit integrity, and dual refresh. | `IMPLEMENTED & CERTIFIED (HITO 12)` |
| `12` | [`12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md`](12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md) | Automated reconciliation, deduplication, and domain-rule isolation in `.agents/` (`reconcile-agents`). | `IMPLEMENTED & CERTIFIED (HITO 13)` |
| `13` | [`13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md`](13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md) | Extreme MCP token optimization, 3-way proportional execution (`DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`), and Progressive Disclosure. | `IMPLEMENTED & CERTIFIED (HITO 14)` |
| `14` | [`14_LOCAL_LLM_AND_A2A_PROFILES.md`](14_LOCAL_LLM_AND_A2A_PROFILES.md) | Local LLM inference profiles (`Ollama` / `vLLM`), A2A Agent Card (`task-capacity`), and 2-level Zero-LLM compactor (`T2.7`). | `IMPLEMENTED (QA-11X v2.0)` |
| `15` | [`15_ENTERPRISE_TMS_TRACEABILITY.md`](15_ENTERPRISE_TMS_TRACEABILITY.md) | Zero-Infra bidirectional enterprise TMS traceability across Jira, Zephyr Scale, Xray, and GitHub Issues (`T4.6`). | `IMPLEMENTED (QA-11X v2.0)` |
| `16` | [`16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md`](16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md) | Multi-stack differential coverage (`verify_diff_coverage.py`) and anti-evasion gate (`Hito 21`). | `COMPLETED (HITO 21)` |
| `17` | [`17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md`](17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md) | Anti-loop circuit breaker (`BREAKER-42`) and line-shift-invariant finding state memory (`track_findings_state.py`, `Hito 22`). | `IMPLEMENTED & CERTIFIED (HITO 22)` |
| `18` | [`18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md`](18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md) | Differential mode in `inspect_ast_blast_radius` and executive `PR_VERDICT.md` exporter (`generate_pr_verdict.py`, `Hito 23`). | `IMPLEMENTED & CERTIFIED (HITO 23)` |
| `19` | [`19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md`](19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md) | Bilingual documentation architecture: English-Primary (`*.md`) + 1:1 Spanish Mirror (`*.es.md`) with structural parity validation. | `IMPLEMENTED & CERTIFIED IN QA-11X v3.0` |
| `20` | [`20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md`](20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md) | Hardened non-root `sinfallas/base-mobile-appium:26` Docker image (OpenJDK 21, Android SDK/ADB, Appium 3 `uiautomator2`/`xcuitest`, WebdriverIO v9) and Compose/Makefile integration. | `IMPLEMENTED & CERTIFIED IN QA-11X v3.0` |

---

## 2. Maintenance Policy (Spec 19)

- **Historical Spanish ADRs (`01..18`):** Preserved in Spanish for zero-breakage anchor compatibility and maintenance ROI.
- **v3.0+ Specifications & Stack Blueprints:** New architectural specs and operational guides follow the canonical English (`*.md`) + 1:1 Spanish Mirror (`*.es.md`) convention linked from the root [`README.md`](../../README.md) and [`README.es.md`](../../README.es.md).
