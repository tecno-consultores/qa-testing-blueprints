# 🐘 PHP 8.2–8.5 Stack Reference (`sinfallas/basephpcomposer` — Standard 11X)

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Respond in **user's prompt language** (unless `AGENTS.md` fixes it); docs/commits match `README.md`/`CHANGELOG.md` (Spec 19; `.agents/**` English).

This reference provides the technical directives, hardened container/INI blueprints, and ephemeral Docker commands for PHP 8.2–8.5 APIs, microservices, and enterprise applications (Symfony, Laravel, Slim, or standalone PHP).

---

## 1. Core Architecture & Ephemeral Container Topology

All execution MUST occur inside ephemeral Docker containers (`Rule Zero`) using the official multi-arch (`linux/amd64`, `linux/arm64`) image fleet `sinfallas/basephpcomposer` (`8.2`, `8.3`, `8.4`, `8.5`, `latest`):

| Service / Container Role | Docker Image | Port / Socket | Purpose |
| :--- | :--- | :--- | :--- |
| **PHP API / Test Runner** | `sinfallas/basephpcomposer:8.5` | Non-root `www` (`1000:1000`) | Pest/PHPUnit + PCOV, PHPStan, Psalm, PHP-CS-Fixer, Infection |
| **Relational Database** | `postgres:17-alpine` | `5432:5432` | Real PostgreSQL schema parity, `FORCE RLS`, Doctrine/Laravel migrations |
| **In-Memory Store & Cache** | `eqalpha/keydb:6.3.4` | `6379:6379` | Multi-threaded KeyDB (`--server-threads 2`) via C `ext-redis` |
| **Black-Box REST / HTTP BDD** | `sinfallas/karatelabs:1.5.1` | Target: `http://php-api:8000` | Gherkin HTTP, OpenAPI & OWASP OSHP checks (`test/api_test.feature`) |
| **Dynamic Security (DAST)** | `zaproxy/zap-stable:2.15.0` | Target: `http://php-api:8000` | OWASP ZAP Baseline & OSHP header verification |
| **Chaos Injection** | `gaiaadm/pumba:0.10.1` | Docker Socket | Network latency (`netem`), jitter, and packet loss |

---

## 2. Innegotiable PHP 8.2–8.5 Directives

### A. Strict Types, PHPStan Level Max & Cognitive Complexity
1. Every `.php` source and test file MUST start with `<?php declare(strict_types=1);`.
2. Enforce `phpstan/phpstan` at `level: max` (Level 9/10) with `phpstan/phpstan-strict-rules` and `tomasvotruba/cognitive-complexity` (`function: 9`, `class: 40`).
3. Run `vimeo/psalm --taint-analysis` to statically detect SQLi, XSS, SSRF, and path traversal sinks.

### B. Unit Coverage (`>= 95.0%`) via Native C `PCOV` & Offline Isolation
1. Use `pcov` (`php -d pcov.enabled=1 -d pcov.directory=src ./vendor/bin/pest --coverage --min=95`, or `-d pcov.directory=app` on Laravel) for fast C-level branch/line instrumentation; mount custom hardened `.ini` files as `/usr/local/etc/php/conf.d/99-qa11x.ini` so they prevail over `conf.d/docker-php-ext-pcov.ini`.
2. External HTTP calls MUST be intercepted offline (`GuzzleHttp\Handler\MockHandler`, `Symfony\Component\HttpClient\MockHttpClient`, or `php-vcr`).
3. Filesystem operations in unit tests MUST use `bovigo/vfsstream` or ephemeral `/tmp` directories.

### C. Database Schema Parity & Anti-Mock Blindness
1. NEVER mock PDO/Doctrine/Eloquent connections when testing persistence or migrations.
2. Verify schema synchronization against real ephemeral `postgres:17-alpine`:
   - Doctrine: `php bin/console doctrine:migrations:migrate --no-interaction && php bin/console doctrine:schema:validate`
   - Laravel: `php artisan migrate --force` + schema parity test asserting `FORCE ROW LEVEL SECURITY`.

