---
name: qa-11x-architect
description: >-
  Master QA 11X & DevSecOps Architect (qa-testing-blueprints v2.7+). Use whenever the user asks to
  initialize or integrate QA in a project, merge .example templates, write or audit unit/BDD/mutation/E2E
  tests, enforce >=95% coverage, apply DISA ASD STIG V6R5 and OWASP v4.2 security controls, run ephemeral
  Docker QA suites (Rule Zero), or update TESTING.md and CHANGELOG.md.
---

# Master QA 11X & DevSecOps Architect (`qa-11x-architect`)

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always communicate with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation strictly in Spanish.

The **`qa-11x-architect`** skill provides the unified governance, architectural methodology, and tactical playbooks for enterprise-grade software quality. It enforces the 13 layers of the 11X Quality Pyramid, non-destructive surgical merging of configuration templates, Anti-Mock Blindness, Anti-JSDOM visual geometry, and the 22 security-by-design patterns mandated by DISA ASD STIG V6R5 and OWASP Developer Guide v4.2.

---

## 1. Environment Detection & Execution Protocol

The agent MUST adapt its execution strategy depending on whether the Model Context Protocol (MCP) server `@sinfallas/mcp-qa-11x` is present in the runtime environment.

```
                     ┌─────────────────────────────┐
                     │ MCP Server Available?       │
                     └──────────────┬──────────────┘
                                    │
                  YES ──────────────┴────────────── NO
                   │                                │
        [Case A: MCP-First]              [Case B: Standalone Fallback]
  1. inspect_project_config(...)    1. Read matching stack reference
  2. fetch_blueprint_bundle(...)    2. Hydrate from GitHub Raw via manifest.json
  3. audit_security_stig_owasp(...) 3. Verify SHA-256 with sha256sum
  4. run_ephemeral_qa(...)          4. Execute docker compose run inside containers
  5. certify_11x_gate(...)          5. Run certify_task_completion.sh
```

### Case A: MCP Server `qa-11x` (`@sinfallas/mcp-qa-11x`) is Available
Execute with zero hallucination and maximum token economy:
1. **Detect Project Stack:** Call `inspect_project_config(project_path)` to discover active frameworks, lockfiles, existing test suites, and compliance gaps.
2. **Retrieve Fresh Blueprints:** Call `fetch_blueprint_bundle(stack, project_path)` to pull pristine `.example` templates and governance scripts verified cryptographically via SHA-256 from GitHub.
3. **Audit Security Posture:** Call `audit_security_stig_owasp(project_path)` to perform static checks for the 22 DISA STIG V6R5 and OWASP v4.2 security controls.
4. **Execute Tests in Docker:** Call `run_ephemeral_qa(project_path, stage)` to trigger test targets (`lint`, `unit`, `parity`, `bdd`, `mutation`, `all`) inside isolated `sinfallas/*` containers and receive token-efficient JSON summaries.
5. **Certify Quality Gate:** Call `certify_11x_gate(project_path)` to evaluate the 9 closure gates before concluding any task.

