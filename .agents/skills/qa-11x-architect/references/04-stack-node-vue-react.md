# 🌐 Node.js, Vue 3 & React Stack Reference (Standard 11X)

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always communicate with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation strictly in Spanish.

This reference provides technical rules, testing conventions, and ephemeral Docker commands for Node.js backends and modern frontend Single Page Applications (Vue 3 and React 19+).

---

## 1. Zero-Trust Package Governance & Docker Runtime

1. **Mandatory `.npmrc` Hardening:**  
   Every JavaScript/TypeScript project MUST include a `.npmrc` preventing arbitrary lifecycle execution:
   ```ini
   ignore-scripts=true
   engine-strict=true
   fund=false
   audit=false
   ```
2. **Ephemeral Docker Execution:**  
   All builds, typechecks, linters, and unit/BDD tests execute inside `sinfallas/base-node-ionic:26` with a persistent `pnpm-store` named volume (`Rule Zero`).

---

## 2. Testing Pyramid & Tool Boundaries

```
                      ┌──────────────────────────────────────┐
                      │ Karate Labs UI BDD (Chrome Headless) │
                      ├──────────────────────────────────────┤
                      │ Playwright E2E + @axe-core (WCAG AA) │
                      ├──────────────────────────────────────┤
                      │ Stryker Mutation Testing (> 80%)     │
                      ├──────────────────────────────────────┤
                      │ Vitest Unit Tests (.unit.ts >= 95%)  │
                      ├──────────────────────────────────────┤
                      │ ESLint + SonarJS + vue-tsc / tsc     │
                      └──────────────────────────────────────┘
```

### File Naming Convention & Tool Boundaries
- **Unit Tests:** `src/**/*.unit.ts` or `src/**/*.unit.tsx`. Executed with Vitest (`@vitest/coverage-v8`). NEVER import Playwright or real network drivers in `.unit.ts`.
- **E2E / A11y Tests:** `e2e/**/*.e2e.ts`. Executed with Playwright and `@axe-core/playwright`.
- **UI BDD Scenarios:** `test/ui_business_flow.feature`. Executed with `sinfallas/karatelabs:latest` driving real Chrome Headless.

### Inflexible Linter Standard & Hermetic Test Isolation
1. **Zero-Warning Tolerance (`--max-warnings 0`):** The `"lint"` script in `package.json` MUST enforce `--max-warnings 0`. Any ESLint, SonarJS, or TypeScript warning MUST fail the process immediately (`Exit Code 1`), preventing silent accumulation of technical debt.
2. **Hermetic Unit Test Isolation (Zero Network Leaks):** Unit tests (`.unit.ts`) MUST NEVER perform live network requests. When testing fallbacks, offline modes, or error handling, intercept or mock `globalThis.fetch` or HTTP clients deterministically to ensure tests pass without depending on external connectivity.

