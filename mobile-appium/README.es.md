> 🌐 **Idioma:** [🇺🇸 English (Canonical)](README.md) · **Español (Espejo 1:1)**

# 📱 Blueprint Móvil Nativo e Híbrido — Appium 3 / WebdriverIO v9 + Screenplay (Estándar QA 11X)

Plantilla corporativa de automatización móvil **Nativa (iOS / Android)** e **Híbrida (Ionic / Capacitor y React Native)** regida por la **Regla Cero** (cero ejecuciones ni descargas ad-hoc en el host), **Patrón Screenplay RBAC Multi-Tenant**, localizadores semánticos resilientes y controles de seguridad móvil.

---

## 1. Arquitectura bajo Regla Cero (`sinfallas/base-mobile-appium:26`)

[`sinfallas/base-mobile-appium:26`](../docs/specs/20_SPEC_PLAN_IMAGEN_BASE_DOCKER_MOBILE_APPIUM_26.es.md) es la **imagen base oficial no-root endurecida** (`UID 10001`, compatible con `-u "$(id -u):$(id -g)" -e HOME=/tmp`) con **Node.js 26**, **pnpm**, **OpenJDK 21**, **Android SDK (`ANDROID_HOME=/opt/android-sdk`) / ADB / `aapt2`**, **Appium 3** (`APPIUM_HOME=/opt/appium-home`) con drivers **`uiautomator2`** y **`xcuitest`** preinstalados, y **WebdriverIO v9** (`/opt/qa11x/node_modules`) sin descargas en runtime (**cero `npm install`**).

| Imagen | Alcance Oficial Móvil QA-11X | Herramientas Prehorneadas |
| :--- | :--- | :--- |
| **`sinfallas/base-mobile-appium:26`** | **Predeterminada oficial** para CI móvil autocontenido, Driver Bridge W3C local, Android ADB y WebdriverIO v9 | Node.js 26, pnpm, **OpenJDK 21**, **Android SDK/ADB**, **Appium 3 (`uiautomator2`/`xcuitest`)**, **WebdriverIO v9**, TypeScript |
| **`sinfallas/base-node-ionic:26`** | Verificaciones ligeras Ionic web o delegación a granjas W3C externas sin sobrecarga Java/Android | Node.js 26, pnpm, TypeScript, Playwright (delega drivers móviles reales a granjas externas) |

> **Arquitectura Bilingüe:** Mantenida bajo el estándar Inglés Primario + Espejo Español 1:1 definido en [`docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md`](../docs/specs/19_SPEC_PLAN_ARQUITECTURA_BILINGUE_EN_PRIMARIO_Y_ESPEJO_ES.es.md).

```bash
# Verificar OpenJDK 21, Android ADB, Appium 3 y drivers preinstalados sin modificar el árbol
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  sinfallas/base-mobile-appium:26 \
  sh -ec 'java -version && adb version && appium --version && appium driver list --installed'

# Compilación estricta TypeScript (0 any, --erasableSyntaxOnly) + contrato Screenplay W3C
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e NODE_PATH=/opt/qa11x/node_modules \
  -v "$(pwd):/app:ro" -w /app sinfallas/base-mobile-appium:26 \
  sh -ec 'tsc --strict --noImplicitAny --noUnusedLocals --noUnusedParameters \
  --noImplicitReturns --erasableSyntaxOnly --allowImportingTsExtensions \
  --target ES2023 --module NodeNext --moduleResolution NodeNext \
  --typeRoots /opt/qa11x/node_modules/@types --types node --noEmit \
  mobile-appium/wdio.conf.ts mobile-appium/tests/screenplay/MobileActor.ts mobile-appium/tests/mobile_screenplay.spec.ts && \
  node --test mobile-appium/tests/mobile_screenplay.spec.ts'

# Auditoría determinista de antipatrones UI (0 violaciones)
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 \
  -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 \
  python3 .agents/scripts/lint_test_antipatterns.py mobile-appium
```

---

## 2. Jerarquía Estricta de Localizadores Móviles y Cero Antipatrones

