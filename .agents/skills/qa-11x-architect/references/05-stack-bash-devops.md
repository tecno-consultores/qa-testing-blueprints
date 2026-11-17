# 🐧 Bash & DevOps Shell Stack Reference (Standard 11X)

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Respond in **user's prompt language** (unless `AGENTS.md` fixes it); docs/commits match `README.md`/`CHANGELOG.md` (Spec 19; `.agents/**` English).

This reference provides technical standards, testing directives, and ephemeral Docker commands for Bash, POSIX Shell, and DevOps automation scripts.

---

## 1. Zero-Contamination Runtime & Docker Environment

All shell testing and linting MUST execute strictly inside `sinfallas/base-bash-qa@sha256:2d1f579e20ef384e85da839304dbae2d28231fcdc893c21cbe79861b44d675a7` (`Rule Zero`).
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

setup() {
  export _USER="${_USER:-$(id -un 2>/dev/null || id -u)}"
  load '/opt/bats-libs/bats-support/load.bash'
  load '/opt/bats-libs/bats-assert/load.bash'
  load '/opt/bats-libs/bats-mock/load.bash'
  BASH_STACK_DIR="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"
  export BASH_STACK_DIR
}

@test "clean_artifacts.sh supports --dry-run without modifying files" {
  work_dir="${BATS_TEST_TMPDIR}/work"
  mkdir -p "${work_dir}/coverage_report"
  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --dry-run
  assert_success
  assert_output --partial "[DRY-RUN]"
  [ -d "${work_dir}/coverage_report" ]
}

@test "clean_artifacts.sh purges artifacts with mocked docker" {
  work_dir="${BATS_TEST_TMPDIR}/live-work"
  mkdir -p "${work_dir}/coverage_report"
  mock_docker="$(mock_create)"
  mock_set_status "${mock_docker}" 0 1
  mock_set_output "${mock_docker}" "Contenedores QA detenidos" 1
  ln -s "${mock_docker}" "${BATS_TEST_TMPDIR}/docker"
  PATH="${BATS_TEST_TMPDIR}:${PATH}"

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}"
  assert_success
  assert_output --partial "Contenedores QA detenidos"
  [ ! -d "${work_dir}/coverage_report" ]
}
```

---

## 4. Makefile Targets

```makefile
.PHONY: qa-lint qa-unit qa-all clean-cache clean qa-clean

PROJECT_DIR ?= $(CURDIR)
QA_UID ?= $(shell id -u)
QA_GID ?= $(shell id -g)
export QA_UID QA_GID

qa-lint:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-bash bash -c "shopt -s globstar nullglob && shellcheck -x **/*.sh && shfmt -i 2 -ci -d **/*.sh"

qa-unit:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$$(id -u):$$(id -g)" -e _USER=qa qa-bash bash -c 'rm -rf coverage_report; rc=0; kcov --include-path="$$PWD" --exclude-pattern="$$PWD/test" -l 80,95 coverage_report/ bats test/ >/tmp/bats-tap.log 2>/tmp/kcov-stderr.log || rc=$$?; cat /tmp/bats-tap.log; if [ "$${rc}" -ne 0 ]; then if ! grep -q "^not ok " /tmp/bats-tap.log 2>/dev/null; then tail -n 40 /tmp/kcov-stderr.log >&2; fi; exit "$${rc}"; fi; /usr/bin/python3 -c "import json, pathlib, sys; r = pathlib.Path(\"coverage_report\"); jf = sorted(r.rglob(\"coverage.json\")); ds = [json.loads(p.read_text()) for p in jf]; tot = sum(int(d.get(\"total_lines\", 0)) for d in ds); pct = (sum(int(d.get(\"covered_lines\", 0)) for d in ds) * 100.0 / tot if tot > 0 else float(ds[0].get(\"percent_covered\", 0))) if ds else -1.0; sys.exit(0 if pct >= 95.0 else 1)"'

qa-all: qa-lint qa-unit

clean-cache:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml down -v >/dev/null 2>&1 || true
	rm -rf coverage_report/

clean: clean-cache
	./limpieza.sh

qa-clean: clean
```
