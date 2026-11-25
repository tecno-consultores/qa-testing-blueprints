> **[DIRECTIVA DE SISTEMA PARA AGENTES DE IA]:** Actúa como un Ingeniero Staff de Automatización QA y Experto DevOps. Lee, analiza y aplica estrictamente las siguientes restricciones arquitectónicas redactadas en español. Debes generar código que se alinee perfectamente con estas reglas, utilizando exclusivamente los contenedores Docker efímeros, frameworks de pruebas y umbrales estrictos de calidad (p. ej. 95% de cobertura, SAST, mutación con Infection, Pact CDCT Zero-Infra, SLOs con k6) especificados a continuación. No sugieras instalaciones locales. Emite tu respuesta final, explicaciones y comentarios de código en el idioma del prompt del usuario (por defecto español).

> 🌐 **Idioma:** [🇺🇸 English (Canonical)](README.md) · **Español (Espejo 1:1)**

# Guía Canónica de Pruebas y Validación para PHP 8.2–8.5 (QA-11X v3.7)

Este documento contiene las instrucciones corporativas de **Nivel 11X (QA-11X v3.7)** que DEBES seguir innegociablemente para generar, estructurar y ejecutar pruebas automatizadas en APIs y microservicios backend construidos en **PHP (versiones 8.2, 8.3, 8.4 y 8.5)**. El objetivo es garantizar resiliencia bajo estrés extremo, paridad de contratos inter-servicios sin infraestructura externa (*Zero-Infra*), seguridad por diseño (DISA ASD STIG V6R5 + OWASP Developer Guide v4.2) y cero ejecución local en el host.

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
  sinfallas/basephpcomposer:8.5@sha256:56ff6d2dbf8b13833555b56ddc517bf520506b669c235026bb23224b212f0208 \
  sh -c 'php -d allow_url_fopen=1 "$(command -v composer)" run-script qa:unit'
```

* **Para PHP, Linting, PHPStan (`max`), Psalm, PHPUnit/Pest (`PCOV`) y Mutación (`Infection`):** `sinfallas/basephpcomposer:8.5@sha256:56ff6d2dbf8b13833555b56ddc517bf520506b669c235026bb23224b212f0208` (fija digests SHA-256 explícitos al usar variantes `8.2`–`8.5`; ejecuta `./scripts/actualizar-grafos-graphify.sh php` y `python3 .agents/scripts/inspect_blast_radius.py "<simbolo>"` antes de editar).
* **Para Persistencia Real y Aislamiento Multi-Tenant (Anti-Mock Blindness):** `postgres:17-alpine@sha256:d3244e8ce3f165ee3c93d9c4a4b1d0fe48b3a89e2287b717fdcbbde92d405065` con usuario de aplicación `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
* **Para Idempotencia, Sesiones Concurrentes y Caché Multi-Hilo:** `eqalpha/keydb:6.3.4`.
* **Para Pruebas BDD de Caja Negra API:** `sinfallas/karatelabs:1.5.1@sha256:a9a52ca9c5491ab39b64f0b4fdc3dea879c2213c9bc995be58d6cd4b9a80cc89` (inyectando `Idempotency-Key` en toda mutación).
* **Para Pruebas de Carga Declarativas y SLOs:** `grafana/k6:2.4.0@sha256:d41bb79cd8de5a7ad619b53570e3712633e8bff0937010a5c6c57a4747e7a276`.
* **Para Seguridad Dinámica (DAST) y Caos:** `zaproxy/zap-stable:2.15.0`, `gaiaadm/pumba:0.10.1` y `prom/prometheus:v2.55.1`.

---

## 2. Matriz Tecnológica de las 13 Capas 11X para PHP

1. **Tipado Estricto y Formato:** `declare(strict_types=1);` obligatorio en todo archivo PHP + `friendsofphp/php-cs-fixer` (`@PER-CS2.0`).
2. **Análisis Estático y Complejidad Cognitiva:** `phpstan/phpstan` (nivel `max` / 9 + `phpstan-strict-rules`, `phpstan/extension-installer`) y `tomasvotruba/cognitive-complexity` (complejidad `<= 5` en módulos críticos / `<= 9` global).
3. **Seguridad Estática (SAST) y CVEs:** `vimeo/psalm` (`--taint-analysis` configurado en `psalm.xml`) y `composer audit` (0 CVEs High/Critical).
4. **Pruebas Unitarias Aisladas:** `pestphp/pest` o `phpunit/phpunit` 11.5+–13.x con `defaultTestSuite="Unit"` en `phpunit.xml` y motor ligero `pcov` para cobertura de líneas (cobertura de líneas innegociable `>= 95.0%`; habilita Xdebug para auditar cobertura de ramas y pasa `-d allow_url_fopen=1` al invocar Composer con `php.ini` endurecido).
5. **Pruebas de Mutación:** `infection/infection` (`minMsi: 80`, `minCoveredMsi: 80`, 0 mutantes vivos críticos).
6. **Paridad de Base de Datos y PostgreSQL 17 `FORCE RLS`:** Hidrata `initdb/01-init-rls-role.sql.example` en `initdb/01-init-rls-role.sql` para aprovisionar el rol de aplicación `app_user` (`NOBYPASSRLS`) usado por `DATABASE_URL`, y verifica migraciones Doctrine / Laravel bajo `MIGRATION_DATABASE_URL` contra `postgres:17-alpine@sha256:d3244e8ce3f165ee3c93d9c4a4b1d0fe48b3a89e2287b717fdcbbde92d405065` real ejecutando `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY;` validado en `pg_class.relforcerowsecurity` bajo rol `NOBYPASSRLS` y re-aplicación por transacción de `SET LOCAL app.current_tenant_id` (`make qa-parity` emite `[SKIPPED]` solo en la consola de migración si falta Doctrine/Laravel).
7. **OpenAPI 3.1 y Contratos Zero-Infra (`Pact` V3/V4):**
   * `make qa-contracts` exporta únicamente `openapi.json` mediante `vendor/bin/openapi` (emitiendo `[SKIPPED]` si falta); las integraciones inter-servicios frente a `fastapi/` o `node-backend/` requieren cablear una suite Pact en PHP que exporte contratos en `PACT_OUTPUT_DIR` sin *Pact Broker*.
   * **Precisión Monetaria Exacta:** Los importes financieros deben viajar serializados como cadenas decimales exactas (`"149.95"` vía `bcmath` o `Brick\Money`), quedando terminantemente prohibido usar `float` binario en cuerpos JSON.
   * **Trimodal Fixtures y Anti-Silo:** Cubrir estados `nominal_configured` (`201 Created` con eco de `Idempotency-Key`), `virgin_empty` (`404 Not Found` en formato RFC 7807 `application/problem+json`) y `degraded_conflict` (lotes parciales `POST .../batch` devolviendo `200 OK` con inspección ítem por ítem de `results[].status`, más `409 Conflict` RFC 7807 ante colisión de `Idempotency-Key` con payload mutado).
