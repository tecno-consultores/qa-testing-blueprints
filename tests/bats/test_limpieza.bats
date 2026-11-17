#!/usr/bin/env bats
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

setup() {
  load '/opt/bats-libs/bats-support/load.bash'
  load '/opt/bats-libs/bats-assert/load.bash'
  load '/opt/bats-libs/bats-mock/load.bash'

  if [ -f "${BATS_TEST_DIRNAME}/../../scripts/limpieza.sh" ]; then
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  elif [ -f "/repo/scripts/limpieza.sh" ]; then
    REPO_ROOT="/repo"
  else
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"
  fi
  CLEAN_SCRIPT="${REPO_ROOT}/scripts/limpieza.sh"

  FAKE_ROOT="${BATS_TEST_TMPDIR}/workspace"
  FAKE_HOME="${BATS_TEST_TMPDIR}/home"
  FAKE_TMP="${BATS_TEST_TMPDIR}/tmp"
  FAKE_BIN="${BATS_TEST_TMPDIR}/bin"

  mkdir -p "${FAKE_ROOT}/scripts" "${FAKE_HOME}/.cache" "${FAKE_TMP}" "${FAKE_BIN}"
  cp "${CLEAN_SCRIPT}" "${FAKE_ROOT}/scripts/limpieza.sh"
  chmod +x "${FAKE_ROOT}/scripts/limpieza.sh"

  for tool in bash dirname cd pwd find rm id; do
    resolved="$(command -v "${tool}" || true)"
    if [ -n "${resolved}" ]; then
      ln -sf "${resolved}" "${FAKE_BIN}/${tool}"
    fi
  done
}

