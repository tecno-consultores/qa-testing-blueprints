> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in Spanish. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Infection mutation) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, but output your final response, explanations, and code comments in Spanish.

# Guía Canónica de Pruebas y Validación para PHP 8.1–8.5 (Estándar 11X)

Este documento contiene las instrucciones corporativas de **Nivel 11X** que DEBES seguir innegociablemente para generar, estructurar y ejecutar pruebas automatizadas en APIs y aplicaciones backend construidas en **PHP (versiones 8.1, 8.2, 8.3, 8.4 y 8.5)**. El objetivo es garantizar resiliencia bajo estrés extremo, auditar complejidad cognitiva, certificar seguridad estática y dinámica (DISA ASD STIG V6R5 + OWASP Developer Guide v4.2) y erradicar la ceguera de mocks.

---

## 1. Reglas Estrictas de Ejecución (Docker Efímero y Regla Cero)

**NUNCA** debes instruir la instalación local de PHP, extensiones PECL o Composer en la máquina host. Todo se ejecuta de forma efímera y segura a través de los contenedores Docker oficiales del ecosistema:

* **Para PHP, Linting, Análisis Estático, Pruebas Unitarias y Mutación:** `sinfallas/basephpcomposer:8.5` (o tag correspondiente `8.1`–`8.5`).
* **Para Persistencia Real y Validación de Esquemas (Anti-Mock Blindness):** `postgres:17-alpine`.
* **Para Sesiones Concurrentes, Idempotency-Key y Caché In-Memory:** `eqalpha/keydb:alpine` (Multi-Threaded).
* **Para Pruebas BDD de Caja Negra API:** `sinfallas/karatelabs:latest`.
* **Para Seguridad Dinámica (DAST) y Cabeceras OSHP:** `zaproxy/zap-stable`.
* **Para Ingeniería del Caos y Resiliencia:** `gaiaadm/pumba:latest` y `prom/prometheus:latest`.

---

## 2. Matriz Tecnológica de las 13 Capas 11X para PHP

1. **Tipado Estricto y Formato:** `declare(strict_types=1);` obligatorio en todo archivo PHP + `friendsofphp/php-cs-fixer` (`@PER-CS2.0`).
2. **Análisis Estático y Complejidad Cognitiva:** `phpstan/phpstan` (nivel `max` / 9 + `phpstan-strict-rules`) y `tomasvotruba/cognitive-complexity` (límite por función/método $\le 9$).
3. **Seguridad Estática (SAST) y Vulnerabilidades:** `vimeo/psalm` (`--taint-analysis`) y `composer audit` (0 CVEs High/Critical).
4. **Pruebas Unitarias Aisladas:** `pestphp/pest` o `phpunit/phpunit` 11.5+ con motor ligero `pcov` (cobertura innegociable $\ge 95.0\%$ en líneas y ramas).
5. **Pruebas de Mutación:** `infection/infection` (`minMsi: 80`, `minCoveredMsi: 80`, 0 mutantes vivos críticos).
6. **Paridad de Base de Datos (Anti-Mock Blindness):** Verificación de migraciones Doctrine / Laravel contra `postgres:17-alpine` real con políticas `FORCE RLS`.
7. **Contratos Front-Back y OpenAPI:** Validación de esquemas OpenAPI 3.1 con Swagger-PHP / Schemathesis.
8. **Pruebas BDD de Caja Negra:** `Karate Labs` ejecutando `test/api_test.feature` contra la API en contenedor efímero.
9. **Seguridad Dinámica DAST:** OWASP ZAP Baseline y verificación de cabeceras seguras (OSHP: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, supresión de `X-Powered-By`).
10. **Canonicalización y Criptografía Segura:** Unicode `\Normalizer::FORM_KC` antes de validación (`DISA APSC-DV-002520`), Argon2id y AES-256-GCM con `sodium_memzero()` en secretos en memoria.
11. **Gobernanza de Sesiones y Anti-Replay:** Cabecera obligatoria `Idempotency-Key` en operaciones de mutación (POST/PUT/PATCH/DELETE) respaldada en KeyDB con TTL.
12. **Ingeniería del Caos y Observabilidad:** Inyección de fallas con Pumba (`netem`) y exportador de métricas Prometheus (`promphp/prometheus_client_php`).
13. **SBOM Criptográfico:** `cyclonedx/cyclonedx-php-composer` generando `sbom-php.cdx.json` (estándar CycloneDX 1.6).

---

## 3. Comandos Canónicos (`Makefile`)

```bash
# Ejecutar verificación completa de estilo, análisis estático y auditoría de CVEs
make qa-lint

# Ejecutar pruebas unitarias con reporte de cobertura PCOV (>= 95%)
make qa-unit

# Validar paridad de esquema y migraciones contra PostgreSQL 17 real
make qa-parity

# Ejecutar pruebas BDD de caja negra con Karate Labs
make qa-bdd

# Ejecutar pruebas de mutación con Infection (MSI >= 80%)
make qa-mutation

# Generar SBOM CycloneDX 1.6
make qa-sbom

# Ejecutar pipeline completo 11X
make qa-all

# Limpieza profunda sin residuos root (Fallback Alpine)
make clean
```
