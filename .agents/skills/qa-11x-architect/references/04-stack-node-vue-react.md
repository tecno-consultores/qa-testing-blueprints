# 🌐 Node.js, Vue 3 & React Stack Reference (Standard 11X)

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:**
> Unless target `AGENTS.md` mandates a fixed language, interact in the **user's prompt language**; human docs use EN canonical (`*.md`) + 1:1 ES mirror (`*.es.md`) (matching `README.md`/`CHANGELOG.md` in consumer repos, defaulting to prompt language if empty); `.agents/**` stays concise English.

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
2. **Ephemeral Docker Execution & Non-Root Host UID Alignment (`UID 10001` Guardrail):**  
   All builds, typechecks, linters, and unit/BDD tests execute inside `sinfallas/base-node-ionic:26` (available tags: `22`, `24`, `26`, and `latest`) with a persistent `pnpm-store` named volume (`Rule Zero`). Because `sinfallas/base-node-ionic:26` runs by default as `uid=10001(appuser)` and pre-populates `/pnpm/store/v11/files/*` as `10001:10001`:
   - Always pass `-u "$(id -u):$(id -g)"` on `docker compose run --rm` (and set `user: "${QA_UID:-1000}:${QA_GID:-1000}"` in `docker-compose.qa.yml`) so `node_modules/.pnpm` and `dist/` match the host/CI runner UID (`1001` on GitHub Actions, `1000` on Linux, `501` on macOS) without `ERR_PNPM_PACKAGE_MANAGER_CREATE_SLOT_DIR` (`os error 13`).
   - Declare a one-shot `pnpm-store-init` service (`user: "0:0"`, `command: ["chmod", "-R", "a+rwX", "/pnpm"]`) with `depends_on: { pnpm-store-init: { condition: service_completed_successfully } }`, plus `HOME: /tmp` and `pnpm_config_store_dir: /pnpm/store` (`pnpm` v12+ ignores legacy `npm_config_*`), preventing CAFS permission errors and preventing cross-device fallback creation of `/app/.pnpm-store`.
   - Never invoke bare `os.homedir()` without `try/catch` in Node.js CLIs/tools: under arbitrary non-root UIDs absent from container `/etc/passwd` (e.g. GitHub Actions `UID 1001`, OpenShift random UIDs) when `process.env.HOME` is unset, `uv_os_homedir` throws `SystemError: ENOENT`; always resolve `process.env.HOME || process.env.USERPROFILE` first and fall back to `os.tmpdir()` inside `catch`.
3. **Node 26 + pnpm 12 Supply-Chain `allowBuilds`, ESLint 9 Flat Config & `vue-tsc`:**
   - Under `sinfallas/base-node-ionic:26` (`Node v26.13+`, `pnpm 12.18+`) with `.npmrc` `ignore-scripts=true` (`SEC-09`), `package.json#pnpm` (`pnpm.onlyBuiltDependencies`) is ignored (`WARN` + `ERR_PNPM_IGNORED_BUILDS`). Omit `"pnpm"` from `package.json` and declare `pnpm-workspace.yaml` using a **boolean map (`Record<string, boolean>`, NEVER a YAML list `- pkg`, which aborts with `ERR_PNPM_INVALID_SETTING`)**:
     ```yaml
     allowBuilds:
       esbuild: true
       playwright: true
       '@playwright/test': true
       vue-demi: false
     ```
   - Standardize on **ESLint 9 Flat Config (`eslint.config.mjs`)** with `eslint-plugin-security@^3.0.0` (`security.configs.recommended`), `eslint-plugin-sonarjs@^3.0.7` (`sonarjs.configs.recommended`), and `typescript-eslint@^8.x` type-aware checks (`@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-misused-promises` via `projectService` / `tsconfig.typecheck.json`), ignoring `["dist/", "dist-ssr/", "coverage/", "playwright-report/", "lhci-reports/", "target/", "graphify-out/"]`. Pin `"vue-tsc": "^2.2.12"` on Vue 3 with TypeScript `5.7+` and Vite `6`. *(Legacy consumer repos still on ESLint `8.57.x` `.eslintrc.json` remain audited by `SEC-09` and must extend `"plugin:security/recommended-legacy"`.)*

