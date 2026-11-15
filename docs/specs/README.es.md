> 🌐 **Idioma:** [🇺🇸 English](README.md) · **Español** (Espejo 1:1)

# 📐 Índice de Especificaciones Técnicas (ADRs y Specs `01..20`)

Índice bilingüe central de las **20 especificaciones técnicas** que rigen **QA Testing Blueprints (`QA-11X v3.0`)**. Conforme a la política definida en la Spec 19 (§3.4), las especificaciones históricas `01..18` permanecen en español como registros arquitectónicos inmutables, mientras que la documentación v3.0+ adopta la arquitectura **Inglés Primario (`*.md`) + Espejo Español 1:1 (`*.es.md`)**.

---

## 1. Catálogo de Especificaciones (`01` – `20`)

| # | Archivo de Especificación | Propósito Técnico | Estado |
| :---: | :--- | :--- | :--- |
| `01` | [`01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md`](01_SPEC_ARQUITECTURA_ZERO_CLONE_Y_MANIFIESTO_REMOTO.md) | Hidratación remota Zero-Clone desde GitHub y manifiesto criptográfico `SHA-256` (`manifest.json`). | `IMPLEMENTADO Y CERTIFICADO` |
| `02` | [`02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md`](02_SPEC_SKILL_QA_11X_ARCHITECT_E_INSTALADOR.md) | Skill cognitiva modular (`qa-11x-architect`) e instalador universal (`scripts/install-skill.sh`). | `IMPLEMENTADO Y CERTIFICADO` |
| `03` | [`03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md`](03_SPEC_MCP_SERVER_NODE_TS_CORE_Y_TOOLS.md) | Núcleo del servidor MCP en Node.js / TypeScript (`@sinfallas/mcp-qa-11x`), recursos y herramientas 1–4. | `IMPLEMENTADO Y CERTIFICADO` |
| `04` | [`04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md`](04_SPEC_MCP_PARSERS_AUDITOR_STIG_OWASP_Y_GATE.md) | Parsers ahorradores de tokens, auditor de seguridad DISA STIG / OWASP (`audit_security_stig_owasp`) y compuerta 11X. | `IMPLEMENTADO Y CERTIFICADO` |
| `05` | [`05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md`](05_SPEC_PUBLICACION_NPM_Y_AUTOMATIZACION_CI.md) | Flujo soberano de publicación en npm y automatización en Docker efímero sin dependencias de CI externas. | `IMPLEMENTADO Y CERTIFICADO` |
| `06` | [`06_SPEC_AUDITOR_BRECHAS_PIRAMIDE_PRUEBAS_11X.md`](06_SPEC_AUDITOR_BRECHAS_PIRAMIDE_PRUEBAS_11X.md) | Auditor de brechas de la pirámide de pruebas 11X (`audit_test_pyramid_gaps`) y playbook de remediación. | `IMPLEMENTADO Y CERTIFICADO (HITO 7)` |
| `07` | [`07_SPEC_AUTODETECCION_AGENTES_CLI_Y_RESILIENCIA_CDN_NPM.md`](07_SPEC_AUTODETECCION_AGENTES_CLI_Y_RESILIENCIA_CDN_NPM.md) | Autodetección inteligente de agentes CLI en `install-skill` (`npx`/`curl`) y resiliencia ante propagación CDN de npm. | `IMPLEMENTADO Y CERTIFICADO (HITO 8)` |
| `08` | [`08_SPEC_CONECTOR_AGENTS_MD_THIN_REPO_Y_MIGRACION.md`](08_SPEC_CONECTOR_AGENTS_MD_THIN_REPO_Y_MIGRACION.md) | Inyector aditivo no destructivo del conector Thin-Repo `AGENTS.md` (`init-agents`). | `IMPLEMENTADO Y CERTIFICADO (HITO 9)` |
| `09` | [`09_SPEC_DETECCION_PLAYWRIGHT_MCP_Y_PR_EVOLUCION_CONTINUA.md`](09_SPEC_DETECCION_PLAYWRIGHT_MCP_Y_PR_EVOLUCION_CONTINUA.md) | Detección de preparación Browser / Playwright MCP y PRs Zero-Trust de evolución continua (`propose_skill_evolution_pr`). | `IMPLEMENTADO Y CERTIFICADO (HITO 10)` |
| `10` | [`10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md`](10_SPEC_ECOSISTEMA_PHP_8_Y_HERRAMIENTAS_MCP.md) | Ecosistema PHP 8.2–8.5 (`sinfallas/basephpcomposer`), blueprints 11X e integración en servidor MCP. | `IMPLEMENTADO Y CERTIFICADO (HITO 11)` |
| `11` | [`11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md`](11_SPEC_INVARIANTE_ANTI_SILO_CICLO_TEMPORAL_AUDITORIA_Y_REFRESCO_DUAL.md) | Auditores automáticos para propagación cruzada Anti-Silo, ciclo temporal de 3 fases, auditoría anti-UUID y refresco dual. | `IMPLEMENTADO Y CERTIFICADO (HITO 12)` |
| `12` | [`12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md`](12_SPEC_RECONCILIACION_Y_DEDUPLICACION_GOBERNANZA_AGENTS_PROYECTOS.md) | Reconciliación automática, deduplicación y aislamiento de reglas de dominio en `.agents/` (`reconcile-agents`). | `IMPLEMENTADO Y CERTIFICADO (HITO 13)` |
| `13` | [`13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md`](13_SPEC_OPTIMIZACION_EXTREMA_TOKENS_MCP_3_VIAS_Y_PROGRESSIVE_DISCLOSURE.md) | Optimización extrema de tokens MCP, ejecución proporcional en 3 vías (`DOCS_ONLY` / `MICRO_CHANGE` / `FULL_11X`) y Progressive Disclosure. | `IMPLEMENTADO Y CERTIFICADO (HITO 14)` |
| `14` | [`14_LOCAL_LLM_AND_A2A_PROFILES.md`](14_LOCAL_LLM_AND_A2A_PROFILES.md) | Perfiles de inferencia local LLM (`Ollama` / `vLLM`), Tarjeta A2A (`task-capacity`) y compactador Zero-LLM en 2 niveles (`T2.7`). | `IMPLEMENTADO (QA-11X v2.0)` |
| `15` | [`15_ENTERPRISE_TMS_TRACEABILITY.md`](15_ENTERPRISE_TMS_TRACEABILITY.md) | Trazabilidad bidireccional enterprise Zero-Infra entre Jira, Zephyr Scale, Xray y GitHub Issues (`T4.6`). | `IMPLEMENTADO (QA-11X v2.0)` |
| `16` | [`16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md`](16_SPEC_COBERTURA_DIFERENCIAL_MULTISTACK_Y_ANTI_EVASION.md) | Cobertura diferencial multi-stack (`verify_diff_coverage.py`) y compuerta anti-evasión (`Hito 21`). | `COMPLETADO (HITO 21)` |
| `17` | [`17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md`](17_SPEC_CORTACIRCUITOS_ANTI_LOOP_Y_ESTADO_HALLAZGOS.md) | Cortacircuitos anti-loop (`BREAKER-42`) y memoria determinista de hallazgos invariante al desplazamiento de líneas (`track_findings_state.py`, `Hito 22`). | `IMPLEMENTADO Y CERTIFICADO (HITO 22)` |
| `18` | [`18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md`](18_SPEC_MODO_DIFF_BLAST_RADIUS_Y_VEREDICTO_PR.md) | Modo diferencial en `inspect_ast_blast_radius` y exportador ejecutivo `PR_VERDICT.md` (`generate_pr_verdict.py`, `Hito 23`). | `IMPLEMENTADO Y CERTIFICADO (HITO 23)` |
| `19` | [`19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md`](19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md) | Arquitectura documental bilingüe: Inglés Primario (`*.md`) + Espejo Español 1:1 (`*.es.md`) con validación de paridad estructural. | `IMPLEMENTADO Y CERTIFICADO EN QA-11X v3.0` |
| `20` | [`20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md`](20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md) | Imagen Docker base no-root endurecida `sinfallas/base-mobile-appium:26` (OpenJDK 21, Android SDK/ADB, Appium 3 `uiautomator2`/`xcuitest`, WebdriverIO v9) e integración Compose/Makefile. | `IMPLEMENTADO Y CERTIFICADO EN QA-11X v3.0` |

---

## 2. Política de Mantenimiento (Spec 19)

- **ADRs Históricos en Español (`01..18`):** Conservados en español para compatibilidad cero-ruptura de anclas y máximo ROI de mantenimiento.
- **Especificaciones y Blueprints v3.0+:** Las nuevas especificaciones arquitectónicas y guías operativas siguen la convención canónica Inglés (`*.md`) + Espejo Español 1:1 (`*.es.md`) enlazada desde [`README.md`](../../README.md) y [`README.es.md`](../../README.es.md).
