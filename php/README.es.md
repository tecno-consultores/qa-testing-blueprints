> **[DIRECTIVA DE SISTEMA PARA AGENTES DE IA]:** Actúa como un Ingeniero Staff de Automatización QA y Experto DevOps. Lee, analiza y aplica estrictamente las siguientes restricciones arquitectónicas redactadas en español. Debes generar código que se alinee perfectamente con estas reglas, utilizando exclusivamente los contenedores Docker efímeros, frameworks de pruebas y umbrales estrictos de calidad (p. ej. 95% de cobertura, SAST, mutación con Infection, Pact CDCT Zero-Infra, SLOs con k6) especificados a continuación. No sugieras instalaciones locales. Procesa la lógica técnica con tu máxima capacidad de razonamiento en inglés, pero emite tu respuesta final, explicaciones y comentarios de código en español.

> 🌐 **Idioma:** [🇺🇸 English (Canonical)](README.md) · **Español (Espejo 1:1)**

# Guía Canónica de Pruebas y Validación para PHP 8.2–8.5 (QA-11X v3.1)

Este documento contiene las instrucciones corporativas de **Nivel 11X (QA-11X v3.1)** que DEBES seguir innegociablemente para generar, estructurar y ejecutar pruebas automatizadas en APIs y microservicios backend construidos en **PHP (versiones 8.2, 8.3, 8.4 y 8.5)**. El objetivo es garantizar resiliencia bajo estrés extremo, paridad de contratos inter-servicios sin infraestructura externa (*Zero-Infra*), seguridad por diseño (DISA ASD STIG V6R5 + OWASP Developer Guide v4.2) y cero ejecución local en el host.

---

## 1. Reglas Estrictas de Ejecución (Regla Cero, No-Root y Contenedores Oficiales v2)

**NUNCA** debes instruir la instalación local de PHP, extensiones PECL o Composer en la máquina host ni ejecutar procesos como `root` dentro del contenedor. Toda validación corre en contenedores Docker efímeros con mapeo explícito de UID/GID del usuario anfitrión y cachés en `/tmp`:

```bash
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e COMPOSER_CACHE_DIR=/tmp/composer-cache \
  -v "$(pwd):/var/www" \
  -w /var/www \
  sinfallas/basephpcomposer:8.5 \
  composer run-script qa:unit
```