---

## 2. Testing Pyramid & Tool Boundaries

```
                      ┌──────────────────────────────────────┐
                      │ Karate Labs HTTP/Edge/OSHP BDD       │
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
- **E2E / A11y Tests:** `e2e/**/*.e2e.ts`. Executed with Playwright (`ui-e2e`, `mcr.microsoft.com/playwright:v1.52.0-noble`) and `@axe-core/playwright` for real DOM interactions, Screenplay/POM flows, Anti-JSDOM geometry, and WCAG 2.1 AA.
- **UI BDD Scenarios:** `test/ui_business_flow.feature`. Executed with `sinfallas/karatelabs:1.5.1` (`:latest` has no Chrome/Chromium binary installed) to certify HTTP/Nginx delivery on `http://ui-prod:80`, SPA/SSG routes, OWASP OSHP headers, and SEO/XML endpoints (`* string xmlText = response`).

### Inflexible Linter Standard & Hermetic Test Isolation
1. **Zero-Warning Tolerance (`--max-warnings 0`):** The `"lint"` script in `package.json` MUST enforce `--max-warnings 0`. Any ESLint, SonarJS, or TypeScript warning MUST fail the process immediately (`Exit Code 1`), preventing silent accumulation of technical debt.
2. **Hermetic Unit Test Isolation (Zero Network Leaks):** Unit tests (`.unit.ts`) MUST NEVER perform live network requests. When testing fallbacks, offline modes, or error handling, intercept or mock `globalThis.fetch` or HTTP clients deterministically to ensure tests pass without depending on external connectivity.

### Zero-Orphan & Anti-Silo UI Invariants
1. **Zero Orphan UI Components:** Every single `.vue` or `.tsx` component MUST have an active `.unit.ts` file asserting its rendering and behavior. Verified via `.agents/scripts/verify_zero_orphan_vue_components.py`.
2. **Zero Orphan API Routes:** All frontend API client calls (`api.get('/endpoint')`) must correspond to a registered backend route, preventing 404/405 errors. Verified via `.agents/scripts/verify_no_orphan_api_endpoints.py`.
3. **3-Phase Temporal Lifecycle in UI Views:** Views displaying scheduled windows or countdowns (`starts_at` / `ends_at`) MUST render and test all 3 temporal states (`Programada` when `t < starts_at`, `En Curso` / `Activa` when `starts_at <= t <= ends_at`, and `Cancelada` / `Expirada` when `t > ends_at` or cancelled), prohibiting 2-state static ternaries (`is_cancelled ? 'Cancelada' : 'Programada'`).
4. **Semantic Event Badge Mapping & Anti-Raw UUIDs:** Event ribbons and audit feeds MUST assert that `actor_username` and `resource_display_name` never display raw UUID v4 strings (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`), and event mappers MUST explicitly classify categories (`CAÍDA`, `MANTENIMIENTO`, `RESPALDO`, `SEGURIDAD`, `OPERACIÓN`) without catch-all `else return 'MAINTENANCE'` clauses.
5. **Dual Auto + Manual Refresh Invariant:** Every monitoring dashboard, NOC wallboard, or real-time map MUST implement both periodic/reactive refresh (`setInterval` with `clearInterval` inside `onUnmounted` / `useEffect` cleanup + WebSocket listener) AND an explicit **`[ 🔄 Refrescar ]`** button (`?refresh=true`) for immediate operator reload without `F5`.
6. **Prohibition of Blind `HTTP 200 OK` Success in Batch Endpoints:** Views and stores consuming bulk/batch execution endpoints (`POST .../execute`, `POST .../batch`) MUST NEVER assume global success from `HTTP 200 OK` alone; they MUST inspect `res.data.results[].status` (or `items[].status`) per target resource and surface partial/total item failures (`status === 'FAILED'` or `'ERROR: ...'`) in the UI and unit/BDD tests.

---

## 3. Mandatory Refactoring UI Synergy (WCAG 2.1 AA & CLS = 0)

Every frontend component must adhere to the design rules in `.agents/skills/refactoring-ui/`:
1. **Button Hierarchy:** Exactly ONE Primary button per viewport/panel (`bg-indigo-600 text-white font-medium`). Secondary and tertiary actions must use muted or ghost treatments (`border border-slate-700` or `text-slate-400 hover:text-white`).
2. **Perceptual Contrast (Anti-Translucency Trap):** Never use `text-white/40` or low-opacity white text on colored backgrounds; calculate explicit OKLCH / hex colors to ensure `>= 4.5:1` contrast ratio for normal text and `>= 3.0:1` for large text.
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
    setupFiles: ['./vitest.setup.ts'],
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

### `vitest.setup.ts` (Node v26+ `localStorage` Polyfill)
Node v26 exposes an experimental `globalThis.localStorage` lacking `.clear()` without `--localstorage-file`. Register an in-memory `Storage` fallback when missing:
```typescript
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear() { store.clear(); },
    getItem(k) { return store.get(k) ?? null; },
    key(i) { return Array.from(store.keys())[i] ?? null; },
    removeItem(k) { store.delete(k); },
    setItem(k, v) { store.set(k, String(v)); },
  };
}

