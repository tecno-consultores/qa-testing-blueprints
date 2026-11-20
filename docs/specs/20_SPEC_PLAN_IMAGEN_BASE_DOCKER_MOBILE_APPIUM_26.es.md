> 🌐 **Idioma:** [🇺🇸 English (Canonical)](20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.md) · **Español (Espejo 1:1)**

# 🐳 Especificación 20: Plan de Imagen Base Docker Endurecida para `mobile-appium` (`sinfallas/base-mobile-appium:26`)

**Proyecto:** QA Testing Blueprints (Estándar Corporativo QA-11X)  
**Versión Objetivo:** QA-11X v3.0 / v3.1 (Imagen base multi-arch construida y certificada)  
**Estado:** IMPLEMENTADO Y CERTIFICADO EN QA-11X v3.1 (Fases 1–4 Completadas)  
**Audiencia:** Arquitectura DevSecOps, Ingeniería Móvil QA y Mantenedores de Imágenes `sinfallas/*`

---

## 1. Propósito y Contexto

Evaluar objetivamente si el entorno [`mobile-appium/`](../../mobile-appium/README.es.md) requiere una nueva imagen base Docker dedicada bajo la **Regla Cero** y definir su especificación técnica completa, endurecimiento STIG/OWASP, cadena de suministro y plan de integración en CI/Compose/MCP.

> **IMPLEMENTACIÓN CERTIFICADA EN QA-11X v3.1:** Construcción multi-stage non-root (`UID/GID 10001`) completada y certificada en el repositorio `base-mobile-appium` (`sinfallas/base-mobile-appium:26` / `:latest`, Trivy `HIGH/CRITICAL = 0`), integrada en [`.github/workflows/audit-base-images.yml`](../../.github/workflows/audit-base-images.yml), [`mobile-appium/docker-compose.qa.yml`](../../mobile-appium/docker-compose.qa.yml) (orquestador QA Categoría 1 hidratado directamente como `docker-compose.qa.yml` en proyectos destino) y plantillas hermanas `*.example`, [`Makefile`](../../Makefile) (`test-mobile-blueprints`) y servidor MCP `@sinfallas/mcp-qa-11x`.

---

## 2. Diagnóstico Técnico: Qué Cubre `sinfallas/base-node-ionic:26` vs. Brechas Reales

De acuerdo con [`mobile-appium/README.es.md`](../../mobile-appium/README.es.md), [`mobile-appium/wdio.conf.ts`](../../mobile-appium/wdio.conf.ts) y [`mobile-appium/tests/screenplay/MobileActor.ts`](../../mobile-appium/tests/screenplay/MobileActor.ts), las capacidades actuales frente a las necesarias para ejecutar pruebas Appium 3 reales se comparan así:

| Capacidad Requerida por `mobile-appium` | `sinfallas/base-node-ionic:26` Actual | Brecha Observada |
| :--- | :--- | :--- |
| Compilación TypeScript estricta (`tsc --noEmit`, `0 any`, `--erasableSyntaxOnly`) | **Cubierta** (`Node` + `TypeScript` preinstalados en `/opt/qa11x`) | Ninguna para validación estática y Screenplay TS. |
| Validación de perfiles `wdio.conf.ts` (`node --experimental-strip-types`) | **Cubierta** | Ninguna para pruebas unitarias de configuración. |
| Auditoría AST anti-XPath / anti-`waitForTimeout` (`lint_test_antipatterns.py`) | **Cubierta** (junto a `sinfallas/base-python-uv:3.15`) | Ninguna. |
| CLI base `appium` (`Appium 3.x` compatible W3C) | **Parcial** (binario `appium` presente, **sin drivers prehorneados**) | `appium driver list --installed` vacío o dependiente de descargas bloqueadas en contenedores efímeros sin red / `read_only`. |
| **Ejecución real Android (`android-uiautomator2`, `hybrid-ionic`, `hybrid-rn`)** | **Ausente** | Faltan **OpenJDK 21 LTS (`JAVA_HOME`)**, **Android SDK Command-Line Tools**, **`platform-tools` (`adb`)** y **`build-tools` (`aapt2`, `apksigner`)**. |
| **Drivers W3C prehorneados no-root (`APPIUM_HOME`)** | **Ausente** | Faltan drivers `uiautomator2` (e iOS W3C cliente `xcuitest` para remoting hacia granjas macOS) bajo `/opt/appium-home` con permisos de lectura globales para `-u "$(id -u):$(id -g)"`. |
| **Runner WebdriverIO v9 Zero-Runtime (`Rule Zero`)** | **Ausente** | Faltan `@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter`, `@wdio/appium-service`, `webdriverio` v9 y `@wdio/allure-reporter` prehorneados en `/opt/qa11x/node_modules` para cumplir cero `npm install` en runtime y `.npmrc` `ignore-scripts=true`. |

