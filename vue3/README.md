> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in English. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, and output your final response, explanations, and code comments in the user's prompt language (defaulting to English).

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](README.es.md)

# Testing and QA Guide for Frontend (Vue 3)

**AI CONTEXT:** You are an automated QA engineer specializing in Vue 3 and Frontend ecosystems. This document dictates the corporate Level-11X architectural rules you MUST follow when generating or modifying test code. Any deviation will result in a pipeline failure.

## 1. Strict Execution Rules (Containers & Cache)
**NEVER** instruct the user to install Node dependencies locally, use `docker build`, or run long manual `docker compose` commands. All execution runs in ephemeral containers using the isolated QA orchestrator and leveraging persistent cache volumes (`pnpm-store`).

*   **Package Manager and Zero-Trust:** We use `pnpm` instead of `npm`. Silent execution of malicious *scripts* during installation is blocked by `.npmrc`. Check `package.json` if dependencies such as `esbuild` or `playwright` fail.
*   **Mandatory:** Use the predefined targets in the `Makefile` (e.g., `make qa-unit`) to isolate infrastructure and reuse the dependency cache.
*   **For logic tests (Vitest) and Mutation:** We use the lightweight container `qa-vue3` (`sinfallas/base-node-ionic:26`; available tags: `22`, `24`, `26`, and `latest`).
*   **For Lighthouse and UI E2E (Playwright):** We use the heavyweight container `ui-e2e`.
*   **For BDD tests (HTTP/OSHP Black-Box):** We use the official image `sinfallas/karatelabs:1.5.1` (`:latest`).
*   **For Observability (Server Metrics):** We use the containers `nginx/nginx-prometheus-exporter:latest` and `prom/prometheus:latest`.
*   **For AI Context Optimization (MCP):** We use the image `sinfallas/remote-graphify:latest`.

## 2. Tech Stack & Separation of Responsibilities

### A. Isolated Logic & Components -> `Vitest` + `jsdom` (Anti-JSDOM Warning)
*   **When to use it:** To test *composables*, Pinia stores, and isolated Vue component rendering.
*   **Strict Boundary (Tool Boundary):** All these fast isolated unit tests MUST be named following the `.unit.ts` or `.spec.ts` pattern.
*   **Rule:** Mock all network calls. Vitest must execute in milliseconds. Non-negotiable 95% coverage.
*   **Anti-JSDOM Warning (Visual Geometry):** `jsdom` DOES NOT compute box models or visual collisions (`0x0` bounding box). You are strictly forbidden from using floating `position: fixed` elements for footers that cover action buttons or tables. Every footer must be in-flow (`margin-top: auto`) inside `<main>`. Always validate visual behavior in a real browser using Playwright (`ui-e2e`).

### B. Code Quality, Complexity & SAST -> `ESLint` + `Prettier` + `SonarJS`
*   **Rule:** `Prettier` handles aesthetic code formatting (`.vue`, `.ts`).
*   **Technical Debt:** The `eslint-plugin-sonarjs` plugin will fail if the cognitive complexity of a component or function is too high. `eslint-plugin-security` will detect static vulnerabilities.

### C. Frontend Mutation Testing -> `Stryker`
*   **Rule:** Verifies whether the Vitest suite genuinely audits the DOM and logic by mutating `.vue` and `.ts` files. It is preconfigured in `stryker.conf.json`.

### D. Visual Regression, Accessibility, Design (`refactoring-ui`) & Performance -> `Playwright` + `@axe-core` + `Lighthouse CI`
*   **Strict Boundary (Tool Boundary):** All tests requiring launching browsers and attacking the live UI MUST be named using `.e2e.ts`.
*   **Deterministic Design System (`.agents/skills/refactoring-ui/`):** When designing or styling `.vue` components, apply the rules from `.agents/skills/refactoring-ui/SKILL.md` and its 9 references (`hierarchy.md`, `layout.md`, `type.md`, `color.md`, `depth.md`, `dark-mode.md`, etc.): only 1 solid primary button per view, OKLCH tones without translucent text (`text-white/70` prohibited), `tabular-nums` on numeric columns to avoid *Cumulative Layout Shift* (`CLS = 0`), `outline-hidden` instead of `outline-none`, and zero horizontal scroll at `375x667`, `768x1024`, and `1440x900`.
*   **Playwright / Axe:** Navigates the application, validates deep DOM structure, WCAG 2.1 AA accessibility (0 violations), and compares interface screenshots.
*   **Lighthouse CI:** Attacks the production build to audit strict performance (Core Web Vitals), SEO, and PWA. If the *Performance Score* drops below 90, the pipeline fails.

