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
- **Rootless `kcov >= 95.0%` without `SYS_PTRACE` (`yama.ptrace_scope = 2`):** Keep `cap_drop: [ALL]` and `security_opt: [no-new-privileges:true]` in `qa-bash` (never add `SYS_PTRACE` or `seccomp:unconfined`). Pass `--bash-dont-parse-binary-dir --bash-parse-files-in-dir` with `--exclude-pattern` excluding vendored QA-11X helpers (`/limpieza.sh`, `/instalar-hooks.sh`, `/.agents/`, `/scripts/{verificar-secretos,auditar-infra,auditar-pagespeed,actualizar-grafos-graphify,generar-sbom-cyclonedx,install-skill}.sh`) and wrap `bats` in `/tmp/run-bats.sh` (`export -n BASH_XTRACEFD` + `export BASH_ENV=/tmp/kcov-env.sh` checking `[ -p "/proc/${BASHPID}/fd/${KCOV_BASH_XTRACEFD}" ]` without restricting `${0}` to `/app/*`) so `source`d scripts, relative paths, and `close_fds`/FD-reusing subprocesses (`python3`, `node`) preserve `>= 95.0%` coverage without `stderr` or file leaks. Write raw `kcov` output to `/tmp/kcov-out` and strip `<!DOCTYPE` declarations when exporting `.agents/.cache/coverage/bash.xml` (`0600`) for Anti-XXE compatibility with `verify_diff_coverage.py`.
- Enforce **`>= 95.0%` line coverage** (`total_lines > 0`) via `kcov`.

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
BATS_TARGETS ?=
KCOV_PARSE_DIR ?= .
KCOV_INCLUDE_PATH ?= .
KCOV_EXCLUDE_EXTRA ?=
export QA_UID QA_GID