---

## 3. Veredicto Arquitectónico: **SÍ se Justifica (`sinfallas/base-mobile-appium:26`, Sin Emulador Embebido)**

1. **Sí es necesaria una nueva imagen base dedicada (`sinfallas/base-mobile-appium:26`)** porque inyectar OpenJDK 21 + Android `platform-tools`/`build-tools` + drivers Appium 3 + WebdriverIO v9 dentro de `sinfallas/base-node-ionic:26` degradaría gravemente la base web/Ionic (añadiendo ~450–600 MB innecesarios y superficie Java CVE al auditor Trivy de proyectos web puros como Vue 3 o React).
2. **Principio de Separación (Sin Emulador QEMU/KVM Embebido):**
   - La imagen `sinfallas/base-mobile-appium:26` será estrictamente un **Runner + Driver Bridge W3C sin emulador Android embebido**, manteniendo la imagen ligera (`< 950 MB` comprimida), portable sin `--privileged` ni `/dev/kvm` dentro de CI estándar, y fácil de auditar (`Trivy HIGH/CRITICAL = 0`).
   - En ejecución viva se conectará por TCP/W3C hacia: (a) un emulador efímero en servicio hermano (`budtmo/docker-android` / red privada Docker o `host.docker.internal`), (b) granja W3C (Device Farm / BrowserStack / Appium Grid), o (c) servidor Appium remoto en runner macOS para perfiles `ios-xcuitest`.

---

## 4. Diseño Endurecido de `sinfallas/base-mobile-appium:26` (DISA STIG & Non-Root)

### 4.1. Arquitectura Multi-Etapa y Variables Canónicas (`linux/amd64` + `linux/arm64`)
- **Base OS + Node:** Misma familia base minimalista endurecida Debian 13 `trixie` (`node:26-slim`), `pnpm`, `bash`, `ca-certificates`, `unzip` solo en etapa `android-sdk-builder`.
- **Stage 1 (`android-sdk-builder`, `--platform=$BUILDPLATFORM`):**
  - Instala **OpenJDK 21 Headless JDK** a velocidad nativa del host.
  - Descarga **Android `commandlinetools-linux-15641748_latest.zip`** (`cmdline-tools;21.0`) fijado por **SHA-256** (`a66d5ef0238fc0162e9c1446602ce0dd41702d4dd7a94d2ce42d12b7f80baf7e`), última revisión **100% Java puro (`SdkManagerCli`)** con `REPO_OS_OVERRIDE=linux`, evitando el wrapper `v22+/v23+` (`16111833`) que delega en el binario ELF `bin/android` exclusivo de `x86_64` (`exit 127` en `linux/arm64`).
  - Instala exclusivamente `platform-tools` (`adb`), `build-tools;35.0.0` (`aapt2`, `apksigner`, `zipalign`) y `platforms;android-35` (excluyendo `system-images`, `emulator`, NDK y purgando `cmdline-tools` al finalizar).
- **Stage 2 (`node-builder`, plataforma destino nativa `$TARGETPLATFORM`):**
  - Prehornea en `/opt/qa11x/` desde lockfile (`npm ci --omit=dev --ignore-scripts`, compilando/resolviendo addons nativos `@img/sharp-linux-*`, `@esbuild/linux-*` y `bare-*` para `$TARGETARCH`): `appium@3.x`, `webdriverio@^9`, `@wdio/cli@^9`, `@wdio/local-runner@^9`, `@wdio/mocha-framework@^9`, `@wdio/spec-reporter@^9`, `@wdio/appium-service@^9`, `@wdio/allure-reporter@^9`, `typescript`, y genera el SBOM CycloneDX (`/opt/qa11x/sbom.cdx.json`).
  - Prehornea drivers en `APPIUM_HOME=/opt/appium-home` durante build (`appium driver install uiautomator2` y `appium driver install xcuitest`).
- **Stage 3 (`runtime` endurecido, `ARG TARGETARCH`):**
  - Copia únicamente `JRE 21`, `ANDROID_HOME=/opt/android-sdk`, `APPIUM_HOME=/opt/appium-home` y `/opt/qa11x` con `chmod -R a+rX` (sin escritura en `/opt`).
  - Mantiene los binarios oficiales de Google en `amd64`; cuando `TARGETARCH=arm64`, instala `adb`, `aapt` (`aapt` + `aapt2`) y `zipalign` nativos `arm64` de Debian 13 (`trixie`), purga los ELF `x86_64` incompatibles y enlaza `/usr/lib/android-sdk/...` dentro de `${ANDROID_HOME}/platform-tools` y `${ANDROID_HOME}/build-tools/35.0.0`, conservando intactos los artefactos Java/DEX multiplataforma (`apksigner`, `d8`, `platforms/android-35`).
  - Usuario no-root por defecto `USER 10001:10001` compatible con sobreescritura `-u "$(id -u):$(id -g)"`.
  - Variables de entorno: `HOME=/tmp`, `JAVA_HOME=/opt/java/openjdk`, `ANDROID_HOME=/opt/android-sdk`, `ANDROID_USER_HOME=/tmp/.android`, `APPIUM_HOME=/opt/appium-home`, `NODE_PATH=/opt/qa11x/node_modules`, `QA_MOBILE_ARTIFACT_DIR=/tmp/qa-11x-mobile-artifacts`.
  - Sin secretos, sin SSH, sin `sudo`, `HEALTHCHECK` invocando `appium --version && adb --version`.