if (typeof globalThis.localStorage?.clear !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  });
}
```

### `Makefile` Targets (Frontend & Node.js — Non-Root `ui-e2e`, `QA-PLAYWRIGHT-PIN-01` & Post-Deploy PSI)
Pin exact `@playwright/test`/`playwright` versions (`"1.52.0"`, no `^`/`~` ranges) matching `mcr.microsoft.com/playwright:vX.Y.Z-noble` (`QA-PLAYWRIGHT-PIN-01`). Run `ui-e2e` as non-root (`-u "$(QA_UID):$(QA_GID)" -e HOME=/tmp -e COREPACK_HOME=/tmp/.corepack`) with rootless Corepack (`/tmp/.corepack-bin`) and prefer `./node_modules/.bin/{playwright,lhci}` over dynamic downloads:
```makefile
.PHONY: qa-lint qa-unit qa-orphans qa-mutation qa-bdd qa-e2e qa-perf qa-psi qa-all

qa-lint:
	docker compose -f docker-compose.qa.yml run --rm -T ui pnpm run lint
	docker compose -f docker-compose.qa.yml run --rm -T ui pnpm exec vue-tsc --noEmit

qa-unit:
	docker compose -f docker-compose.qa.yml run --rm -T ui pnpm exec vitest run --coverage

qa-orphans:
	python3 .agents/scripts/verify_zero_orphan_vue_components.py
	python3 .agents/scripts/verify_no_orphan_api_endpoints.py

qa-mutation:
	docker compose -f docker-compose.qa.yml run --rm -T ui pnpm exec stryker run

qa-bdd:
	docker compose -f docker-compose.qa.yml run --rm -T karatelabs mvn -B clean test -Dkarate.options="test/ui_business_flow.feature"

qa-e2e:
	docker compose -f docker-compose.qa.yml run --rm -T -u "$$(id -u):$$(id -g)" -e HOME=/tmp ui-e2e sh -c 'if [ -x ./node_modules/.bin/playwright ]; then ./node_modules/.bin/playwright test; elif command -v pnpm >/dev/null 2>&1; then pnpm exec playwright test; else corepack pnpm exec playwright test; fi'

qa-perf:
	docker compose -f docker-compose.qa.yml run --rm -T -u "$$(id -u):$$(id -g)" -e HOME=/tmp ui-e2e sh -c 'if [ -x ./node_modules/.bin/lhci ]; then ./node_modules/.bin/lhci autorun; elif command -v pnpm >/dev/null 2>&1; then pnpm exec lhci autorun; else corepack pnpm exec lhci autorun; fi'

qa-psi:
	@./scripts/auditar-pagespeed.sh $(if $(URL),--url "$(URL)",) --strategy "$(or $(STRATEGY),both)" $(if $(MIN_PERF),--min-performance "$(MIN_PERF)",) --output "psi-reports/psi-report.json"

