> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in English. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, and output your final response, explanations, and code comments in the user's prompt language (defaulting to English).

> 🌐 **Language / Idioma:** **English (Canonical)** | [🇪🇸 Español (README.es.md)](README.es.md)

# Testing and QA Guide for Frontend (React / Vite)

**AI CONTEXT:** You are an automated QA engineer specializing in React, TypeScript, and Frontend ecosystems. This document dictates the corporate Level-11X architectural rules you MUST follow when generating or modifying test code. Any deviation will result in a pipeline failure.

## 1. Strict Execution Rules (Containers & Cache)
**NEVER** instruct the user to install Node dependencies locally, use `docker build`, or run long manual `docker compose` commands. All execution runs in ephemeral containers using the isolated QA orchestrator and leveraging persistent cache volumes (`pnpm-store`).

*   **Package Manager and Zero-Trust:** We use `pnpm` instead of `npm`. Silent execution of malicious *scripts* during installation is blocked by `.npmrc`. Check `package.json` if dependencies such as `esbuild` or `playwright` fail.
*   **Mandatory:** Use the predefined targets in the `Makefile` (e.g., `make qa-unit`) to isolate infrastructure and reuse the dependency cache.
*   **For logic tests (Vitest/RTL) and Mutation:** We use the lightweight container `qa-frontend` (`sinfallas/base-node-ionic:26`; available tags: `22`, `24`, `26`, and `latest`).
*   **For Lighthouse and UI E2E (Playwright):** We use the heavyweight container `ui-e2e`.
*   **For BDD tests (HTTP/OSHP Black-Box):** We use the official image `sinfallas/karatelabs:1.5.1` (`:latest`).
*   **For Observability (Server Metrics):** We use the containers `nginx/nginx-prometheus-exporter:latest` and `prom/prometheus:latest`.
*   **For AI Context Optimization (MCP):** We use the image `sinfallas/remote-graphify:latest`.

## 2. Tech Stack & Separation of Responsibilities

