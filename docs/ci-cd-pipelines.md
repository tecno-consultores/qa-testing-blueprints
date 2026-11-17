> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](ci-cd-pipelines.es.md)

# CI/CD Pipelines (Continuous Integration and Sovereign Execution)

This document explains the continuous integration principles under Standard 11X, covering both sovereign local execution operated by **AI Agents** and the optional offloading of tests to automated remote environments (such as GitHub Actions or GitLab CI) in projects adopting this blueprint.

---

## 0. Extreme Shift-Left: AI Agent Governance vs. Traditional CI/CD

In traditional development workflows, the remote CI/CD pipeline is the first place where lint failures, insufficient coverage, or security vulnerabilities are discovered. This introduces slow feedback loops (10 to 20 minutes per iteration).

In Standard 11X we apply **Extreme Shift-Left operated by AI Agents**:
* **Autonomous Local Execution:** Before a commit is created, the AI agent (Google Antigravity, Claude Code, Cursor, Hermes) runs the ephemeral Docker suite (`Rule Zero`) and the universal certification gate (`./.agents/scripts/certify_task_completion.sh`) locally.
* **Pre-Push Guaranteed Quality:** When code is pushed to Git, it has already been mathematically validated against the 95% coverage rule, 0 secrets, ORM parity against real PostgreSQL, and Karate Labs BDD scenarios. Remote CI stops being a discovery filter and becomes a simple redundant safeguard (paired with `QA-GIT-GATE-01` human confirmation for remote pushes).
* **Sovereign Philosophy (RoSGrid Model):** For high-criticality tasks such as package publishing (e.g., the `@sinfallas/mcp-qa-11x` MCP server on npm), the standard forbids delegating master credentials (`NPM_TOKEN`) to shared external runners. The publishing cycle executes locally and sovereignly through audited ephemeral scripts (`scripts/publicar-mcp.sh`).

---

## 1. The Anti-Pattern vs. The "Blueprints" Way

**The Traditional Approach (Anti-Pattern):**
Typically, CI pipelines install the language runtime directly on the GitHub/GitLab runner (e.g., using `actions/setup-node` or `actions/setup-python`), run `npm install`, and finally execute the tests.
*   **Why is this wrong for us?** Because it breaks isolation. The CI runner could have pre-installed global Ubuntu dependencies that mask errors, causing the pipeline to pass on GitHub while failing on your production Proxmox server.

**Our Approach (Blueprints):**
The CI runner is treated as a "dumb" machine whose only job is having Docker installed. **We run the exact same Makefile-encapsulated commands we use locally across all 10 hydratable stacks + `architecture/` + `mcp-server/` (= 12 matrix environments)**.
*   **Why is it like this?** Absolute parity. If `make qa-unit` passes on your laptop, it will pass in CI and work in production. All intelligence, tools (SAST, Mutation, BATS, Appium 3), `.npmrc` configs, and dependencies live inside the certified `sinfallas/*` base images (`sinfallas/base-python-uv:3.15`, `sinfallas/base-node-ionic:26`, `sinfallas/base-mobile-appium:26`, `sinfallas/basephpcomposer:8.5`, `sinfallas/karatelabs:1.5.1`, `sinfallas/base-bash-qa:latest`, `sinfallas/remote-graphify:latest`) backed by cache volumes.

---

## 2. Anatomy of CI Execution (Level 11X)

For the pipeline to operate properly, it must follow a strict structure:

