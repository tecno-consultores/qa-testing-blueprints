# 🌐 Node.js, Vue 3 & React Stack Reference (Standard 11X)

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Respond in **user's prompt language** (unless `AGENTS.md` fixes it); docs/commits match `README.md`/`CHANGELOG.md` (Spec 19; `.agents/**` English).

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
2. **Ephemeral Docker & Host UID (`UID 10001` Guardrail):** Run builds, lint, and tests inside `sinfallas/base-node-ionic:26` (`22|24|26|latest`) with a persistent `pnpm-store` volume (`Rule Zero`):
   - Pass `-u "$(id -u):$(id -g)"` (`user: "${QA_UID:-1000}:${QA_GID:-1000}"`) so host/CI mounts (`1000`/`1001`/`501`) avoid `ERR_PNPM_PACKAGE_MANAGER_CREATE_SLOT_DIR` (`os error 13`).
   - Declare `pnpm-store-init` (`user: "0:0"`, `command: ["chmod", "-R", "a+rwX", "/pnpm"]`) with `depends_on: { pnpm-store-init: { condition: service_completed_successfully } }`, `HOME: /tmp`, and `pnpm_config_store_dir: /pnpm/store`.
   - Wrap `os.homedir()` in `try/catch` preferring `process.env.HOME || process.env.USERPROFILE` and falling back to `os.tmpdir()` under arbitrary UIDs (`ENOENT`).
3. **Node 26 + pnpm 12 `allowBuilds`, ESLint 9 Flat Config & `vue-tsc`:**
   - With `.npmrc` `ignore-scripts=true` (`SEC-09`), omit `"pnpm"` from `package.json` (`ERR_PNPM_IGNORED_BUILDS`) and declare `pnpm-workspace.yaml` as a **boolean map** (`Record<string, boolean>`, NEVER a YAML list `- pkg`):
     ```yaml
     allowBuilds:
       esbuild: true
       playwright: true
       '@playwright/test': true
       vue-demi: false
     ```
   - Standardize on **ESLint 9 Flat Config (`eslint.config.mjs`)** with `eslint-plugin-security@^3.0.0`, `eslint-plugin-sonarjs@^3.0.7`, and `typescript-eslint@^8.x` (`@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-misused-promises`), ignoring `["dist/", "dist-ssr/", "coverage/", "playwright-report/", "lhci-reports/", "target/", "graphify-out/", ".stryker-tmp/**"]`. Pin `"vue-tsc": "^2.2.12"` (`TS 5.7+`, `Vite 6`). *(ESLint `8.57.x` legacy `.eslintrc.json` remains audited by `SEC-09`.)*

---

## 2. Testing Pyramid & Tool Boundaries

Flow: `ESLint + SonarJS + vue-tsc/tsc` -> `Vitest (.unit.ts >= 95%)` -> `Stryker (MSI >= 80%)` -> `Playwright + @axe-core` -> `Karate HTTP/Edge/OSHP`.

- **Unit Tests:** `src/**/*.unit.{ts,tsx}` (Vitest + `@vitest/coverage-v8`, `--max-warnings 0`, hermetic `globalThis.fetch` mocks, zero Playwright/network).
- **E2E / A11y:** `e2e/**/*.e2e.ts` in Playwright (`mcr.microsoft.com/playwright:v1.52.0-noble`) + `@axe-core/playwright` (DOM, Anti-JSDOM geometry, WCAG 2.1 AA).
- **UI BDD:** `test/ui_business_flow.feature` in `sinfallas/karatelabs:1.5.1` (no Chromium) certifying `http://ui-prod:8080`, SPA/SSG routes, OSHP headers, and XML/SEO (`* string xmlText = response`).
- **Zero-Orphan & Anti-Silo UI Invariants (`Rule Zero`):**
  1. Every `.vue`/`.tsx` needs a `.unit.ts`/`.unit.tsx` (`docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 .agents/scripts/verify_zero_orphan_vue_components.py`); verify routes via `verify_no_orphan_api_endpoints.py`.
  2. **3-Phase Temporal UI:** Test `starts_at`/`ends_at` across `Programada` ($t < t_0$), `En Curso`/`Activa` ($t_0 \le t \le t_1$), and `Cancelada`/`Expirada` ($t > t_1$).
  3. **Semantic Badges & Anti-UUID:** Assert `actor_username`/`resource_display_name` never match raw UUID v4; map event categories explicitly (`CAÍDA`, `MANTENIMIENTO`, `RESPALDO`, `SEGURIDAD`, `OPERACIÓN`) without catch-all `else return 'MAINTENANCE'`.
  4. **Dual Refresh & Batch Status:** Pair `setInterval` (`clearInterval` on unmount) + WebSocket with **`[ 🔄 Refrescar ]`** (`?refresh=true`). Never infer success from `HTTP 200 OK` alone on `POST .../execute`; inspect per-item `results[].status`.

