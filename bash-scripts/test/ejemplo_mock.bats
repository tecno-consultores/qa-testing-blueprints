#!/usr/bin/env bats
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

setup() {
  # Evita "id: cannot find name for user ID <UID>" en bats-mock bajo UIDs sin /etc/passwd (CI 1001, macOS 501)
  export _USER="${_USER:-$(id -un 2>/dev/null || id -u)}"
  # Carga las librerías preinstaladas en la imagen sinfallas/base-bash-qa
  load '/opt/bats-libs/bats-support/load.bash'
  load '/opt/bats-libs/bats-assert/load.bash'
  load '/opt/bats-libs/bats-mock/load.bash'
  BASH_STACK_DIR="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"
  export BASH_STACK_DIR
}

@test "clean_artifacts.sh muestra ayuda (--help) sin requerir Docker" {
  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --help
  assert_success
  assert_output --partial "clean_artifacts.sh"
}

@test "clean_artifacts.sh soporta --dry-run y rechaza opciones o rutas invalidas" {
  work_dir="${BATS_TEST_TMPDIR}/dry-work"
  mkdir -p "${work_dir}/coverage_report"
  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --dry-run
  assert_success
  assert_output --partial "[DRY-RUN]"
  [ -d "${work_dir}/coverage_report" ]

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --unknown-flag
  assert_failure 2

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${BATS_TEST_TMPDIR}/missing"
  assert_failure 1
}

@test "clean_artifacts.sh purga artefactos y propaga error cuando docker compose falla (bats-mock)" {
  work_dir="${BATS_TEST_TMPDIR}/live-work"
  mkdir -p "${work_dir}/coverage_report" "${work_dir}/.pytest_cache"

  mock_docker="$(mock_create)"
  mock_set_status "${mock_docker}" 0 1
  mock_set_output "${mock_docker}" "Contenedores QA detenidos" 1
  mock_set_status "${mock_docker}" 1 2
  mock_set_output "${mock_docker}" "Error simulado de Docker" 2

  ln -s "${mock_docker}" "${BATS_TEST_TMPDIR}/docker"
  PATH="${BATS_TEST_TMPDIR}:$PATH"

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}"
  assert_success
  assert_output --partial "Contenedores QA detenidos"
  [ ! -d "${work_dir}/coverage_report" ]
  [ ! -d "${work_dir}/.pytest_cache" ]

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}"
  assert_failure 1
  assert_output --partial "Error simulado de Docker"
}