@test "limpieza.sh: purga restos de pruebas y basura intrusa preservando invariantes 11X" {
  mkdir -p "${FAKE_ROOT}/allure-results" "${FAKE_ROOT}/.pytest_cache" "${FAKE_ROOT}/.ruff_cache" \
    "${FAKE_ROOT}/.deepeval" "${FAKE_ROOT}/.promptfoo" "${FAKE_ROOT}/src" \
    "${FAKE_ROOT}/mcp-server/dist" "${FAKE_ROOT}/.agents/proposals" "${FAKE_ROOT}/.agents/backups" \
    "${FAKE_ROOT}/.agents/.cache/coverage" "${FAKE_ROOT}/.agents/artifacts" \
    "${FAKE_ROOT}/graphify-out/cache" "${FAKE_TMP}/qa11x-certify.xyz"
  touch "${FAKE_ROOT}/sbom.cyclonedx.json" "${FAKE_ROOT}/.DS_Store" "${FAKE_ROOT}/src/Thumbs.db" \
    "${FAKE_ROOT}/src/edit.swp" "${FAKE_ROOT}/src/old.bak" "${FAKE_ROOT}/ACTIVE_TASK.md" \
    "${FAKE_ROOT}/.agents/.cache/coverage/py.xml" "${FAKE_ROOT}/.agents/artifacts/PR_VERDICT.md" \
    "${FAKE_ROOT}/graphify-out/junk.tmp" "${FAKE_TMP}/qa-11x-last-failure.json"

  echo "// dist" >"${FAKE_ROOT}/mcp-server/dist/index.js"
  echo '{"version":"2.20.3"}' >"${FAKE_ROOT}/.qa-11x-version"
  echo "env: {}" >"${FAKE_ROOT}/zap.yaml"
  echo "# active" >"${FAKE_ROOT}/.agents/ACTIVE_TASK.md"
  echo '{"evidence":true}' >"${FAKE_ROOT}/.agents/.qa-evidence.json"
  echo '{"status":"IN_PROGRESS"}' >"${FAKE_ROOT}/.agents/.cache/session_checkpoint.json"
  echo '{"sessions":{}}' >"${FAKE_ROOT}/.agents/.cache/certify_state.json"
  echo "{}" >"${FAKE_ROOT}/graphify-out/graph.json"
  echo "# report" >"${FAKE_ROOT}/graphify-out/GRAPH_REPORT.md"
  echo "<html/>" >"${FAKE_ROOT}/graphify-out/graph.html"
  echo "{}" >"${FAKE_ROOT}/graphify-out/manifest.json"

  run env HOME="${FAKE_HOME}" TMPDIR="${FAKE_TMP}" PATH="${FAKE_BIN}" LC_ALL=C "${FAKE_ROOT}/scripts/limpieza.sh" --quiet
  assert_success

  [ ! -d "${FAKE_ROOT}/allure-results" ]
  [ ! -d "${FAKE_ROOT}/.pytest_cache" ]
  [ ! -d "${FAKE_ROOT}/.ruff_cache" ]
  [ ! -d "${FAKE_ROOT}/.deepeval" ]
  [ ! -d "${FAKE_ROOT}/.promptfoo" ]
  [ ! -f "${FAKE_ROOT}/sbom.cyclonedx.json" ]
  [ ! -f "${FAKE_ROOT}/.DS_Store" ]
  [ ! -f "${FAKE_ROOT}/src/Thumbs.db" ]
  [ ! -f "${FAKE_ROOT}/src/edit.swp" ]
  [ ! -f "${FAKE_ROOT}/src/old.bak" ]
  [ ! -f "${FAKE_ROOT}/ACTIVE_TASK.md" ]
  [ ! -d "${FAKE_ROOT}/.agents/.cache/coverage" ]
  [ ! -d "${FAKE_ROOT}/.agents/artifacts" ]
  [ ! -f "${FAKE_ROOT}/graphify-out/junk.tmp" ]
  [ ! -d "${FAKE_ROOT}/graphify-out/cache" ]
  [ ! -f "${FAKE_TMP}/qa-11x-last-failure.json" ]
  [ ! -d "${FAKE_TMP}/qa11x-certify.xyz" ]

  [ -f "${FAKE_ROOT}/.agents/ACTIVE_TASK.md" ]
  [ -f "${FAKE_ROOT}/.agents/.cache/session_checkpoint.json" ]
  [ -f "${FAKE_ROOT}/.agents/.cache/certify_state.json" ]
  [ -f "${FAKE_ROOT}/mcp-server/dist/index.js" ]
  [ -f "${FAKE_ROOT}/.qa-11x-version" ]
  [ -f "${FAKE_ROOT}/zap.yaml" ]
  [ -f "${FAKE_ROOT}/graphify-out/graph.json" ]
  [ -f "${FAKE_ROOT}/graphify-out/GRAPH_REPORT.md" ]
  [ -f "${FAKE_ROOT}/graphify-out/graph.html" ]
  [ -f "${FAKE_ROOT}/graphify-out/manifest.json" ]
  [ -f "${FAKE_ROOT}/.agents/.qa-evidence.json" ]
  [ -d "${FAKE_ROOT}/.agents/proposals" ]
}

@test "limpieza.sh --deep: purga proposals, backups, .agents/.cache y .qa-evidence.json preservando .agents/ACTIVE_TASK.md y mcp-server/dist" {
  mkdir -p "${FAKE_ROOT}/mcp-server/dist" "${FAKE_ROOT}/.agents/proposals" "${FAKE_ROOT}/.agents/backups" "${FAKE_ROOT}/.agents/.cache"
  echo "// dist" >"${FAKE_ROOT}/mcp-server/dist/index.js"
  echo "# active" >"${FAKE_ROOT}/.agents/ACTIVE_TASK.md"
  echo '{"evidence":true}' >"${FAKE_ROOT}/.agents/.qa-evidence.json"
  echo '{"status":"IN_PROGRESS"}' >"${FAKE_ROOT}/.agents/.cache/session_checkpoint.json"
  echo "# draft" >"${FAKE_ROOT}/.agents/proposals/p.md"
  echo "bak" >"${FAKE_ROOT}/.agents/backups/b.md"

  run env HOME="${FAKE_HOME}" TMPDIR="${FAKE_TMP}" PATH="${FAKE_BIN}" LC_ALL=C "${FAKE_ROOT}/scripts/limpieza.sh" --quiet --deep
  assert_success

  [ ! -d "${FAKE_ROOT}/.agents/proposals" ]
  [ ! -d "${FAKE_ROOT}/.agents/backups" ]
  [ ! -f "${FAKE_ROOT}/.agents/.qa-evidence.json" ]
  [ ! -d "${FAKE_ROOT}/.agents/.cache" ]
  [ -f "${FAKE_ROOT}/.agents/ACTIVE_TASK.md" ]
  [ -f "${FAKE_ROOT}/mcp-server/dist/index.js" ]
}

