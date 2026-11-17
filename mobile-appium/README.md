> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](README.es.md)

# 📱 Native & Hybrid Mobile Blueprint — Appium 3 / WebdriverIO v9 + Screenplay (QA-11X Standard)

Corporate **Native (iOS / Android)** and **Hybrid (Ionic / Capacitor & React Native)** mobile automation blueprint governed by **Rule Zero** (zero ad-hoc host executions or downloads), **Multi-Tenant RBAC Screenplay Pattern**, resilient semantic locators, and mobile security controls.

---

## 1. Architecture Under Rule Zero (`sinfallas/base-mobile-appium:26`)

[`sinfallas/base-mobile-appium:26`](../docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md) is the **official hardened non-root mobile base image** (`UID 10001`, compatible with `-u "$(id -u):$(id -g)" -e HOME=/tmp`) pre-baking **Node.js 26**, **pnpm**, **OpenJDK 21**, **Android SDK (`ANDROID_HOME=/opt/android-sdk`) / ADB / `aapt2`**, **Appium 3** (`APPIUM_HOME=/opt/appium-home`) with preinstalled **`uiautomator2`** and **`xcuitest`** drivers, and **WebdriverIO v9** (`/opt/qa11x/node_modules`) with **zero runtime `npm install`**.

| Image | Official QA-11X Mobile Scope | Pre-Baked Runtime Tooling |
| :--- | :--- | :--- |
| **`sinfallas/base-mobile-appium:26`** | **Official default** for self-contained mobile CI, local W3C Bridge, Android ADB & WebdriverIO v9 | Node.js 26, pnpm, **OpenJDK 21**, **Android SDK/ADB**, **Appium 3 (`uiautomator2`/`xcuitest`)**, **WebdriverIO v9**, TypeScript |
| **`sinfallas/base-node-ionic:26`** | Lightweight Ionic web checks or external W3C device-farm delegation without Java/Android overhead | Node.js 26, pnpm, TypeScript, Playwright (delegates real mobile drivers to external grids) |

