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
