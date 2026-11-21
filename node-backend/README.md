> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in English. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, and output your final response, explanations, and code comments in the user's prompt language (defaulting to English).

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](README.es.md)

# Testing and QA Guide for Backend (Node.js)

**AI CONTEXT:** You are an automated QA engineer specializing in Node.js and TypeScript. This document dictates the non-negotiable Level-11X corporate architectural rules you MUST follow when generating test code. The goal is not only to prove that the code works, but to guarantee its resilience under extreme stress, audit its complexity, and certify its security.

## 1. Strict Execution Rules (Ephemeral Containers & Cache)
**NEVER** instruct the user to run `npm install` on their local machine, use `docker build`, or construct manual `docker compose run` commands. All execution runs ephemerally through the provided `Makefile`, leveraging persistent cache volumes:
*   For the API, logic tests, SAST, profiling, and stress: `sinfallas/base-node-ionic:26@sha256:275f3d8bbfef87f4e836e4f77d92c0d199821154079b050eaef53ce33ae6de60`.
*   For black-box BDD tests: `sinfallas/karatelabs:1.5.1@sha256:a9a52ca9c5491ab39b64f0b4fdc3dea879c2213c9bc995be58d6cd4b9a80cc89`.
*   For Dynamic Security (DAST): `zaproxy/zap-stable:2.15.0`.
*   For Chaos Engineering & Observability: `gaiaadm/pumba:0.10.1` and `prom/prometheus:v2.55.1`.
*   For Ephemeral AST Graph Extraction (Graphify CLI): `sinfallas/remote-graphify@sha256:08aa6a6fc5e72f25bb6a37da632932fe295ba0d72fd971ae5b365eeea3f778b0`.

**Package Manager and Zero-Trust:** Our base image replaces `npm` with `pnpm` v12 (`ignore-scripts=true` in `.npmrc` and allowlisted build trust via `pnpm-workspace.yaml#allowBuilds`).
**Mandatory:** Use clean execution targets (e.g., `make qa-unit`) to isolate infrastructure, run non-root with `no-new-privileges:true`, and reuse the dependency cache (`pnpm-store`).

## 2. Tech Stack & Separation of Responsibilities

### A. Code Observability (Non-Negotiable Prerequisite)
*   Before running any audit, you MUST ensure the Express/Fastify entry file (e.g., `src/server.ts`) is instrumented by non-intrusively injecting this middleware to expose `/metrics`:

```typescript
    import promBundle from "express-prom-bundle";
    // Inject before declaring your business routes:
    app.use(promBundle({ includeMethod: true, includePath: true }));
```

### B. Internal Logic, Integration & Interception -> `Vitest` + `Supertest` + `Nock`
*   **Strict Boundary (Tool Boundary):** All unit test files MUST be named `.unit.ts` or `.spec.ts` to separate their context.
*   **Rule:** Use `Vitest` as the test runner (not Jest). Use `Supertest` to test Express/Fastify routes by passing the app instance directly WITHOUT listening on a real port.
*   **Isolation Rule (Anti-Mock Blindness Boundary):** In unit tests (`.unit.ts` / `.spec.ts`), mock external HTTP third-party APIs and timers using `nock` or Vitest mocks. NEVER rely on blind database mocks to certify persistence, transactions, or migrations — validate SQL schemas and ORM models against a real PostgreSQL engine in integration/BDD tests.
*   **Pact V4 Provider Contracts (`node --test`):** Zero-Infra contract verification files in `tests/contracts/*.test.ts` (e.g., `tests/contracts/provider.pact.test.ts`) are strictly separated from Vitest (`vitest.config.ts` excludes `tests/contracts/**`) and execute natively via `pnpm run test:contracts` (`node --test`) and `make qa-contracts`.

### C. Code Quality, Complexity & Static SAST -> `ESLint` + `Prettier` + `SonarJS`
*   **Rule:** `Prettier` handles aesthetic code formatting. `ESLint` enforces logical rules.
*   **Technical Debt:** The `eslint-plugin-sonarjs` plugin will fail the pipeline if it detects "Spaghetti Code" (high cognitive complexity) or logical vulnerabilities (`eslint-plugin-security`).

### D. Profiling (CPU/RAM) -> `Clinic.js`
*   **Rule:** Before deploying to production, generate a *Flamegraph* (`clinic flame`) to detect whether any endpoint blocks Node.js's asynchronous *Event Loop* or causes *Memory Leaks*.

### E. Mutation Testing -> `Stryker`
*   **Rule:** Used to mutate source code and verify whether the Vitest suite catches the injected faults. It is preconfigured in `stryker.conf.json`.

### F. BDD Business Flows -> `Karate Labs`
*   **Rule:** Use Karate exclusively to evaluate the live API from an external client's perspective, writing flows in Gherkin syntax.

### G. Dynamic Security (DAST) -> `OWASP ZAP`
*   **Rule:** We use ZAP in *Baseline Scan* mode to audit the API at runtime. It evaluates security headers, information leaks, and vulnerable configurations without choking the pipeline.