---

## 3. Refactoring UI Synergy (WCAG 2.1 AA & CLS = 0)

1. ONE Primary button per panel (`bg-indigo-600 text-white font-medium`); muted secondary/tertiary actions.
2. Calculate explicit OKLCH/hex colors clearing `4.5:1` / `3:1` contrast (never `text-white/40`).
3. Apply `tabular-nums` (`font-feature-settings: "tnum"`) on counters, metrics, and tables (`CLS = 0`).
4. Fix overflow with `min-w-0`/wrapping across `375x667`, `768x1024`, `1440x900` (never mask bugs with `overflow-x: hidden`); pair `focus-visible` rings (no bare `outline: none`).

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
Pin exact `@playwright/test`/`playwright` (`"1.52.0"`) matching `mcr.microsoft.com/playwright:vX.Y.Z-noble` (`QA-PLAYWRIGHT-PIN-01`). Run containers non-root (`$(QA_UID):$(QA_GID)`, `HOME=/tmp`) preferring local `./node_modules/.bin/{playwright,lhci}`:
```makefile
.PHONY: build-ui qa-lint qa-unit qa-orphans qa-mutation qa-bdd qa-e2e qa-perf qa-psi qa-all clean-cache clean qa-clean

PROJECT_DIR ?= $(CURDIR)
PYTHON_QA_IMAGE = sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4
QA_UID ?= $(shell id -u)
QA_GID ?= $(shell id -g)
export QA_UID QA_GID

build-ui:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-frontend bash -c "pnpm install --silent && pnpm --silent run build"
	bash -c 'trap "docker compose --project-directory \"$(PROJECT_DIR)\" -f docker-compose.qa.yml down --remove-orphans >/dev/null 2>&1 || true" ERR INT TERM; \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml up -d --wait ui-prod'

qa-lint:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-frontend bash -c "pnpm install --silent && pnpm run audit:deps && pnpm run type-check && pnpm run format:check && pnpm lint"

qa-unit:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-frontend bash -c "pnpm install --silent && pnpm run test:coverage"

qa-orphans:
	@if [ -f .agents/scripts/verify_zero_orphan_vue_components.py ]; then \
		docker run --rm --network none --security-opt=no-new-privileges:true -u "$(QA_UID):$(QA_GID)" -e HOME=/tmp -v "$(PROJECT_DIR):/app:ro" -w /app $(PYTHON_QA_IMAGE) python3 .agents/scripts/verify_zero_orphan_vue_components.py; \
	else \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-frontend node -e "const fs=require('fs'),p=require('path');const walk=d=>fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p.join(d,e.name)):[p.join(d,e.name)]):[];const tests=walk('src').concat(walk('tests')).filter(f=>/\.(unit|spec|test)\.(ts|tsx|js|jsx)$$|\.(test)\.(vue|tsx)$$/.test(f));const comps=walk('src/components').concat(walk('src/views')).filter(f=>/\.(vue|tsx)$$/.test(f)&&!/\.(unit|spec|test)\./.test(f));const m=comps.filter(c=>{const b=p.basename(c).replace(/\.(vue|tsx)$$/,'');return !tests.some(t=>p.basename(t).startsWith(b+'.'));});if(m.length){console.error('Orphan UI components:',m);process.exit(1)}"; \
	fi

qa-mutation:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-frontend bash -c 'mkdir -p /tmp/qa-bin && printf "#!/bin/sh\nexit 0\n" >/tmp/qa-bin/ps && chmod +x /tmp/qa-bin/ps && pnpm install --silent && PATH="/tmp/qa-bin:$$PATH" pnpm run mutate'

qa-bdd: build-ui
	bash -c 'trap "docker compose --project-directory \"$(PROJECT_DIR)\" -f docker-compose.qa.yml down --remove-orphans >/dev/null 2>&1 || true" EXIT; \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml up -d --wait ui-prod && \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T karatelabs mvn -B clean test'

qa-e2e: build-ui
	bash -c 'trap "docker compose --project-directory \"$(PROJECT_DIR)\" -f docker-compose.qa.yml down --remove-orphans >/dev/null 2>&1 || true" EXIT; \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml up -d --wait ui-prod && \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" -e HOME=/tmp ui-e2e bash -c "if [ -x ./node_modules/.bin/playwright ]; then ./node_modules/.bin/playwright test; elif command -v pnpm >/dev/null 2>&1; then pnpm install --silent && pnpm exec playwright test; else corepack pnpm install --silent && corepack pnpm exec playwright test; fi"'

qa-perf: build-ui
	bash -c 'trap "docker compose --project-directory \"$(PROJECT_DIR)\" -f docker-compose.qa.yml down --remove-orphans >/dev/null 2>&1 || true" EXIT; \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml up -d --wait ui-prod && \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" -e HOME=/tmp ui-e2e bash -c "export CHROME_PATH=\$$(ls -d /ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | head -n 1) && if [ -x ./node_modules/.bin/lhci ]; then ./node_modules/.bin/lhci autorun --config=lighthouserc.cjs; elif command -v pnpm >/dev/null 2>&1; then pnpm install --silent && pnpm run test:perf; else corepack pnpm install --silent && corepack pnpm run test:perf; fi"'

qa-psi:
	@target_url="$${PSI_URL:-$(URL)}"; \
	if [ -z "$$target_url" ]; then echo "⚠️ [SKIPPED] Define URL=https://domain.example (or PSI_URL)."; exit 0; fi; \
	./scripts/auditar-pagespeed.sh --url "$$target_url" --strategy "$(or $(STRATEGY),both)" $(if $(MIN_PERF),--min-performance "$(MIN_PERF)",) --output "psi-reports/psi-report.json"

qa-all: qa-lint qa-orphans qa-unit qa-mutation qa-perf qa-e2e qa-bdd

clean-cache:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml down -v >/dev/null 2>&1 || true

clean: clean-cache
	./limpieza.sh

qa-clean: clean
```

