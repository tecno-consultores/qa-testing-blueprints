# 🧪 Tipos de Pruebas en el Estándar QA 11X y Cómo Utilizarlos

> **PROPÓSITO:**  
> Este manual es la guía técnica canónica para desarrolladores e ingenieros de QA. Explica cada uno de los niveles de la pirámide de calidad 11X, detallando su justificación, estructura de archivos, sintaxis de código, comando de ejecución en Docker y umbrales de aprobación innegociables.

---

## 🏛️ La Pirámide de Calidad Nivel 11X

```text
               ▲
              / \
             /   \      [13] Fixtures Trimodales & Invariantes Negativos
            /     \     [12] Ingeniería del Caos (Pumba) & Resiliencia
           /       \    [11] Seguridad Dinámica DAST (OWASP ZAP)
          /         \   [10] Rendimiento & Estrés (Locust / Artillery)
         /           \  [09] Accesibilidad WCAG 2.1 AA & Geometría Visual
        /             \ [08] Mutación: Pruebas de las Pruebas (Mutmut / Stryker)
       /               \[07] BDD UI Aceptación (Karate Labs UI en Chrome Headless)
      /                 \[06] BDD API Caja Negra (Karate Labs HTTP)
     /                   \[05] Contratos de Integración Front-Back
    /                     \[04] Paridad de Esquema DB & Migraciones (Alembic)
   /                       \[03] Pruebas Unitarias Aisladas (Pytest / Vitest >= 95%)
  /                         \[02] Tipado Estricto & Complejidad (Mypy / Radon / SonarJS)
 /                           \[01] Análisis Estático, Formateo & SAST (Ruff / ESLint / Bandit)
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
  - Python: `mypy --strict src/` y `radon cc --min C src/` (Complejidad ciclomática Grado A: `CC <= 5`).
  - TypeScript / Vue: `vue-tsc --noEmit` y `SonarJS` (Complejidad cognitiva máxima acotada).
* **Umbral Innegociable:** **0 errores de tipado, ninguna función grado C o inferior**.

---

## 3. Pruebas Unitarias Aisladas con Mocks (Cobertura Innegociable $\ge 95\%$)

* **Propósito:** Validar la lógica algorítmica de funciones puras, composables, helpers y casos de uso de negocio en microsegundos, aislando dependencias de red o disco.
* **Herramientas:**
  - Python: `pytest`, `pytest-mock`, `pytest-cov`.
  - Frontend: `vitest` con motor `@vitest/coverage-v8`.
* **Ejemplo (Backend - Python con Pytest):**
  ```python
  # fastapi/tests/core/test_token_manager.unit.py
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
  // vue3/src/composables/useIdempotency.unit.ts
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
* **Ejecución:**
  ```bash
  python3 .agents/scripts/verify_alembic_orm_parity.py
  ```

---

## 5. Contratos de Integración Front-Back

* **Propósito:** Certificar que el formato de petición enviado por la interfaz (JSON, Multipart FormData) coincide exactamente con lo que el backend espera y persiste en la base de datos viva.
* **Herramientas:** Scripts de prueba ejecutados dentro del contenedor API levantado con PostgreSQL y KeyDB reales.
* **Flujo:** Realiza peticiones HTTP reales a la API efímera, consulta la base de datos real con `SELECT` para verificar persistencia, y valida cabeceras de respuesta (`X-Content-Type-Options`, `Content-Security-Policy`).

---

## 6. Pruebas BDD de Caja Negra con Karate Labs para API REST

