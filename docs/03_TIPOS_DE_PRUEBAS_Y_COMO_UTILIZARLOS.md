> 🌐 **Language / Idioma:** **English (Canonical)** | [🇪🇸 Español (03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md)](03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.es.md)

# 🧪 Test Types in the QA 11X Standard and How to Use Them

> **PURPOSE:**  
> This manual is the canonical technical guide for developers and QA engineers. It explains each level of the 11X quality pyramid, detailing its rationale, file structure, code syntax, Docker execution command, and non-negotiable passing thresholds.

---

## 🏛️ The Level 11X Quality Pyramid

```text
               ▲
              / \
             /   \      [13] Trimodal Fixtures & Negative Invariants
            /     \     [12] Chaos Engineering (Pumba) & Resilience
           /       \    [11] Dynamic Security DAST (OWASP ZAP)
          /         \   [10] Performance & Stress (Locust / Artillery)
         /           \  [09] WCAG 2.1 AA Accessibility & Visual Geometry
        /             \ [08] Mutation Testing: Tests of Tests (Mutmut / Stryker)
       /               \[07] Frontend HTTP/OSHP/SSG Contracts (Karate Labs HTTP + Playwright DOM)
      /                 \[06] Black-Box API BDD (Karate Labs HTTP)
     /                   \[05] Front-Back Integration Contracts
    /                     \[04] DB Schema & Migration Parity (Alembic)
   /                       \[03] Isolated Unit Tests (Pytest / Vitest >= 95%)
  /                         \[02] Strict Typing & Complexity (Mypy / Radon / SonarJS)
 /                           \[01] Static Analysis, Formatting & SAST (Ruff / ESLint / Bandit)
─────────────────────────────────────────────────────────────────────────────────────────────
```

---

## 1. Static Analysis, Linters, and SAST (Static Security)

* **Purpose:** Detect syntax errors, anti-patterns, unused variables, and security injections before compiling or executing code.
* **Tools:**
  - Python / FastAPI: `ruff` (ultra-fast linter and formatter), `bandit` (security SAST).
  - Node / Vue / React: `eslint` with security plugins (`eslint-plugin-security`), `prettier`.
  - Bash: `shellcheck` (POSIX), `shfmt` (formatting).
* **Non-Negotiable Threshold:** **0 warnings, 0 errors, 0 vulnerabilities**.
* **Execution:**
  ```bash
  # Backend
  make qa-lint
  # Frontend
  make qa-lint
  ```

---

## 2. Strict Typing and Cognitive / Cyclomatic Complexity

* **Purpose:** Prevent runtime type errors (`AttributeError: 'NoneType'`, `TypeError: undefined is not a function`) and enforce readability by eliminating monolithic functions.
* **Tools:**
  - Python: `mypy --strict src/` and `radon cc --min C src/` (Grade A Cyclomatic Complexity: `CC <= 5`).
  - TypeScript / Vue: `vue-tsc --noEmit` and `SonarJS` (bounded maximum cognitive complexity).
* **Non-Negotiable Threshold:** **0 typing errors, zero functions at grade C or worse**.

---

## 3. Isolated Unit Tests with Mocks (Non-Negotiable Coverage >= 95%)

* **Purpose:** Validate the algorithmic logic of pure functions, composables, helpers, and business use cases in microseconds while isolating network or disk dependencies.
* **Tools:**
  - Python: `pytest`, `pytest-mock`, `pytest-cov`.
  - Frontend: `vitest` with `@vitest/coverage-v8` engine.
* **Example (Backend - Python with Pytest):**
  ```python
  # fastapi/tests/core/test_token_manager.unit.py
  import pytest
  from src.core.token_manager import generate_access_token, verify_token

  def test_token_lifecycle_nominal():
      payload = {"sub": "user-123", "role": "OPERATOR"}
      token = generate_access_token(payload, expires_minutes=15)
      decoded = verify_token(token)
      assert decoded["sub"] == "user-123"
      assert decoded["role"] == "OPERATOR"
  ```
