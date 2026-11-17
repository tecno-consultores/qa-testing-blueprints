> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md)

# 🐳 Specification 20: Hardened Base Docker Image Plan for `mobile-appium` (`sinfallas/base-mobile-appium:26`)

**Project:** QA Testing Blueprints (QA-11X Corporate Standard)  
**Target Version:** QA-11X v3.0 / v3.1 (Multi-Arch Base Image Built & Certified)  
**Status:** IMPLEMENTED AND CERTIFIED IN QA-11X v3.1 (Phases 1–4 Completed)  
**Audience:** DevSecOps Architecture, Mobile QA Engineering, and `sinfallas/*` Image Maintainers

---

## 1. Purpose and Context

Objectively evaluate whether the [`mobile-appium/`](../../mobile-appium/README.md) blueprint requires a dedicated base Docker image under **Rule Zero**, and define its full technical specification, STIG/OWASP hardening, supply-chain attestation, and CI/Compose/MCP integration plan.

> **CERTIFIED IMPLEMENTATION IN QA-11X v3.1:** Multi-stage non-root build (`UID/GID 10001`) completed and certified in the `base-mobile-appium` repository (`sinfallas/base-mobile-appium:26` / `:latest`, Trivy `HIGH/CRITICAL = 0`), integrated into [`.github/workflows/audit-base-images.yml`](../../.github/workflows/audit-base-images.yml), [`mobile-appium/docker-compose.qa.yml`](../../mobile-appium/docker-compose.qa.yml) (Category 1 QA orchestrator hydrated directly to `docker-compose.qa.yml` in target projects) and sibling `*.example` templates, [`Makefile`](../../Makefile) (`test-mobile-blueprints`), and the `@sinfallas/mcp-qa-11x` MCP server.

---

## 2. Technical Diagnosis: `sinfallas/base-node-ionic:26` Coverage vs. Real Gaps

According to [`mobile-appium/README.md`](../../mobile-appium/README.md), [`mobile-appium/wdio.conf.ts`](../../mobile-appium/wdio.conf.ts), and [`mobile-appium/tests/screenplay/MobileActor.ts`](../../mobile-appium/tests/screenplay/MobileActor.ts), current capabilities versus requirements for real Appium 3 execution compare as follows:

| Capability Required by `mobile-appium` | Current `sinfallas/base-node-ionic:26` | Observed Gap |
| :--- | :--- | :--- |
| Strict TypeScript compilation (`tsc --noEmit`, `0 any`, `--erasableSyntaxOnly`) | **Covered** (`Node` + `TypeScript` preinstalled in `/opt/qa11x`) | None for static validation and TS Screenplay. |
| Profile validation for `wdio.conf.ts` (`node --experimental-strip-types`) | **Covered** | None for configuration unit tests. |
| AST anti-XPath / anti-`waitForTimeout` audit (`lint_test_antipatterns.py`) | **Covered** (alongside `sinfallas/base-python-uv:3.15`) | None. |
| Base `appium` CLI (W3C-compatible `Appium 3.x`) | **Partial** (`appium` binary present, **no pre-baked drivers**) | `appium driver list --installed` empty or dependent on downloads blocked inside offline / `read_only` ephemeral containers. |
| **Real Android execution (`android-uiautomator2`, `hybrid-ionic`, `hybrid-rn`)** | **Absent** | Missing **OpenJDK 21 LTS (`JAVA_HOME`)**, **Android SDK Command-Line Tools**, **`platform-tools` (`adb`)**, and **`build-tools` (`aapt2`, `apksigner`)**. |
| **Non-root pre-baked W3C drivers (`APPIUM_HOME`)** | **Absent** | Missing `uiautomator2` (and iOS W3C client `xcuitest` for remoting to macOS device farms) under `/opt/appium-home` with world-readable permissions for `-u "$(id -u):$(id -g)"`. |
| **Zero-Runtime WebdriverIO v9 Runner (`Rule Zero`)** | **Absent** | Missing pre-baked `@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter`, `@wdio/appium-service`, `webdriverio` v9, and `@wdio/allure-reporter` under `/opt/qa11x/node_modules` to enforce zero runtime `npm install` and `.npmrc` `ignore-scripts=true`. |

---

## 3. Architectural Verdict: **YES, Justified (`sinfallas/base-mobile-appium:26`, No Embedded Emulator)**

