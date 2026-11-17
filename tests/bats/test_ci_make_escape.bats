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
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"
  fi
  AUDIT_SCRIPT="${REPO_ROOT}/scripts/auditar-infra.sh"

  FAKE_ROOT="${BATS_TEST_TMPDIR}/workspace"
  FAKE_BIN="${BATS_TEST_TMPDIR}/bin"

  mkdir -p "${FAKE_ROOT}/scripts" "${FAKE_BIN}"
  cp "${AUDIT_SCRIPT}" "${FAKE_ROOT}/scripts/auditar-infra.sh"
  chmod +x "${FAKE_ROOT}/scripts/auditar-infra.sh"

  for tool in bash dirname cd pwd find awk sort xargs sha256sum rm touch; do
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
  local pinned_img="aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb"
  assert_output --partial "${pinned_img} config . --quiet --config .trivy.yaml --severity HIGH,CRITICAL --exit-code 1"
  assert_output --partial "${pinned_img} fs . --quiet --scanners vuln --config .trivy.yaml"
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
}

@test ".trivy.yaml (Repo real): excluye patrones glob **/vendor, **/.venv, **/node_modules, **/mutants y compose QA" {
  local trivy_cfg="${BATS_TEST_DIRNAME}/../../.trivy.yaml"
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
  assert_output --partial "skip-files:"
  assert_output --partial "docker-compose.qa.yml"
  assert_output --partial "mcp-server/docker-compose.qa.yml"
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
  assert_output --partial "verdict=SKIPPED"

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
}