### D. DISA ASD STIG V6R5 & OWASP v4.2 Controls in PHP
- **Unicode NFKC (`APSC-DV-002520`):** `\Normalizer::normalize($input, \Normalizer::FORM_KC)` (`ext-intl`).
- **Cryptographic Vault & Zeroization (`APSC-DV-002010/2590`):** `openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, $aad)` and `sodium_memzero($key)` (`ext-sodium`).
- **Constant-Time Auth (`APSC-DV-000530`):** `password_hash($pw, PASSWORD_ARGON2ID)` and `password_verify($pw, $userHash ?? DUMMY_ARGON2ID_HASH)` with 3-attempt/15m KeyDB lockout.
- **Anti-XXE & Safe Deserialization (`APSC-DV-002390/2510`):** Use `LIBXML_NONET` on XML parsers; forbid raw `unserialize()` (enforce `json_decode(..., flags: JSON_THROW_ON_ERROR)` or `unserialize($data, ['allowed_classes' => false])`); forbid `shell_exec`, `exec`, `passthru`, `system`, `eval`.
- **Magic-Byte File Verification (`APSC-DV-002485`):** Validate uploads with `finfo_file(finfo_open(FILEINFO_MIME_TYPE), $tmpFile)`.
- **CycloneDX SBOM (`APSC-DV-001430`):** Generate via `cyclonedx/cyclonedx-php-composer` (`composer CycloneDX:make-sbom --spec-version=1.6`).

---

## 3. Hardened `php.ini` & `phpstan.neon` Blueprints

### `php.ini` (Compatible Across PHP 8.2 to 8.5)
```ini
[PHP]
expose_php = Off
memory_limit = 2048M
max_execution_time = 60
max_input_vars = 3000
post_max_size = 64M
upload_max_filesize = 64M
display_errors = Off
display_startup_errors = Off
log_errors = On
error_reporting = E_ALL
zend.exception_ignore_args = On

[Date]
date.timezone = UTC

[Session]
session.use_strict_mode = 1
session.cookie_httponly = 1
session.cookie_secure = 1
session.cookie_samesite = "Strict"
session.use_only_cookies = 1
; PHP 8.4+ deprecated session.sid_length & session.sid_bits_per_character (native 32-byte CSPRNG)
session.cache_expire = 15

[opcache]
opcache.enable = 1
opcache.enable_cli = 1
opcache.memory_consumption = 256
opcache.interned_strings_buffer = 16
opcache.max_accelerated_files = 20000
opcache.save_comments = 1
opcache.jit = disable
opcache.jit_buffer_size = 0
; For prod PHP-FPM without PCOV use tracing / 128M; disabling JIT in QA CLI avoids failOnWarning PCOV notices

[pcov]
pcov.enabled = 1
; Use 'app' on Laravel; mount as /usr/local/etc/php/conf.d/99-qa11x.ini or pass -d pcov.directory=... in CLI
pcov.directory = src
pcov.exclude = ~vendor~
```

### `phpstan.neon`
```neon
includes:
    - vendor/phpstan/phpstan-strict-rules/rules.neon

parameters:
    level: max
    paths:
        - src
        - tests
    cognitive_complexity:
        class: 40
        function: 9
```

