> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in English. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Infection mutation, Pact CDCT Zero-Infra, k6 SLOs) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, and output your final response, explanations, and code comments in the user's prompt language (defaulting to English).

> 🌐 **Language / Idioma:** **English (Canonical)** | [🇪🇸 Español (README.es.md)](README.es.md)

# Canonical Testing and Validation Guide for PHP 8.2–8.5 (QA-11X v3.0)

This document contains the non-negotiable **Level-11X (QA-11X v3.0)** corporate instructions you MUST follow when generating, structuring, and running automated tests for backend APIs and microservices built in **PHP (versions 8.2, 8.3, 8.4, and 8.5)**. The goal is to guarantee resilience under extreme stress, cross-service contract parity without external infrastructure (*Zero-Infra*), security by design (DISA ASD STIG V6R5 + OWASP Developer Guide v4.2), and zero local execution on the host.

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
  sinfallas/basephpcomposer:8.5 \
  composer run-script qa:unit
```

* **For PHP, Linting, PHPStan (`max`), Psalm, PHPUnit/Pest (`PCOV`), and Mutation (`Infection`):** `sinfallas/basephpcomposer:8.5` (official available tags: `8.2`, `8.3`, `8.4`, `8.5`, `latest`, and `11x-v2-php{8.2,8.3,8.4,8.5}`).
* **For Real Persistence & Multi-Tenant Isolation (Anti-Mock Blindness):** `postgres:17-alpine` with application role `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
* **For Idempotency, Concurrent Sessions & Multi-Threaded Caching:** `eqalpha/keydb:alpine`.
* **For API Black-Box BDD Tests:** `sinfallas/karatelabs:1.5.1` (injecting `Idempotency-Key` on every mutation).
* **For Declarative Load Tests & SLOs:** `grafana/k6:2.4.0`.
* **For Dynamic Security (DAST) & Chaos:** `zaproxy/zap-stable`, `gaiaadm/pumba:latest`, and `prom/prometheus:latest`.

---

## 2. 13-Layer 11X Tech Matrix for PHP

1. **Strict Typing and Formatting:** Mandatory `declare(strict_types=1);` in every PHP file + `friendsofphp/php-cs-fixer` (`@PER-CS2.0`).
2. **Static Analysis and Cognitive Complexity:** `phpstan/phpstan` (level `max` / 9 + `phpstan-strict-rules`) and `tomasvotruba/cognitive-complexity` (complexity `<= 5` in critical modules / `<= 9` global).
3. **Static Security (SAST) and CVEs:** `vimeo/psalm` (`--taint-analysis`) and `composer audit` (0 High/Critical CVEs).
4. **Isolated Unit Tests:** `pestphp/pest` or `phpunit/phpunit` 11.5+–13.x with lightweight `pcov` driver (non-negotiable coverage `>= 95.0%` for lines and branches).
5. **Mutation Testing:** `infection/infection` (`minMsi: 80`, `minCoveredMsi: 80`, 0 critical escaped mutants).
6. **Database Parity and PostgreSQL 17 `FORCE RLS`:** Verification of Doctrine / Laravel migrations against real `postgres:17-alpine` running `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY;` under role `NOBYPASSRLS` and per-transaction re-application of `SET LOCAL app.current_tenant_id` (relying on `SELECT *` without an active RLS policy is prohibited).
7. **Zero-Infra Consumer-Driven Contracts (`Pact` V3/V4) & OpenAPI 3.1:**
   * Every inter-service integration (for example, PHP as provider or consumer against `fastapi/` or `node-backend/`) MUST validate deterministic JSON contracts in `PACT_OUTPUT_DIR` without relying on a cloud *Pact Broker*.
   * **Exact Monetary Precision:** Financial amounts must be serialized as exact decimal strings (`"149.95"` via `bcmath` or `Brick\Money`); binary `float` in JSON bodies is strictly prohibited.
   * **Trimodal Fixtures and Anti-Silo:** Cover `nominal_configured` (`201 Created` echoing `Idempotency-Key`), `virgin_empty` (`404 Not Found` in RFC 7807 `application/problem+json` format), and `degraded_conflict` (partial batches `POST .../batch` returning `200 OK` with item-by-item inspection of `results[].status`, plus `409 Conflict` RFC 7807 on `Idempotency-Key` collision with a mutated payload).
8. **Black-Box BDD Tests:** `Karate Labs` executing `test/api_test.feature` against the live API inside an ephemeral container.
9. **Declarative Load Tests & SLOs (`k6`):** Environment-parameterized profiles (`K6_PROFILE=smoke|load|stress`, reference in `fastapi/tests/load/smoke.k6.js`) with blocking thresholds aligned to `evaluateReleaseGate` (`http_req_failed < 1%`, `p(95) < 250ms`, `p(99) < 500ms`, `checks == 100%`) and per-item inspection of batch responses without assuming success from `status === 200`.
10. **Dynamic Security DAST & OSHP:** OWASP ZAP Baseline verifying `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, and `X-Powered-By` suppression.
11. **Canonicalization, Cryptography & Idempotency:** Unicode `\Normalizer::FORM_KC` before validation (`APSC-DV-002520`), Argon2id, AES-256-GCM with `sodium_memzero()`, and mandatory `Idempotency-Key` header (UUIDv4 format) on every `POST`/`PUT`/`PATCH`/`DELETE` backed by KeyDB with a SHA-256 hash of the payload to reject mutations with `409 Conflict`.
12. **Chaos Engineering and Observability:** Latency/fault injection with Pumba (`netem`) and Prometheus metrics (`/metrics`).
13. **Cryptographic SBOM:** `cyclonedx/cyclonedx-php-composer` generating `sbom-php.cdx.json` (CycloneDX 1.6).

---

## 3. Canonical Commands (`Makefile`)

```bash
# From the hydrated PHP project (Rule Zero non-root):
make qa-lint        # PHP-CS-Fixer + PHPStan (max) + Psalm Taint + Composer Audit
make qa-unit        # Pest/PHPUnit with PCOV >= 95%
make qa-parity      # Migrations + FORCE RLS verification against PostgreSQL 17
make qa-bdd         # Karate Labs API (with Idempotency-Key UUIDv4)
make qa-mutation    # Infection (MSI >= 80%)
make qa-sbom        # CycloneDX 1.6
make qa-all         # Comprehensive 11X pipeline

# From the qa-testing-blueprints root (Zero-Infra cross-certification):
make test-backend-blueprints  # Pact V4 Python->Node + k6 smoke + anti-pattern lint
make clean                    # Deep cleanup without root artifacts
```
