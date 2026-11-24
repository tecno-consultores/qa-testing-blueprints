> 🌐 **Idioma:** [🇺🇸 English (Canonical)](03_TIPOS_DE_PRUEBAS_Y_COMO_UTILIZARLOS.md) · **Español (Espejo 1:1)**

# 🧪 Tipos de Pruebas en el Estándar QA 11X y Cómo Utilizarlos

> **PROPÓSITO:**  
> Este manual es la guía técnica canónica para desarrolladores e ingenieros de QA. Explica cada uno de los niveles de la pirámide de calidad 11X, detallando su justificación, estructura de archivos, sintaxis de código, comando de ejecución en Docker y umbrales de aprobación innegociables.

---

## 🏛️ La Pirámide de Calidad Nivel 11X

```text
               ▲
              / \
             /   \      [13] Fixtures Trimodales, Reloj 3 Fases & Invariantes Negativos
            /     \     [12] Ingeniería del Caos (Pumba) & Telemetría RED (Prometheus)
           /       \    [11] Seguridad Dinámica DAST (OWASP ZAP) & OSHP
          /         \   [10] Rendimiento & Estrés (grafana/k6:2.4.0 / Locust / Artillery)
         /           \  [09] Playwright WCAG 2.1 AA, Geometría Visual & Lighthouse CI
        /             \ [08] Mutación: Pruebas de las Pruebas (Mutmut / Stryker / Infection)
       /               \[07] Contratos HTTP/OSHP/SSG Frontend (Karate Labs HTTP)
      /                 \[06] BDD API Caja Negra (Karate Labs API + Idempotency-Key)
     /                   \[05] Contratos Integración Front-Back & Fuzzing OpenAPI (Pact / Schemathesis)
    /                     \[04] Paridad de Esquema DB & Migraciones (Alembic / PostgreSQL 17)
   /                       \[03] Pruebas Unitarias Aisladas (Pytest / Vitest / Pest >= 95%)
  /                         \[02] Tipado Estricto & Complejidad (Mypy / Radon Grado A / SonarJS)
 /                           \[01] Análisis Estático, Formateo & SAST/IaC (Ruff / ESLint / Trivy)
─────────────────────────────────────────────────────────────────────────────────────────────
```

---

## 1. Análisis Estático, Linters y SAST (Seguridad Estática)

* **Propósito:** Detectar errores sintácticos, anti-patrones, variables no utilizadas e inyecciones de seguridad antes de compilar o ejecutar el código.
* **Herramientas:**
  - Python / FastAPI: `ruff` (linter ultrarrápido y formateador), `bandit` (SAST de seguridad).
  - Node / Vue / React: `eslint` con plugins de seguridad (`eslint-plugin-security`), `prettier`.
  - Bash: `shellcheck` (POSIX), `shfmt` (formateo).
* **Umbral Innegociable:** **0 advertencias, 0 errores, 0 vulnerabilidades**.
* **Ejecución:**
  ```bash
  # Backend
  make qa-lint
  # Frontend
  make qa-lint
  ```

---

## 2. Tipado Estricto y Complejidad Cognitiva / Ciclomática

* **Propósito:** Prevenir errores de tipo en tiempo de ejecución (`AttributeError: 'NoneType'`, `TypeError: undefined is not a function`) y forzar la legibilidad eliminando funciones monolíticas.
* **Herramientas:**
  - Python: `mypy --strict src/` y `test -z "$(radon cc --min B src/)"` (exige Complejidad ciclomática Grado A: `CC <= 5`).
  - TypeScript / Vue: `vue-tsc --noEmit` y `SonarJS` (Complejidad cognitiva máxima acotada).
* **Umbral Innegociable:** **0 errores de tipado, ninguna función grado B o inferior (`CC > 5`)**.

---

## 3. Pruebas Unitarias Aisladas con Mocks (Cobertura Innegociable >= 95%)

* **Propósito:** Validar la lógica algorítmica de funciones puras, composables, helpers y casos de uso de negocio en microsegundos, aislando dependencias de red o disco.
* **Herramientas:**
  - Python: `pytest`, `pytest-mock`, `pytest-cov`.
  - Frontend: `vitest` con motor `@vitest/coverage-v8`.
  - Bash / DevOps: `BATS-core` (`bats-support`, `bats-assert`, `bats-mock`) + `kcov` rootless (`no-new-privileges:true`, `cap_drop: [ALL]`, cero `SYS_PTRACE`).
