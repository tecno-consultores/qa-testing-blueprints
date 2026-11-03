# 🧠 Especificación 02: Skill Cognitiva (`qa-11x-architect`) e Instalador Universal

**Proyecto:** QA Testing Blueprints (Estándar Corporativo Nivel 11X)  
**Componente:** `.agents/skills/qa-11x-architect/` + `scripts/install-skill.sh`  
**Audiencia de Ejecución:** Gemini 3.8 Flash High / Desarrolladores  
**Estado:** APROBADO PARA IMPLEMENTACIÓN

---

## 1. Propósito de la Skill `qa-11x-architect`

La skill **`qa-11x-architect`** es el cerebro metodológico unificado del repositorio `qa-testing-blueprints`. Condensa las 13 capas de la pirámide de calidad 11X, la fusión quirúrgica no destructiva de archivos `.example`, las reglas Anti-Mock Blindness / Anti-JSDOM y los **22 patrones de seguridad por diseño (DISA ASD STIG V6R5 + OWASP Developer Guide v4.2)** utilizando **Carga Progresiva (*Progressive Disclosure*)**.

### Restricción de Idioma Bimodal (Ahorro de ~35% de Tokens BPE)
- Todos los archivos dentro de `.agents/skills/qa-11x-architect/` (`SKILL.md` y `references/*.md`) DEBEN redactarse en **inglés técnico compacto de alta densidad**.
- Todos DEBEN incluir en su encabezado la directiva:
  `> **OUTPUT LANGUAGE CONSTRAINT:** Always communicate with the user, explain reasoning, write commit messages, and author project documentation strictly in Spanish.`

---

## 2. Estructura de Directorios Exacta de la Skill

```text
.agents/skills/qa-11x-architect/
├── SKILL.md                                  # Cerebro: detección MCP vs Fallback, 10 Leyes 11X y Playbooks
└── references/                               # Archivos cargados bajo demanda según el stack o tarea
    ├── 01-core-13-layers.md                  # Las 13 capas, Anti-Mock Blindness, Anti-JSDOM, Trimodal Fixtures
    ├── 02-security-disa-owasp-22.md          # Tabla y reglas de los 22 patrones DISA STIG V6R5 + OWASP v4.2
    ├── 03-stack-python-fastapi.md            # Reglas y comandos para Python standalone y FastAPI
    ├── 04-stack-node-vue-react.md            # Reglas y comandos para Node.js, Vue 3 y React
    └── 05-stack-bash-devops.md               # Reglas y comandos para Bash / DevOps (BATS, ShellCheck, kcov)
```

---

## 3. Especificación Detallada de `SKILL.md`

### 3.1. YAML Frontmatter Obligatorio
```yaml
---
name: qa-11x-architect
description: >-
  Master QA 11X & DevSecOps Architect (qa-testing-blueprints v2.7+). Use whenever the user asks to
  initialize or integrate QA in a project, merge .example templates, write or audit unit/BDD/mutation/E2E
  tests, enforce >=95% coverage, apply DISA ASD STIG V6R5 and OWASP v4.2 security controls, run ephemeral
  Docker QA suites (Rule Zero), or update TESTING.md and CHANGELOG.md.
---
```

### 3.2. Secciones Obligatorias dentro de `SKILL.md`

1. **Environment Detection & Execution Protocol (MCP-First vs. Direct GitHub Hydration Fallback):**
   - **Case A — MCP Server `qa-11x` (`@sinfallas/mcp-qa-11x`) is available:**
     1. Call `inspect_project_config(project_path)` FIRST (Zero-Shot Accuracy).
     2. Call `fetch_blueprint_bundle(stack, project_path)` to retrieve fresh `.example` templates and `.agents/` scripts verified via SHA-256 from GitHub.
     3. Call `audit_security_stig_owasp(project_path)` to detect missing DISA STIG V6R5 / OWASP v4.2 controls.
     4. Call `run_ephemeral_qa(project_path, stage)` to execute tests in ephemeral `sinfallas/*` containers and receive token-efficient JSON summaries.
     5. Call `certify_11x_gate(project_path)` before completing the task.
   - **Case B — No MCP Server available (Terminal / Cloud / Standalone Skill Mode):**
     1. Read only the matching stack reference file inside `references/` (`03-stack-python-fastapi.md`, `04-stack-node-vue-react.md`, or `05-stack-bash-devops.md`), plus `01-core-13-layers.md` and `02-security-disa-owasp-22.md` when needed.
     2. If terminal access is available and `.example` files are needed, hydrate only the required stack files directly from GitHub Raw without cloning the repository:
        ```bash
        RAW_BASE="https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main"
        curl -fsSL "$RAW_BASE/manifest.json" -o /tmp/qa11x_manifest.json
        ```
        And download only the files listed under `.stacks["<stack>"].files` and `.common_files`, verifying their `sha256` hashes with `sha256sum -c`.

