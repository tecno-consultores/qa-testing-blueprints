#!/usr/bin/env bats
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
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"
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
