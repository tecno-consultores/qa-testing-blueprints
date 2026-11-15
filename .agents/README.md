# 🤖 Carpeta `.agents/` — Gobernanza de Inteligencia Artificial y Reglas de Calidad 11X (QA Blueprints)

Bienvenido a la carpeta de configuración y gobernanza para **Agentes de Inteligencia Artificial** y **Desarrolladores Humanos** del repositorio **QA Testing Blueprints**.

Este directorio implementa el estándar abierto y emergente de la industria para agentes autónomos (Google Antigravity, Anthropic Claude Code / Claude Desktop, Hermes Agent de Nous Research, Cursor, Windsurf, etc.), proporcionando el contexto técnico, las restricciones de seguridad y las compuertas de calidad necesarias para mantener cualquier proyecto en el estándar de calidad corporativa **Nivel 11X**.

---

## 📂 Estructura del Directorio

```text
.agents/
├── README.md                                         # Este documento explicativo
├── rules/                                            # Reglas y directivas de comportamiento forzadas (8 archivos canónicos globales)
│   ├── mandatory_qa_pyramid_and_doc_sync.md          # Pirámide de pruebas multi-capa, propagación transversal Anti-Silo y sync documental
│   ├── secure_development_and_testing_guidelines.md  # DISA ASD STIG V6R5 + OWASP v4.2: Anti-Mocks, RLS, sesiones, NFKC, XXE, auditoría semántica anti-UUID, SBOM y geometría visual
│   ├── frontend_parity_and_closure.md                # Paridad terminal-UI, tablas mutables, Refresco Dual ([ 🔄 Refrescar ]) y protocolo de cierre
│   ├── continuous_agent_evolution.md                 # Evolución autónoma de .agents/ y aislamiento de reglas de dominio (domain_*.md)
│   ├── anti_regression_and_side_effects_guardrail.md # Blindaje contra regresiones y control de radio de impacto
│   ├── ground_truth_fixtures_and_negative_invariants.md # Fixtures trimodales, Ciclo Temporal de 3 Fases e invariantes negativos
│   ├── active_task_and_planning_resilience.md        # Bitácora en caliente (.agents/ACTIVE_TASK.md) y resiliencia ante caídas de sesión
│   └── git_closure_gate.md                           # Compuerta QA-GIT-GATE-01 (commit local certificado, cero git push automático)
├── skills/                                           # Habilidades y Playbooks de dominio (10 skills modulares del catálogo)
│   ├── qa-11x-architect/                             # Skill Maestra: 13 capas, 10 leyes 11X, 11 reglas UAT Anti-Blindness y 9 references/
│   ├── qa-11x-docker-certifier/                      # Certificación 11X en Docker efímero (>=95% cobertura)
│   ├── qa-11x-devsecops-hardener/                    # Endurecimiento DISA ASD STIG V6R5 (34 reglas) & OWASP v4.2
│   ├── qa-11x-systematic-debugging/                  # Depuración determinista en 4 fases (Rule Zero + AST Blast Radius)
│   ├── qa-11x-screenplay-builder/                    # Arquitectura E2E Screenplay Pattern, Anti-JSDOM y aserciones temporales
│   ├── qa-11x-llm-evaluator/                         # Evaluación dual-mode de LLMs, RAG, voz y red-teaming OWASP LLM Top 10
│   ├── qa-11x-vibe-rescue/                           # Rescate 5-etapas de prototipos AI Vibe-to-Enterprise
│   ├── docker-trivy-keydb-hardening/                 # Endurecimiento Docker, Trivy = 0 y KeyDB multi-hilo
│   ├── graphify-ast-navigator/                       # Navegación AST, radio de impacto (Blast Radius) y selector diferencial
│   └── refactoring-ui/                               # Jerarquía visual, escalas discretas, color OKLCH, tabular-nums y WCAG 2.1 AA (SKILL.md + 9 references/)
└── scripts/                                          # Scripts de automatización y compuertas de calidad (20 scripts)
    ├── verify_alembic_orm_parity.py                  # Auditoría estricta: modelos ORM vs migraciones de BD (y revision <= 32 chars)
    ├── verify_json_no_duplicate_keys.py              # Auditoría estricta anti-colisión de claves duplicadas en JSON i18n
    ├── verify_topological_health.py                  # Auditoría estricta de salud topológica y límites de capas AST
    ├── inspect_blast_radius.py                       # Análisis bidireccional AST de radio de impacto y Code Q&A
    ├── select_tests_by_blast_radius.py               # Selector determinista de suites QA por radio de impacto AST
    ├── verify_zero_orphan_vue_components.py          # Auditoría estricta: paridad y cobertura de componentes UI (0 huérfanos)
    ├── verify_no_orphan_api_endpoints.py             # Auditoría bidireccional: paridad de endpoints API Front-Back (0 huérfanos 404/405)
    ├── verify_roadmap_consistency.py                 # Auditoría bidireccional: coherencia de ROADMAP.md y ACTIVE_TASK.md
    ├── verify_docs_invariants.py                     # Auditoría de presupuesto cognitivo (<12KB arquitecto / <20KB skills / <=40 líneas) y paridad Dual-Consumer 1:1
    ├── verify_diff_coverage.py                       # Compuerta de cobertura diferencial 100% línea / >=90% rama Multi-Stack
    ├── track_findings_state.py                       # Rastreador de estado de hallazgos y cortacircuitos anti-loop (exit 42)
    ├── generate_pr_verdict.py                        # Generador determinista de PR_VERDICT.md y atestación SHA-256
    ├── lint_test_antipatterns.py                     # Linter AST contra mocks ciegos de auditoría y regresiones UUID
    ├── bump_version_11x.py                           # Sincronizador determinista Zero-LLM de versión y edición 11X
    ├── sync_governance.py                            # Sincronizador criptográfico SHA-256 de manifest.json (100% offline)
    ├── release_readiness_gate.py                     # Evaluador SLA de Release Readiness (GO / NO-GO)
    ├── compact_context_11x.py                        # Compactador de contexto Zero-LLM en 2 niveles
    ├── audit_pagespeed_insights.py                   # Auditor Core Web Vitals / PageSpeed Insights
    ├── validate_calm_architecture.sh                 # Validador de arquitectura FINOS CALM en Docker efímero
    └── certify_task_completion.sh                    # Compuerta de certificación pre-commit automatizada (10 etapas)
```