qa-all: qa-lint qa-unit qa-orphans qa-bdd
```

---

## 5. UI Acceptance BDD: Karate Labs (`test/ui_business_flow.feature`)

Because `sinfallas/karatelabs:1.5.1` (`:latest`) ships without Chrome/Chromium, Karate focuses on HTTP/Nginx delivery, OWASP OSHP headers, SPA/SSG routes, and XML/SEO safety, while Playwright (`ui-e2e`) certifies DOM/WCAG 2.1 AA:

```gherkin
Feature: HTTP Edge, OWASP OSHP Headers & SSG/SEO Contract (Karate 1.5.1)

  Background:
    * def envBaseUrl = java.lang.System.getenv('UI_BASE_URL')
    * def baseUrl = karate.properties['UI_BASE_URL'] || envBaseUrl || 'http://ui-prod:80'
    * url baseUrl

  Scenario: Root HTML delivery and OWASP OSHP headers on internal Nginx
    Given path '/'
    When method get
    Then status 200
    And match header Content-Type contains 'text/html'
    And match header X-Frame-Options == 'DENY'
    And match header X-Content-Type-Options == 'nosniff'
    And match header Referrer-Policy == 'strict-origin-when-cross-origin'
    And match header Content-Security-Policy contains "default-src 'self'"

  Scenario: Safe string assertion for SSG /sitemap.xml without XML namespace failures
    Given path '/sitemap.xml'
    When method get
    Then status 200
    * string xmlText = response
    * def ct = responseHeaders['Content-Type'] ? responseHeaders['Content-Type'][0] : ''
    * assert ct.contains('xml') ? xmlText.contains('<urlset') : xmlText.toLowerCase().contains('<html')