* **Ejemplo (Backend - Python con Pytest):**
  ```python
  # fastapi/tests/core/test_token_manager.unit.py (ruta ilustrativa)
  import pytest
  from src.core.token_manager import generate_access_token, verify_token

  def test_token_lifecycle_nominal():
      payload = {"sub": "user-123", "role": "OPERATOR"}
      token = generate_access_token(payload, expires_minutes=15)
      decoded = verify_token(token)
      assert decoded["sub"] == "user-123"
      assert decoded["role"] == "OPERATOR"
  ```
* **Ejemplo (Frontend - Vue 3 con Vitest):**
  ```typescript
  // vue3/src/composables/useIdempotency.unit.ts (ruta ilustrativa)
  import { describe, it, expect } from 'vitest';
  import { useIdempotency } from './useIdempotency';

  describe('useIdempotency Composable', () => {
    it('genera claves UUID válidas para cada mutación', () => {
      const { generateKey } = useIdempotency();
      const key1 = generateKey();
      const key2 = generateKey();
      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });
  ```
* **Receta Reproducible Bash `kcov` + `BATS` Rootless (`kernel.yama.ptrace_scope = 2`, Cero `SYS_PTRACE`):**
  - Dentro de `sinfallas/base-bash-qa` (`no-new-privileges:true`, `cap_drop: [ALL]`), envuelve `bats` en `/tmp/run-bats.sh` (`export -n BASH_XTRACEFD` + `export BASH_ENV=/tmp/kcov-env.sh` protegido por `[ -p "/proc/${BASHPID}/fd/${KCOV_BASH_XTRACEFD}" ]` sin filtros `${0} == /app/*`) e invoca `--bash-dont-parse-binary-dir --bash-parse-files-in-dir` con `--exclude-pattern` excluyendo utilerías vendoreadas QA-11X (`/limpieza.sh`, `/instalar-hooks.sh`, `/.agents/`, `/scripts/{verificar-secretos,auditar-infra,auditar-pagespeed,actualizar-grafos-graphify,generar-sbom-cyclonedx,install-skill}.sh`).
  - Emite los artefactos crudos en `/tmp/kcov-out` y purga declaraciones `<!DOCTYPE` al volcar `.agents/.cache/coverage/bash.xml` (`0600`) para que [`.agents/scripts/verify_diff_coverage.py`](../.agents/scripts/verify_diff_coverage.py) valide el reporte Cobertura sin rechazos Anti-XXE DTD ni residuos `coverage_report/` en la raíz.
* **Umbral Innegociable:** **`>= 95.0%` de cobertura de líneas y ramas**. Si baja a 94.9%, el comando falla.
* **Ejecución:**
  ```bash
  make qa-unit
  ```

---

## 4. Paridad de Esquema DB y Migraciones (Anti-Mock Blindness)

* **Propósito:** Garantizar que los modelos ORM de la aplicación coincidan exactamente con las tablas, columnas y tipos reales creados en las migraciones de base de datos.
* **Herramientas:** Script automatizado `.agents/scripts/verify_alembic_orm_parity.py` y ejecución en contenedor PostgreSQL real.
* **Cómo Funciona:**
  1. Extrae los nombres de tablas declaradas con `__tablename__` en `src/models/*.py`.
  2. Inspecciona las llamadas `op.create_table()` en los archivos de migración de Alembic.
  3. Si existe algún modelo ORM sin migración asociada, aborta la ejecución con código de salida 1.
* **Ejecución (Regla Cero Docker):**
  ```bash
  docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 \
    python3 .agents/scripts/verify_alembic_orm_parity.py
  ```

---

## 5. Contratos de Integración Front-Back y Propagación Transversal Anti-Silo