### `Makefile` Targets
```makefile
.PHONY: qa-lint qa-unit qa-parity qa-contracts qa-bdd qa-mutation qa-dast qa-load qa-chaos qa-sbom qa-all clean-cache clean qa-clean

PROJECT_DIR ?= $(CURDIR)
QA_UID ?= $(shell id -u)
QA_GID ?= $(shell id -g)
export QA_UID QA_GID

qa-lint:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-php sh -c "[ -f vendor/autoload.php ] || php -d allow_url_fopen=1 /usr/local/bin/composer install --no-interaction --prefer-dist --quiet; php -d allow_url_fopen=1 /usr/local/bin/composer run-script qa:lint"

qa-unit:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-php sh -c "[ -f vendor/autoload.php ] || php -d allow_url_fopen=1 /usr/local/bin/composer install --no-interaction --prefer-dist --quiet; composer run-script qa:unit"

qa-parity:
	bash -c 'trap "docker compose --project-directory \"$(PROJECT_DIR)\" -f docker-compose.qa.yml --profile \"*\" down -v >/dev/null 2>&1 || true" EXIT; \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml --profile integration up -d --wait postgres-qa keydb-qa && \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-php sh -c "[ -f vendor/autoload.php ] || php -d allow_url_fopen=1 /usr/local/bin/composer install --no-interaction --prefer-dist --quiet; if [ -f bin/console ]; then DATABASE_URL=\"\$$MIGRATION_DATABASE_URL\" php bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration && DATABASE_URL=\"\$$MIGRATION_DATABASE_URL\" php bin/console doctrine:schema:validate; elif [ -f artisan ]; then DB_URL=\"\$$MIGRATION_DATABASE_URL\" php artisan migrate --force --no-interaction && DB_URL=\"\$$MIGRATION_DATABASE_URL\" php artisan migrate:status; else echo \"[SKIPPED] ORM console absent (Doctrine/Laravel).\"; fi" && \
		unprotected=$$(docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml exec -T postgres-qa psql -U qa_user -d qa_db -tAc "SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='\''public'\'' AND c.relkind='\''r'\'' AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);"); \
		[ "$${unprotected:-0}" -eq 0 ]'

qa-contracts:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-php sh -c "[ -f vendor/autoload.php ] || php -d allow_url_fopen=1 /usr/local/bin/composer install --no-interaction --prefer-dist --quiet; if [ -f vendor/bin/openapi ]; then ./vendor/bin/openapi src/ -o openapi.json --format json; else echo '[SKIPPED] OpenAPI generator not installed.'; fi"

qa-bdd:
	bash -c 'trap "docker compose --project-directory \"$(PROJECT_DIR)\" -f docker-compose.qa.yml --profile \"*\" down -v >/dev/null 2>&1 || true" EXIT; \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml --profile integration up -d --wait postgres-qa keydb-qa php-api && \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml --profile integration run --rm -T karatelabs mvn -B clean test'

qa-mutation:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-php sh -c "[ -f vendor/autoload.php ] || php -d allow_url_fopen=1 /usr/local/bin/composer install --no-interaction --prefer-dist --quiet; composer run-script qa:mutation"  # MSI >= 80%

qa-dast:
	bash -c 'trap "docker compose --project-directory \"$(PROJECT_DIR)\" -f docker-compose.qa.yml --profile \"*\" down -v >/dev/null 2>&1 || true" EXIT; \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml --profile integration up -d --wait postgres-qa keydb-qa php-api && \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml --profile integration run --rm -T -u "$(QA_UID):$(QA_GID)" -e HOME=/tmp zap zap-baseline.py -t http://php-api:8000 -r zap-report.html'

qa-load:
	mkdir -p "$(PROJECT_DIR)/reports"
	bash -c 'trap "docker compose --project-directory \"$(PROJECT_DIR)\" -f docker-compose.qa.yml --profile \"*\" down -v >/dev/null 2>&1 || true" EXIT; \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml --profile load up --abort-on-container-exit --exit-code-from k6-smoke'

qa-chaos:
	mkdir -p "$(PROJECT_DIR)/reports"
	bash -c 'trap "docker compose --project-directory \"$(PROJECT_DIR)\" -f docker-compose.qa.yml --profile \"*\" down -v >/dev/null 2>&1 || true" EXIT; \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml --profile chaos up -d --wait postgres-qa keydb-qa php-api && \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml --profile chaos up -d pumba prometheus && \
		docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml --profile load run --rm -T -e K6_P95_MS=900 -e K6_P99_MS=1500 k6-smoke'

qa-sbom:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-php sh -c "[ -f vendor/autoload.php ] || php -d allow_url_fopen=1 /usr/local/bin/composer install --no-interaction --prefer-dist --quiet; composer run-script qa:sbom"

qa-all: qa-lint qa-unit qa-parity qa-contracts qa-bdd qa-mutation qa-dast qa-load qa-chaos qa-sbom

clean-cache:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml --profile "*" down -v >/dev/null 2>&1 || true

clean: clean-cache
	@./scripts/limpieza.sh  # (or @./limpieza.sh inside hydrated stack)

qa-clean: clean
```
