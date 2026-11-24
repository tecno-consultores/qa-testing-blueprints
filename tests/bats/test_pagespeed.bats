# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

setup() {
  load '/opt/bats-libs/bats-support/load.bash'
  load '/opt/bats-libs/bats-assert/load.bash'

  if [ -f "${BATS_TEST_DIRNAME}/../../scripts/auditar-pagespeed.sh" ]; then
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  elif [ -f "/repo/scripts/auditar-pagespeed.sh" ]; then
    REPO_ROOT="/repo"
  else
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  fi
  PSI_SCRIPT="${REPO_ROOT}/scripts/auditar-pagespeed.sh"
}

@test "auditar-pagespeed.sh (Virgen / Sin URL): retorna exit 0 SKIPPED sin falsos fallos" {
  run env -u PSI_URL -u PAGESPEED_API_KEY LC_ALL=C bash "${PSI_SCRIPT}"
  assert_success
  assert_output --partial "SKIPPED"
  assert_output --partial "MISSING_TARGET_URL"
}

@test "auditar-pagespeed.sh (Degradado SSRF / Loopback): bloquea http://127.0.0.1:8080 con exit 1" {
  run env LC_ALL=C bash "${PSI_SCRIPT}" --url "http://127.0.0.1:8080"
  assert_failure 1
  assert_output --partial "BLOCKED_SSRF"
}

@test "auditar-pagespeed.sh (--require-url sin URL): falla con exit 2 MISSING_TARGET_URL" {
  run env -u PSI_URL LC_ALL=C bash "${PSI_SCRIPT}" --require-url
  assert_failure 2
  assert_output --partial "MISSING_TARGET_URL"
}

@test "auditar-pagespeed.sh (Nominal Wrapper Docker): invoca imagen pineada con --url y retorna 0" {
  local work="${BATS_TEST_TMPDIR}/psi_nom_ws"
  local fake_bin="${BATS_TEST_TMPDIR}/psi_nom_bin"
  local docker_log="${BATS_TEST_TMPDIR}/psi_docker.log"
  mkdir -p "${work}/scripts" "${work}/.agents/scripts" "${fake_bin}"
  cp "${PSI_SCRIPT}" "${work}/scripts/auditar-pagespeed.sh"
  cp "${REPO_ROOT}/.agents/scripts/audit_pagespeed_insights.py" "${work}/.agents/scripts/audit_pagespeed_insights.py"
  chmod +x "${work}/scripts/auditar-pagespeed.sh"

  cat >"${fake_bin}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >"${docker_log}"
printf '{"status":"PASSED","strategies":[]}\n'
exit 0
EOF
  chmod +x "${fake_bin}/docker"

  local mock_env_key="psi-mock""-env-token"
  run env PATH="${fake_bin}:/usr/bin:/bin" PAGESPEED_API_KEY="${mock_env_key}" LC_ALL=C bash "${work}/scripts/auditar-pagespeed.sh" --url "https://ejemplo-nominal.example" --strategy desktop
  assert_success
  assert_output --partial "PASSED"

  run cat "${docker_log}"
  assert_success
  assert_output --partial "sinfallas/base-python-uv:3.15@sha256:"
  assert_output --partial "--url https://ejemplo-nominal.example"
  assert_output --partial "--strategy desktop"
  assert_output --partial "-e PAGESPEED_API_KEY"
  refute_output --partial "${mock_env_key}"
}

@test "auditar-pagespeed.sh (Degradado): rechaza script ausente y estrategia invalida" {
  local empty_ws="${BATS_TEST_TMPDIR}/psi_missing_ws"
  mkdir -p "${empty_ws}/scripts"
  cp "${PSI_SCRIPT}" "${empty_ws}/scripts/auditar-pagespeed.sh"
  chmod +x "${empty_ws}/scripts/auditar-pagespeed.sh"

  run env LC_ALL=C bash "${empty_ws}/scripts/auditar-pagespeed.sh" --url "https://ejemplo.example"
  assert_failure 1
  assert_output --partial "No se encontró"

  run env LC_ALL=C bash "${PSI_SCRIPT}" --url "https://ejemplo.example" --strategy tablet
  assert_failure 2
}

@test "auditar-pagespeed.sh (Degradado CLI/Docker): rechaza --api-key en argv y docker ausente" {
  run env LC_ALL=C bash "${PSI_SCRIPT}" --url "https://ejemplo.example" --api-key "leaked-arg"
  assert_failure 1
  assert_output --partial "PAGESPEED_API_KEY"

  local no_docker_bin="${BATS_TEST_TMPDIR}/psi_nodocker_bin"
  mkdir -p "${no_docker_bin}"
  for tool in bash dirname id env; do
    resolved="$(command -v "${tool}" || true)"
    [ -n "${resolved}" ] && ln -sf "${resolved}" "${no_docker_bin}/${tool}"
  done
  run env QA11X_DOCKERENV_PATH="/nonexistent" PATH="${no_docker_bin}" LC_ALL=C "${no_docker_bin}/bash" "${PSI_SCRIPT}" --url "https://ejemplo.example"
  assert_failure 1
  assert_output --partial "Se requiere Docker"
}
