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

  # Sin docker-compose.qa.yml no invoca docker compose y sale con 0
  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}"
  assert_success
  [ ! -d "${work_dir}/coverage_report" ]
  [ ! -d "${work_dir}/.pytest_cache" ]
  [ "$(mock_get_call_num "${mock_docker}")" -eq 0 ]

  touch "${work_dir}/docker-compose.qa.yml"
  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}"
  assert_success
  assert_output --partial "Contenedores QA detenidos"

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}"
  assert_failure 1
  assert_output --partial "Error simulado de Docker"
}

@test "clean_artifacts.sh emite metrica HTTPS con --tlsv1.2 y normaliza esquema/host mayuscula" {
  work_dir="${BATS_TEST_TMPDIR}/push-work"
  mkdir -p "${work_dir}/coverage_report"
  touch "${work_dir}/docker-compose.qa.yml"

  mock_docker="$(mock_create)"
  mock_set_status "${mock_docker}" 0 1
  mock_set_status "${mock_docker}" 0 2
  mock_curl="$(mock_create)"
  mock_set_status "${mock_curl}" 0 1
  mock_set_status "${mock_curl}" 0 2

  ln -s "${mock_docker}" "${BATS_TEST_TMPDIR}/docker"
  ln -s "${mock_curl}" "${BATS_TEST_TMPDIR}/curl"
  PATH="${BATS_TEST_TMPDIR}:$PATH"

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "https://pushgateway:9091"
  assert_success
  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "HTTPS://PushGateway:9091/Custom/"
  assert_success

  [ "$(mock_get_call_num "${mock_curl}")" -eq 2 ]
  assert_equal "$(mock_get_call_args "${mock_curl}" 1 | grep -c -- '--tlsv1.2')" "1"
  assert_equal "$(mock_get_call_args "${mock_curl}" 2 | grep -c -- 'https://pushgateway:9091/Custom/metrics/job/bash_scripts')" "1"
}

@test "clean_artifacts.sh permite HTTP local (incluyendo mayusculas y [::1]) con --proto =http" {
  work_dir="${BATS_TEST_TMPDIR}/push-local"
  mkdir -p "${work_dir}/coverage_report"

  mock_curl="$(mock_create)"
  mock_set_status "${mock_curl}" 0 1
  mock_set_status "${mock_curl}" 0 2
  mock_set_status "${mock_curl}" 0 3
  mock_set_status "${mock_curl}" 0 4
  ln -s "${mock_curl}" "${BATS_TEST_TMPDIR}/curl"
  PATH="${BATS_TEST_TMPDIR}:$PATH"

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "http://pushgateway:9091"
  assert_success
  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "http://127.0.0.1:9091"
  assert_success
  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "http://[::1]:9091/custom/"
  assert_success
  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "HTTP://LOCALHOST:9091"
  assert_success

  [ "$(mock_get_call_num "${mock_curl}")" -eq 4 ]
  assert_equal "$(mock_get_call_args "${mock_curl}" 1 | grep -c -- '=http')" "1"
  assert_equal "$(mock_get_call_args "${mock_curl}" 1 | grep -c -- '--tlsv1.2')" "0"
  assert_equal "$(mock_get_call_args "${mock_curl}" 3 | grep -c -- 'http://\[::1\]:9091/custom/metrics/job/bash_scripts')" "1"
  assert_equal "$(mock_get_call_args "${mock_curl}" 4 | grep -c -- 'http://localhost:9091/metrics/job/bash_scripts')" "1"
}

@test "clean_artifacts.sh bloquea bypass con userinfo @, autoridad malformada, query/fragmento y backslashes sin invocar curl" {
  work_dir="${BATS_TEST_TMPDIR}/push-ssrf"
  mkdir -p "${work_dir}/coverage_report"

  mock_curl="$(mock_create)"
  mock_set_status "${mock_curl}" 0 1
  ln -s "${mock_curl}" "${BATS_TEST_TMPDIR}/curl"
  PATH="${BATS_TEST_TMPDIR}:$PATH"

  for bad_url in \
    "http://localhost:pass@evil.com:9091/" \
    "http://127.0.0.1:80@evil.com:9091" \
    "http://[::1]:pass@evil.com:9091" \
    "http://pushgateway:x@169.254.169.254/" \
    "https://user:pass@pushgateway:9091" \
    "http://" \
    "http://[::1" \
    "http://[::1][::2]" \
    "http://localhost:9091:80" \
    "http://localhost]evil:9091" \
    "http://localhost?foo=bar" \
    "http://localhost#frag" \
    "http://pushgateway:9091?x=1" \
    "http://localhost\\@evil.com:9091"; do
    run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "${bad_url}"
    assert_failure 1
    assert_output --partial "URL de Pushgateway invalida"
  done

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "http:localhost:9091"
  assert_failure 1
  assert_output --partial "Esquema de Pushgateway invalido"

  [ "$(mock_get_call_num "${mock_curl}")" -eq 0 ]
}

@test "clean_artifacts.sh rechaza HTTP externo o esquema invalido y permite override con --allow-insecure-local" {
  work_dir="${BATS_TEST_TMPDIR}/push-policy"
  mkdir -p "${work_dir}/coverage_report"

  mock_curl="$(mock_create)"
  mock_set_status "${mock_curl}" 0 1
  ln -s "${mock_curl}" "${BATS_TEST_TMPDIR}/curl"
  PATH="${BATS_TEST_TMPDIR}:$PATH"

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "http://example.com:9091"
  assert_failure 1
  assert_output --partial "Pushgateway HTTP bloqueado"
  [ "$(mock_get_call_num "${mock_curl}")" -eq 0 ]

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "file:///tmp/x"
  assert_failure 1
  assert_output --partial "Esquema de Pushgateway invalido"
  [ "$(mock_get_call_num "${mock_curl}")" -eq 0 ]

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "http://example.com:9091" --allow-insecure-local
  assert_success
  [ "$(mock_get_call_num "${mock_curl}")" -eq 1 ]
}

@test "clean_artifacts.sh falla con codigo 1 cuando curl falta o falla en --pushgateway-url explicito" {
  work_dir="${BATS_TEST_TMPDIR}/push-fail"
  no_curl_bin="${BATS_TEST_TMPDIR}/nocurl_bin"
  mkdir -p "${work_dir}/coverage_report" "${no_curl_bin}"
  for tool in bash rm cat printf; do
    resolved="$(command -v "${tool}")"
    ln -sf "${resolved}" "${no_curl_bin}/${tool}"
  done

  run env PATH="${no_curl_bin}" bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "http://pushgateway:9091"
  assert_failure 1
  assert_output --partial "curl es requerido"

  mock_curl="$(mock_create)"
  mock_set_status "${mock_curl}" 1 1
  ln -s "${mock_curl}" "${BATS_TEST_TMPDIR}/curl"
  PATH="${BATS_TEST_TMPDIR}:$PATH"

  run bash "${BASH_STACK_DIR}/clean_artifacts.sh" --target "${work_dir}" --pushgateway-url "http://pushgateway:9091"
  assert_failure 1
  assert_output --partial "Error al enviar metrica a Pushgateway"
}
