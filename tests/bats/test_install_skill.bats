#!/usr/bin/env bats
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

setup() {
  load '/opt/bats-libs/bats-support/load.bash'
  load '/opt/bats-libs/bats-assert/load.bash'
  load '/opt/bats-libs/bats-mock/load.bash'

  if [ -f "${BATS_TEST_DIRNAME}/../../scripts/install-skill.sh" ]; then
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  elif [ -f "/repo/scripts/install-skill.sh" ]; then
    REPO_ROOT="/repo"
  else
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"
  fi
  INSTALL_SCRIPT="${REPO_ROOT}/scripts/install-skill.sh"
}

@test "install-skill.sh: --help muestra ayuda y retorna 0" {
  run sh "${INSTALL_SCRIPT}" --help
  assert_success
  assert_output --partial "Instalador Universal de Skills QA 11X"
  assert_output --partial "--include-scripts"
}

@test "install-skill.sh: --target sin argumento o valor inválido falla con código 1" {
  run sh "${INSTALL_SCRIPT}" --target
  assert_failure 1
  assert_output --partial "requiere un argumento"

  run sh "${INSTALL_SCRIPT}" --target agente_inexistente
  assert_failure 1
  assert_output --partial "inválido"
}

@test "install-skill.sh: instalación exitosa con --include-scripts excluye publicar-mcp.sh" {
  TEST_DIR="${BATS_TEST_TMPDIR}/workspace_test"
  mkdir -p "${TEST_DIR}"

  cd "${TEST_DIR}"
  export QA_BLUEPRINTS_LOCAL_PATH="${REPO_ROOT}"
  run sh "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_success
  assert_output --partial "Instalación de Skills QA 11X Completada con Éxito"

  [ -f "${TEST_DIR}/.agents/skills/qa-11x-architect/SKILL.md" ]
  [ -f "${TEST_DIR}/.agents/skills/qa-11x-architect/references/01-core-13-layers.md" ]
  [ -f "${TEST_DIR}/.agents/skills/refactoring-ui/SKILL.md" ]
  [ -f "${TEST_DIR}/.agents/scripts/certify_task_completion.sh" ]
  [ ! -f "${TEST_DIR}/scripts/publicar-mcp.sh" ]
}