* **Propósito:** Certificar que el formato de petición enviado por la interfaz (JSON, Multipart FormData) coincide exactamente con lo que el backend espera y persiste en la base de datos viva, y erradicar la **ceguera de mocks por silos (*Silo Mock Blindness*)**.
* **Herramientas:** Scripts de prueba ejecutados dentro del contenedor API levantado con PostgreSQL y KeyDB reales, más `Schemathesis`.
* **Flujo Read-After-Write Transversal (Sin Mocks Intermedios):**
  1. Realiza una petición HTTP mutadora real en el **Módulo A** (`POST`/`PUT`/`PATCH`/`DELETE`, ej. programar una ventana de mantenimiento o cambiar el estado administrativo de un equipo).
  2. Invoca inmediatamente los endpoints de consulta (`GET`) de los **Módulos B consumidores** (ej. Inventario, Wallboard NOC, KPIs del Centro de Mando) sobre la misma base de datos real **sin mocks intermedios**, certificando que los contadores, insignias y estados efectivos reflejan la mutación de extremo a extremo.
  3. Verifica que la bitácora de auditoría (`write_audit_log`) registre `actor_username` y `resource_display_name` con nombres humanos legibles y nunca con un UUID v4 crudo (`claims.get("sub")`).

---

## 6. Pruebas BDD de Caja Negra con Karate Labs para API REST

* **Propósito:** Validar el comportamiento de la API REST desde la perspectiva de un cliente externo, sin conocer el código interno. Valida códigos de estado HTTP, cabeceras de seguridad, respuestas JSON y esquemas dinámicos.
* **Herramientas:** Contenedor oficial `sinfallas/karatelabs:1.5.1` (`:latest`) ejecutando archivos `.feature` de Cucumber/Gherkin.
* **Estructura:** Ubicado en `fastapi/test/api_test.feature`.
* **Ejemplo Real de Escenario Karate Labs API:**
  ```gherkin
  Feature: Validación de API REST y Manejo de Errores

    Background:
      * url 'http://api:8000'
      * configure headers = { 'Content-Type': 'application/json' }

    Scenario: Healthcheck de API con estado de base de datos y redis
      Given path '/health'
      When method get
      Then status 200
      And match response.status == 'healthy'
      And match response.database == '#string'

    Scenario: Petición con payload incompleto devuelve HTTP 422
      Given path '/api/v1/auth/login'
      And header Idempotency-Key = java.util.UUID.randomUUID() + ''
      And request { username: "operador_sin_password" }
      When method post
      Then status 422
      And match response.detail[0].type == '#string'

    Scenario: Consulta a recurso protegido sin autenticación devuelve HTTP 401
      Given path '/api/v1/users/me'
      When method get
      Then status 401
      And match response.detail contains 'Not authenticated'
  ```
* **Ejecución:**
  ```bash
  make qa-bdd   # o docker compose run --rm -T karatelabs mvn clean test
  ```

---

## 7. Contratos BDD HTTP/OSHP/SSG Frontend con Karate Labs (sin navegador Headless)

* **Propósito:** La imagen oficial `sinfallas/karatelabs:1.5.1` (al igual que `:latest`) **no incluye binario Chrome ni Chromium**. Por ello, Karate 1.5.1 certifica en caja negra la entrega HTTP/Nginx sobre `http://ui-prod:8080`: códigos `200`, rutas SPA/SSG, cabeceras OWASP OSHP (`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`) e integridad XML/SEO como cadena (`* string xmlText = response` en `/sitemap.xml`). Toda interacción DOM real, validación del botón `[ 🔄 Refrescar ]`, geometría Anti-JSDOM y accesibilidad WCAG 2.1 AA se delega a Playwright (`ui-e2e`).
* **Estructura:** Ubicado en `vue3/test/ui_business_flow.feature` y `react-frontend/test/ui_business_flow.feature`.
* **Ejemplo Real de Escenario Karate Labs HTTP/OSHP/SSG:**
  ```gherkin
  Feature: Contratos BDD HTTP, Cabeceras OWASP OSHP, Rutas SPA/SSG y SEO (Karate 1.5.1)

    Background:
      * def baseUrl = karate.properties['UI_BASE_URL'] || 'http://ui-prod:8080'
      * url baseUrl

    Scenario: Entrega HTML y cabeceras OWASP OSHP alineadas con Nginx
      Given path '/'
      When method get
      Then status 200
      And match header Content-Type contains 'text/html'
      And match header X-Frame-Options == 'DENY'
      And match header X-Content-Type-Options == 'nosniff'
      And match header Referrer-Policy == 'strict-origin-when-cross-origin'
      And match header Content-Security-Policy contains "default-src 'self'"

    Scenario: Inspección segura como string de /sitemap.xml en SSG o fallback SPA
      Given path '/sitemap.xml'
      When method get
      Then status 200
      * string xmlText = response
      * def contentType = responseHeaders['Content-Type'] ? responseHeaders['Content-Type'][0] : ''
      * assert contentType.contains('xml') ? xmlText.contains('<urlset') : xmlText.toLowerCase().contains('<html')
  ```