2. **The 10 Non-Negotiable Laws of Standard 11X:**
   - **Law 1 (Rule Zero — Ephemeral Docker Execution):** Never run `pip`, `uv`, `pytest`, `npm`, `pnpm`, `vitest`, or linters on the host OS. Use `make qa-*` or `docker compose -f docker-compose.qa.yml run --rm ...` with `sinfallas/*` images and named cache volumes (`uv-cache`, `pnpm-store`).
   - **Law 2 (Fail & Forbid Thresholds):** Unit coverage `>= 95.0%` (including `catch`/`except` branches), Cyclomatic Complexity Grade A/B (`CC <= 5` in Radon / SonarJS), 0 SAST/DAST/IaC High/Critical vulnerabilities, 0 surviving critical mutants.
   - **Law 3 (Strict Network Isolation in Unit Tests vs. Anti-Mock Blindness in DB):** Block external internet calls in unit tests (`pytest-mock`, `nock`, `msw`, `bats-mock`). Never mock SQL execution or ORM schema parity: verify migrations against real ephemeral `postgres:17-alpine` (`verify_alembic_orm_parity.py`).
   - **Law 4 (Visual Geometry & Anti-JSDOM):** JSDOM returns `0x0` bounding boxes. Prohibit fixed floating footers (`position: fixed`) over interactive content; enforce in-flow footers (`margin-top: auto` inside `<main>`) and validate in real headless Chrome (Karate UI / Playwright + `@axe-core` WCAG 2.1 AA).
   - **Law 5 (Non-Destructive Surgical Merge of `.example` Files):** Merge linters, test runners, and QA scripts from `.example` files into existing project config files (`pyproject.toml`, `package.json`, `Makefile`) without deleting any pre-existing production dependency or business script.
   - **Law 6 (Mandatory Karate Labs BDD, Zero Orphan UI Components & Zero Orphan API Endpoints):** Every API endpoint and UI view requires Karate Labs `.feature` scenarios (`api_test.feature`, `ui_business_flow.feature`). Every `.vue`/`.tsx` component requires a `.unit.ts` test (`verify_zero_orphan_vue_components.py`), and every frontend HTTP call must match a registered backend route (`verify_no_orphan_api_endpoints.py`).
   - **Law 7 (DISA ASD STIG V6R5 & OWASP v4.2 Security-by-Design):** Enforce all 22 canonical patterns (PostgreSQL `FORCE RLS`, SSRF DNS validation, FIPS 140-3 AES-256-GCM + memory zeroization, `Idempotency-Key`, `extra="forbid"`, CSWSH `4403`, 10m/15m role idle timeouts, 3-attempt/15m lockout with constant-time Argon2id, `NFKC` canonicalization, anti-XXE, magic-byte file uploads, HMAC-chained logs with 0 secrets and 75% storage alert, OWASP OSHP headers, Fail-Secure startup, OWASP API Top 10 2023, CycloneDX SBOM & `pytm`).
   - **Law 8 (Universal RED Observability Pre-Chaos):** Instrument `/metrics` (Prometheus) or `Pushgateway` before running Pumba + Locust/Artillery chaos profiles.
   - **Law 9 (Trimodal Ground-Truth Fixtures & Anti-Regression):** Test external integrations with 3 fixtures (Virgin/Unconfigured, Nominal, Degraded) and inspect AST blast radius (`inspect_blast_radius.py`) before refactoring shared modules.
   - **Law 10 (Living Logbook & Closure Gate):** Continuously update `TESTING.md`, `CHANGELOG.md`, and `README.md`, and run `certify_task_completion.sh` before finishing.