### A. Isolated Logic & Components -> `Vitest` + `jsdom` + `@testing-library/react` (Anti-JSDOM Warning)
*   **When to use it:** To test custom *Hooks*, state managers (Zustand/Redux), and isolated component rendering.
*   **Strict Boundary (Tool Boundary):** All these fast isolated unit tests MUST be named following the `.unit.tsx` or `.spec.ts` pattern.
*   **React Testing Library (RTL) Rule:** Interact with components as a user would (by ARIA role, text, or label), NEVER by internal implementation details or contrived CSS selectors.
*   **Network Rule:** Mock all API calls (using `msw` or Vitest's native *mock*). Vitest must execute in milliseconds. Non-negotiable 95% coverage.
*   **Anti-JSDOM Warning (Visual Geometry):** `jsdom` does not compute real boxes or layer collisions. Avoid fixed floating elements (`position: fixed`) that cover tables or forms. Footers must be placed in-flow (`margin-top: auto`). Validate visual geometry with Playwright in a real browser.

### B. Code Quality, Complexity & SAST -> `ESLint` + `Prettier` + `SonarJS`
*   **Rule:** `Prettier` handles aesthetic code formatting (`.tsx`, `.ts`).
*   **Technical Debt (Hooks):** The `eslint-plugin-react-hooks` plugin is critical. Do not allow violations in `useEffect` dependency arrays. `eslint-plugin-sonarjs` will fail if a component's cognitive complexity is spaghetti code.

### C. Frontend Mutation Testing -> `Stryker`
*   **Rule:** Verifies whether the Vitest suite genuinely audits the DOM and logic by mutating `.tsx` and `.ts` files with logical mutants.

### D. Visual Regression, Accessibility, Design (`refactoring-ui`) & Performance -> `Playwright` + `@axe-core` + `Lighthouse CI`
*   **Strict Boundary (Tool Boundary):** All tests requiring launching browsers and attacking the live UI MUST be named using `.e2e.ts`.
*   **Deterministic Design System (`.agents/skills/refactoring-ui/`):** When designing or styling `.tsx` components, apply the rules from `.agents/skills/refactoring-ui/SKILL.md` and its 9 references (`hierarchy.md`, `layout.md`, `type.md`, `color.md`, `depth.md`, `dark-mode.md`, etc.): only 1 solid primary button per view, OKLCH tones without translucent text (`text-white/70` prohibited), `tabular-nums` on numeric columns to avoid *Cumulative Layout Shift* (`CLS = 0`), `outline-hidden` instead of `outline-none`, and zero horizontal scroll at `375x667`, `768x1024`, and `1440x900`.
*   **Playwright / Axe:** Navigates the application, validates deep DOM structure, accessibility, and compares interface screenshots while freezing CSS animations.
*   **Lighthouse CI:** Attacks the static production build on Nginx to audit strict performance (Core Web Vitals). If the *Performance Score* drops below 90, the pipeline fails.

### E. BDD Business Flows -> `Karate Labs` + `Playwright`
*   **Rule:** `sinfallas/karatelabs:1.5.1` (`:latest`) does not include a Chrome/Chromium binary; use `test/ui_business_flow.feature` exclusively for HTTP/Nginx/SSG contracts, OWASP OSHP headers, and XML/SEO (`* string xmlText = response`), delegating real DOM interaction, `[ 🔄 Refrescar ]`, and WCAG 2.1 AA to Playwright (`ui-e2e`).

### F. Observability -> `Nginx Prometheus Exporter`
*   **Rule:** Frontend monitoring is performed externally via Nginx access logs. This runs via the `--profile observability` profile.

### G. Smart Ingestion (Step 0 - MCP / AST CLI-First)
*   **Rule (Exclusive to you, AI):** You are strictly forbidden from generating code or tests blindly. If you have shell access (Antigravity), perform static inspections via CLI without occupying ports. If you are an external agent (Hermes, Claude), connect to the `sinfallas/remote-graphify:latest` MCP server. Additionally, you MUST silently read linter configurations, dependencies, and forbidden *scripts* defined in `package.json`, `.eslintrc.json`, and `vite.config.ts` to prevent pipeline failures.

### H. Mandatory Frontend Security (DISA ASD STIG V6R5 & OWASP Developer Guide v4.2)
*   When building or testing React components (`.tsx`) and stores (Zustand/Redux), you MUST apply and verify with unit/BDD tests the controls from **[`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](../docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md)**:
    *   **Full Purge on Logout & Explicit Confirmation (`DISA V-222388, V-222392, V-222578` & `OWASP 4.3.7`):** Upon logout or reaching the *idle timeout* (**10 min** privileged role / **15 min** standard role, `V-222389/000080`), clear `sessionStorage.clear()`, `localStorage.clear()`, `CacheStorage`, and in-memory state, displaying an explicit logout message.
    *   **Last Login Notification & Zero Secrets in Hidden Fields (`DISA V-222437, V-222601` & `OWASP 4.3.6 FV-2`):** Display the user's last login date/time after login and prohibit the use of `<input type="hidden">` or `localStorage` for sensitive data or session tokens.
    *   **Anti-XSS Defense, Anti-Prototype Pollution & OSHP Headers (`DISA V-222602, V-222609` & `OWASP 4.3.5, 5.4.4`):** Prohibit `dangerouslySetInnerHTML` without strict sanitization (`escapeHtml`), filter `__proto__`/`constructor`/`prototype` (`Object.create(null)`), attach `X-CSRF-Token` and `Idempotency-Key` to mutating requests, and preserve the known valid state on transient network errors.

## 3. Local Execution Commands for the Developer (and AI)

Instead of building complex Docker commands, you **MUST** instruct the user (or execute autonomously if you have terminal access) using the standardized `Makefile`:

**Step 0: Context Ingestion & AST Graph (`CLI-First`)**
Update the source code AST graph and query the blast radius before editing:
```bash
./scripts/actualizar-grafos-graphify.sh react-frontend
python3 .agents/scripts/inspect_blast_radius.py "<ComponenteORuta>"
```

**Step 1: Run Logic Validation Suites (No Build Required)**

*   **Static Validation (CVEs, Linting, SonarJS, Type-checking, and Prettier):**
```bash
make qa-lint
```

*   **Isolated Unit Tests (Vitest + RTL - 95% Requirement):**
```bash
make qa-unit
```

*   **Frontend Mutation Testing (Stryker):**
```bash
make qa-mutation
```

**Step 2: Build and Run End-to-End Suites (Attacking Nginx)**
*(Note: The `qa-perf`, `qa-e2e`, and `qa-bdd` targets automatically build the Frontend and start `ui-prod` before testing).*

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