* **Ejecución:**
  ```bash
  make qa-bdd
  ```

---

## 8. Pruebas de Mutación (Pruebas de las Pruebas)

* **Propósito:** Demostrar que las pruebas unitarias no son "de adorno". La herramienta inyecta mutaciones lógicas en el código fuente (ej. cambia `>` por `<=`, `True` por `False`, o elimina una llamada a función) y ejecuta la suite de pruebas. Si las pruebas pasan a pesar del cambio malicioso, el mutante "sobrevive" y se detecta una debilidad en los asserts.
* **Herramientas:**
  - Python: `mutmut` validado por [`mutmut_gates.py`](../fastapi/mutmut_gates.py.example) (`mutmut run && python mutmut_gates.py` >= 80% de mutantes eliminados).
  - JavaScript / TypeScript: `Stryker Mutator` (`stryker run`, con `"ignoreStatic": true`, `"concurrency" <= 4` y shim non-root `/tmp/qa-bin/ps` en [`Makefile.example`](../node-backend/Makefile.example)).
  - PHP (8.2–8.5): `Infection PHP` (`php -d pcov.enabled=1 ./vendor/bin/infection --min-msi=80 --min-covered-msi=80 --threads=4`).
* **Ejecución:**
  ```bash
  make qa-mutation
  ```

---

## 9. Accesibilidad (WCAG 2.1 AA) y Geometría Visual

* **Propósito:** Garantizar que la interfaz sea usable por personas con discapacidad visual o motriz y que cumpla estándares legales de accesibilidad (contraste de color, etiquetas ARIA, navegación por teclado), además de verificar que no existan colisiones de layout (pies de página fijos tapando botones).
* **Herramientas:**
  - `@axe-core/playwright`: Escaneo de violaciones WCAG 2.1 AA en Chromium.
  - `Lighthouse CI`: Métricas de accesibilidad con umbral mínimo de **0.95**.
* **Ejecución:**
  ```bash
  make qa-e2e   # Playwright + Axe Core (ui-e2e no-root, ./node_modules/.bin/playwright)
  make qa-perf  # Lighthouse CI pre-merge sobre contenedores locales
  make qa-psi URL=https://tu-dominio.com  # PageSpeed Insights v5 post-deploy (Lab + CrUX)
  ```

---

## 10. Concurrencia y Pruebas de Carga / Estrés

* **Propósito:** Validar el comportamiento de la API y el consumo de recursos de memoria/CPU bajo tráfico masivo concurrente.
* **Herramientas:**
  - Carga declarativa k6 Smoke / Load (FastAPI y PHP): `grafana/k6:2.4.0` (`fastapi/tests/load/smoke.k6.js`, `php/tests/load/smoke.k6.js`).
  - Python / FastAPI: `locust` en modo headless con escenarios definidos en `locustfile.py`.
  - Node.js: `artillery` ejecutando escenarios definidos en `artillery.yml`.
* **Umbral Innegociable:** **0% de peticiones fallidas y latencia P95 inferior a 200 ms**.

---

## 11. Seguridad Dinámica DAST (OWASP ZAP), OWASP WSTG / ASVS y Cabeceras OSHP