### Step 0: Infrastructure Audit (Trivy)
Before downloading language dependencies, we statically scan Docker manifests to prevent infrastructure injections or privilege escalation.
### Step 1: Checkout and Preparation
Clone the source code. We do not need to install Python, Node, or system dependencies on the host runner.
### Step 2: Base Ephemeral Execution (The Core)
Launch the suites using the targets defined in `Makefile` (e.g., `make qa-lint`, `make qa-unit`). If the coverage test detects less than 95%, or complexity metrics fail, it returns Exit Code `1`, blocking the merge.
### Step 3: Dynamic Security (DAST)
OWASP ZAP launches a lightweight attack (*Baseline Scan*) against the live container to audit network-exposed vulnerabilities.
### Step 4: Resilience, Chaos, and Observability
The hidden `--profile chaos` profile is activated, injecting latency with Pumba and concurrent stress waves while Prometheus scrapes metrics.
### Step 5: Artifact Extraction (Reports)
Because we use *bind* volumes, when the ephemeral container exits, it leaves HTML and JSON reports physically on the runner's disk. The pipeline collects that folder and uploads it as an "Artifact" for the team to download.
### Step 6: Cleanup
Run `./scripts/limpieza.sh` (or `make clean`) to destroy temporary artifacts and ephemeral containers without saturating the runner's storage.

---

## 3. Practical Reference Example: GitHub Actions (For Adopting Projects)

Below is an illustrative reference template for external projects adopting this blueprint that need to configure a verification workflow in GitHub Actions (e.g., in `.github/workflows/qa-pipeline.yml`). Using corporate `Makefiles` under Rule Zero keeps the pipeline clean, installs zero runtimes on the runner, and delegates all intelligence to the official ephemeral images:

```yaml
name: QA Testing Blueprint Pipeline (Level 11X)

on:
  pull_request:
    branches: [ "main", "develop" ]

jobs:
  auditoria-y-pruebas:
    name: 🛡️ Strict Audit (95% Coverage) & Resilience
    runs-on: ubuntu-latest

    steps:
      - name: 1️⃣ Code checkout (pin immutable SHA in production)
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: 2️⃣ Secrets Verification & Safe Ephemeral Config
        run: |
          ./scripts/verificar-secretos.sh
          # Inject test env vars (NEVER real production credentials in runners)
          echo "ENVIRONMENT=test" >> .env.test
          echo "DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/test_db" >> .env.test

      - name: 3️⃣ Infrastructure & Container Audit (Trivy)
        run: |
          ./scripts/auditar-infra.sh

      - name: 4️⃣ Static Analysis, Complexity & Formatting
        # Runs linting, strict typing (Mypy/TS), and cyclomatic complexity rules.
        run: make qa-lint

      - name: 5️⃣ Run Ephemeral Suite with Network Interception (>= 95% Coverage)
        # If coverage is below 95%, this command fails and aborts the pipeline.
        run: make qa-unit

      - name: 6️⃣ Mutation Testing (Anti-False Positives)
        # Ensures tests truly validate logic by mutating the AST.
        run: make qa-mutation

      - name: 7️⃣ 11X Certification Gate (ORM Parity, Orphans & Topology)
        run: |
          chmod +x .agents/scripts/*.sh .agents/scripts/*.py
          ./.agents/scripts/certify_task_completion.sh

      - name: 8️⃣ Dynamic Security DAST (OWASP ZAP Baseline)
        # Starts persistence services and the API, then runs ZAP.
        # (Note: Skip this step if it is a pure Bash or standalone Python script)
        run: |
          docker compose -f docker-compose.qa.yml up -d postgres keydb api || docker compose -f docker-compose.qa.yml up -d api
          docker compose -f docker-compose.qa.yml run --rm zap zap-baseline.py -t http://api:8000 -r zap-report.html || \
          docker compose -f docker-compose.qa.yml run --rm zap zap-baseline.py -t http://api:3000 -r zap-report.html

      - name: 9️⃣ Chaos Engineering & Observability (Prometheus + Pumba)
        # Activates the hidden profile to inject latency and automatically start Prometheus.
        # (Note: If your project is a Bash or pure Python script, change '--profile chaos' to '--profile observability')
        run: docker compose -f docker-compose.qa.yml --profile chaos up --abort-on-container-exit stress_test

      - name: 🔟 Archive Quality Reports (Artifacts)
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        if: always()
        with:
          name: qa-reports
          path: |
            coverage/
            coverage_report/
            reports/
            stryker.html
            zap-report.html
            chaos-report.html
            chaos-report.json
          retention-days: 7

      - name: 1️⃣1️⃣ Environment Cleanup
        if: always()
        run: ./scripts/limpieza.sh
```