* **Example (Frontend - Vue 3 with Vitest):**
  ```typescript
  // vue3/src/composables/useIdempotency.unit.ts
  import { describe, it, expect } from 'vitest';
  import { useIdempotency } from './useIdempotency';

  describe('useIdempotency Composable', () => {
    it('generates valid UUID keys for each mutation', () => {
      const { generateKey } = useIdempotency();
      const key1 = generateKey();
      const key2 = generateKey();
      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });
  ```
* **Non-Negotiable Threshold:** **`>= 95.0%` line and branch coverage**. If it drops to 94.9%, the command fails.
* **Execution:**
  ```bash
  make qa-unit
  ```

---

## 4. DB Schema and Migration Parity (Anti-Mock Blindness)

* **Purpose:** Guarantee that the application's ORM models match the exact tables, columns, and real types created in database migrations.
* **Tools:** Automated script `.agents/scripts/verify_alembic_orm_parity.py` and execution against a real PostgreSQL container.
* **How It Works:**
  1. Extracts table names declared with `__tablename__` in `src/models/*.py`.
  2. Inspects `op.create_table()` calls inside Alembic migration files.
  3. If any ORM model lacks an associated migration, aborts execution with exit code 1.
* **Execution:**
  ```bash
  python3 .agents/scripts/verify_alembic_orm_parity.py
  ```

---

## 5. Front-Back Integration Contracts and Anti-Silo Cross-Module Propagation