qa-lint:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" qa-bash bash -c "mapfile -d '' files < <(find . \( -name node_modules -o -name .venv -o -name vendor -o -name .bats-battery \) -prune -o -type f -name '*.sh' -print0); if [ \$${#files[@]} -gt 0 ]; then shellcheck -x \"\$${files[@]}\" && shfmt -i 2 -ci -d \"\$${files[@]}\"; fi"

qa-unit:
	mkdir -p .agents/.cache/coverage
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml run --rm -T -u "$(QA_UID):$(QA_GID)" -e _USER=qa -e QA_BATS_TARGETS="$(BATS_TARGETS)" -e QA_KCOV_PARSE_DIR="$(KCOV_PARSE_DIR)" -e QA_KCOV_INCLUDE_PATH="$(KCOV_INCLUDE_PATH)" -e QA_KCOV_EXCLUDE_EXTRA="$(KCOV_EXCLUDE_EXTRA)" qa-bash bash -c 'set -euo pipefail; kcov_tmp="$${QA_KCOV_TMP:-/tmp}"; kcov_out="$${QA_KCOV_OUT:-/tmp/kcov-out}"; parse_dir="$$(cd "$${QA_KCOV_PARSE_DIR:-.}" && pwd)"; include_dir="$$(cd "$${QA_KCOV_INCLUDE_PATH:-.}" && pwd)"; excl="$${parse_dir}/test,$${parse_dir}/tests,$${parse_dir}/.agents/,$${parse_dir}/.git/,$${parse_dir}/node_modules/,$${parse_dir}/.venv/,$${parse_dir}/vendor/,$${parse_dir}/.bats-battery/,$${parse_dir}/graphify-out/,$${parse_dir}/coverage_report/,$${parse_dir}/limpieza.sh,$${parse_dir}/scripts/limpieza.sh,$${parse_dir}/instalar-hooks.sh,$${parse_dir}/scripts/verificar-secretos.sh,$${parse_dir}/scripts/auditar-infra.sh,$${parse_dir}/scripts/auditar-pagespeed.sh,$${parse_dir}/scripts/actualizar-grafos-graphify.sh,$${parse_dir}/scripts/generar-sbom-cyclonedx.sh,$${parse_dir}/scripts/install-skill.sh$${QA_KCOV_EXCLUDE_EXTRA:+,$${QA_KCOV_EXCLUDE_EXTRA}}"; if [ -n "$${QA_BATS_TARGETS:-}" ]; then if [ -e "$${QA_BATS_TARGETS}" ]; then bats_targets=("$${QA_BATS_TARGETS}"); elif [[ "$${QA_BATS_TARGETS}" == *:* ]]; then IFS=: read -r -a bats_targets <<<"$${QA_BATS_TARGETS}"; else read -r -a bats_targets <<<"$${QA_BATS_TARGETS}"; fi; elif [ -d test ]; then bats_targets=(test); elif [ -d tests/bash ]; then bats_targets=(tests/bash); elif [ -d tests/bats ]; then bats_targets=(tests/bats); else exit 1; fi; printf "%s\n" "if [[ \"\$${KCOV_BASH_XTRACEFD:-}\" =~ ^[0-9]+\$$ ]] && [ -p \"/proc/\$${BASHPID}/fd/\$${KCOV_BASH_XTRACEFD}\" ]; then" "  PS4='\''kcov@\$$""{BASH_SOURCE}@\$$""{LINENO}@'\''" "  BASH_XTRACEFD=\"\$${KCOV_BASH_XTRACEFD}\"" "  set -x" "fi" >"$${kcov_tmp}/kcov-env.sh"; printf "#!/usr/bin/env bash\nexport -n BASH_XTRACEFD 2>/dev/null || unset BASH_XTRACEFD\nexport BASH_ENV=\"%s/kcov-env.sh\"\nexec bats \"\$$@\"\n" "$${kcov_tmp}" >"$${kcov_tmp}/run-bats.sh"; chmod +x "$${kcov_tmp}/run-bats.sh"; rm -rf "$${kcov_out}" coverage_report; rc=0; env -u KCOV_BASH_XTRACEFD -u BASH_XTRACEFD -u BASH_ENV kcov --bash-dont-parse-binary-dir --bash-parse-files-in-dir="$${parse_dir}" --include-path="$${include_dir}" --exclude-pattern="$${excl}" -l 80,95 "$${kcov_out}" "$${kcov_tmp}/run-bats.sh" "$${bats_targets[@]}" >/tmp/bats-tap.log 2>/tmp/kcov-stderr.log || rc=$$?; cat /tmp/bats-tap.log; if [ "$${rc}" -ne 0 ]; then if ! grep -q "^not ok " /tmp/bats-tap.log 2>/dev/null; then tail -n 40 /tmp/kcov-stderr.log >&2; fi; exit "$${rc}"; fi; mkdir -p .agents/.cache/coverage && chmod 0700 .agents/.cache .agents/.cache/coverage; /usr/bin/python3 -c "import json, os, pathlib, re, sys; r = pathlib.Path(sys.argv[1]); out_xml = pathlib.Path(sys.argv[2]); jf = [p for p in sorted(r.rglob(\"coverage.json\")) if not p.parent.is_symlink()]; xf = [p for p in sorted(r.rglob(\"cobertura.xml\")) if not p.parent.is_symlink()]; mxf = [p for p in xf if p.parent.name == \"kcov-merged\"]; src_xml = (mxf[0] if mxf else xf[0]) if xf else None; src_xml is None and sys.exit(1); raw_xml = src_xml.read_text(encoding=\"utf-8\"); san = raw_xml if \"<!ENTITY\" in raw_xml.upper() else re.sub(r\"<!DOCTYPE\s+coverage\s+[^\s[\]<>][^[\]<>]*>\r?\n?\", \"\", raw_xml, flags=re.I); out_xml.write_text(san, encoding=\"utf-8\"); os.chmod(out_xml, 0o600); ds = [json.loads(p.read_text(encoding=\"utf-8\")) for p in jf if p.parent.name == \"kcov-merged\"] or [json.loads(p.read_text(encoding=\"utf-8\")) for p in jf]; tot = sum(int(d.get(\"total_lines\", 0)) for d in ds); cov = sum(int(d.get(\"covered_lines\", 0)) for d in ds); m_v = re.search(r\"<coverage[^>]*lines-valid=.(\d+)\", san); m_r = re.search(r\"<coverage[^>]*line-rate=.([0-9.]+)\", san); pct = ((cov * 100.0 / tot) if tot > 0 else 0.0) if ds else ((float(m_r.group(1)) * 100.0) if (m_r and m_v and int(m_v.group(1)) > 0) else 0.0); sys.exit(0 if pct >= 95.0 else 1)" "$${kcov_out}" ".agents/.cache/coverage/bash.xml"'

qa-all: qa-lint qa-unit

clean-cache:
	docker compose --project-directory "$(PROJECT_DIR)" -f docker-compose.qa.yml down -v >/dev/null 2>&1 || true
	rm -rf coverage_report/

clean: clean-cache
	./limpieza.sh

qa-clean: clean
```
