> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in English. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, and output your final response, explanations, and code comments in the user's prompt language (defaulting to English).

> 🌐 **Language / Idioma:** **English (Canonical)** | [🇪🇸 Español (README.es.md)](README.es.md)

# Testing and QA Guide for Backend (Node.js)

**AI CONTEXT:** You are an automated QA engineer specializing in Node.js and TypeScript. This document dictates the non-negotiable Level-11X corporate architectural rules you MUST follow when generating test code. The goal is not only to prove that the code works, but to guarantee its resilience under extreme stress, audit its complexity, and certify its security.

## 1. Strict Execution Rules (Ephemeral Containers & Cache)
**NEVER** instruct the user to run `npm install` on their local machine, use `docker build`, or construct manual `docker compose run` commands. All execution runs ephemerally through the provided `Makefile`, leveraging persistent cache volumes:
*   For the API, logic tests, SAST, profiling, and stress: `sinfallas/base-node-ionic:26` (available tags: `22`, `24`, `26`, and `latest`).
*   For black-box BDD tests: `sinfallas/karatelabs:1.5.1` (`:latest`).
*   For Dynamic Security (DAST): `zaproxy/zap-stable:latest`.
*   For Chaos Engineering & Observability: `gaiaadm/pumba:latest` and `prom/prometheus:latest`.
*   For AI Context Optimization (MCP): `sinfallas/remote-graphify:latest`.

**Package Manager and Zero-Trust:** Our base image replaces `npm` with `pnpm`. Container installation automatically blocks execution of malicious third-party scripts (via `ignore-scripts=true` in `.npmrc`).
**Mandatory:** Use clean execution targets (e.g., `make qa-unit`) to isolate infrastructure and reuse the dependency cache (`pnpm-store`). The container has the `SYS_PTRACE` capability enabled to attach memory *profilers*.

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
*   **Isolation Rule:** Every call to a third-party service or database MUST be mocked using `nock` or native Vitest mocks. No network latency is allowed in unit tests.

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
*   **Rule (Exclusive to you, AI):** You are strictly forbidden from generating code or tests blindly. Your first step must be updating and inspecting the AST graph via CLI (`./scripts/actualizar-grafos-graphify.sh node-backend` and `python3 .agents/scripts/inspect_blast_radius.py "<simbolo>"`, or the `inspect_ast_blast_radius` MCP tool) without starting background daemons occupying port `8080`. Additionally, you MUST silently read dependency, formatting, and linter rules defined in `package.json`, `.eslintrc.json`, `.prettierrc`, and `tsconfig.json` to adapt your code to strict repository conventions and avoid CI/CD rejections.

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
python3 .agents/scripts/inspect_blast_radius.py "<simbolo_o_archivo>"
```

**Step 1: Start the API in the background**
```bash
docker compose -f docker-compose.qa.yml up -d api
```

**Step 2: Run the validation suites (Regular Pipeline)**

*   **Vulnerability Audit (CVEs), Quality, and Strict Typing:**
```bash
make qa-lint
```

*   **Internal Logic Tests (Isolated with Nock/Vitest) - Requirement >95%:**
```bash
make qa-unit
```

*   **Mutation Testing (Evaluate assertion strength):**
```bash
make qa-mutation
```

*   **BDD Behavior (Karate):**
```bash
make qa-e2e
```

*   **Dynamic Security DAST (OWASP ZAP):**
```bash
docker compose -f docker-compose.qa.yml run --rm zap zap-baseline.py -t http://api:3000 -r zap-report.html
```

*   **Cumulative Profiling (CPU Flamegraph):**
```bash
docker compose -f docker-compose.qa.yml run --rm qa-node-backend bash -c "pnpm install && pnpm run profile:cpu"
```

**Step 3: Level-11X Certification (Chaos Engineering & Observability)**
*WARNING:* This command activates the chaos profile. It launches Pumba, Artillery, and Prometheus simultaneously to stress the API while simulating a severely degraded network.
```bash
make qa-stress
```
*(During the attack, view live metrics at `http://localhost:9090`. Upon completion, inspect the locally generated `chaos-report.json` file).*