3. **4 Operational Playbooks (Decision Tree):**
   - **Playbook 1 — Project Bootstrap & Surgical Merge:** Detect stack $\rightarrow$ Fetch stack `.example` bundle $\rightarrow$ Surgically merge config files $\rightarrow$ Install `lefthook.yml`, `auditar-infra.sh`, `scripts/verificar-secretos.sh`, and `.agents/scripts/`.
   - **Playbook 2 — Test Creation & Coverage Rescue (`< 95%`):** Inspect uncovered lines $\rightarrow$ Write isolated `.unit.py`/`.unit.ts` tests + DB parity tests + Karate `.feature` scenarios $\rightarrow$ Run `make qa-unit` and `make qa-bdd`.
   - **Playbook 3 — DISA STIG V6R5 & OWASP v4.2 Hardening:** Audit against `references/02-security-disa-owasp-22.md` $\rightarrow$ Inject missing middlewares/validators $\rightarrow$ Add negative security unit & BDD assertions.
   - **Playbook 4 — 11X Certification & Closure:** Run `make qa-all` $\rightarrow$ Run `certify_task_completion.sh` $\rightarrow$ Update `TESTING.md` & `CHANGELOG.md`.

---

## 4. Especificación de los 5 Archivos en `references/`

1. **`references/01-core-13-layers.md`:**
   - Tabla compacta de las 13 capas con herramientas, umbrales exactos y comandos `make`, más las reglas de Anti-Mock Blindness, Anti-JSDOM y Fixtures Trimodales.
2. **`references/02-security-disa-owasp-22.md`:**
   - Matriz de referencia rápida de los **22 patrones de seguridad** (IDs `APSC-DV-...` / `V-222...` y secciones OWASP v4.2) con snippets condensados listos para inyectar en Python/FastAPI, Node/TS, Vue/React y Bash.
3. **`references/03-stack-python-fastapi.md`:**
   - Reglas condensadas de `python/README.md` y `fastapi/README.md`, estructura de `pyproject.toml.example`, `Makefile.example`, `docker-compose.qa.yml` (con `postgres:17-alpine` y `eqalpha/keydb:alpine`), e instrumentación Prometheus / Pushgateway.
4. **`references/04-stack-node-vue-react.md`:**
   - Reglas condensadas de `node-backend/README.md`, `vue3/README.md` y `react-frontend/README.md`, `.npmrc` (`ignore-scripts=true`), fronteras `.unit.ts` vs `.e2e.ts`, Playwright + `@axe-core`, Lighthouse CI, Karate UI y **sinergia obligatoria con `.agents/skills/refactoring-ui/`** (jerarquía Primario/Secundario/Terciario con 1 solo botón primario, color perceptual OKLCH sin texto translúcido, `tabular-nums` para `CLS = 0`, `outline-hidden` y cero scroll horizontal en `375px`/`768px`/`1440px`).
5. **`references/05-stack-bash-devops.md`:**
   - Reglas condensadas de `bash-scripts/README.md`, `ShellCheck`, `shfmt`, `BATS-core`, `bats-mock`, `kcov` (`>= 95%`) y métricas `Pushgateway`.

---

## 5. Especificación del Instalador Universal de la Skill

Para que cualquier persona pueda instalar la Skill en **1 segundo** sin clonar el repositorio, se proveerán dos mecanismos idénticos en comportamiento:

### 5.1. Vía `npx` (Integrado en el paquete npm del MCP)
```bash
npx -y @sinfallas/mcp-qa-11x@latest install-skill --target [auto|antigravity|claude|cursor|hermes|workspace|all] --init-agents --include-scripts
```

### 5.2. Vía Script Independiente (`scripts/install-skill.sh`)
```bash
curl -fsSL https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/scripts/install-skill.sh | sh
```

### 5.3. Rutas de Destino Soportadas por el Instalador
El instalador detectará o permitirá elegir dónde colocar **`qa-11x-architect/`** y **`refactoring-ui/`** (con su `SKILL.md` y sus 9 archivos `references/*.md`):
1. **Proyecto Actual (`workspace`, por defecto si existe `.git`):** `./.agents/skills/qa-11x-architect/` y `./.agents/skills/refactoring-ui/`
2. **Google Antigravity (Global Usuario):** `~/.gemini/config/skills/qa-11x-architect/` y `~/.gemini/config/skills/refactoring-ui/`
3. **Claude Code / Desktop (Global Usuario):** `~/.claude/skills/qa-11x-architect/` y `~/.claude/skills/refactoring-ui/`
4. **Cursor / Windsurf (Proyecto):** `./.agents/skills/qa-11x-architect/` y `./.agents/skills/refactoring-ui/` + enlace en `.cursor/rules/` si aplica.
5. **Verificación de Integridad:** El instalador descargará `manifest.json`, verificará el hash SHA-256 de cada archivo de `qa-11x-architect/` y `refactoring-ui/` antes de escribirlo en disco y mostrará un resumen en español de los archivos instalados.