---

## 🌐 Estrategia Lingüística y Optimización de Tokens (Inglés Técnico vs. Español Humano)

> **PREMISA DE DISEÑO ARQUITECTÓNICO:**  
> Las instrucciones destinadas al consumo interno de los modelos de IA (`rules/` y `skills/`) están redactadas en **inglés técnico compacto de alta densidad**, mientras que la documentación para humanos adopta la arquitectura bilingüe **Inglés Canónico (`*.md`) + Espejo 1:1 en Español (`*.es.md`)** (`README.{md,es.md}`, `TESTING.{md,es.md}`, `CHANGELOG.{md,es.md}`, `SECURITY.{md,es.md}`, `ROADMAP.{md,es.md}`, `docs/agent-setup.{md,es.md}`, `mcp-server/`, con `docs/01..04*.md` y stacks migrando en Fases B–C, más política *Dynamic Mirroring* en consumidores).

### ¿Por qué las directivas de IA están en inglés?

1. **Economía de Tokens en la Ventana de Contexto (~35% de Ahorro):**
   - Los tokenizadores de frontera basados en BPE (*Byte-Pair Encoding*, ej. Tiktoken, Gemini Tokenizer, Claude Tokenizer) dividen las palabras en español en una mayor cantidad de fragmentos o subtokens debido a sufijos, conjugaciones y menor frecuencia estadística en los corpus de entrenamiento masivo.
   - Redactar las reglas y habilidades en inglés técnico de alta densidad reduce drásticamente el consumo de tokens en el prompt de sistema en cada interacción, dejando mayor espacio disponible en el contexto para el código fuente del proyecto, esquemas de bases de datos y trazas de depuración.

2. **Menor Latencia y Mayor Velocidad de Respuesta:**
   - Menos tokens de entrada se traducen directamente en menor tiempo de procesamiento (*Time-To-First-Token* y tiempo de procesamiento por turno) en herramientas de IA autónomas.

3. **Adherencia Semántica y Rigor Lógico Superior:**
   - La literatura técnica de software y estándares de seguridad (RFCs, DISA ASD STIG V6R5, OWASP Developer Guide / ASVS / WSTG / API Top 10 / OSHP / CycloneDX, CIS Benchmark, RLS, FIPS 140-3 AES-256-GCM, WCAG 2.1 AA) tienen su máxima densidad conceptual y precisión de alineación en inglés. Los modelos exhiben un cumplimiento de instrucciones (*instruction following*) más estricto y predecible al procesar directivas en este idioma.

