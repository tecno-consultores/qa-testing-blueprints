# 🐧 Bash & DevOps Shell Stack Reference (Standard 11X)

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:**
> Unless target `AGENTS.md` mandates a fixed language, interact in the **user's prompt language**; human docs use EN canonical (`*.md`) + 1:1 ES mirror (`*.es.md`) (matching `README.md`/`CHANGELOG.md` in consumer repos, defaulting to prompt language if empty); `.agents/**` stays concise English.

This reference provides technical standards, testing directives, and ephemeral Docker commands for Bash, POSIX Shell, and DevOps automation scripts.

---

## 1. Zero-Contamination Runtime & Docker Environment

All shell testing and linting MUST execute strictly inside `sinfallas/base-bash-qa:latest` (`Rule Zero`).
- Preinstalled tools in image: `bats`, `kcov`, `shellcheck`, `shfmt`, and BATS libraries in `/opt/bats-libs/` (`bats-support`, `bats-assert`, `bats-mock`).
- Never execute destructive or environment-altering scripts directly on the host machine.

---

## 2. Innegotiable Shell Standards & Hardening

1. **Strict Shell Modes:**
   - For Bash: `set -euo pipefail`.
   - For POSIX `sh`: `set -eu`.
2. **Quoting & Injection Defense:**
   - Always quote variable expansions: `"${VAR}"` instead of `$VAR` to prevent globbing, word splitting, and command injection (`APSC-DV-002510`).
   - Strictly prohibit `eval` or dynamic command generation from untrusted strings.
3. **ShellCheck & Formatting Gate:**
   - Zero ShellCheck warnings or errors allowed: `shellcheck -s bash -x -S warning`.
   - Code formatting must adhere to `shfmt -i 2 -ci`.
4. **Pushgateway Observability:**
   - Scripts performing batch or operational actions must push metrics to Prometheus Pushgateway upon completion or failure:
     ```bash
     echo "script_success_total 1" | curl -s -X POST --data-binary @- http://pushgateway:9091/metrics/job/bash_scripts
     ```
5. **Cryptographic Validation (DISA STIG V-222513):**
   - Downloaded scripts, packages, or binaries must verify SHA-256 hashes against trusted manifests before execution:
     ```bash
     echo "${EXPECTED_SHA256}  ${DOWNLOADED_FILE}" | sha256sum -c -
     ```

---

## 3. Unit Testing & Mocking with BATS-core

### Test Isolation Principles
- Manipulate files only within `$BATS_TEST_TMPDIR`.
- Intercept destructive commands (`rm`, `apt`, `systemctl`, `docker`, `curl`) using `bats-mock` or mock wrapper functions.
- In rootless containers whose mapped UID lacks an `/etc/passwd` entry (e.g., GitHub Actions `UID 1001` or macOS `UID 501`), `bats-mock`'s `id -un` lookup emits stderr noise that breaks `assert_output`: always pass `-e _USER=qa` (`_USER: qa` in Compose) and set `export _USER="${_USER:-$(id -un 2>/dev/null || id -u)}"` in `setup()`.
- Redirect `kcov` `PS4` xtrace stderr to `/tmp/kcov-stderr.log` (`2>/tmp/kcov-stderr.log`, surfacing its tail only on non-BATS runner failures) without using `--bash-method=DEBUG` (which drops child subshell coverage in `cobertura.xml`).
- Enforce **`>= 95.0%` line coverage** via `kcov`.

### Example BATS Unit Test (`test/ejemplo_mock.bats`)
```bash
#!/usr/bin/env bats

load '/opt/bats-libs/bats-support/load'
load '/opt/bats-libs/bats-assert/load'
load '/opt/bats-libs/bats-mock/load'

setup() {
  export _USER="${_USER:-$(id -un 2>/dev/null || id -u)}"
  TEST_TEMP_DIR="$(temp_make)"
  MOCK_CURL="$(mock_create)"
}

teardown() {
  temp_del "${TEST_TEMP_DIR}"
}

@test "script successfully cleans directory and pushes metric" {
  export PATH="${MOCK_CURL%/*}:${PATH}"
  
  # Run the script under test
  run ./limpieza.sh "${TEST_TEMP_DIR}"
  
  assert_success
  assert_output --partial "Limpieza completada"
}
```

---

## 4. Makefile Targets

```makefile
.PHONY: qa-lint qa-unit qa-all

qa-lint:
	docker compose -f docker-compose.qa.yml run --rm qa-bash shellcheck -s bash -x *.sh test/*.bats
	docker compose -f docker-compose.qa.yml run --rm qa-bash shfmt -d -i 2 -ci *.sh

qa-unit:
	docker compose -f docker-compose.qa.yml run --rm qa-bash kcov --include-path=. /tmp/coverage bats test/
	docker compose -f docker-compose.qa.yml run --rm qa-bash bash -c "python3 -c 'import json; ...' || true"

qa-all: qa-lint qa-unit
```