* **Propósito:** Bombardear la aplicación en ejecución con ataques web activos (inyección SQL, XSS reflejado, cabeceras HTTP inseguras, cookies sin flags de seguridad) y certificar el cumplimiento de los estándares **OWASP Application Security Verification Standard (ASVS Nivel 2/3)**, **OWASP Web Security Testing Guide (WSTG)**, **OWASP API Security Top 10 (2023)** y **DISA ASD STIG V6R5** (`APSC-DV-003160`..`003230`).
* **Herramientas:**
  - Contenedor `zaproxy/zap-stable:2.15.0` ejecutando `zap-baseline.py` / Automation Framework `zap.yaml` (`zap.sh -cmd -autorun /zap/wrk/zap.yaml`) contra `http://api:8000` (escribiendo reportes bajo `./reports/zap-report.{html,json}` en montajes `:ro`).
  - Validación de cabeceras del **OWASP Secure Headers Project (OSHP)**: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cache-Control: no-store` y ausencia de banners `Server` / `X-Powered-By`.
  - Verificación de cadena de suministro con **OWASP CycloneDX SBOM/CBOM** (`cyclonedx-py`, `@cyclonedx/cyclonedx-npm`) y auditoría SCA con `Trivy` / `OWASP Dependency-Check`.
  - Pruebas de inicialización, apagado y aborto en estado seguro (*Fail-Secure State Testing*, `DISA V-222585` / `V-222647`): certificar que ante fallos de configuración o caída de dependencias críticas, la aplicación deniega el acceso por defecto sin exponer trazas ni permitir bypass de autenticación.
* **Reporte:** Genera `reports/zap-report.{html,json}` y `reports/sbom*.cdx.json` para auditoría continua.

---

## 12. Ingeniería del Caos (Pumba) y Resiliencia

* **Propósito:** Verificar si la aplicación sobrevive y se recupera automáticamente ante fallos reales de infraestructura de red (latencia extrema, paquetes descartados, caídas de microservicios).
* **Herramientas:** `gaiaadm/pumba:0.10.1` orquestado con Docker socket para inyectar fallos de red tipo `netem` sobre el contenedor de la API, mientras `Prometheus` monitorea la tasa de errores en `/metrics`.

---

## 13. Fixtures Trimodales, Ciclo Temporal de 3 Fases e Invariantes Negativos

* **Propósito:** Erradicar la ceguera de mocks al integrar con APIs externas o hardware, así como la **ceguera estática de 2 estados (*2-State Static Blindness*)** en flujos gobernados por ventanas de tiempo.
* **Estructura de 3 Fixtures Espaciales/Salud:**
  1. **Virgin / Factory Default:** Asegura que sistemas no configurados no generen falsos positivos en el dashboard.
  2. **Nominal Configured:** Valida el funcionamiento en condiciones normales de producción.
  3. **Degraded / Unsupported / Fallo Parcial en Lote:** Valida que sistemas con errores, funciones no soportadas, transferencias truncadas de `0 bytes` (exigiendo `timeout >= 180s` en descargas síncronas de firmware/paquetes) o respuestas batch `HTTP 200 OK` con fallos por ítem (`results[].status == 'FAILED'`) degraden elegantemente y expongan el error por recurso sin arrojar HTTP 500 ni falsos positivos de éxito global.
* **Estructura Obligatoria de las 3 Fases Temporales (Reloj de 3 Estados):**
  Toda entidad con ventanas de tiempo, cronómetros o TTL (`starts_at` / `ends_at`, Safe Mode de 60s, tokens Step-Up de 30s, leases) DEBE probarse en sus **3 fases del reloj**:
  1. **Fase 1 (`t < starts_at`):** Estado Programado / Pendiente (`Programada`).
  2. **Fase 2 (`starts_at <= t <= ends_at`):** Estado Activo / En Curso (`En Curso` / `Activa`, verificando que el scheduler permanezca vivo y proyecte el estado activo a todos los módulos consumidores).
  3. **Fase 3 (`t > ends_at` o Cancelado):** Estado Expirado / Purgado / Revertido (verificando la restauración automática al estado nominal original y su registro en auditoría).

---

## 14. Compuerta de Certificación Global (`certify_task_completion.sh`)

* **Propósito:** Punto final de control que reúne todas las validaciones antes de permitir el commit.
* **Ejecución:**
  ```bash
  ./.agents/scripts/certify_task_completion.sh
  ```
* **Modo Diferencial en Blast Radius y Veredicto Ejecutivo de PR (`Hito 23`):** Antes de emitir cambios o preparar un Pull Request, inspecciona el delta compacto invocando `inspect_ast_blast_radius` con `changed_since_ref` y `max_tokens_budget` (ahorro `>= 60%` de tokens, redacción de secretos y alertas de contratos `.feature`), y genera los artefactos `.agents/artifacts/PR_VERDICT.md` + `pr_verdict_attestation.json` (`0600`) ejecutando `make pr-verdict` en Docker efímero (`exit 0` o `30` ante divergencia/evidencia faltante).
* Si cualquiera de los pasos falla, el commit debe ser rechazado inmediatamente.
