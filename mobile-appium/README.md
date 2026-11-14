# 📱 Blueprint Móvil Nativo e Híbrido — Appium 2 + WebdriverIO + Screenplay (Estándar QA 11X)

Plantilla corporativa de automatización móvil **Nativa (iOS / Android)** e **Híbrida (Ionic / Capacitor y React Native)** regida por la **Regla Cero** (cero ejecuciones ni descargas ad-hoc en el host), **Patrón Screenplay RBAC Multi-Tenant**, localizadores semánticos resilientes y controles de seguridad móvil.

---

## 1. Arquitectura bajo Regla Cero (`sinfallas/base-node-ionic:26`)

El CLI `appium` (`Appium 3.x` compatible con protocolo W3C WebDriver / Appium 2) viene **preinstalado** dentro de `sinfallas/base-node-ionic:26`. Todas las validaciones TypeScript, linter de antipatrones y clientes de prueba corren como usuario no-root (`-u "$(id -u):$(id -g)" -e HOME=/tmp`) con **cero `npm install` o `appium driver install` en runtime**:

```bash
# Verificar CLI Appium preinstalado sin modificar el árbol del proyecto
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  sinfallas/base-node-ionic:26 appium --version

# Compilación estricta TypeScript (0 any, --erasableSyntaxOnly)
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$(pwd):/app:ro" -w /app sinfallas/base-node-ionic:26 \
  tsc --strict --noImplicitAny --noUnusedLocals --noUnusedParameters \
  --noImplicitReturns --erasableSyntaxOnly --allowImportingTsExtensions \
  --target ES2023 --module NodeNext --moduleResolution NodeNext \
  --typeRoots /opt/qa11x/node_modules/@types --types node --noEmit \
  mobile-appium/wdio.conf.ts mobile-appium/tests/screenplay/MobileActor.ts

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

## 3. Patrón `MobileActor` Screenplay (RBAC Multi-Tenant, Deep Links, Biometría y Offline)

`mobile-appium/tests/screenplay/MobileActor.ts` implementa composición pura sin herencia profunda ni aserciones ocultas (`expect`/`assert` viven exclusivamente en los `.spec.ts`):

1. **Identidad Multi-Tenant (`MobileActorIdentity`):** Exige `tenantId`, `role`, `platform` (`android | ios`), `hybridShell` (`ionic-capacitor | react-native | native`) y lista explícita de `permissions`.
2. **Conmutación Segura de Contexto (`SwitchMobileContext`):** Inspecciona `getContexts()` antes de cambiar entre `NATIVE_APP` y `WEBVIEW_<paquete>`; si el WebView no existe lanza `MobileContextNotFoundError` en lugar de colgarse indefinidamente.
3. **Geometría Anti-Colapso (`VisibleMobileBounds`):** Rechaza elementos con bounding box `0x0` (`CollapsedMobileGeometryError`) antes de tocar o escribir.
4. **Defensa contra *Intent / Deep-Link Hijacking* (`OpenVerifiedDeepLink`):** Bloquea esquemas peligrosos (`javascript:`, `file:`, `data:`, `content:`) y hosts externos fuera de lista blanca lanzando `UnsafeDeepLinkError`.
5. **Biometría y Permisos Explícitos (`SimulateBiometricPrompt`):** Permite simular coincidencia o rechazo (`faceId`, `touchId`, `fingerprint`) mientras `wdio.conf.ts` mantiene `appium:autoGrantPermissions: false` y `appium:autoAcceptAlerts: false` para auditar diálogos reales de permisos.
6. **Resiliencia Offline, `Idempotency-Key` y Paridad Antisilosis (`VerifyOfflineSyncParity`):** Conmuta conectividad (`SetMobileNetworkState('offline' | 'online')`), envía sincronizaciones mutables con `X-Tenant-ID` e `Idempotency-Key` (UUIDv4), inspecciona `results[].status` ítem por ítem (`inspectBatchSync`), evalúa las 3 fases temporales (`pending`, `active`, `expired`) y verifica la paridad pantalla móvil <-> `GET` real del backend sin mocks intermedios.

---

## 4. Perfiles W3C en `wdio.conf.ts` y Diagnóstico `Pass-Quiet` / `Fail-Verbose`

`buildMobileWdioConfig(env)` selecciona el perfil mediante `MOBILE_PROFILE`:

- `android-uiautomator2`: `platformName: 'Android'`, `appium:automationName: 'UiAutomator2'`, `appium:noReset: false`, `appium:autoGrantPermissions: false`.
- `ios-xcuitest`: `platformName: 'iOS'`, `appium:automationName: 'XCUITest'`, `appium:isolateSimDevice: true`, `appium:autoAcceptAlerts: false`.
- `hybrid-ionic` / `hybrid-rn`: `appium:autoWebview: false` por defecto para conmutación explícita `NATIVE_APP` <-> `WEBVIEW_*` con `appium:webviewConnectTimeout: 10000`.
- **Guardias `QA-CLI-TTY-01` & `Fail-Closed`:** Puertos fuera de `1..65535`, perfiles desconocidos o rutas de artefactos fuera de `/tmp` lanzan `MobileConfigValidationError`. Los timeouts quedan acotados (`connectionRetryTimeout: 30000`, `connectionRetryCount: 1`, `waitforTimeout: 10000`, `appium:newCommandTimeout: 60`).
- **Diagnóstico `Pass-Quiet` / `Fail-Verbose`:** En éxito (`passed: true`), `afterTest` no escribe archivos ni emite ruido; en fallo (`passed: false`), guarda el árbol XML/DOM, captura PNG y metadatos Allure (`deviceProfile`, `context`, `tenantId`) bajo `/tmp/qa-11x-mobile-artifacts` sin contaminar el árbol Git.

---

## 5. Ejecución contra Emuladores Efímeros o Granjas W3C

Apunte el contenedor efímero hacia un servidor Appium remoto, granja W3C (Device Farm / BrowserStack / Sauce Labs) o emulador aislado usando variables de entorno sin instalar paquetes en runtime:

```bash
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -e MOBILE_PROFILE=hybrid-ionic \
  -e APPIUM_HOST=host.docker.internal \
  -e APPIUM_PORT=4723 \
  -e QA_MOBILE_ARTIFACT_DIR=/tmp/qa-11x-mobile-artifacts \
  -v "$(pwd):/app:ro" -w /app sinfallas/base-node-ionic:26 \
  node --experimental-strip-types -e "import('./mobile-appium/wdio.conf.ts').then(m => console.log(m.buildMobileWdioConfig().profile))"
```