* **Propósito:** Validar el comportamiento de la API REST desde la perspectiva de un cliente externo, sin conocer el código interno. Valida códigos de estado HTTP, cabeceras de seguridad, respuestas JSON y esquemas dinámicos.
* **Herramientas:** Contenedor oficial `sinfallas/karatelabs:latest` ejecutando archivos `.feature` de Cucumber/Gherkin.
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
      And request { username: "operador_sin_password" }
      When method post
      Then status 422
      And match response.detail[0].type == '#string'

    Scenario: Consulta a recurso protegido sin autenticación devuelve HTTP 401
      Given path '/api/v1/users/me'
      When method get
      Then status 401
      And match response.detail contains 'No autenticado'
  ```
* **Ejecución:**
  ```bash
  make qa-bdd   # o docker compose run --rm karatelabs mvn clean test
  ```

---

## 7. Pruebas BDD de Aceptación UI con Karate Labs (Chrome Headless)

* **Propósito:** Automatizar interacciones reales de usuario en el navegador Chrome sin necesidad de Selenium ni dependencias locales pesadas: login, clics de botones, navegación de pestañas, modales y validación de textos en el DOM.
* **Estructura:** Ubicado en `vue3/test/ui_business_flow.feature`.
* **Ejemplo Real de Escenario Karate Labs UI:**
  ```gherkin
  Feature: Flujo de Aceptación UI en Vue 3

    Background:
      * configure driver = { type: 'chrome', headless: true, addOptions: ['--no-sandbox', '--disable-dev-shm-usage'] }
      * def baseUrl = karate.properties['UI_BASE_URL'] || 'http://ui-prod:80'

    Scenario: Pantalla de Login y validación de campos obligatorios
      Given driver baseUrl + '/login'
      And waitFor("#login-email")
      And waitFor("#login-password")
      When input("#login-email", 'operador@demo.net')
      And input("#login-password", 'PasswordInvalido123!')
      And click("#btn-login-submit")
      Then waitFor(".banner--error")

    Scenario: Centro de Mando y actualización de datos
      Given driver baseUrl + '/'
      And waitFor("//h1[contains(., 'Centro de Mando') or contains(., 'Dashboard')]")
      When click("//button[contains(@class, 'btn-primary') and contains(., 'Actualizar Datos')]")
      Then waitFor(".status-indicator.success")
      And match text(".status-text") == 'Actualizado'
  ```
* **Ejecución:**
  ```bash
  make qa-bdd
  ```

---

## 8. Pruebas de Mutación (Pruebas de las Pruebas)

* **Propósito:** Demostrar que las pruebas unitarias no son "de adorno". La herramienta inyecta mutaciones lógicas en el código fuente (ej. cambia `>` por `<=`, `True` por `False`, o elimina una llamada a función) y ejecuta la suite de pruebas. Si las pruebas pasan a pesar del cambio malicioso, el mutante "sobrevive" y se detecta una debilidad en los asserts.
* **Herramientas:**
  - Python: `mutmut` (`mutmut run && mutmut results`).
  - JavaScript / TypeScript: `Stryker Mutator` (`stryker run`).
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
  make qa-e2e   # Playwright + Axe Core
  make qa-perf  # Lighthouse CI
  ```

---

## 10. Concurrencia y Pruebas de Carga / Estrés

* **Propósito:** Validar el comportamiento de la API y el consumo de recursos de memoria/CPU bajo tráfico masivo concurrente.
* **Herramientas:**
  - Python / FastAPI: `locust` en modo headless con escenarios definidos en `locustfile.py`.
  - Node.js: `artillery` ejecutando escenarios definidos en `artillery.yml`.
* **Umbral Innegociable:** **0% de peticiones fallidas y latencia P95 inferior a 200 ms**.

---

## 11. Seguridad Dinámica DAST (OWASP ZAP)

* **Propósito:** Bombardear la aplicación en ejecución con ataques web activos (inyección SQL, XSS reflejado, cabeceras HTTP inseguras, cookies sin flags de seguridad).
* **Herramientas:** Contenedor `zaproxy/zap-stable:latest` ejecutando `zap-baseline.py` contra `http://api:8000`.
* **Reporte:** Genera `zap-report.html` en la raíz del proyecto para auditoría.

---

## 12. Ingeniería del Caos (Pumba) y Resiliencia

* **Propósito:** Verificar si la aplicación sobrevive y se recupera automáticamente ante fallos reales de infraestructura de red (latencia extrema, paquetes descartados, caídas de microservicios).
* **Herramientas:** `gaiaadm/pumba:latest` orquestado con Docker socket para inyectar fallos de red tipo `netem` sobre el contenedor de la API, mientras `Prometheus` monitorea la tasa de errores en `/metrics`.

---

## 13. Fixtures Trimodales e Invariantes Negativos

* **Propósito:** Erradicar la ceguera de mocks al integrar con APIs externas o hardware.
* **Estructura de 3 Fixtures:**
  1. **Virgin / Factory Default:** Asegura que sistemas no configurados no generen falsos positivos en el dashboard.
  2. **Nominal Configured:** Valida el funcionamiento en condiciones normales de producción.
  3. **Degraded / Unsupported:** Valida que sistemas con errores o funciones no soportadas degraden elegantemente sin arrojar HTTP 500.

---

## 14. Compuerta de Certificación Global (`certify_task_completion.sh`)

* **Propósito:** Punto final de control que reúne todas las validaciones antes de permitir el commit.
* **Ejecución:**
  ```bash
  ./.agents/scripts/certify_task_completion.sh
  ```
* Si cualquiera de los pasos falla, el commit debe ser rechazado inmediatamente.