* **Para PHP, Linting, PHPStan (`max`), Psalm, PHPUnit/Pest (`PCOV`) y Mutación (`Infection`):** `sinfallas/basephpcomposer:8.5` (tags oficiales disponibles: `8.2`, `8.3`, `8.4`, `8.5`, `latest` y `11x-v2-php{8.2,8.3,8.4,8.5}`).
* **Para Persistencia Real y Aislamiento Multi-Tenant (Anti-Mock Blindness):** `postgres:17-alpine` con usuario de aplicación `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
* **Para Idempotencia, Sesiones Concurrentes y Caché Multi-Hilo:** `eqalpha/keydb:6.3.4`.
* **Para Pruebas BDD de Caja Negra API:** `sinfallas/karatelabs:1.5.1` (inyectando `Idempotency-Key` en toda mutación).
* **Para Pruebas de Carga Declarativas y SLOs:** `grafana/k6:2.4.0`.
* **Para Seguridad Dinámica (DAST) y Caos:** `zaproxy/zap-stable`, `gaiaadm/pumba:latest` y `prom/prometheus:latest`.

---

## 2. Matriz Tecnológica de las 13 Capas 11X para PHP

1. **Tipado Estricto y Formato:** `declare(strict_types=1);` obligatorio en todo archivo PHP + `friendsofphp/php-cs-fixer` (`@PER-CS2.0`).
2. **Análisis Estático y Complejidad Cognitiva:** `phpstan/phpstan` (nivel `max` / 9 + `phpstan-strict-rules`) y `tomasvotruba/cognitive-complexity` (complejidad `<= 5` en módulos críticos / `<= 9` global).
3. **Seguridad Estática (SAST) y CVEs:** `vimeo/psalm` (`--taint-analysis`) y `composer audit` (0 CVEs High/Critical).
4. **Pruebas Unitarias Aisladas:** `pestphp/pest` o `phpunit/phpunit` 11.5+–13.x con motor ligero `pcov` (cobertura innegociable `>= 95.0%` en líneas y ramas).
5. **Pruebas de Mutación:** `infection/infection` (`minMsi: 80`, `minCoveredMsi: 80`, 0 mutantes vivos críticos).
6. **Paridad de Base de Datos y PostgreSQL 17 `FORCE RLS`:** Verificación de migraciones Doctrine / Laravel contra `postgres:17-alpine` real ejecutando `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY;` bajo rol `NOBYPASSRLS` y re-aplicación por transacción de `SET LOCAL app.current_tenant_id` (prohibido depender de `SELECT *` sin política RLS activa).
7. **Contratos Consumer-Driven Zero-Infra (`Pact` V3/V4) y OpenAPI 3.1:**
   * Toda integración inter-servicios (por ejemplo, PHP como proveedor o consumidor frente a `fastapi/` o `node-backend/`) DEBE validar contratos JSON deterministas en `PACT_OUTPUT_DIR` sin depender de un *Pact Broker* en la nube.
   * **Precisión Monetaria Exacta:** Los importes financieros deben viajar serializados como cadenas decimales exactas (`"149.95"` vía `bcmath` o `Brick\Money`), quedando terminantemente prohibido usar `float` binario en cuerpos JSON.
   * **Trimodal Fixtures y Anti-Silo:** Cubrir estados `nominal_configured` (`201 Created` con eco de `Idempotency-Key`), `virgin_empty` (`404 Not Found` en formato RFC 7807 `application/problem+json`) y `degraded_conflict` (lotes parciales `POST .../batch` devolviendo `200 OK` con inspección ítem por ítem de `results[].status`, más `409 Conflict` RFC 7807 ante colisión de `Idempotency-Key` con payload mutado).
8. **Pruebas BDD de Caja Negra:** `Karate Labs` ejecutando `test/api_test.feature` contra la API viva en contenedor efímero.
9. **Pruebas de Carga Declarativas y SLOs (`k6`):** Perfiles parametrizables por entorno (`K6_PROFILE=smoke|load|stress`, referencia en `fastapi/tests/load/smoke.k6.js`) con umbrales bloqueantes alineados a `evaluateReleaseGate` (`http_req_failed < 1%`, `p(95) < 250ms`, `p(99) < 500ms`, `checks == 100%`) e inspección por ítem de respuestas batch sin asumir éxito por `status === 200`.
10. **Seguridad Dinámica DAST y OSHP:** OWASP ZAP Baseline verificando `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store` y supresión de `X-Powered-By`.
11. **Canonicalización, Criptografía e Idempotencia:** Unicode `\Normalizer::FORM_KC` antes de validar (`APSC-DV-002520`), Argon2id, AES-256-GCM con `sodium_memzero()`, y cabecera obligatoria `Idempotency-Key` (formato UUIDv4) en todo `POST`/`PUT`/`PATCH`/`DELETE` respaldada en KeyDB con hash SHA-256 del payload para bloquear mutaciones con `409 Conflict`.
12. **Ingeniería del Caos y Observabilidad:** Inyección de latencia/fallos con Pumba (`netem`) y métricas Prometheus (`/metrics`).
13. **SBOM Criptográfico:** `cyclonedx/cyclonedx-php-composer` generando `sbom-php.cdx.json` (CycloneDX 1.6).

---

## 3. Comandos Canónicos (`Makefile`)

```bash
# Desde el proyecto PHP hidratado (Regla Cero no-root):
make qa-lint        # PHP-CS-Fixer + PHPStan (max) + Psalm Taint + Composer Audit
make qa-unit        # Pest/PHPUnit con PCOV >= 95%
make qa-parity      # Migraciones + verificación FORCE RLS contra PostgreSQL 17
make qa-bdd         # Karate Labs API (con Idempotency-Key UUIDv4)
make qa-mutation    # Infection (MSI >= 80%)
make qa-sbom        # CycloneDX 1.6
make qa-all         # Pipeline integral 11X

# Desde la raíz de qa-testing-blueprints (certificación cruzada Zero-Infra):
make test-backend-blueprints  # Pact V4 Python->Node + k6 smoke + lint antipatrones
make clean                    # Limpieza profunda sin residuos root
```