* **Purpose:** Certify that the request payload sent by the interface (JSON, Multipart FormData) matches exactly what the backend expects and persists to the live database, and eradicate **Silo Mock Blindness**.
* **Tools:** Test scripts executed inside the API container booted with real PostgreSQL and KeyDB, plus `Schemathesis`.
* **Cross-Module Read-After-Write Flow (No Intermediate Mocks):**
  1. Execute a real mutating HTTP request in **Module A** (`POST`/`PUT`/`PATCH`/`DELETE`, e.g., scheduling a maintenance window or changing a device's administrative state).
  2. Immediately call the query (`GET`) endpoints of **Consumer Modules B** (e.g., Inventory, NOC Wallboard, Command Center KPIs) against the same live database **with zero intermediate mocks**, certifying that counters, badges, and effective states reflect the end-to-end mutation.
  3. Verify that the audit log (`write_audit_log`) records `actor_username` and `resource_display_name` with human-readable names and never a raw UUID v4 (`claims.get("sub")`).

---

## 6. Black-Box BDD Tests with Karate Labs for REST APIs

* **Purpose:** Validate REST API behavior from an external client's perspective without knowledge of internal code. Validates HTTP status codes, security headers, JSON responses, and dynamic schemas.
* **Tools:** Official `sinfallas/karatelabs:1.5.1` (`:latest`) container executing Cucumber/Gherkin `.feature` files.
* **Structure:** Located at `fastapi/test/api_test.feature`.
* **Real Karate Labs API Scenario Example:**
  ```gherkin
  Feature: REST API Validation and Error Handling

    Background:
      * url 'http://api:8000'
      * configure headers = { 'Content-Type': 'application/json' }

    Scenario: API healthcheck with database and redis status
      Given path '/health'
      When method get
      Then status 200
      And match response.status == 'healthy'
      And match response.database == '#string'

    Scenario: Request with incomplete payload returns HTTP 422
      Given path '/api/v1/auth/login'
      And request { username: "operator_without_password" }
      When method post
      Then status 422
      And match response.detail[0].type == '#string'

    Scenario: Protected resource query without authentication returns HTTP 401
      Given path '/api/v1/users/me'
      When method get
      Then status 401
      And match response.detail contains 'No autenticado'
  ```
* **Execution:**
  ```bash
  make qa-bdd   # or docker compose run --rm karatelabs mvn clean test
  ```

---

## 7. Frontend HTTP/OSHP/SSG BDD Contracts with Karate Labs (Without Headless Browser)

* **Purpose:** The official `sinfallas/karatelabs:1.5.1` image (like `:latest`) **does not include Chrome or Chromium binaries**. Therefore, Karate 1.5.1 black-box certifies HTTP/Nginx delivery on `http://ui-prod:80`: `200` status codes, SPA/SSG routes, OWASP OSHP headers (`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`), and XML/SEO integrity as strings (`* string xmlText = response` on `/sitemap.xml`). All real DOM interaction, `[ 🔄 Refrescar ]` button checks, Anti-JSDOM geometry, and WCAG 2.1 AA accessibility are delegated to Playwright (`ui-e2e`).
* **Structure:** Located at `vue3/test/ui_business_flow.feature` and `react-frontend/test/ui_business_flow.feature`.
* **Real Karate Labs HTTP/OSHP/SSG Scenario Example:**
  ```gherkin
  Feature: HTTP BDD Contracts, OWASP OSHP Headers, SPA/SSG Routes & SEO (Karate 1.5.1)

    Background:
      * def baseUrl = karate.properties['UI_BASE_URL'] || 'http://ui-prod:80'
      * url baseUrl

    Scenario: HTML delivery and OWASP OSHP headers aligned with Nginx
      Given path '/'
      When method get
      Then status 200
      And match header Content-Type contains 'text/html'
      And match header X-Frame-Options == 'DENY'
      And match header X-Content-Type-Options == 'nosniff'
      And match header Referrer-Policy == 'strict-origin-when-cross-origin'
      And match header Content-Security-Policy contains "default-src 'self'"

    Scenario: Safe string inspection of /sitemap.xml in SSG or SPA fallback
      Given path '/sitemap.xml'
      When method get
      Then status 200
      * string xmlText = response
      * def contentType = responseHeaders['Content-Type'] ? responseHeaders['Content-Type'][0] : ''
      * assert contentType.contains('xml') ? xmlText.contains('<urlset') : xmlText.toLowerCase().contains('<html')
  ```
* **Execution:**
  ```bash
  make qa-bdd
  ```

---

## 8. Mutation Testing (Testing the Tests)

* **Purpose:** Prove that unit tests are not superficial. The tool injects logical mutations into source code (e.g., changing `>` to `<=`, `True` to `False`, or deleting a function call) and re-runs the test suite. If tests still pass despite the malicious change, the mutant "survives" and exposes weak assertions.
* **Tools:**
  - Python: `mutmut` (`mutmut run && mutmut results`).
  - JavaScript / TypeScript: `Stryker Mutator` (`stryker run`).
  - PHP (8.2–8.5): `Infection PHP` (`php -d pcov.enabled=1 ./vendor/bin/infection --min-msi=80 --min-covered-msi=80 --threads=4`).
* **Execution:**
  ```bash
  make qa-mutation
  ```

---

## 9. Accessibility (WCAG 2.1 AA) and Visual Geometry

* **Purpose:** Guarantee that the interface is usable by people with visual or motor impairments, complies with legal accessibility standards (color contrast, ARIA labels, keyboard navigation), and has zero layout collisions (fixed footers covering action buttons).
* **Tools:**
  - `@axe-core/playwright`: WCAG 2.1 AA violation scan in Chromium.
  - `Lighthouse CI`: Accessibility metrics with minimum threshold **0.95**.
* **Execution:**
  ```bash
  make qa-e2e   # Playwright + Axe Core (non-root ui-e2e, ./node_modules/.bin/playwright)
  make qa-perf  # Pre-merge Lighthouse CI against local containers
  make qa-psi URL=https://your-domain.com  # Post-deploy PageSpeed Insights v5 (Lab + CrUX)
  ```

---

## 10. Concurrency and Load / Stress Testing

* **Purpose:** Validate API behavior and memory/CPU resource consumption under massive concurrent traffic.
* **Tools:**
  - Python / FastAPI: `locust` in headless mode with scenarios defined in `locustfile.py`.
  - Node.js: `artillery` executing scenarios defined in `artillery.yml`.
* **Non-Negotiable Threshold:** **0% failed requests and P95 latency under 200 ms**.

---

## 11. Dynamic Security DAST (OWASP ZAP), OWASP WSTG / ASVS, and OSHP Headers

* **Purpose:** Bombard the running application with active web attacks (SQL injection, reflected XSS, insecure HTTP headers, cookies missing security flags) and certify compliance with **OWASP Application Security Verification Standard (ASVS Level 2/3)**, **OWASP Web Security Testing Guide (WSTG)**, **OWASP API Security Top 10 (2023)**, and **DISA ASD STIG V6R5** (`APSC-DV-003160`..`003230`).
* **Tools:**
  - Container `zaproxy/zap-stable:latest` running `zap-baseline.py` / `zap-api-scan.py` against `http://api:8000`.
  - Validation of **OWASP Secure Headers Project (OSHP)** headers: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cache-Control: no-store`, and absence of `Server` / `X-Powered-By` banners.
  - Supply chain verification with **OWASP CycloneDX SBOM/CBOM** (`cyclonedx-py`, `@cyclonedx/cyclonedx-npm`) and SCA auditing with `Trivy` / `OWASP Dependency-Check`.
  - Fail-secure initialization, shutdown, and abort testing (*Fail-Secure State Testing*, `DISA V-222585` / `V-222647`): certify that upon configuration errors or critical dependency outages, the application denies access by default without leaking stack traces or permitting authentication bypass.
* **Report:** Generates `zap-report.html` and `sbom.cdx.json` for continuous auditing.

---

## 12. Chaos Engineering (Pumba) and Resilience

* **Purpose:** Verify whether the application survives and recovers automatically under real network infrastructure faults (extreme latency, dropped packets, microservice crashes).
* **Tools:** `gaiaadm/pumba:latest` orchestrated via Docker socket to inject `netem` network faults against the API container while `Prometheus` monitors error rates on `/metrics`.

---

## 13. Trimodal Fixtures, 3-Phase Temporal Lifecycle, and Negative Invariants

* **Purpose:** Eradicate mock blindness when integrating with external APIs or hardware, as well as **2-State Static Blindness** in time-windowed flows.
* **3 Spatial/Health Fixtures Structure:**
  1. **Virgin / Factory Default:** Ensures unconfigured systems do not produce false positives on the dashboard.
  2. **Nominal Configured:** Validates operation under normal production conditions.
  3. **Degraded / Unsupported / Partial Batch Failure:** Validates that systems experiencing errors, unsupported features, `0-byte` truncated transfers (requiring `timeout >= 180s` on synchronous firmware/package downloads), or `HTTP 200 OK` batch responses with per-item failures (`results[].status == 'FAILED'`) degrade gracefully and surface per-resource errors without throwing HTTP 500 or false global success.
* **Mandatory 3-Phase Temporal Structure (3-State Clock):**
  Every entity with time windows, timers, or TTLs (`starts_at` / `ends_at`, 60s Safe Mode, 30s Step-Up tokens, leases) MUST be tested across its **3 clock phases**:
  1. **Phase 1 (`t < starts_at`):** Scheduled / Pending state (`Programada`).
  2. **Phase 2 (`starts_at <= t <= ends_at`):** Active / In-Progress state (`En Curso` / `Activa`, verifying the scheduler stays alive and projects active state to all consumer modules).
  3. **Phase 3 (`t > ends_at` or Cancelled):** Expired / Purged / Reverted state (verifying automatic restoration to the original nominal state and audit logging).

---

## 14. Global Certification Gate (`certify_task_completion.sh`)

* **Purpose:** Final checkpoint aggregating all validations before permitting a commit.
* **Execution:**
  ```bash
  ./.agents/scripts/certify_task_completion.sh
  ```
* **Blast Radius Diff Mode and Executive PR Verdict (`Milestone 23`):** Before emitting changes or opening a Pull Request, inspect the compact delta by calling `inspect_ast_blast_radius` with `changed_since_ref` and `max_tokens_budget` (`>= 60%` token savings, secret redaction, and `.feature` contract alerts), and generate `.agents/artifacts/PR_VERDICT.md` + `pr_verdict_attestation.json` (`0600`) by running `make pr-verdict` inside ephemeral Docker (`exit 0`, or `30` on divergence/missing evidence).
* If any step fails, the commit must be rejected immediately.