```

---

## 6. Hardened Static/SSG Deployment: Wrangler v4 (Cloudflare Pages) on `read_only: true` (`QA-DOCKER-TTY-01` & `QA-GIT-GATE-01`)

Deterministic non-interactive Cloudflare Pages deployments under `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges:true`, and `CI: 'true'` prevent three chained runtime failures observed with Wrangler v4:
1. **`NoDefaultValueProvided` (`process.stdin.isTTY === true` + `CI: 'true'`):** `docker compose run --rm` without `-T` allocates a pseudo-TTY that triggers interactive prompts (`select2`) and aborts in CI. Always pass `-T` and create missing Pages projects idempotently before deploying.
2. **`ENOENT`/`EROFS` on `/app/.wrangler/cache` (`saveToConfigCache`):** Pre-create `/app/.wrangler` in `Dockerfile.deploy` and mount it as `tmpfs` with `noexec,nosuid,nodev`.
3. **Silent Pages-to-Workers delegation (`maybeDelegatePagesToWorkers`):** When AI coding-agent environment variables are present, pass `--force` on `wrangler pages project create` and `wrangler pages deploy`.

1. **`Dockerfile.deploy` (pre-create `tmpfs` mount point on read-only rootfs):**
   ```dockerfile
   USER root
   RUN mkdir -p /app/.wrangler \
       && chown -R appuser:appgroup /app /pnpm
   USER appuser
   ```

2. **`docker-compose.deploy.yml` (`noexec` `tmpfs`, Fail-Secure env validation, resilient JSON check, `--force`):**
   ```yaml
   services:
     deploy:
       read_only: true
       cap_drop:
         - ALL
       security_opt:
         - no-new-privileges:true
       tmpfs:
         - /tmp:size=64M,mode=1777,noexec,nosuid,nodev
         - /app/.wrangler:size=32M,mode=1777,noexec,nosuid,nodev
       environment:
         HOME: /tmp
         WRANGLER_SEND_METRICS: 'false'
         CI: 'true'
       entrypoint: ["sh", "-c"]
       command:
         - |
           set -eu
           : "$${CF_PAGES_PROJECT:?CF_PAGES_PROJECT is required}"
           : "$${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
           PROJECT="$${CF_PAGES_PROJECT}"
           BRANCH="$${CF_PAGES_PRODUCTION_BRANCH:-main}"
           PROJECTS_JSON="$$(wrangler pages project list --json)"
           if ! printf '%s' "$$PROJECTS_JSON" | node -e 'const fs=require("fs"),p=process.argv[1],d=JSON.parse(fs.readFileSync(0,"utf8"));if(!Array.isArray(d))process.exit(2);process.exit(d.some(x=>(x["Project Name"]??x.name)===p)?0:1)' "$$PROJECT"; then
             status=$$?
             [ "$$status" -eq 1 ] || exit "$$status"
             wrangler pages project create "$$PROJECT" --production-branch="$$BRANCH" --force
           fi
           wrangler pages deploy /app/dist \
             --project-name="$$PROJECT" \
             --branch="$$BRANCH" \
             --commit-dirty=true \
             --force
   ```

3. **`deploy.sh` (disable pseudo-TTY; `QA-GIT-GATE-01` remote mutation gate):**
   ```bash
   # Requires explicit human operator confirmation or GO Release Gate (QA-GIT-GATE-01)
   docker compose -f docker-compose.deploy.yml run --rm -T --no-deps -u "$(id -u):$(id -g)" deploy
   ```

### 6.1. Multi-Format Favicon Suite, PWA Manifest & Edge `_headers` Hygiene (`UI-11X-03`)
Frontend SPAs/SSGs MUST ship cross-browser icon assets and explicitly detach inherited Edge headers instead of relying on `.webp` shortcuts or additive `/*` rules:
1. **Multi-Resolution Icon Suite (`Rule Zero` Chromium + ICO):**
   - Generate PNG rasters from brand SVG inside `mcr.microsoft.com/playwright` (`deviceScaleFactor: 1`) and pack `public/favicon.ico` via Python `PIL`/`struct` with `16x16`, `32x32`, and `48x48` PNG-encoded frames (satisfies browsers and Google Search `>= 48px` requirement).
   - Ship `public/favicons/favicon.svg`, `32x32` and `48x48` RGBA PNGs, and opaque RGB (no alpha transparency, 80% safe-zone centered) `apple-touch-icon.png` (`180x180`), `icon-192.png` (`192x192`), and `icon-512.png` (`512x512`).
2. **HTML & Web App Manifest Parity (`index.html` & `site.webmanifest`):**
   - Never point `rel="apple-touch-icon"` to `.webp`/`.svg` (Safari/iOS ignores it). Use `<link rel="icon" href="/favicon.ico" sizes="48x48" />`, `<link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />`, `48x48`/`32x32` PNG `<link rel="icon">`, and `<link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />`.
   - In `site.webmanifest`, declare `192x192` and `512x512` opaque PNG icons with separate `"purpose": "any"` and `"purpose": "maskable"` entries (never combined `"any maskable"`).
3. **Cloudflare Pages `_headers`, `_routes.json` & Nginx `CORP` Parity:**
   - When `/*` defines `Cache-Control`, `X-Robots-Tag`, `Cross-Origin-Resource-Policy`, `Content-Security-Policy`, `X-Frame-Options`, or `Referrer-Policy`, sub-path overrides in `public/_headers` MUST detach them first (`! Cache-Control`, `! X-Robots-Tag`, `! Cross-Origin-Resource-Policy`) before setting new values, and emit `Cross-Origin-Resource-Policy: cross-origin` on `/favicon.ico`, `/favicons/*`, `/brand/*`, and `/og/*` (keeping `X-Robots-Tag: noindex, nofollow` on private backoffice SPAs and `index, follow` only on public SSG sites).
   - Mirror `Cross-Origin-Resource-Policy "same-origin"` at `server`/`/index.html` and `"cross-origin"` in `location ~* \.(?:ico|svg|png|webmanifest)$` in `nginx/default.conf`.
   - In `_routes.json`, exclude exact `"/favicon.ico"` when `include` has `"/*"`; never use invalid suffix globs (`/*.ico`, `/*.png`).