### E. BDD Business Flows -> `Karate Labs` + `Playwright`
*   **Rule:** `sinfallas/karatelabs:1.5.1` (`:latest`) does not include a Chrome/Chromium binary; use `test/ui_business_flow.feature` exclusively for HTTP/Nginx/SSG contracts, OWASP OSHP headers, and XML/SEO (`* string xmlText = response`), delegating real DOM interaction, `[ 🔄 Refrescar ]`, and WCAG 2.1 AA to Playwright (`ui-e2e`).

### F. Observability -> `Nginx Prometheus Exporter`
*   **Rule:** Frontend monitoring is performed externally via Nginx access logs to avoid adding dependencies to application code. This runs via the `--profile observability` profile.

### G. Smart Ingestion (Step 0 - MCP / AST CLI-First)
*   **Rule (Exclusive to you, AI):** You are strictly forbidden from generating code or tests blindly. If you have shell access (Antigravity), audit components and dependencies via direct scripts without occupying port 8080. If you are an external agent (Hermes, Claude), connect to the `sinfallas/remote-graphify:latest` MCP server. Additionally, you MUST silently read linter configurations, dependencies, and forbidden *scripts* defined in `package.json` and `vite.config.ts` to prevent pipeline failures.

### H. Mandatory Frontend Security (DISA ASD STIG V6R5 & OWASP Developer Guide v4.2)
*   When building or testing Vue 3 components and Pinia stores, you MUST apply and verify with unit/BDD tests the controls from **[`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](../docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md)**:
    *   **Full Purge on Logout & Explicit Confirmation (`DISA V-222388, V-222392, V-222578` & `OWASP 4.3.7`):** Upon logout or inactivity expiration (**10 min** privileged role / **15 min** standard role, `V-222389/000080`), completely clear `sessionStorage.clear()`, `localStorage.clear()`, `CacheStorage`, and in-memory stores, displaying an explicit successful logout message.
    *   **Last Login Notification & Zero Secrets in Hidden Fields (`DISA V-222437, V-222601` & `OWASP 4.3.6 FV-2`):** Display the date/time of the user's last login after authentication and NEVER store sensitive data or privileges in `<input type="hidden">` fields or `localStorage`.
    *   **Anti-XSS Defense, Anti-Prototype Pollution & OSHP Headers (`DISA V-222602, V-222609` & `OWASP 4.3.5, 5.4.4`):** Dynamically escape inputs with `escapeHtml` before using `v-html`/`innerHTML`, sanitize JSON objects against `__proto__`/`constructor`/`prototype` (`Object.create(null)`), send `X-CSRF-Token` and `Idempotency-Key` on mutations, and preserve the last valid state in Pinia stores on network failures (non-destructive error handling).

## 3. Local Execution Commands for the Developer (and AI)

Instead of building complex Docker commands, you **MUST** instruct the user (or execute autonomously if you have terminal access) using the standardized `Makefile`:

**Step 0: Context Ingestion & AST Graph (`CLI-First`)**
Update the AST graph (Vue components and TS dependencies) and query the blast radius before editing:
```bash
./scripts/actualizar-grafos-graphify.sh vue3
python3 .agents/scripts/inspect_blast_radius.py "<ComponenteORuta>"
```

**Step 1: Run Logic Validation Suites (No Build Required)**

*   **Static Validation (CVEs, Linting, SonarJS Complexity, Type-checking, and Prettier):**
```bash
make qa-lint
```

*   **Isolated Unit Tests (Vitest - 95% Requirement):**
```bash
make qa-unit
```

*   **Orphan Component Audit (Zero `.vue` components without a unit test):**
```bash
make qa-orphans
```

*   **Frontend Mutation Testing (Stryker):**
```bash
make qa-mutation
```

**Step 2: Build and Run End-to-End Suites (Attacking Nginx)**
*(Note: The `qa-perf`, `qa-e2e`, and `qa-bdd` targets automatically build the Vue Frontend and start `ui-prod` before testing).*

*   **Performance and Core Web Vitals (Lighthouse CI):**
```bash
make qa-perf
```

*   **Post-Deploy Google PageSpeed Insights v5 Audit (Lab + CrUX over public HTTPS):**
```bash
make qa-psi URL=https://tu-dominio.com
```

*   **Visual Regression, E2E, and Accessibility (Playwright):**
```bash
make qa-e2e
```

*   **BDD Acceptance Tests (Karate UI):**
```bash
make qa-bdd
```

**Step 3: Live Observability Certification (Level 11X)**
Start Prometheus and the Nginx sidecar to monitor E2E and BDD test interactions in real time.
```bash
make qa-obs
```