### Zero-Orphan & Anti-Silo UI Invariants
1. **Zero Orphan UI Components:** Every single `.vue` or `.tsx` component MUST have an active `.unit.ts` file asserting its rendering and behavior. Verified via `.agents/scripts/verify_zero_orphan_vue_components.py`.
2. **Zero Orphan API Routes:** All frontend API client calls (`api.get('/endpoint')`) must correspond to a registered backend route, preventing 404/405 errors. Verified via `.agents/scripts/verify_no_orphan_api_endpoints.py`.
3. **3-Phase Temporal Lifecycle in UI Views:** Views displaying scheduled windows or countdowns (`starts_at` / `ends_at`) MUST render and test all 3 temporal states (`Programada` when `t < starts_at`, `En Curso` / `Activa` when `starts_at <= t <= ends_at`, and `Cancelada` / `Expirada` when `t > ends_at` or cancelled), prohibiting 2-state static ternaries (`is_cancelled ? 'Cancelada' : 'Programada'`).
4. **Semantic Event Badge Mapping & Anti-Raw UUIDs:** Event ribbons and audit feeds MUST assert that `actor_username` and `resource_display_name` never display raw UUID v4 strings (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`), and event mappers MUST explicitly classify categories (`CAÍDA`, `MANTENIMIENTO`, `RESPALDO`, `SEGURIDAD`, `OPERACIÓN`) without catch-all `else return 'MAINTENANCE'` clauses.
5. **Dual Auto + Manual Refresh Invariant:** Every monitoring dashboard, NOC wallboard, or real-time map MUST implement both periodic/reactive refresh (`setInterval` with `clearInterval` inside `onUnmounted` / `useEffect` cleanup + WebSocket listener) AND an explicit **`[ 🔄 Refrescar ]`** button (`?refresh=true`) for immediate operator reload without `F5`.

---

## 3. Mandatory Refactoring UI Synergy (WCAG 2.1 AA & CLS = 0)

Every frontend component must adhere to the design rules in `.agents/skills/refactoring-ui/`:
1. **Button Hierarchy:** Exactly ONE Primary button per viewport/panel (`bg-indigo-600 text-white font-medium`). Secondary and tertiary actions must use muted or ghost treatments (`border border-slate-700` or `text-slate-400 hover:text-white`).
2. **Perceptual Contrast (Anti-Translucency Trap):** Never use `text-white/40` or low-opacity white text on colored backgrounds; calculate explicit OKLCH / hex colors to ensure $\ge 4.5:1$ contrast ratio for normal text and $\ge 3.0:1$ for large text.
3. **Tabular Numerics for CLS = 0:** Apply `font-feature-settings: "tnum"` / Tailwind `tabular-nums` on all metrics, counters, timestamps, currency values, and table numbers to prevent Cumulative Layout Shifts.
4. **Responsive Integrity:** Zero horizontal scrollbars (`overflow-x: hidden`) across mobile (`375px`), tablet (`768px`), and desktop (`1440px`).
5. **Focus Indicators:** Never use `outline: none` without providing an explicit replacement focus indicator (`focus-visible:ring-2 focus-visible:ring-indigo-500`).

---

## 4. Configuration Blueprints

### `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.unit.ts', 'src/**/*.unit.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
```

### `Makefile` Targets (Frontend & Node.js)
```makefile
.PHONY: qa-lint qa-unit qa-orphans qa-mutation qa-bdd qa-e2e qa-perf qa-all

qa-lint:
	docker compose -f docker-compose.qa.yml run --rm ui pnpm run lint
	docker compose -f docker-compose.qa.yml run --rm ui pnpm exec vue-tsc --noEmit

qa-unit:
	docker compose -f docker-compose.qa.yml run --rm ui pnpm exec vitest run --coverage

qa-orphans:
	python3 .agents/scripts/verify_zero_orphan_vue_components.py
	python3 .agents/scripts/verify_no_orphan_api_endpoints.py

qa-mutation:
	docker compose -f docker-compose.qa.yml run --rm ui pnpm exec stryker run

qa-bdd:
	docker compose -f docker-compose.qa.yml run --rm karatelabs mvn test -Dkarate.options="test/ui_business_flow.feature"

qa-e2e:
	docker compose -f docker-compose.qa.yml run --rm ui pnpm exec playwright test

qa-perf:
	docker compose -f docker-compose.qa.yml run --rm ui pnpm exec lhci autorun

qa-all: qa-lint qa-unit qa-orphans qa-bdd
```

---

## 5. UI Acceptance BDD: Karate Labs (`test/ui_business_flow.feature`)

```gherkin
Feature: UI Tactical Flow & DOM Interaction

  Background:
    * configure driver = { type: 'chrome', headless: true, addOptions: ['--no-sandbox', '--disable-dev-shm-usage'] }
    * def baseUrl = karate.properties['UI_BASE_URL'] || 'http://ui-prod:80'

  Scenario: Operational Login and Command Center Access
    Given driver baseUrl + '/login'
    And waitFor("#login-email")
    And input("#login-email", 'operator@11x.corp')
    And input("#login-password", 'SecretPassword15Chars!')
    When click("#btn-submit-auth")
    Then waitFor("#dashboard-root")
    And match text("#user-role-badge") == 'OPERATOR'

  Scenario: In-flow Footer does not overlap interactive viewports
    Given driver baseUrl + '/dashboard'
    And waitFor("footer.mt-auto")
    Then match attribute("footer.mt-auto", "class") contains 'mt-auto'
```