4. **Garantía Inviolable de Salida en Español (`OUTPUT LANGUAGE CONSTRAINT`):**
   - Para garantizar que el desarrollador reciba siempre explicaciones claras y fluidas en su lengua materna, cada archivo en `.agents/rules/` y `.agents/skills/` incluye la directiva forzada:
     ```markdown
     > **OUTPUT LANGUAGE CONSTRAINT:**
     > Always communicate with the user, provide status updates, explain reasoning,
     > and write commit messages / user-facing documentation in Spanish.
     ```

5. **Revelación Progresiva en 3 Niveles (*3-Tier Progressive Disclosure*) y Economía Cognitiva de Tokens (*High-IQ Token Economy*):**
   - **Nivel 1 (Conector `AGENTS.md` / `GEMINI.md`):** Índice ligero siempre activo (`< 35 líneas`) que clasifica la tarea en **3 Vías Proporcionales de Ejecución**: `DOCS_ONLY` (Fast-Path documental), `MICRO_CHANGE` (Vía Quirúrgica para `<= 3` archivos y `LOW` Blast Radius) y `FULL_11X` / `CODE_CHANGE` (Flujo completo de 11 pasos para cambios arquitectónicos).
   - **Nivel 2 (`SKILL.md` Ejecutivo):** Resume las 10 Leyes, las 11 Reglas UAT Anti-Blindness (incluyendo *Zero Hardcoded Pass*, `SEC-16`, `QA-HEALTH-01`, `QA-CLI-TTY-01`, `QA-CONTRACT-SDK-01` y `QA-DOCKER-LOCK-01`), los 7 Playbooks y las **6 Estrategias Cognitivas de Ahorro de Tokens** (`Graphify AST-First, Grep-Fallback, Windowed-Read-Second`, `Zero Redundant Re-Read`, `Parallel Tool Batching`, `Subagent Context Isolation <= 20 líneas`, `Pass-Quiet Terminal Filtering` y `Compact ACTIVE_TASK.md <= 40 líneas`) sin duplicar párrafos completos de `.agents/rules/`.
   - **Nivel 3 (`references/*.md` y `.agents/rules/*.md`):** Se cargan bajo demanda estricta únicamente cuando la tarea toca ese stack o dominio específico.

---

## 🤝 Compatibilidad Multi-Agente

Esta carpeta **NO es exclusiva de una sola herramienta**. Ha sido diseñada bajo especificaciones estándar y portables:

1. **Google Antigravity:** Carga automáticamente las directivas en `rules/` y expone las habilidades en `skills/` en cada sesión de trabajo.
2. **Anthropic Claude Code / Claude Desktop:** Puede consumir los playbooks de `skills/` y leer `rules/` como System Prompt contextual.
3. **Hermes Agent (Nous Research):** Compatible nativo para agentes de terminal autónomos conectados vía Model Context Protocol (MCP).
4. **Cursor / Windsurf / Copilot:** Las directivas de `rules/` y `AGENTS.md` en la raíz son leídas automáticamente como reglas de contexto para generación de código.
5. **Ingenieros y Desarrolladores Humanos:** Funciona como un catálogo centralizado de directivas ("guía de estilo viva") que explica exactamente cómo probar el sistema, qué trampas evitar (ej. mocks ciegos de base de datos) y cómo certificar la entrega.

---

## 🔒 Seguridad y Versionado en Git

**¿Es seguro y recomendable versionar `.agents/` en Git?**
**Sí, es 100% recomendable y una práctica de ingeniería de software moderna:**
- **Cero Secretos:** Este directorio solo contiene directivas en Markdown, configuraciones de muestra (`.json`, `.yaml`) y scripts en Python/Bash. No contiene tokens de producción, contraseñas ni variables de entorno.
- **Reproducibilidad:** Permite que cualquier desarrollador que clone el repositorio obtenga inmediatamente un agente de IA calibrado y alineado con las reglas del estándar 11X, sin riesgo de que introduzca código roto, modelos sin migración o fallos de seguridad.
- **Auditoría Continua:** Cualquier script añadido a `.agents/scripts/` es auditado por `ShellCheck` y `./scripts/verificar-secretos.sh` en el pipeline de CI/CD.

---

## 🚀 Cómo Usar las Automatizaciones

Para certificar localmente que una tarea cumple con todos los requisitos antes de hacer commit:

```bash
# Ejecutar compuerta integral de certificación 11X
./.agents/scripts/certify_task_completion.sh

# Auditar paridad 100% de componentes Vue sin huérfanos
python3 ./.agents/scripts/verify_zero_orphan_vue_components.py

# Auditar que no existen modelos ORM huérfanos sin migración
python3 ./.agents/scripts/verify_alembic_orm_parity.py
```
