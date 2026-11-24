> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in English. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Infection mutation, Pact CDCT Zero-Infra, k6 SLOs) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, and output your final response, explanations, and code comments in the user's prompt language (defaulting to English).

> 🌐 **Language:** **English (Canonical)** · [🇪🇸 Leer en Español](README.es.md)

# Canonical Testing and Validation Guide for PHP 8.2–8.5 (QA-11X v3.5)

This document contains the non-negotiable **Level-11X (QA-11X v3.5)** corporate instructions you MUST follow when generating, structuring, and running automated tests for backend APIs and microservices built in **PHP (versions 8.2, 8.3, 8.4, and 8.5)**. The goal is to guarantee resilience under extreme stress, cross-service contract parity without external infrastructure (*Zero-Infra*), security by design (DISA ASD STIG V6R5 + OWASP Developer Guide v4.2), and zero local execution on the host.

---

## 1. Strict Execution Rules (Rule Zero, Non-Root & Official v2 Containers)

**NEVER** instruct local installation of PHP, PECL extensions, or Composer on the host machine, nor run processes as `root` inside the container. Every validation runs inside ephemeral Docker containers with explicit host user UID/GID mapping and `/tmp` caches:

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

* **For PHP, Linting, PHPStan (`max`), Psalm, PHPUnit/Pest (`PCOV`), and Mutation (`Infection`):** `sinfallas/basephpcomposer:8.5@sha256:56ff6d2dbf8b13833555b56ddc517bf520506b669c235026bb23224b212f0208` (pin explicit SHA-256 digests when selecting `8.2`–`8.5` variants; run `./scripts/actualizar-grafos-graphify.sh php` and `python3 .agents/scripts/inspect_blast_radius.py "<symbol>"` before editing).
* **For Real Persistence & Multi-Tenant Isolation (Anti-Mock Blindness):** `postgres:17-alpine@sha256:d3244e8ce3f165ee3c93d9c4a4b1d0fe48b3a89e2287b717fdcbbde92d405065` with application role `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
* **For Idempotency, Concurrent Sessions & Multi-Threaded Caching:** `eqalpha/keydb:6.3.4`.
* **For API Black-Box BDD Tests:** `sinfallas/karatelabs:1.5.1@sha256:a9a52ca9c5491ab39b64f0b4fdc3dea879c2213c9bc995be58d6cd4b9a80cc89` (injecting `Idempotency-Key` on every mutation).
* **For Declarative Load Tests & SLOs:** `grafana/k6:2.4.0@sha256:d41bb79cd8de5a7ad619b53570e3712633e8bff0937010a5c6c57a4747e7a276`.
* **For Dynamic Security (DAST) & Chaos:** `zaproxy/zap-stable:2.15.0`, `gaiaadm/pumba:0.10.1`, and `prom/prometheus:v2.55.1`.

---

## 2. 13-Layer 11X Tech Matrix for PHP

1. **Strict Typing and Formatting:** Mandatory `declare(strict_types=1);` in every PHP file + `friendsofphp/php-cs-fixer` (`@PER-CS2.0`).
2. **Static Analysis and Cognitive Complexity:** `phpstan/phpstan` (level `max` / 9 + `phpstan-strict-rules`, `phpstan/extension-installer`) and `tomasvotruba/cognitive-complexity` (complexity `<= 5` in critical modules / `<= 9` global).
3. **Static Security (SAST) and CVEs:** `vimeo/psalm` (`--taint-analysis` configured in `psalm.xml`) and `composer audit` (0 High/Critical CVEs).
4. **Isolated Unit Tests:** `pestphp/pest` or `phpunit/phpunit` 11.5+–13.x with `defaultTestSuite="Unit"` in `phpunit.xml` and lightweight `pcov` line-coverage driver (line coverage `>= 95.0%` mandatory; enable Xdebug when auditing branch coverage, and pass `-d allow_url_fopen=1` when invoking Composer against hardened `php.ini` files).
5. **Mutation Testing:** `infection/infection` (`minMsi: 80`, `minCoveredMsi: 80`, 0 critical escaped mutants).
6. **Database Parity and PostgreSQL 17 `FORCE RLS`:** Hydrate `initdb/01-init-rls-role.sql.example` into `initdb/01-init-rls-role.sql` to provision the `app_user` (`NOBYPASSRLS`) application role used by `DATABASE_URL`, and verify Doctrine / Laravel migrations under `MIGRATION_DATABASE_URL` against real `postgres:17-alpine@sha256:d3244e8ce3f165ee3c93d9c4a4b1d0fe48b3a89e2287b717fdcbbde92d405065` running `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY;` verified via `pg_class.relforcerowsecurity` under role `NOBYPASSRLS` and per-transaction re-application of `SET LOCAL app.current_tenant_id` (`make qa-parity` emits `[SKIPPED]` only for migration commands when no ORM console exists).
7. **Zero-Infra OpenAPI 3.1 & Contracts (`Pact` V3/V4):**
   * `make qa-contracts` exports `openapi.json` via `vendor/bin/openapi` (emitting `[SKIPPED]` when absent); cross-service Pact V3/V4 integrations against `fastapi/` or `node-backend/` require wiring a PHP Pact suite exporting JSON artifacts to `PACT_OUTPUT_DIR` without relying on a cloud *Pact Broker*.
   * **Exact Monetary Precision:** Financial amounts must be serialized as exact decimal strings (`"149.95"` via `bcmath` or `Brick\Money`); binary `float` in JSON bodies is strictly prohibited.
   * **Trimodal Fixtures and Anti-Silo:** Cover `nominal_configured` (`201 Created` echoing `Idempotency-Key`), `virgin_empty` (`404 Not Found` in RFC 7807 `application/problem+json` format), and `degraded_conflict` (partial batches `POST .../batch` returning `200 OK` with item-by-item inspection of `results[].status`, plus `409 Conflict` RFC 7807 on `Idempotency-Key` collision with a mutated payload).
8. **Black-Box BDD Tests:** `Karate Labs` executing `test/api_test.feature` against the live API inside an ephemeral container.
9. **Declarative Load Tests & SLOs (`k6`):** Environment-parameterized profiles (`K6_PROFILE=smoke|load|stress`, reference in `php/tests/load/smoke.k6.js`) persisting `reports/k6-summary.json` with blocking thresholds aligned to `evaluateReleaseGate` (`http_req_failed < 1%`, `p(95) < 250ms`, `p(99) < 500ms`, `checks == 100%`) and per-item inspection of batch responses without assuming success from `status === 200`.
10. **Dynamic Security DAST & OSHP:** OWASP ZAP Automation Framework (`zap.yaml` from `zap.yaml.example`, or Baseline fallback) persisting `reports/zap-report.html` and `reports/zap-report.json`, verifying `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, and `X-Powered-By` suppression.
11. **Security by Design, Canonicalization & Idempotency ([Security Guide](../docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md)):** Apply DISA ASD STIG V6R5 + OWASP v4.2 controls: Unicode `\Normalizer::FORM_KC` before validation (`APSC-DV-002520`), Argon2id, AES-256-GCM with `sodium_memzero()`, and mandatory `Idempotency-Key` header (UUIDv4 format) on every `POST`/`PUT`/`PATCH`/`DELETE` backed by KeyDB with a SHA-256 hash of the payload to reject mutations with `409 Conflict`.
12. **Chaos Engineering and Observability:** Latency/fault injection with Pumba (`netem`) and Prometheus metrics (`/metrics`, `--profile observability`).
13. **Cryptographic SBOM:** `cyclonedx/cyclonedx-php-composer` generating `reports/sbom-php.cdx.json` (CycloneDX 1.6).