8. **Pruebas BDD de Caja Negra:** `Karate Labs` ejecutando `test/api_test.feature` contra la API viva en contenedor efímero.
9. **Pruebas de Carga Declarativas y SLOs (`k6`):** Perfiles parametrizables por entorno (`K6_PROFILE=smoke|load|stress`, referencia en `php/tests/load/smoke.k6.js`) persistiendo `reports/k6-summary.json` con umbrales bloqueantes alineados a `evaluateReleaseGate` (`http_req_failed < 1%`, `p(95) < 250ms`, `p(99) < 500ms`, `checks == 100%`) e inspección por ítem de respuestas batch sin asumir éxito por `status === 200`.
10. **Seguridad Dinámica DAST y OSHP:** OWASP ZAP Automation Framework (`zap.yaml` desde `zap.yaml.example`, o fallback Baseline) persistiendo `reports/zap-report.html` y `reports/zap-report.json`, verificando `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store` y supresión de `X-Powered-By`.
11. **Seguridad por Diseño, Canonicalización e Idempotencia ([Guía de Seguridad](../docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md)):** Aplica controles DISA ASD STIG V6R5 + OWASP v4.2: Unicode `\Normalizer::FORM_KC` antes de validar (`APSC-DV-002520`), Argon2id, AES-256-GCM con `sodium_memzero()` y cabecera obligatoria `Idempotency-Key` (formato UUIDv4) en todo `POST`/`PUT`/`PATCH`/`DELETE` respaldada en KeyDB con hash SHA-256 del payload para bloquear mutaciones con `409 Conflict`.
12. **Ingeniería del Caos y Observabilidad:** Inyección de latencia/fallos con Pumba (`netem`) y métricas Prometheus (`/metrics`, `--profile observability`).
13. **SBOM Criptográfico:** `cyclonedx/cyclonedx-php-composer` generando `reports/sbom-php.cdx.json` (CycloneDX 1.6).

---

## 3. Comandos Canónicos (`Makefile`) y Paso 0 Graphify

```bash
# Paso 0 — Ingestión de Contexto y Grafo AST (CLI-First antes de editar):
./scripts/actualizar-grafos-graphify.sh php
python3 .agents/scripts/inspect_blast_radius.py "<simbolo_o_archivo>"

# Desde el proyecto PHP hidratado (Regla Cero no-root):
make qa-lint        # PHP-CS-Fixer (@PER-CS2.0) + PHPStan (max) + Psalm Taint + Composer Audit
make qa-unit        # Pest/PHPUnit con cobertura de líneas PCOV >= 95%
make qa-parity      # Migraciones + verificación PostgreSQL 17 relforcerowsecurity
make qa-contracts   # Solo exportación OpenAPI 3.1 (emite [SKIPPED] sin vendor/bin/openapi ni suite Pact)
make qa-bdd         # Karate Labs API contra php-api (con Idempotency-Key UUIDv4)
make qa-dast           # Seguridad Dinámica (OWASP ZAP vía zap.yaml -> reports/zap-report.{html,json})
make qa-load           # Pruebas de carga declarativas k6 (smoke | load | stress -> reports/k6-summary.json)
make qa-chaos          # Ingeniería del Caos (Pumba netem + scraping Prometheus)
make qa-observability  # Levanta el perfil observability de Prometheus raspando /metrics
make qa-mutation       # Infection (MSI >= 80%)
make qa-sbom           # CycloneDX 1.6 -> reports/sbom-php.cdx.json
make qa-all         # Pipeline integral 11X

# Desde la raíz de qa-testing-blueprints (certificación cruzada Zero-Infra):
make test-backend-blueprints  # Pact V4 Python->Node + k6 smoke + lint antipatrones
make clean                    # Limpieza profunda sin residuos root
```