| Prioridad | Estrategia | Uso Canónico (`MobileActor.ts`) | Notas de Resiliencia |
| :--- | :--- | :--- | :--- |
| **1 (Primaria)** | `accessibilityId` (`~id`) | `ByAccessibilityId('btn-sync-tenant')` | Estable entre iOS (`accessibilityIdentifier`) y Android (`content-desc`). |
| **2 (Nativo iOS/Android)** | `iosPredicate` / `androidUiAutomator` | `ByIosPredicate(...)` / `ByAndroidUiAutomator(...)` | Consultas nativas sin acoplamiento al árbol XML completo. |
| **3 (Híbrido WebView)** | Roles ARIA en `WEBVIEW_*` | `ByWebviewRole('button', 'Sincronizar')` | Reutiliza semántica accesible dentro de Ionic/Capacitor o React Native WebView. |
| **VETADO** | XPath absoluto o esperas fijas | *Rechazado en runtime (`Fail-Closed`)* | Cero `/html/body`, `//div`, `waitForTimeout(...)` o `sleep`; auditado por `lint_test_antipatterns.py`. |

---

## 3. Patrón `MobileActor` Screenplay y Suite de Contrato (`tests/mobile_screenplay.spec.ts`)

[`mobile-appium/tests/screenplay/MobileActor.ts`](tests/screenplay/MobileActor.ts) implementa composición pura sin herencia profunda ni aserciones ocultas (`expect`/`assert` viven exclusivamente en los `.spec.ts`), validada de extremo a extremo por [`mobile-appium/tests/mobile_screenplay.spec.ts`](tests/mobile_screenplay.spec.ts) (`node:test` + stub HTTP W3C WebDriver local):

1. **Identidad Multi-Tenant (`MobileActorIdentity`):** Exige `tenantId`, `role`, `platform` (`android | ios`), `hybridShell` (`ionic-capacitor | react-native | native`) y lista explícita de `permissions` (`MissingMobileAbilityError` si falta la capacidad).
2. **Conmutación Segura de Contexto (`SwitchMobileContext`):** Inspecciona `getContexts()` antes de cambiar entre `NATIVE_APP` y `WEBVIEW_<paquete>`; si el WebView no existe lanza `MobileContextNotFoundError` en lugar de colgarse indefinidamente.
3. **Geometría Anti-Colapso (`VisibleMobileBounds`):** Rechaza elementos con bounding box `0x0` (`CollapsedMobileGeometryError`) antes de tocar o escribir.
4. **Defensa contra *Intent / Deep-Link Hijacking* (`OpenVerifiedDeepLink`):** Bloquea esquemas peligrosos (`javascript:`, `file:`, `data:`, `content:`) y hosts externos fuera de lista blanca lanzando `UnsafeDeepLinkError`.
5. **Biometría y Permisos Explícitos (`SimulateBiometricPrompt`):** Permite simular coincidencia o rechazo (`faceId`, `touchId`, `fingerprint`) mientras `wdio.conf.ts` mantiene `appium:autoGrantPermissions: false` y `appium:autoAcceptAlerts: false` para auditar diálogos reales de permisos.
6. **Resiliencia Offline, `Idempotency-Key` y Paridad Antisilosis (`VerifyOfflineSyncParity`):** Conmuta conectividad (`SetMobileNetworkState('offline' | 'online')`), envía sincronizaciones mutables con `X-Tenant-ID` e `Idempotency-Key` (UUIDv4), inspecciona `results[].status` ítem por ítem (`inspectBatchSync`), evalúa las 3 fases temporales (`MobileTemporalLifecycleState`: `pending`, `active`, `expired`) y verifica la paridad pantalla móvil <-> `GET` real del backend sin mocks intermedios.

---

## 4. Perfiles W3C en `wdio.conf.ts` y Diagnóstico `Pass-Quiet` / `Fail-Verbose`

[`buildMobileWdioConfig(env)`](wdio.conf.ts) selecciona el perfil mediante `MOBILE_PROFILE`:

- `android-uiautomator2`: `platformName: 'Android'`, `appium:automationName: 'UiAutomator2'`, `appium:noReset: false`, `appium:autoGrantPermissions: false`.
- `ios-xcuitest`: `platformName: 'iOS'`, `appium:automationName: 'XCUITest'`, `appium:isolateSimDevice: true`, `appium:autoAcceptAlerts: false`.
- `hybrid-ionic` / `hybrid-rn`: `appium:autoWebview: false` por defecto para conmutación explícita `NATIVE_APP` <-> `WEBVIEW_*` con `appium:webviewConnectTimeout: 10000`.
- **Guardias `QA-CLI-TTY-01` & `Fail-Closed`:** Puertos fuera de `1..65535`, perfiles desconocidos o rutas de artefactos fuera de `/tmp` lanzan `MobileConfigValidationError`. Los timeouts quedan acotados (`connectionRetryTimeout: 30000`, `connectionRetryCount: 1`, `waitforTimeout: 10000`, `appium:newCommandTimeout: 60`).
- **Diagnóstico `Pass-Quiet` / `Fail-Verbose`:** En éxito (`passed: true`), `afterTest` no escribe archivos ni emite ruido; en fallo (`passed: false`), guarda el árbol XML/DOM, captura PNG y metadatos Allure (`deviceProfile`, `context`, `tenantId`) bajo `/tmp/qa-11x-mobile-artifacts` sin contaminar el árbol Git.

---

## 5. Plantillas Compose Efímeras y Orquestación Raíz (`make test-mobile-blueprints`)

Las plantillas listas para adoptar en proyectos consumidores viven bajo `mobile-appium/` junto al objetivo raíz de certificación:

- [`docker-compose.qa.yml`](docker-compose.qa.yml): Orquesta `pnpm-store-init`, el corredor no-root `qa-mobile` (`sinfallas/base-mobile-appium:26`, `${QA_UID:-1000}:${QA_GID:-1000}`, `HOME=/tmp`, `ANDROID_HOME=/opt/android-sdk`, `APPIUM_HOME=/opt/appium-home`, `NODE_PATH=/opt/qa11x/node_modules`) y `appium-bridge` (perfil `appium-live`, `ADB_SERVER_SOCKET` vía `host.docker.internal:5037`, `HEALTHCHECK` W3C `/status` en el puerto `4723`).
- [`package.json.example`](package.json.example): Descriptor ESM (`pnpm@12.18.0`, `webdriverio@^9.16.0`, `appium@^3.0.0`, `typescript@^5.8.2`) con scripts `type-check`, `test:unit`, `test:e2e`, `appium:drivers`, `adb:devices` y `audit:deps`.
- [`Makefile.example`](Makefile.example): Objetivos efímeros anclados con `$(CURDIR)` (`QA-MAKE-CURDIR-01`) — `qa-lint`, `qa-unit`, `qa-drivers`, `qa-bridge`, `qa-e2e`, `qa-all`, `clean-cache`, `clean` y `qa-clean`.
- `make test-mobile-blueprints` ([`Makefile`](../Makefile) en la raíz del monorepo): Certifica binarios `java`/`adb`/`appium`, `tsc --noEmit` estricto y `node --test mobile-appium/tests/mobile_screenplay.spec.ts` dentro de `sinfallas/base-mobile-appium:26`, además de `lint_test_antipatterns.py mobile-appium` dentro de `sinfallas/base-python-uv:3.15`.

```bash
# Certificación completa del blueprint móvil desde la raíz del monorepo (Regla Cero)
make test-mobile-blueprints

# Uso en proyecto consumidor tras copiar las plantillas *.example (sin sufijo .example)
make qa-all
make qa-e2e

# Validación directa de perfil W3C y host en un solo contenedor contra grid/Appium remoto
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -e MOBILE_PROFILE=hybrid-ionic \
  -e APPIUM_HOST=host.docker.internal \
  -e APPIUM_PORT=4723 \
  -e QA_MOBILE_ARTIFACT_DIR=/tmp/qa-11x-mobile-artifacts \
  -v "$(pwd):/app:ro" -w /app sinfallas/base-mobile-appium:26 \
  node --experimental-strip-types -e "import('./mobile-appium/wdio.conf.ts').then(m => console.log(m.buildMobileWdioConfig().profile))"
```