---

## 3. Canonical Commands (`Makefile`) & Step 0 Graphify

```bash
# Step 0 — Context Ingestion & AST Graph (CLI-First before edits):
./scripts/actualizar-grafos-graphify.sh php
python3 .agents/scripts/inspect_blast_radius.py "<symbol_or_file>"

# From the hydrated PHP project (Rule Zero non-root):
make qa-lint        # PHP-CS-Fixer (@PER-CS2.0) + PHPStan (max) + Psalm Taint + Composer Audit
make qa-unit        # Pest/PHPUnit with PCOV line coverage >= 95%
make qa-parity      # Migrations + PostgreSQL 17 relforcerowsecurity verification
make qa-contracts   # OpenAPI 3.1 schema export only (emits [SKIPPED] unless vendor/bin/openapi or Pact suite exists)
make qa-bdd         # Karate Labs API against php-api (with Idempotency-Key UUIDv4)
make qa-dast           # Dynamic Security Scan (OWASP ZAP via zap.yaml -> reports/zap-report.{html,json})
make qa-load           # Declarative k6 SLO tests (smoke | load | stress -> reports/k6-summary.json)
make qa-chaos          # Chaos Engineering (Pumba netem + Prometheus scraping)
make qa-observability  # Start Prometheus observability profile scraping /metrics
make qa-mutation       # Infection (MSI >= 80%)
make qa-sbom           # CycloneDX 1.6 -> reports/sbom-php.cdx.json
make qa-all         # Comprehensive 11X pipeline

# From the qa-testing-blueprints root (Zero-Infra cross-certification):
make test-backend-blueprints  # Pact V4 Python->Node + k6 smoke + anti-pattern lint
make clean                    # Deep cleanup without root artifacts
```