### H. Extreme Resilience (Chaos Engineering) -> `Pumba` + `Artillery`
*   **Rule:** Executed exclusively via the `--profile chaos` profile. Pumba injects 500ms of unpredictable network latency onto the Node.js container while `Artillery` sends waves of concurrent users and Prometheus scrapes metrics. It certifies that the architecture neither collapses nor enters permanent *timeouts* when networking degrades.

### I. Smart Ingestion (Step 0 - AST Graphify `CLI-First`)
*   **Rule (Exclusive to you, AI):** You are strictly forbidden from generating code or tests blindly. Your first step must be updating and inspecting the AST graph via CLI (`./scripts/actualizar-grafos-graphify.sh node-backend` and `python3 .agents/scripts/inspect_blast_radius.py "<symbol>"`, or the `inspect_ast_blast_radius` MCP tool) without starting background daemons occupying port `8080`. Additionally, you MUST silently read dependency, formatting, and linter rules defined in `package.json`, `eslint.config.mjs`, `.prettierrc`, `tsconfig.json`, and `tsconfig.build.json` to adapt your code to strict repository conventions and avoid CI/CD rejections.

### J. Mandatory Security by Design (DISA ASD STIG V6R5 & OWASP Developer Guide v4.2)
*   When programming or auditing Node.js/TypeScript microservices, you MUST apply and test the controls from **[`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](../docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md)**:
    *   **Sessions and Identity (`APSC-DV-000010, 000070, 000080, 000530` & `OWASP 4.3.7`):** Concurrent session limits, role-based *idle timeouts* (**10 min** admin / **15 min** standard), session ID rotation after login/privilege escalation, and lockout after **3 failed attempts in 15 min** with constant-time verification.
    *   **Validation, Canonicalization & Anti-Prototype Pollution (`APSC-DV-002390, 002485, 002510, 002520` & `OWASP 4.3.5, 4.3.6`):** `.normalize('NFKC')` before validation, recursive sanitization against `__proto__`/`constructor`/`prototype` (`Object.create(null)`), prohibition of `child_process.exec` with shell, XML external entity disablement, and file validation via *Magic Bytes* and allowlisted indexes.
    *   **Immutable Auditing, OSHP Headers, Fail-Secure & SBOM (`APSC-DV-000650, 001090, 001350, 002310` & `OWASP 4.3.10, 5.3.4, 5.4.4, 7.8`):** HMAC-SHA256 chained UTC logs sanitized against CR/LF injection with zero secrets, alert at **75% log storage capacity**, **OWASP OSHP** headers (HSTS, CSP, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `X-Powered-By` suppression), *Fail-Secure* startup, OWASP API Top 10 (2023) mitigation, and **CycloneDX SBOM** generation (`@cyclonedx/cyclonedx-npm`).

## 3. Local Execution Commands for the Developer (and AI)

Instead of building complex Docker commands, you **MUST** instruct the user (or execute autonomously if you have terminal access) using the standardized `Makefile`:

**Step 0: Context Ingestion & AST Graph (`CLI-First`)**
Extract/update the AST knowledge graph and query the blast radius before coding:
```bash
./scripts/actualizar-grafos-graphify.sh node-backend
python3 .agents/scripts/inspect_blast_radius.py "<symbol_or_file>"
```

**Step 1: Ephemeral Execution & Container Lifecycle (`Rule Zero`)**
Targets such as `qa-e2e`, `qa-dast`, and `qa-stress` automatically start `api` and clean up on exit; run `make clean-cache` or `make clean` if background containers were started manually.

**Step 2: Run the validation suites (Regular Pipeline)**

*   **Vulnerability Audit (CVEs), Quality, and Strict Typing:**
```bash
make qa-lint
```

*   **Internal Logic Tests (Isolated with Nock/Vitest) - Requirement >= 95%:**
```bash
make qa-unit
```

*   **Zero-Infra Pact V4 Provider Contracts (`node --test`):**
```bash
make qa-contracts
```

*   **CycloneDX SBOM Generation:**
```bash
make qa-sbom
```

*   **Mutation Testing (Evaluate assertion strength):**
```bash
make qa-mutation
```

*   **BDD Behavior (Karate):**
```bash
make qa-bdd   # alias of qa-e2e
```

*   **Dynamic Security DAST (OWASP ZAP via `zap.yaml` -> `reports/zap-report.html` & `reports/zap-report.json`):**
```bash
make qa-dast
```

**Step 3: Level-11X Certification (Chaos Engineering & Observability — standalone from `qa-all`)**
*WARNING:* This standalone command (`qa-stress` / `qa-chaos` is excluded from `qa-all`) activates the chaos profile (`qa-observability` starts Prometheus cleanly on demand). It launches Pumba, Artillery, and Prometheus simultaneously to stress the API while simulating a severely degraded network.
```bash
make qa-chaos          # alias of qa-stress
make qa-observability  # standalone Prometheus observability profile
```
*(During the attack, view live metrics at `http://localhost:9090`. Upon completion, inspect the locally generated `reports/chaos-report.json` file. For CPU/RAM flamegraphs, execute `pnpm run profile:cpu` or `pnpm run profile:memory` inside `qa-node-backend`).*