> **Bilingual Architecture:** Maintained under the English-Primary + 1:1 Spanish Mirror standard defined in [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md`](../docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.md).

```bash
# Verify OpenJDK 21, Android ADB, Appium 3 and preinstalled drivers without modifying the tree
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  sinfallas/base-mobile-appium:26 \
  sh -ec 'java -version && adb version && appium --version && appium driver list --installed'

# Strict TypeScript compilation (0 any, --erasableSyntaxOnly) + W3C Screenplay contract
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e NODE_PATH=/opt/qa11x/node_modules \
  -v "$(pwd):/app:ro" -w /app sinfallas/base-mobile-appium:26 \
  sh -ec 'tsc --strict --noImplicitAny --noUnusedLocals --noUnusedParameters \
  --noImplicitReturns --erasableSyntaxOnly --allowImportingTsExtensions \
  --target ES2023 --module NodeNext --moduleResolution NodeNext \
  --typeRoots /opt/qa11x/node_modules/@types --types node --noEmit \
  mobile-appium/wdio.conf.ts mobile-appium/tests/screenplay/MobileActor.ts mobile-appium/tests/mobile_screenplay.spec.ts && \
  node --test mobile-appium/tests/mobile_screenplay.spec.ts'

# Deterministic UI anti-pattern audit (0 violations)
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 \
  -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 \
  python3 .agents/scripts/lint_test_antipatterns.py mobile-appium
```

---

## 2. Strict Mobile Locator Hierarchy and Zero Anti-Patterns

| Priority | Strategy | Canonical Usage (`MobileActor.ts`) | Resilience Notes |
| :--- | :--- | :--- | :--- |
| **1 (Primary)** | `accessibilityId` (`~id`) | `ByAccessibilityId('btn-sync-tenant')` | Stable across iOS (`accessibilityIdentifier`) and Android (`content-desc`). |
| **2 (Native iOS/Android)** | `iosPredicate` / `androidUiAutomator` | `ByIosPredicate(...)` / `ByAndroidUiAutomator(...)` | Native queries without coupling to the full XML hierarchy. |
| **3 (Hybrid WebView)** | ARIA roles in `WEBVIEW_*` | `ByWebviewRole('button', 'Sincronizar')` | Reuses accessible semantics inside Ionic/Capacitor or React Native WebView. |
| **VETOED** | Absolute XPath or fixed sleeps | *Rejected at runtime (`Fail-Closed`)* | Zero `/html/body`, `//div`, `waitForTimeout(...)`, or `sleep`; audited by `lint_test_antipatterns.py`. |

---

## 3. `MobileActor` Screenplay Pattern & Contract Suite (`tests/mobile_screenplay.spec.ts`)

[`mobile-appium/tests/screenplay/MobileActor.ts`](tests/screenplay/MobileActor.ts) enforces pure composition with zero deep inheritance or hidden assertions (`expect`/`assert` reside exclusively inside `.spec.ts` files), validated end-to-end by [`mobile-appium/tests/mobile_screenplay.spec.ts`](tests/mobile_screenplay.spec.ts) (`node:test` + local HTTP W3C WebDriver stub):

1. **Multi-Tenant Identity (`MobileActorIdentity`):** Requires `tenantId`, `role`, `platform` (`android | ios`), `hybridShell` (`ionic-capacitor | react-native | native`), and an explicit `permissions` list (`MissingMobileAbilityError` if an ability is missing).
2. **Safe Context Switching (`SwitchMobileContext`):** Inspects `getContexts()` before switching between `NATIVE_APP` and `WEBVIEW_<package>`; throws `MobileContextNotFoundError` if the WebView is missing instead of hanging indefinitely.
3. **Anti-Collapse Geometry (`VisibleMobileBounds`):** Rejects elements with a `0x0` bounding box (`CollapsedMobileGeometryError`) before tapping or typing.
4. **Intent / Deep-Link Hijacking Defense (`OpenVerifiedDeepLink`):** Blocks dangerous schemes (`javascript:`, `file:`, `data:`, `content:`) and non-allowlisted external hosts by throwing `UnsafeDeepLinkError`.
5. **Biometry & Explicit Permissions (`SimulateBiometricPrompt`):** Simulates match/reject (`faceId`, `touchId`, `fingerprint`) while `wdio.conf.ts` preserves `appium:autoGrantPermissions: false` and `appium:autoAcceptAlerts: false` to audit real permission dialogs.
6. **Offline Resilience, `Idempotency-Key` & Anti-Silo Parity (`VerifyOfflineSyncParity`):** Toggles connectivity (`SetMobileNetworkState('offline' | 'online')`), dispatches mutating syncs with `X-Tenant-ID` and `Idempotency-Key` (UUIDv4), inspects `results[].status` per item (`inspectBatchSync`), evaluates all 3 temporal phases (`MobileTemporalLifecycleState`: `pending`, `active`, `expired`), and asserts mobile screen <-> real backend `GET` parity without intermediate mocks.

---

## 4. W3C Profiles in `wdio.conf.ts` and `Pass-Quiet` / `Fail-Verbose` Diagnostics

[`buildMobileWdioConfig(env)`](wdio.conf.ts) selects the active profile via `MOBILE_PROFILE`:

- `android-uiautomator2`: `platformName: 'Android'`, `appium:automationName: 'UiAutomator2'`, `appium:noReset: false`, `appium:autoGrantPermissions: false`.
- `ios-xcuitest`: `platformName: 'iOS'`, `appium:automationName: 'XCUITest'`, `appium:isolateSimDevice: true`, `appium:autoAcceptAlerts: false`.
- `hybrid-ionic` / `hybrid-rn`: `appium:autoWebview: false` by default for explicit `NATIVE_APP` <-> `WEBVIEW_*` switching with `appium:webviewConnectTimeout: 10000`.
- **`QA-CLI-TTY-01` & `Fail-Closed` Guards:** Ports outside `1..65535`, unknown profiles, or artifact paths outside `/tmp` throw `MobileConfigValidationError`. Timeouts remain bounded (`connectionRetryTimeout: 30000`, `connectionRetryCount: 1`, `waitforTimeout: 10000`, `appium:newCommandTimeout: 60`).
- **`Pass-Quiet` / `Fail-Verbose` Diagnostics:** On success (`passed: true`), `afterTest` emits zero files or log noise; on failure (`passed: false`), it writes the XML/DOM tree, PNG screenshot, and Allure metadata (`deviceProfile`, `context`, `tenantId`) under `/tmp/qa-11x-mobile-artifacts` without polluting the Git tree.

---

## 5. Ephemeral Compose Blueprints & Root Certification (`make test-mobile-blueprints`)

Ready-to-adopt consumer templates live under `mobile-appium/` alongside the monorepo root certification target:

- [`docker-compose.qa.yml.example`](docker-compose.qa.yml.example): Orchestrates `pnpm-store-init`, non-root `qa-mobile` (`sinfallas/base-mobile-appium:26`, `${QA_UID:-1000}:${QA_GID:-1000}`, `HOME=/tmp`, `ANDROID_HOME=/opt/android-sdk`, `APPIUM_HOME=/opt/appium-home`, `NODE_PATH=/opt/qa11x/node_modules`), and `appium-bridge` (profile `appium-live`, `ADB_SERVER_SOCKET` via `host.docker.internal:5037`, W3C `/status` `HEALTHCHECK` on port `4723`).
- [`package.json.example`](package.json.example): ESM descriptor (`pnpm@12.18.0`, `webdriverio@^9.16.0`, `appium@^3.0.0`, `typescript@^5.8.2`) providing `type-check`, `test:unit`, `test:e2e`, `appium:drivers`, `adb:devices`, and `audit:deps`.
- [`Makefile.example`](Makefile.example): Ephemeral container targets anchored with `$(CURDIR)` (`QA-MAKE-CURDIR-01`) — `qa-lint`, `qa-unit`, `qa-drivers`, `qa-bridge`, `qa-e2e`, `qa-all`, `clean-cache`, `clean`, and `qa-clean`.
- `make test-mobile-blueprints` (monorepo root [`Makefile`](../Makefile)): Certifies `java`/`adb`/`appium` binaries, strict `tsc --noEmit`, `node --test mobile-appium/tests/mobile_screenplay.spec.ts` inside `sinfallas/base-mobile-appium:26`, and `lint_test_antipatterns.py mobile-appium` inside `sinfallas/base-python-uv:3.15`.

```bash
# Monorepo root full mobile blueprint certification (Rule Zero)
make test-mobile-blueprints

# Consumer project usage after copying *.example templates (without .example suffix)
make qa-all
make qa-e2e

# Single-container W3C profile & host verification against remote Appium/W3C grid
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -e MOBILE_PROFILE=hybrid-ionic \
  -e APPIUM_HOST=host.docker.internal \
  -e APPIUM_PORT=4723 \
  -e QA_MOBILE_ARTIFACT_DIR=/tmp/qa-11x-mobile-artifacts \
  -v "$(pwd):/app:ro" -w /app sinfallas/base-mobile-appium:26 \
  node --experimental-strip-types -e "import('./mobile-appium/wdio.conf.ts').then(m => console.log(m.buildMobileWdioConfig().profile))"
```