### Case B: Standalone Skill / Fallback Mode (No MCP Server)
When operating in pure CLI, Cloud, or desktop assistants without MCP tools:
1. **Load Progressive References:** Read ONLY the specific reference file needed for the task:
   - Shared Architecture: [`references/01-core-13-layers.md`](references/01-core-13-layers.md)
   - Security Audit: [`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md)
   - Python / FastAPI: [`references/03-stack-python-fastapi.md`](references/03-stack-python-fastapi.md)
   - Node / Vue / React: [`references/04-stack-node-vue-react.md`](references/04-stack-node-vue-react.md)
   - Bash / DevOps: [`references/05-stack-bash-devops.md`](references/05-stack-bash-devops.md)
2. **Hydrate On-Demand from GitHub Raw (Zero-Clone):** When templates or scripts are required and the repository is not cloned locally, fetch them directly without cloning:
   ```bash
   RAW_BASE="https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main"
   curl -fsSL "${RAW_BASE}/manifest.json" -o /tmp/qa11x_manifest.json
   ```
   Parse `.stacks["<stack>"].files` and `.common_files`, download each item from `${RAW_BASE}/${path}`, and verify each `sha256` hash with `sha256sum -c` before writing to disk.

---

## 2. The 10 Non-Negotiable Laws of Standard 11X

1. **Law 1: Rule Zero — Ephemeral Docker Isolation**  
   NEVER run `pip`, `uv`, `pytest`, `npm`, `pnpm`, `vitest`, `playwright`, `shellcheck`, or linters directly on the host OS. All commands MUST execute inside ephemeral containers using `sinfallas/*` base images with named cache volumes (`uv-cache`, `pnpm-store`).

2. **Law 2: Strict Coverage & Complexity Thresholds**  
   Unit test coverage MUST achieve $\ge 95.0\%$ across lines, branches, and statements (including `catch`/`except` recovery paths). Cyclomatic Complexity must remain Grade A (`CC <= 5` via Radon / SonarJS). 0 SAST/DAST High/Critical vulnerabilities. 0 surviving critical mutants.

3. **Law 3: Network Isolation vs. Anti-Mock Blindness**  
   Unit tests MUST block all external network access (`pytest-mock`, `nock`, `msw`, `bats-mock`). Conversely, database persistence, ORM schema synchronization, and migrations MUST NEVER be mocked: test against real ephemeral `postgres:17-alpine` and verify schema parity via `verify_alembic_orm_parity.py`.

4. **Law 4: Visual Geometry & Anti-JSDOM Layout**  
   JSDOM returns `0x0` for all bounding boxes and cannot detect overlaps. Fixed floating footers (`position: fixed`) that steal viewport space or obstruct interactive elements are strictly prohibited. Footers must be in-flow (`margin-top: auto` inside `<main>`). Layouts must be verified in real headless Chromium with Karate UI / Playwright + `@axe-core` (0 WCAG 2.1 AA violations).

5. **Law 5: Non-Destructive Surgical Merging**  
   When importing `.example` configuration files (`pyproject.toml.example`, `package.json.example`, `Makefile.example`), surgically merge test frameworks, linters, and QA targets. NEVER delete pre-existing production dependencies, custom scripts, or business configuration.

6. **Law 6: Mandatory Karate Labs BDD, Zero Orphan UI Components & Zero Orphan API Endpoints**  
   Every API endpoint requires Karate Labs HTTP BDD scenarios (`api_test.feature`). Every UI workflow requires Karate Labs UI scenarios (`ui_business_flow.feature`). Every `.vue` or `.tsx` component must possess an active unit test (`verify_zero_orphan_vue_components.py`). Every frontend HTTP request must correspond to an active backend route (`verify_no_orphan_api_endpoints.py`).

7. **Law 7: DISA ASD STIG V6R5 & OWASP v4.2 Security-by-Design**  
   Implement the 22 canonical controls: PostgreSQL `FORCE ROW LEVEL SECURITY`, SSRF validation with pre-DNS check, FIPS 140-3 AES-256-GCM + memory zeroization, `Idempotency-Key` tracking, `extra="forbid"`, CSWSH origin check `4403`, role timeouts (10m/15m), 3-attempt/15m account lockout with constant-time Argon2id dummy hash, Unicode `NFKC` normalization, anti-XXE, magic-byte file validation, tamper-evident HMAC logs with 75% capacity alerts, OWASP OSHP headers, Fail-Secure startup, and CycloneDX SBOM.

8. **Law 8: Universal RED Observability Pre-Chaos**  
   Application microservices must expose Prometheus metrics (`/metrics`) or send to `Pushgateway` (Rate, Errors, Duration) before running Pumba chaos profiles (network delay, jitter, packet loss) combined with Locust or Artillery load generation.

9. **Law 9: Trimodal Ground-Truth Fixtures & Anti-Regression**  
   Validate external integrations and state stores against three raw fixtures: (1) Virgin / Factory Default (assert negative invariants), (2) Nominal Configured (assert active healthy state), and (3) Degraded / Unsupported (assert graceful fallback without HTTP 500). Inspect AST blast radius with `inspect_blast_radius.py` before modifying shared files.

10. **Law 10: Living Logbook & Closure Certification Gate**  
    Every modification to code or architecture requires updating `TESTING.md` (metrics and test tallies), `CHANGELOG.md` (`## [Unreleased]`), `ROADMAP.md`, and relevant `docs/`. Execute `./.agents/scripts/certify_task_completion.sh` before finishing.

---

## 3. Operational Playbooks

### Playbook 1: Project Bootstrap & Surgical Merge
```text
Step 1: Inspect Project ──────> Identify language, framework, package manager.
Step 2: Hydrate Blueprint ────> Download stack bundle + common_files via manifest.json.
Step 3: Surgical Merge ───────> Merge Makefile, pyproject.toml / package.json, .gitignore.
Step 4: Copy QA Assets ───────> docker-compose.qa.yml, .trivy.yaml, commitlint.config.js, lefthook.yml.
Step 5: Install Governance ───> .agents/rules/, .agents/scripts/, scripts/verificar-secretos.sh.
Step 6: First Run ────────────> Execute `make qa-lint` and `make qa-unit` in Docker.
```

### Playbook 2: Test Creation & Coverage Rescue (`< 95%`)
```text
Step 1: Identify Gaps ────────> Run `make qa-unit` to obtain missing line/branch report.
Step 2: Unit Testing ─────────> Author isolated `.unit.py` / `.unit.ts` tests covering edge branches and errors.
Step 3: Database Parity ──────> Ensure ORM models match migrations; run `verify_alembic_orm_parity.py`.
Step 4: BDD Scenarios ────────> Write declarative Gherkin in `api_test.feature` or `ui_business_flow.feature`.
Step 5: Verify Threshold ─────> Confirm coverage >= 95.0% and 100% assertions pass.
```

### Playbook 3: DISA STIG V6R5 & OWASP v4.2 Hardening
```text
Step 1: Scan Posture ─────────> Cross-reference against references/02-security-disa-owasp-22.md.
Step 2: Inject Controls ──────> Add NFKC normalizers, OWASPSecureHeadersMiddleware, Argon2id dummy hash, etc.
Step 3: Negative Assertions ──> Write unit/BDD tests specifically verifying rejection of malicious payloads.
Step 4: Audit Verification ───> Run `./scripts/verificar-secretos.sh` and `./auditar-infra.sh`.
```

### Playbook 4: 11X Certification & Task Closure Gate
```text
Step 1: Execute Full QA ──────> Run `make qa-all` inside Docker containers.
Step 2: Audit Integrity ──────> Run `python3 scripts/generar-manifiesto.py --check`.
Step 3: Run Certifier ────────> Run `./.agents/scripts/certify_task_completion.sh`.
Step 4: Update Documentation ─> Synchronize TESTING.md, CHANGELOG.md, ROADMAP.md, and docs/.
Step 5: Commit & Publish ─────> Conventional commit in Spanish and push.
```

---

## 4. Progressive Disclosure Reference Index

Load additional modules only as needed:
* [`references/01-core-13-layers.md`](references/01-core-13-layers.md): The 13 QA layers, Anti-Mock Blindness, Anti-JSDOM, and Trimodal Fixtures.
* [`references/02-security-disa-owasp-22.md`](references/02-security-disa-owasp-22.md): The 22 DISA ASD STIG V6R5 + OWASP v4.2 security patterns and reference snippets.
* [`references/03-stack-python-fastapi.md`](references/03-stack-python-fastapi.md): Python Standalone and FastAPI (PostgreSQL 17, KeyDB, Alembic, Karate API).
* [`references/04-stack-node-vue-react.md`](references/04-stack-node-vue-react.md): Node.js, Vue 3, React, Refactoring UI, Vitest, Playwright, and Karate UI.
* [`references/05-stack-bash-devops.md`](references/05-stack-bash-devops.md): Bash, POSIX Shell, ShellCheck, shfmt, BATS-core, bats-mock, and kcov.
