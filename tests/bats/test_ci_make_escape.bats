#!/usr/bin/env bats
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

setup() {
  load '/opt/bats-libs/bats-support/load.bash'
  load '/opt/bats-libs/bats-assert/load.bash'
  load '/opt/bats-libs/bats-mock/load.bash'

  if [ -f "${BATS_TEST_DIRNAME}/../../scripts/auditar-infra.sh" ]; then
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  elif [ -f "/repo/scripts/auditar-infra.sh" ]; then
    REPO_ROOT="/repo"
  else
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  fi
  AUDIT_SCRIPT="${REPO_ROOT}/scripts/auditar-infra.sh"

  FAKE_ROOT="${BATS_TEST_TMPDIR}/workspace"
  FAKE_BIN="${BATS_TEST_TMPDIR}/bin"

  mkdir -p "${FAKE_ROOT}/scripts" "${FAKE_BIN}"
  cp "${AUDIT_SCRIPT}" "${FAKE_ROOT}/scripts/auditar-infra.sh"
  chmod +x "${FAKE_ROOT}/scripts/auditar-infra.sh"

  for tool in bash dirname cd pwd find awk sort xargs sha256sum id rm touch mkdir chmod date; do
    resolved="$(command -v "${tool}" || true)"
    if [ -n "${resolved}" ]; then
      ln -sf "${resolved}" "${FAKE_BIN}/${tool}"
    fi
  done
}

@test "auditar-infra.sh --static-only (Virgen): pasa sin falso error cuando no existen workflows ni sub-Makefiles" {
  run env PATH="${FAKE_BIN}" LC_ALL=C bash "${FAKE_ROOT}/scripts/auditar-infra.sh" --static-only
  assert_success
  assert_output --partial "QA-CI-ESCAPE-01"
  assert_output --partial "QA-MAKE-CURDIR-01"
}

@test "auditar-infra.sh --static-only (Nominal): acepta sustitucion simple en workflows, Compose y CURDIR en sub-Makefiles" {
  mkdir -p "${FAKE_ROOT}/.github/workflows" "${FAKE_ROOT}/backend" "${FAKE_ROOT}/frontend"

  cat >"${FAKE_ROOT}/.github/workflows/ci.yml" <<'EOF'
name: CI
jobs:
  qa:
    steps:
      - run: docker run --rm -u "$(id -u):$(id -g)" -v "$(pwd):/workspace:ro" alpine:3.20 ls
      - run: echo "${{ github.sha }}"
EOF

  cat >"${FAKE_ROOT}/.github/workflows/gen.yml" <<'EOF'
# qa-ci-escape-ok
jobs:
  gen:
    steps:
      - run: echo "$$(pwd)"
EOF

  cat >"${FAKE_ROOT}/docker-compose.deploy.yml" <<'EOF'
services:
  deploy:
    command:
      - |
        : "$${CF_PAGES_PROJECT:?required}"
        JSON="$$(wrangler pages project list --json)"
EOF

  cat >"${FAKE_ROOT}/Makefile" <<'EOF'
HOST_PWD ?= $(PWD)
qa:
	docker run --rm -v "$$(pwd):/app:ro" alpine:3.20 ls
EOF

  cat >"${FAKE_ROOT}/backend/Makefile" <<'EOF'
HOST_PWD ?= $(CURDIR)
qa:
	docker run --rm -v "$$(pwd):/app:ro" -v "$$(PWD):/src:ro" alpine:3.20 ls
EOF

  cat >"${FAKE_ROOT}/frontend/Makefile.example" <<'EOF'
# qa-make-curdir-ok
HOST_PWD ?= $(PWD)
EOF

  run env PATH="${FAKE_BIN}" LC_ALL=C bash "${FAKE_ROOT}/scripts/auditar-infra.sh" --static-only
  assert_success
  assert_output --partial "sin hallazgos"
}

@test "auditar-infra.sh --static-only (Degradado QA-CI-ESCAPE-01): falla con exit 1 ante doble dolar en GitHub Actions" {
  mkdir -p "${FAKE_ROOT}/.github/workflows"
  cat >"${FAKE_ROOT}/.github/workflows/00-iac-audit.yml" <<'EOF'
name: IaC Audit
jobs:
  trivy:
    steps:
      - run: docker run --rm -u "$$(id -u):$$(id -g)" -v "$$(pwd):/workspace:ro" aquasec/trivy:latest config .
EOF

  run env PATH="${FAKE_BIN}" LC_ALL=C bash "${FAKE_ROOT}/scripts/auditar-infra.sh" --static-only
  assert_failure 1
  assert_output --partial "QA-CI-ESCAPE-01"
  assert_output --partial "00-iac-audit.yml:5"
}