1. **A dedicated base image (`sinfallas/base-mobile-appium:26`) IS required** because injecting OpenJDK 21 + Android `platform-tools`/`build-tools` + Appium 3 drivers + WebdriverIO v9 into `sinfallas/base-node-ionic:26` would severely degrade the web/Ionic base (adding ~450–600 MB of unnecessary bloat and Java CVE surface to Trivy audits of pure web projects like Vue 3 or React).
2. **Separation Principle (No Embedded QEMU/KVM Emulator):**
   - `sinfallas/base-mobile-appium:26` is strictly a **Runner + W3C Driver Bridge without an embedded Android emulator**, keeping the image compact (`< 950 MB` compressed), portable without `--privileged` or `/dev/kvm` in standard CI runners, and clean under Trivy (`HIGH/CRITICAL = 0`).
   - At runtime it connects over TCP/W3C to: (a) an ephemeral sibling emulator service (`budtmo/docker-android` / private Docker network or `host.docker.internal`), (b) a W3C device farm (Device Farm / BrowserStack / Appium Grid), or (c) a remote Appium server on a macOS runner for `ios-xcuitest` profiles.

---

## 4. Hardened Design of `sinfallas/base-mobile-appium:26` (DISA STIG & Non-Root)

### 4.1. Multi-Stage Architecture and Canonical Variables (`linux/amd64` + `linux/arm64`)
- **Base OS + Node:** Same hardened minimal Debian 13 `trixie` family (`node:26-slim`), `pnpm`, `bash`, `ca-certificates`, `unzip` restricted to the `android-sdk-builder` stage.
- **Stage 1 (`android-sdk-builder`, `--platform=$BUILDPLATFORM`):**
  - Installs **OpenJDK 21 Headless JDK** at native host speed.
  - Downloads **Android `commandlinetools-linux-15641748_latest.zip`** (`cmdline-tools;21.0`) pinned by **SHA-256** (`a66d5ef0238fc0162e9c1446602ce0dd41702d4dd7a94d2ce42d12b7f80baf7e`), the last **100% pure-Java (`SdkManagerCli`)** revision using `REPO_OS_OVERRIDE=linux`, avoiding the `v22+/v23+` (`16111833`) wrapper that delegates to the `x86_64`-only ELF binary `bin/android` (`exit 127` on `linux/arm64`).
  - Installs only `platform-tools` (`adb`), `build-tools;35.0.0` (`aapt2`, `apksigner`, `zipalign`), and `platforms;android-35` (excluding `system-images`, `emulator`, NDK, and purging `cmdline-tools` afterwards).
- **Stage 2 (`node-builder`, native target platform `$TARGETPLATFORM`):**
  - Pre-bakes into `/opt/qa11x/` from lockfile (`npm ci --omit=dev --ignore-scripts`, compiling/resolving native addons `@img/sharp-linux-*`, `@esbuild/linux-*`, and `bare-*` for `$TARGETARCH`): `appium@3.x`, `webdriverio@^9`, `@wdio/cli@^9`, `@wdio/mocha-framework@^9`, `@wdio/spec-reporter@^9`, `@wdio/appium-service@^9`, `@wdio/allure-reporter@^9`, `typescript`, and generates the CycloneDX SBOM (`/opt/qa11x/sbom.cdx.json`).
  - Pre-bakes drivers under `APPIUM_HOME=/opt/appium-home` at build time (`appium driver install uiautomator2` and `appium driver install xcuitest`).
- **Stage 3 (Hardened `runtime`, `ARG TARGETARCH`):**
  - Copies only `JRE 21`, `ANDROID_HOME=/opt/android-sdk`, `APPIUM_HOME=/opt/appium-home`, and `/opt/qa11x` with `chmod -R a+rX` (non-writable `/opt`).
  - Retains official Google binaries on `amd64`; when `TARGETARCH=arm64`, installs native `arm64` `adb`, `aapt` (`aapt` + `aapt2`), and `zipalign` from Debian 13 (`trixie`), purges incompatible `x86_64` ELFs, and symlinks `/usr/lib/android-sdk/...` inside `${ANDROID_HOME}/platform-tools` and `${ANDROID_HOME}/build-tools/35.0.0` while preserving cross-platform Java/DEX artifacts (`apksigner`, `d8`, `platforms/android-35`).
  - Default non-root user `USER 10001:10001` compatible with `-u "$(id -u):$(id -g)"` overrides.
  - Environment variables: `HOME=/tmp`, `JAVA_HOME=/opt/java/openjdk`, `ANDROID_HOME=/opt/android-sdk`, `ANDROID_USER_HOME=/tmp/.android`, `APPIUM_HOME=/opt/appium-home`, `NODE_PATH=/opt/qa11x/node_modules`, `QA_MOBILE_ARTIFACT_DIR=/tmp/qa-11x-mobile-artifacts`.
  - Zero secrets, zero SSH, zero `sudo`; `HEALTHCHECK` running `appium --version && adb --version`.