@test "limpieza.sh: purga artefactos v3 (playwright-report, .mutmut-cache, .trivycache y mobile-appium)" {
  mkdir -p "${FAKE_ROOT}/playwright-report" "${FAKE_ROOT}/.mutmut-cache" "${FAKE_ROOT}/.trivycache" \
    "${FAKE_ROOT}/mobile-appium/wdio-logs" "${FAKE_ROOT}/mobile-appium/errorShots"
  touch "${FAKE_ROOT}/playwright-report/index.html" "${FAKE_ROOT}/.mutmut-cache/cache.sqlite" \
    "${FAKE_ROOT}/mobile-appium/wdio-logs/wdio.log" "${FAKE_ROOT}/mobile-appium/errorShots/err.png"

  run env HOME="${FAKE_HOME}" TMPDIR="${FAKE_TMP}" PATH="${FAKE_BIN}" LC_ALL=C "${FAKE_ROOT}/scripts/limpieza.sh" --quiet
  assert_success

  [ ! -d "${FAKE_ROOT}/playwright-report" ]
  [ ! -d "${FAKE_ROOT}/.mutmut-cache" ]
  [ ! -d "${FAKE_ROOT}/.trivycache" ]
  [ ! -d "${FAKE_ROOT}/mobile-appium/wdio-logs" ]
  [ ! -d "${FAKE_ROOT}/mobile-appium/errorShots" ]
}

@test "limpieza.sh stacks (mobile-appium, ai-evals, vibe-rescue): purga caches y preserva graphify-out (--quiet y --deep)" {
  cat >"${FAKE_BIN}/docker" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "compose" ] && [ "${2:-}" = "--profile" ]; then
  exit 1
fi
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"

  for stack in mobile-appium ai-evals vibe-rescue; do
    stack_dir="${BATS_TEST_TMPDIR}/stack-${stack}"
    mkdir -p "${stack_dir}/graphify-out/cache" "${stack_dir}/.trivycache" \
      "${stack_dir}/.pytest_cache" "${stack_dir}/wdio-logs" "${stack_dir}/coverage" \
      "${stack_dir}/.agents/proposals" "${stack_dir}/.agents/backups"
    cp "${REPO_ROOT}/${stack}/limpieza.sh" "${stack_dir}/limpieza.sh"
    chmod +x "${stack_dir}/limpieza.sh"
    echo "{}" >"${stack_dir}/graphify-out/graph.json"
    echo "tmp" >"${stack_dir}/graphify-out/junk.tmp"
    echo "log" >"${stack_dir}/wdio-logs/run.log"
    echo "cov" >"${stack_dir}/.coverage"
    echo "v" >"${stack_dir}/.trivycache/db"

    run env HOME="${FAKE_HOME}" TMPDIR="${FAKE_TMP}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C "${stack_dir}/limpieza.sh" --quiet
    assert_success
    [ ! -d "${stack_dir}/.trivycache" ]
    if [ "${stack}" = "mobile-appium" ]; then
      [ ! -d "${stack_dir}/wdio-logs" ]
    else
      [ ! -d "${stack_dir}/.pytest_cache" ]
      [ ! -f "${stack_dir}/.coverage" ]
    fi
    [ ! -f "${stack_dir}/graphify-out/junk.tmp" ]
    [ -f "${stack_dir}/graphify-out/graph.json" ]
    [ -d "${stack_dir}/.agents/proposals" ]

    run env HOME="${FAKE_HOME}" TMPDIR="${FAKE_TMP}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C "${stack_dir}/limpieza.sh" --deep
    assert_success
    [ ! -d "${stack_dir}/.agents/proposals" ]
    [ ! -d "${stack_dir}/.agents/backups" ]
  done
}