@test "auditar-infra.sh --static-only (Degradado QA-MAKE-CURDIR-01): falla con exit 1 ante PWD en sub-Makefile" {
  mkdir -p "${FAKE_ROOT}/backend"
  cat >"${FAKE_ROOT}/backend/Makefile" <<'EOF'
HOST_PWD ?= $(PWD)
EOF

  run env PATH="${FAKE_BIN}" LC_ALL=C bash "${FAKE_ROOT}/scripts/auditar-infra.sh" --static-only
  assert_failure 1
  assert_output --partial "QA-MAKE-CURDIR-01"
  assert_output --partial "backend/Makefile:1"
}

@test "auditar-infra.sh --static-only (Repo real): verifica los workflows y sub-Makefiles reales de qa-testing-blueprints" {
  run env LC_ALL=C bash "${AUDIT_SCRIPT}" --static-only
  assert_success
  assert_output --partial "sin hallazgos"
}

@test "auditar-infra.sh --force: pasa --config .trivy.yaml y --severity HIGH,CRITICAL en Trivy config y fs con imagen fijada" {
  mkdir -p "${FAKE_ROOT}/vendor/laravel/sail/runtimes/8.5"
  cat >"${FAKE_ROOT}/vendor/laravel/sail/runtimes/8.5/Dockerfile" <<'EOF'
FROM ubuntu:latest
USER root
EOF
  printf '{"packages":[]}\n' >"${FAKE_ROOT}/composer.lock"
  cp "${REPO_ROOT}/.trivy.yaml" "${FAKE_ROOT}/.trivy.yaml"

  DOCKER_LOG="${BATS_TEST_TMPDIR}/docker_calls.log"
  cat >"${FAKE_BIN}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "${DOCKER_LOG}"
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"

  run env PATH="${FAKE_BIN}" LC_ALL=C bash "${FAKE_ROOT}/scripts/auditar-infra.sh" --force
  assert_success
  assert_output --partial "IaC (HIGH/CRIT=0) y File System (HIGH/CRIT=0) verificados sin hallazgos"

  run cat "${DOCKER_LOG}"
  assert_success
  [[ "${output}" =~ aquasec/trivy:[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}[[:space:]]+config[[:space:]]+\.[[:space:]]+--quiet[[:space:]]+--config[[:space:]]+\.trivy\.yaml[[:space:]]+--severity[[:space:]]+HIGH,CRITICAL[[:space:]]+--exit-code[[:space:]]+1 ]]
  [[ "${output}" =~ aquasec/trivy:[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}[[:space:]]+fs[[:space:]]+\.[[:space:]]+--quiet[[:space:]]+--scanners[[:space:]]+vuln[[:space:]]+--config[[:space:]]+\.trivy\.yaml ]]
  assert_output --partial "/qa-11x-trivy:/tmp/trivy-cache"
  refute_output --partial "qa11x_trivy_cache:/tmp/trivy-cache"
  assert_output --partial "--timeout 10m --severity HIGH,CRITICAL --exit-code 1"
  refute_output --partial "--severity CRITICAL"
}

@test "auditar-infra.sh --force: usa --skip-dirs de respaldo cuando falta .trivy.yaml" {
  DOCKER_LOG="${BATS_TEST_TMPDIR}/docker_fallback_calls.log"
  cat >"${FAKE_BIN}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "${DOCKER_LOG}"
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"

  run env PATH="${FAKE_BIN}" LC_ALL=C bash "${FAKE_ROOT}/scripts/auditar-infra.sh" --force
  assert_success

  run cat "${DOCKER_LOG}"
  assert_success
  assert_output --partial "config . --quiet --skip-dirs node_modules,.git,dist,target,graphify-out,vendor,.venv --severity HIGH,CRITICAL --exit-code 1"
  assert_output --partial "fs . --quiet --scanners vuln --skip-dirs node_modules,.git,dist,target,graphify-out,vendor,.venv"

  : >"${DOCKER_LOG}"
  touch "${BATS_TEST_TMPDIR}/trivy_ro_blocker"
  run env PATH="${FAKE_BIN}" QA11X_TRIVY_CACHE_DIR="${BATS_TEST_TMPDIR}/trivy_ro_blocker/sub" LC_ALL=C bash "${FAKE_ROOT}/scripts/auditar-infra.sh" --force
  assert_success
  run grep -F ".qa11x_trivy_cache_" "${DOCKER_LOG}"
  assert_success
}