---

## 5. Security, Supply Chain & Integration Plan (4 Phases)

| Phase | Deliverables & Tasks | Target Verification |
| :--- | :--- | :--- |
| **Phase 1: Image Build & Smoke Verification** | Author multi-stage Dockerfile in the base-images repository with `lockfile` and SHA-256 checksums for Java + Android `cmdline-tools`; generate **CycloneDX SBOM (`ECMA-424`)** and **Cosign** signature prior to initial push of `sinfallas/base-mobile-appium:26`. | `id -u != 0`, `appium --version`, `appium driver list --installed`, `adb version`, `tsc --noEmit` on `mobile-appium/`, `Trivy HIGH/CRITICAL = 0`. |
| **Phase 2: Continuous Audit in `audit-base-images.yml`** | Add `'sinfallas/base-mobile-appium:26'` to the `trivy-base-images` matrix in `.github/workflows/audit-base-images.yml` and add a non-root `smoke-mobile-appium` job (`--user 10001:10001 -e HOME=/tmp`). | Automated daily scan on GitHub Actions with `0` `HIGH`/`CRITICAL` findings ignoring only `unfixed`. |
| **Phase 3: Integration in `mobile-appium/` & `Makefile`** | Create [`mobile-appium/docker-compose.qa.yml`](../../mobile-appium/docker-compose.qa.yml) (Category 1 QA orchestrator hydrated directly to `docker-compose.qa.yml` in target projects: `pnpm-store-init`, non-root `qa-mobile` service `${QA_UID:-1000}:${QA_GID:-1000}` with `HOME=/tmp`, `ANDROID_HOME`, `APPIUM_HOME`, `NODE_PATH`, `extra_hosts`, and `appium-live` profile for `appium-bridge` with `/status` `healthcheck` and `ADB_SERVER_SOCKET`), [`mobile-appium/package.json.example`](../../mobile-appium/package.json.example) (zero runtime `webdriverio` install), and [`mobile-appium/Makefile.example`](../../mobile-appium/Makefile.example) anchored with `$(CURDIR)` (`QA-MAKE-CURDIR-01`), plus `make test-mobile-blueprints` in [`Makefile`](../../Makefile). | `mobile-appium/tests/mobile_screenplay.spec.ts` executing against an ephemeral Appium W3C stub/server (`node --test`) with `Pass-Quiet / Fail-Verbose` diagnostics under `/tmp`. |
| **Phase 4: Blueprints & MCP Update (`QA-TEST-SYNC-01`)** | Update `mcp-server/src/resources/stackBlueprints.ts`, `mcp-server/src/tools/ephemeral-runner.ts` (`PREFERRED_QA_SERVICES` including `qa-mobile`), [`README.md`](../../README.md), [`RESOURCES.md`](../../RESOURCES.md), and Karate BDD scenarios. | `make test-mcp`, `make test-py`, `make test-karate`, `make lint-docs`, and `certify_task_completion.sh` at `100%`. |

---

## 6. Decision Matrix: When to Use Each Image?

* **`sinfallas/base-node-ionic:26`**: Angular/Ionic web projects, fast `tsc` + `lint_test_antipatterns.py` checks, and `mobile-appium` projects delegating Appium/drivers to an external grid (BrowserStack / Sauce Labs / macOS runner).
* **`sinfallas/base-mobile-appium:26` *(Certified Multi-Arch `linux/amd64` and `linux/arm64`)***: Self-contained `WebdriverIO + Appium 3 + UiAutomator2 + ADB` execution from CI containers against networked Android devices or TCP emulators with zero runtime downloads.