> **Stryker & Node Hardening (`QA-STRYKER-CFG-01`, `zap.yaml`):** Always configure `"ignoreStatic": true`, `"concurrency": 4` (`<= 4`), and `pnpm_config_manage_package_manager_versions=false` in Node containers alongside the non-root `/tmp/qa-bin/ps` shim; `node-backend/` includes `zap.yaml.example`, `qa-bdd`, `qa-chaos`, and `qa-observability`.

---

## 5. UI Acceptance BDD: Karate Labs (`test/ui_business_flow.feature`)

Because `sinfallas/karatelabs:1.5.1` ships without Chrome/Chromium, Karate focuses on HTTP/Nginx delivery, OWASP OSHP headers, SPA/SSG routes, and XML/SEO safety, while Playwright (`ui-e2e`) certifies DOM/WCAG 2.1 AA:

```gherkin
Feature: HTTP Edge, OWASP OSHP Headers & SSG/SEO Contract (Karate 1.5.1)

  Background:
    * def envBaseUrl = java.lang.System.getenv('UI_BASE_URL')
    * def baseUrl = karate.properties['UI_BASE_URL'] || envBaseUrl || 'http://ui-prod:8080'
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
           status=0
           printf '%s' "$$PROJECTS_JSON" | node -e 'const fs=require("fs"),p=process.argv[1],d=JSON.parse(fs.readFileSync(0,"utf8"));if(!Array.isArray(d))process.exit(2);process.exit(d.some(x=>(x["Project Name"]??x.name)===p)?0:1)' "$$PROJECT" || status=$$?
           if [ "$$status" -eq 1 ]; then
             wrangler pages project create "$$PROJECT" --production-branch="$$BRANCH" --force
           elif [ "$$status" -ne 0 ]; then
             exit "$$status"
           fi
           wrangler pages deploy /app/dist \
             --project-name="$$PROJECT" \
             --branch="$$BRANCH" \
             --commit-dirty=true \
             --force
   ```

3. **`deploy.sh` (serialized build, dual-compose cleanup, bounded `docker run`, disable pseudo-TTY; `QA-DOCKER-TTY-01`, `QA-DOCKER-LOOP-01` & `QA-GIT-GATE-01`):**
   ```bash
   export COMPOSE_PARALLEL_LIMIT=1
   LOCK_FILE="${XDG_RUNTIME_DIR:-/tmp}/qa-11x-docker.lock"
   exec 9>"${LOCK_FILE}"
   flock -x 9

   BUILD_CID="pages-build-$$"
   cleanup() {
     docker rm -f "${BUILD_CID}" >/dev/null 2>&1 || true
     docker compose -f docker-compose.deploy.yml down --remove-orphans >/dev/null 2>&1 || true
     docker compose -f docker-compose.qa.yml --profile "*" down --remove-orphans >/dev/null 2>&1 || true
   }
   trap cleanup EXIT INT TERM

   for svc in preview qa-gate deploy; do
     docker compose -f docker-compose.deploy.yml build "${svc}"
   done
   docker compose -f docker-compose.deploy.yml up -d --wait --wait-timeout 60 preview
   docker compose -f docker-compose.deploy.yml run --rm -T -u "$(id -u):$(id -g)" qa-gate
   docker compose -f docker-compose.deploy.yml down --remove-orphans
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
