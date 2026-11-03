#!/usr/bin/env bats
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

setup() {
  load '/opt/bats-libs/bats-support/load.bash'
  load '/opt/bats-libs/bats-assert/load.bash'
  load '/opt/bats-libs/bats-mock/load.bash'

  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  INSTALL_SCRIPT="${REPO_ROOT}/scripts/install-skill.sh"
}

@test "install-skill.sh: --help muestra ayuda y retorna 0" {
  run sh "${INSTALL_SCRIPT}" --help
  assert_success
  assert_output --partial "Instalador Universal de Skills QA 11X"
  assert_output --partial "--target"
}

@test "install-skill.sh: --target sin argumento falla con código 1" {
  run sh "${INSTALL_SCRIPT}" --target
  assert_failure 1
  assert_output --partial "requiere un argumento"
}

@test "install-skill.sh: instalación exitosa en workspace con repositorio local" {
  TEST_DIR="${BATS_TEST_TMPDIR}/workspace_test"
  mkdir -p "${TEST_DIR}"

  cd "${TEST_DIR}"
  export QA_BLUEPRINTS_LOCAL_PATH="${REPO_ROOT}"
  run sh "${INSTALL_SCRIPT}" --target workspace
  assert_success
  assert_output --partial "Instalación de Skills QA 11X Completada con Éxito"

  [ -f "${TEST_DIR}/.agents/skills/qa-11x-architect/SKILL.md" ]
  [ -f "${TEST_DIR}/.agents/skills/qa-11x-architect/references/01-core-13-layers.md" ]
  [ -f "${TEST_DIR}/.agents/skills/refactoring-ui/SKILL.md" ]
}