---

## 5. Seguridad, Cadena de Suministro y Plan de Integración (4 Fases)

| Fase | Entregables y Tareas | Verificación Objetivo |
| :--- | :--- | :--- |
| **Fase 1: Construcción y Smoke de Imagen** | Crear Dockerfile multi-etapa en repositorio de imágenes base con `lockfile` y checksums SHA-256 para Java + Android `cmdline-tools`; generar **SBOM CycloneDX (`ECMA-424`)** y firma **Cosign** antes del push inicial de `sinfallas/base-mobile-appium:26`. | `id -u != 0`, `appium --version`, `appium driver list --installed`, `adb version`, `tsc --noEmit` sobre `mobile-appium/`, `Trivy HIGH/CRITICAL = 0`. |
| **Fase 2: Auditoría Continua en `audit-base-images.yml`** | Añadir `'sinfallas/base-mobile-appium:26'` a la matriz `trivy-base-images` de `.github/workflows/audit-base-images.yml` y añadir job `smoke-mobile-appium` no-root (`--user 10001:10001 -e HOME=/tmp`). | Escaneo diario automático en GitHub Actions con `0` hallazgos `HIGH`/`CRITICAL` ignorando solo `unfixed`. |
| **Fase 3: Integración en `mobile-appium/` y `Makefile`** | Crear [`mobile-appium/docker-compose.qa.yml`](../../mobile-appium/docker-compose.qa.yml) (orquestador QA Categoría 1 hidratado directamente como `docker-compose.qa.yml` en proyectos destino: `pnpm-store-init`, servicio `qa-mobile` no-root `${QA_UID:-1000}:${QA_GID:-1000}` con `HOME=/tmp`, `ANDROID_HOME`, `APPIUM_HOME`, `NODE_PATH`, `extra_hosts`, y perfil `appium-live` para `appium-bridge` con `/status` `healthcheck` y `ADB_SERVER_SOCKET`), [`mobile-appium/package.json.example`](../../mobile-appium/package.json.example) (scripts estrictos `tsc` + `node --test` alineados con `webdriverio`/`@wdio/*` v9 y `appium` v3 prehorneados sin descargas en runtime vía `NODE_PATH`), [`mobile-appium/npmrc.example`](../../mobile-appium/npmrc.example) (`ignore-scripts=true`, `SEC-09`) y [`mobile-appium/Makefile.example`](../../mobile-appium/Makefile.example) usando `$(CURDIR)` (`QA-MAKE-CURDIR-01`), más `make test-mobile-blueprints` en [`Makefile`](../../Makefile). | `mobile-appium/tests/mobile_screenplay.spec.ts` ejecutándose contra un stub/servidor Appium W3C efímero (`node --test`) con diagnóstico `Pass-Quiet / Fail-Verbose` en `/tmp`. |
| **Fase 4: Actualización de Blueprints y MCP (`QA-TEST-SYNC-01`)** | Actualizar `mcp-server/src/resources/stackBlueprints.ts`, `mcp-server/src/tools/ephemeral-runner.ts` (`PREFERRED_QA_SERVICES` incluyendo `qa-mobile`), [`README.es.md`](../../README.es.md), [`RESOURCES.es.md`](../../RESOURCES.es.md) y escenarios Karate BDD. | `make test-mcp`, `make test-py`, `make test-karate`, `make lint-docs` y `certify_task_completion.sh` al `100%`. |

---

## 6. Matriz de Decisión: ¿Cuándo Usar Cada Imagen?

* **`sinfallas/base-node-ionic:26`**: Proyectos Angular/Ionic web, verificación rápida `tsc` + `lint_test_antipatterns.py`, y proyectos `mobile-appium` que delegan Appium/drivers a una granja externa (BrowserStack / Sauce Labs / runner macOS).
* **`sinfallas/base-mobile-appium:26` *(Certificada Multi-Arch `linux/amd64` y `linux/arm64`)***: Ejecución autocontenida de `WebdriverIO + Appium 3 + UiAutomator2 + ADB` desde contenedor CI contra dispositivos Android en red o emuladores TCP sin descargas en runtime.