@test ".trivy.yaml (Repo real): excluye patrones glob **/vendor, **/.venv, **/node_modules, **/mutants sin skip-files ciegos" {
  local trivy_cfg="${REPO_ROOT}/.trivy.yaml"
  [ -f "${trivy_cfg}" ]

  run cat "${trivy_cfg}"
  assert_success
  assert_output --partial "skip-dirs:"
  assert_output --partial "**/node_modules"
  assert_output --partial "**/.git"
  assert_output --partial "**/dist"
  assert_output --partial "**/target"
  assert_output --partial "**/graphify-out"
  assert_output --partial "**/vendor"
  assert_output --partial "**/.venv"
  assert_output --partial "**/mutants"
  refute_output --partial "skip-files:"
  refute_output --partial "mcp-server/docker-compose.qa.yml"
}

@test "Makefile test-frontend-blueprints (F1.1): propaga fallo de lint_test_antipatterns con && (sin ; echo)" {
  local makefile_path="${REPO_ROOT}/Makefile"
  [ -f "${makefile_path}" ]

  run awk '
    /^test-frontend-blueprints:/ { in_target=1 }
    in_target && /^[a-zA-Z0-9_-]+:/ && $0 !~ /^test-frontend-blueprints:/ { exit }
    in_target { print }
  ' "${makefile_path}"
  assert_success
  assert_output --partial "lint_test_antipatterns.py vue3 react-frontend) &&"
  refute_output --partial "lint_test_antipatterns.py vue3 react-frontend);"

  cat >"${FAKE_BIN}/docker" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "${FAKE_BIN}/docker"

  local extracted
  extracted="$(awk '
    /^test-frontend-blueprints:/ { in_target=1 }
    in_target && /lint_out=\$\$\(/ { cap=1 }
    cap { gsub(/\$\$/, "$"); gsub(/^\t+/, ""); line=$0; if (/echo /) { sub(/;[[:space:]]*\\$/, "", line); print line; exit } print line }
  ' "${makefile_path}")"
  [ -n "${extracted}" ]

  run env PATH="${FAKE_BIN}:${PATH}" bash -c "${extracted}"
  assert_failure 1
  refute_output --partial "✅ [test-frontend-blueprints]"
}

@test "qa-11x-pr-check action.yml (F1.2/F1.3): declara trap verdict=FAIL, SKIPPED y rama if/else en npm lint" {
  local action_yml="${REPO_ROOT}/.github/actions/qa-11x-pr-check/action.yml"
  [ -f "${action_yml}" ]

  run cat "${action_yml}"
  assert_success
  assert_output --partial "Final proportional gate verdict (PASS | FAIL | SKIPPED)"
  assert_output --partial "default: 'auto'"
  assert_output --partial "auto|en|es)"
  assert_output --partial "Allowed: auto | en | es."
  assert_output --partial "trap write_gate_verdict EXIT"
  assert_output --partial 'verdict="FAIL"'
  assert_output --partial "if [ -d node_modules/.bin ]; then npm run lint || exit 1;"
  refute_output --partial "npm run lint || echo"
}

@test "qa-11x-pr-check action.yml (F1.2/F1.3 comportamiento): propaga FAIL, reporta SKIPPED y PASS en outputs" {
  local action_yml="${REPO_ROOT}/.github/actions/qa-11x-pr-check/action.yml"
  local gate_script="${BATS_TEST_TMPDIR}/run_gates.sh"

  python3 - "${action_yml}" "${gate_script}" <<'PY'
import sys
from pathlib import Path

lines = Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
in_step = False
in_run = False
body = []
for line in lines:
    if "id: run-proportional-gates" in line:
        in_step = True
        continue
    if in_step and not in_run and line.strip() == "run: |":
        in_run = True
        continue
    if in_run:
        if line == "" or line.startswith("        "):
            body.append(line[8:] if len(line) >= 8 else "")
        else:
            break
assert body, "No run block extracted from action.yml"
Path(sys.argv[2]).write_text("\n".join(body) + "\n", encoding="utf-8")
PY

  local work="${BATS_TEST_TMPDIR}/pr_repo"
  mkdir -p "${work}/node_modules/.bin"
  printf '{"name":"demo","scripts":{"lint":"eslint ."}}\n' >"${work}/package.json"

  cat >"${FAKE_BIN}/docker" <<'EOF'
#!/usr/bin/env bash
for arg in "$@"; do
  if [ "${arg}" = "node:test" ]; then
    shift
    while [ $# -gt 0 ]; do
      if [ "$1" = "node:test" ]; then
        shift
        exec "$@"
      fi
      shift
    done
  fi
done
echo "✔ [stub] ok"
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"

  cat >"${FAKE_BIN}/npm" <<'EOF'
#!/usr/bin/env bash
echo "ESLint violation" >&2
exit 1
EOF
  chmod +x "${FAKE_BIN}/npm"

  local out_fail="${BATS_TEST_TMPDIR}/out_fail.txt"
  local sum_fail="${BATS_TEST_TMPDIR}/sum_fail.md"
  run env PATH="${FAKE_BIN}:${PATH}" \
    INPUT_TIER=standard INPUT_LANG=en INPUT_WORKDIR="${work}" \
    INPUT_PYTHON_IMAGE="py:test" INPUT_NODE_IMAGE="node:test" \
    BLAST_PLAN_TIER="pr-targeted" SAVINGS_PCT="50" \
    GITHUB_OUTPUT="${out_fail}" GITHUB_STEP_SUMMARY="${sum_fail}" \
    bash "${gate_script}"
  assert_failure 1
  run cat "${out_fail}"
  assert_output --partial "verdict=FAIL"
  run cat "${sum_fail}"
  assert_output --partial "**FAIL**"

  rm -rf "${work}/node_modules"
  local out_skip="${BATS_TEST_TMPDIR}/out_skip.txt"
  local sum_skip="${BATS_TEST_TMPDIR}/sum_skip.md"
  run env PATH="${FAKE_BIN}:${PATH}" \
    INPUT_TIER=standard INPUT_LANG=en INPUT_WORKDIR="${work}" \
    INPUT_PYTHON_IMAGE="py:test" INPUT_NODE_IMAGE="node:test" \
    BLAST_PLAN_TIER="pr-targeted" SAVINGS_PCT="50" \
    GITHUB_OUTPUT="${out_skip}" GITHUB_STEP_SUMMARY="${sum_skip}" \
    bash "${gate_script}"
  assert_success
  assert_output --partial "⚠️ [SKIPPED] npm lint omitted (no node_modules)"
  run cat "${out_skip}"
  assert_output --partial "verdict=SKIPPED"
  run cat "${sum_skip}"
  assert_output --partial "**SKIPPED**"

  local out_docs="${BATS_TEST_TMPDIR}/out_docs.txt"
  local sum_docs="${BATS_TEST_TMPDIR}/sum_docs.md"
  run env PATH="${FAKE_BIN}:${PATH}" \
    INPUT_TIER=standard INPUT_LANG=en INPUT_WORKDIR="${work}" \
    INPUT_PYTHON_IMAGE="py:test" INPUT_NODE_IMAGE="node:test" \
    BLAST_PLAN_TIER="docs-only" SAVINGS_PCT="85" \
    GITHUB_OUTPUT="${out_docs}" GITHUB_STEP_SUMMARY="${sum_docs}" \
    bash "${gate_script}"
  assert_success
  run cat "${out_docs}"
  assert_output --partial "verdict=PASS"
  run cat "${sum_docs}"
  assert_output --partial "**PASS**"

  local out_pass="${BATS_TEST_TMPDIR}/out_pass.txt"
  local sum_pass="${BATS_TEST_TMPDIR}/sum_pass.md"
  run env PATH="${FAKE_BIN}:${PATH}" \
    INPUT_TIER=starter INPUT_LANG=en INPUT_WORKDIR="${work}" \
    INPUT_PYTHON_IMAGE="py:test" INPUT_NODE_IMAGE="node:test" \
    BLAST_PLAN_TIER="pr-targeted" SAVINGS_PCT="50" \
    GITHUB_OUTPUT="${out_pass}" GITHUB_STEP_SUMMARY="${sum_pass}" \
    bash "${gate_script}"
  assert_success
  run cat "${out_pass}"
  assert_output --partial "verdict=PASS"
  run cat "${sum_pass}"
  assert_output --partial "**PASS**"

  mkdir -p "${work}/.agents/scripts"
  cat >"${work}/.agents/scripts/certify_task_completion.sh" <<'EOF'
#!/usr/bin/env bash
echo "[WARN] CERTIFY-STATE | 9/10 PASS, 1 SKIPPED, 0 FAIL"
EOF
  chmod +x "${work}/.agents/scripts/certify_task_completion.sh"

  local out_docs_ent="${BATS_TEST_TMPDIR}/out_docs_ent.txt"
  local sum_docs_ent="${BATS_TEST_TMPDIR}/sum_docs_ent.md"
  run env PATH="${FAKE_BIN}:${PATH}" \
    INPUT_TIER=enterprise INPUT_LANG=en INPUT_WORKDIR="${work}" \
    INPUT_PYTHON_IMAGE="py:test" INPUT_NODE_IMAGE="node:test" \
    BLAST_PLAN_TIER="pr-targeted" SAVINGS_PCT="50" \
    GITHUB_OUTPUT="${out_docs_ent}" GITHUB_STEP_SUMMARY="${sum_docs_ent}" \
    bash "${gate_script}"
  assert_success
  run cat "${out_docs_ent}"
  assert_output --partial "verdict=SKIPPED"
  run cat "${sum_docs_ent}"
  assert_output --partial "**SKIPPED**"

  local out_docs_ent2="${BATS_TEST_TMPDIR}/out_docs_ent2.txt"
  local sum_docs_ent2="${BATS_TEST_TMPDIR}/sum_docs_ent2.md"
  run env PATH="${FAKE_BIN}:${PATH}" \
    INPUT_TIER=enterprise INPUT_LANG=en INPUT_WORKDIR="${work}" \
    INPUT_PYTHON_IMAGE="py:test" INPUT_NODE_IMAGE="node:test" \
    BLAST_PLAN_TIER="docs-only" SAVINGS_PCT="85" \
    GITHUB_OUTPUT="${out_docs_ent2}" GITHUB_STEP_SUMMARY="${sum_docs_ent2}" \
    bash "${gate_script}"
  assert_success
  run cat "${out_docs_ent2}"
  assert_output --partial "verdict=PASS"
  run cat "${sum_docs_ent2}"
  assert_output --partial "**PASS**"
}

@test "auditar-infra.sh: propaga fallo exit 1 si Trivy config o Trivy fs detectan HIGH/CRITICAL" {
  cat >"${FAKE_BIN}/docker" <<'EOF'
#!/usr/bin/env bash
for arg in "$@"; do
  if [ "${arg}" = "config" ] && [ "${MOCK_TRIVY_STAGE_FAIL:-}" = "config" ]; then
    echo "HIGH: Misconfig simulated"
    exit 1
  fi
  if [ "${arg}" = "fs" ] && [ "${MOCK_TRIVY_STAGE_FAIL:-}" = "fs" ]; then
    echo "CRITICAL: CVE simulated"
    exit 1
  fi
done
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"
  printf 'all:\n\techo ok\n' >"${FAKE_ROOT}/Makefile"
  rm -rf "${FAKE_ROOT}/.agents/.cache/trivy" 2>/dev/null || true

  run env PATH="${FAKE_BIN}" MOCK_TRIVY_STAGE_FAIL=config LC_ALL=C bash "${FAKE_ROOT}/scripts/auditar-infra.sh" --force
  assert_failure 1
  assert_output --partial "[Trivy IaC] Misconfiguraciones HIGH/CRITICAL detectadas"

  run env PATH="${FAKE_BIN}" MOCK_TRIVY_STAGE_FAIL=fs LC_ALL=C bash "${FAKE_ROOT}/scripts/auditar-infra.sh" --force
  assert_failure 1
  assert_output --partial "[Trivy FS] Vulnerabilidades HIGH/CRITICAL detectadas"
}

@test "auditar-infra.sh: crea cache diaria SHA-256 y omite Trivy en segunda corrida sin --force" {
  local docker_calls="${BATS_TEST_TMPDIR}/trivy_cache_calls.log"
  : >"${docker_calls}"
  cat >"${FAKE_BIN}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${docker_calls}"
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"
  printf 'all:\n\techo clean\n' >"${FAKE_ROOT}/Makefile"
  rm -rf "${FAKE_ROOT}/.agents/.cache/trivy" 2>/dev/null || true

  run env PATH="${FAKE_BIN}" LC_ALL=C bash "${FAKE_ROOT}/scripts/auditar-infra.sh"
  assert_success
  refute_output --partial "(caché SHA-256)"
  [ "$(wc -l <"${docker_calls}")" -eq 2 ]
  [ -d "${FAKE_ROOT}/.agents/.cache/trivy" ]

  : >"${docker_calls}"
  run env PATH="${FAKE_BIN}" LC_ALL=C bash "${FAKE_ROOT}/scripts/auditar-infra.sh"
  assert_success
  assert_output --partial "(caché SHA-256)"
  [ "$(wc -l <"${docker_calls}")" -eq 0 ]

  rm -rf "${FAKE_ROOT}/.agents/.cache/trivy" 2>/dev/null || true
}

@test "docker-compose.qa.yml, Makefile y action.yml cumplen invariantes de UID, digest Karate y --network none" {
  run grep -F 'user: "${QA_UID:-1000}:${QA_GID:-1000}"' "${REPO_ROOT}/docker-compose.qa.yml"
  assert_success

  run grep -E 'KARATE_IMG := sinfallas/karatelabs:[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}' "${REPO_ROOT}/Makefile"
  assert_success

  run grep -F 'git diff --relative --name-only' "${REPO_ROOT}/.github/actions/qa-11x-pr-check/action.yml"
  assert_success
  run grep -F '${PR_BASE_SHA}...${PR_HEAD_SHA}' "${REPO_ROOT}/.github/actions/qa-11x-pr-check/action.yml"
  assert_success
  run grep -F '^qa-lint:' "${REPO_ROOT}/.github/actions/qa-11x-pr-check/action.yml"
  assert_success
  run grep -F '@sinfallas/mcp-qa-11x@3.2.0' "${REPO_ROOT}/.github/actions/qa-11x-pr-check/action.yml"
  assert_success
  run grep -F 'mktemp -d' "${REPO_ROOT}/.github/actions/qa-11x-pr-check/action.yml"
  assert_success
  run grep -F '"verdict"[[:space:]]*:[[:space:]]*"SKIPPED"' "${REPO_ROOT}/.github/actions/qa-11x-pr-check/action.yml"
  assert_success
  run grep -F 'pnpm_config_manage_package_manager_versions=false' "${REPO_ROOT}/Makefile"
  assert_success
  run grep -F 'pull_request_target' "${REPO_ROOT}/.github/actions/qa-11x-pr-check/action.yml"
  assert_success
  run grep -F 'sarif-path' "${REPO_ROOT}/.github/actions/qa-11x-pr-check/action.yml"
  assert_success
  run grep -F -- '--network none' "${REPO_ROOT}/Makefile"
  assert_success
  run grep -F -- '--network none' "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh"
  assert_success
  run grep -F -- 'wf_files=(' "${REPO_ROOT}/Makefile"
  assert_failure
  run grep -F -- '${cmd//' "${REPO_ROOT}/Makefile"
  assert_failure
  if command -v make >/dev/null 2>&1; then
    run sh -c 'make -C "'"${REPO_ROOT}"'" -n lint-workflows | /bin/sh -n'
    assert_success
    run sh -c 'make -C "'"${REPO_ROOT}"'" -n test-ai-offline | /bin/sh -n'
    assert_success
  fi
}

@test "auditar-infra.sh: usa shasum -a 256 cuando sha256sum no esta disponible" {
  local no_sha256_bin="${BATS_TEST_TMPDIR}/no_sha256_bin"
  local real_sha256sum
  real_sha256sum="$(command -v sha256sum)"
  mkdir -p "${no_sha256_bin}"
  for tool in bash dirname cd pwd find awk sort xargs id rm touch mkdir chmod date; do
    resolved="$(command -v "${tool}" || true)"
    [ -n "${resolved}" ] && ln -sf "${resolved}" "${no_sha256_bin}/${tool}"
  done
  cat >"${no_sha256_bin}/shasum" <<EOF
#!/usr/bin/env bash
if [ "\${1:-}" = "-a" ] && [ "\${2:-}" = "256" ]; then
  shift 2
  exec "${real_sha256sum}" "\$@"
fi
exit 1
EOF
  cat >"${no_sha256_bin}/docker" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "${no_sha256_bin}/shasum" "${no_sha256_bin}/docker"

  printf 'all:\n\techo ok\n' >"${FAKE_ROOT}/Makefile"
  rm -rf "${FAKE_ROOT}/.agents/.cache/trivy" 2>/dev/null || true

  run env PATH="${no_sha256_bin}" LC_ALL=C bash "${FAKE_ROOT}/scripts/auditar-infra.sh"
  assert_success
  assert_output --partial "sin hallazgos"
  [ -d "${FAKE_ROOT}/.agents/.cache/trivy" ]

  rm -rf "${FAKE_ROOT}/.agents/.cache/trivy" 2>/dev/null || true
}
