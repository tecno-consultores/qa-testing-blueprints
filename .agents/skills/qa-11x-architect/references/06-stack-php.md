# 🐘 PHP 8.1–8.5 Stack Reference (`sinfallas/basephpcomposer` — Standard 11X)

> **OUTPUT LANGUAGE CONSTRAINT:**
> Always communicate with the user, provide status updates, explain reasoning, and write commit messages / user-facing documentation strictly in Spanish.

This reference provides the technical directives, hardened container/INI blueprints, and ephemeral Docker commands for PHP 8.1–8.5 APIs, microservices, and enterprise applications (Symfony, Laravel, Slim, or standalone PHP).

---

## 1. Core Architecture & Ephemeral Container Topology

All execution MUST occur inside ephemeral Docker containers (`Rule Zero`) using the official multi-arch (`linux/amd64`, `linux/arm64`) image fleet `sinfallas/basephpcomposer` (`8.1`, `8.2`, `8.3`, `8.4`, `8.5`, `latest`):

| Service / Container Role | Docker Image | Port / Socket | Purpose |
| :--- | :--- | :--- | :--- |
| **PHP API / Test Runner** | `sinfallas/basephpcomposer:8.5` | Non-root `www` (`1000:1000`) | Pest/PHPUnit + PCOV, PHPStan, Psalm, PHP-CS-Fixer, Infection |
| **Relational Database** | `postgres:17-alpine` | `5432:5432` | Real PostgreSQL schema parity, `FORCE RLS`, Doctrine/Laravel migrations |
| **In-Memory Store & Cache** | `eqalpha/keydb:alpine` | `6379:6379` | Multi-threaded KeyDB (`--server-threads 2`) via C `ext-redis` |
| **Black-Box REST / UI BDD** | `sinfallas/karatelabs:latest` | Target: `http://qa-php:8000` | Gherkin HTTP & Chrome Headless (`test/api_test.feature`) |
| **Dynamic Security (DAST)** | `zaproxy/zap-stable:latest` | Target: `http://qa-php:8000` | OWASP ZAP Baseline & OSHP header verification |
| **Chaos Injection** | `gaiaadm/pumba:latest` | Docker Socket | Network latency (`netem`), jitter, and packet loss |

---

## 2. Innegotiable PHP 8.1–8.5 Directives

### A. Strict Types, PHPStan Level Max & Cognitive Complexity
1. Every `.php` source and test file MUST start with `<?php declare(strict_types=1);`.
2. Enforce `phpstan/phpstan` at `level: max` (Level 9/10) with `phpstan/phpstan-strict-rules` and `tomasvotruba/cognitive-complexity` (`function: 9`, `class: 40`).
3. Run `vimeo/psalm --taint-analysis` to statically detect SQLi, XSS, SSRF, and path traversal sinks.

### B. Unit Coverage (`>= 95.0%`) via Native C `PCOV` & Offline Isolation
1. Use `pcov` (`php -d pcov.enabled=1 ./vendor/bin/pest --coverage --min=95` or PHPUnit) for fast C-level branch/line instrumentation.
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

### `php.ini` (Compatible Across PHP 8.1 to 8.5)
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
session.sid_length = 48
session.sid_bits_per_character = 6

[opcache]
opcache.enable = 1
opcache.enable_cli = 1
opcache.memory_consumption = 256
opcache.interned_strings_buffer = 16
opcache.max_accelerated_files = 20000
opcache.save_comments = 1
opcache.jit = tracing
opcache.jit_buffer_size = 128M

[pcov]
pcov.enabled = 1
pcov.directory = /var/www/src
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
.PHONY: qa-lint qa-unit qa-parity qa-bdd qa-mutation qa-sbom qa-all clean

qa-lint:
	docker compose -f docker-compose.qa.yml run --rm qa-php composer qa:lint

qa-unit:
	docker compose -f docker-compose.qa.yml run --rm qa-php composer qa:unit

qa-parity:
	docker compose -f docker-compose.qa.yml run --rm qa-php php bin/console doctrine:schema:validate

qa-bdd:
	docker compose -f docker-compose.qa.yml run --rm karatelabs mvn test -Dkarate.options="test/api_test.feature"

qa-mutation:
	docker compose -f docker-compose.qa.yml run --rm qa-php composer qa:mutation

qa-sbom:
	docker compose -f docker-compose.qa.yml run --rm qa-php composer qa:sbom

qa-all: qa-lint qa-unit qa-parity qa-bdd qa-mutation

clean:
	@./limpieza.sh
```
