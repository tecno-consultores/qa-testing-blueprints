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
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
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
    "${FAKE_ROOT}/graphify-out/cache" "${FAKE_TMP}/qa11x-certify.xyz" "${FAKE_ROOT}/mobile-appium/.pnpm-store"
  touch "${FAKE_ROOT}/sbom.cyclonedx.json" "${FAKE_ROOT}/.DS_Store" "${FAKE_ROOT}/src/Thumbs.db" \
    "${FAKE_ROOT}/src/edit.swp" "${FAKE_ROOT}/src/old.bak" "${FAKE_ROOT}/ACTIVE_TASK.md" \
    "${FAKE_ROOT}/.agents/.cache/coverage/py.xml" "${FAKE_ROOT}/.agents/artifacts/PR_VERDICT.md" \
    "${FAKE_ROOT}/graphify-out/junk.tmp" "${FAKE_TMP}/qa-11x-last-failure.json" \
    "${FAKE_TMP}/graphify_ast.test123.log" "${FAKE_ROOT}/mobile-appium/.pnpm-store/v3"

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
  [ ! -f "${FAKE_TMP}/graphify_ast.test123.log" ]
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

@test "limpieza.sh stacks (10 stacks): purga caches, node_modules/.venv en --deep y preserva graphify-out" {
  cat >"${FAKE_BIN}/docker" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "compose" ] && [ "${2:-}" = "--profile" ]; then
  exit 1
fi
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"

  for stack in ai-evals bash-scripts fastapi mobile-appium node-backend php python react-frontend vibe-rescue vue3; do
    stack_dir="${BATS_TEST_TMPDIR}/${stack}"
    mkdir -p "${stack_dir}/graphify-out/cache" "${stack_dir}/.trivycache" \
      "${stack_dir}/.pytest_cache" "${stack_dir}/wdio-logs" "${stack_dir}/coverage" \
      "${stack_dir}/.agents/proposals" "${stack_dir}/.agents/backups" \
      "${stack_dir}/node_modules" "${stack_dir}/.venv" "${stack_dir}/vendor" "${stack_dir}/.phpunit.cache"
    cp "${REPO_ROOT}/${stack}/limpieza.sh" "${stack_dir}/limpieza.sh"
    chmod +x "${stack_dir}/limpieza.sh"
    echo "{}" >"${stack_dir}/graphify-out/graph.json"
    echo "tmp" >"${stack_dir}/graphify-out/junk.tmp"
    echo "log" >"${stack_dir}/wdio-logs/run.log"
    echo "cov" >"${stack_dir}/.coverage"
    echo "v" >"${stack_dir}/.trivycache/db"
    echo "nm" >"${stack_dir}/node_modules/pkg.txt"
    echo "vn" >"${stack_dir}/vendor/pkg.txt"

    run env HOME="${FAKE_HOME}" TMPDIR="${FAKE_TMP}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C "${stack_dir}/limpieza.sh" --quiet
    assert_success
    [ ! -d "${stack_dir}/.trivycache" ]
    case "${stack}" in
      ai-evals | fastapi | python | vibe-rescue)
        [ ! -d "${stack_dir}/.pytest_cache" ]
        [ ! -f "${stack_dir}/.coverage" ]
        ;;
      mobile-appium | node-backend | react-frontend | vue3)
        [ ! -d "${stack_dir}/coverage" ]
        ;;
      php)
        [ ! -d "${stack_dir}/.phpunit.cache" ]
        ;;
    esac
    if [ "${stack}" = "mobile-appium" ]; then
      [ ! -d "${stack_dir}/wdio-logs" ]
    fi
    [ ! -f "${stack_dir}/graphify-out/junk.tmp" ]
    [ -f "${stack_dir}/graphify-out/graph.json" ]
    [ -d "${stack_dir}/.agents/proposals" ]
    [ -d "${stack_dir}/node_modules" ]
    [ -d "${stack_dir}/vendor" ]

    run env HOME="${FAKE_HOME}" TMPDIR="${FAKE_TMP}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C "${stack_dir}/limpieza.sh" --deep --quiet
    assert_success
    [ ! -d "${stack_dir}/.agents/proposals" ]
    [ ! -d "${stack_dir}/.agents/backups" ]
    if [ "${stack}" = "php" ]; then
      [ ! -d "${stack_dir}/vendor" ]
      [ -d "${stack_dir}/node_modules" ]
      [ -d "${stack_dir}/.venv" ]
    else
      [ ! -d "${stack_dir}/node_modules" ]
      [ ! -d "${stack_dir}/.venv" ]
    fi
  done
}

@test "limpieza.sh: --deep desacoplado de docker system prune y --docker-prune exige --yes + --network none en alpine" {
  local docker_log="${BATS_TEST_TMPDIR}/limpieza_docker.log"
  : >"${docker_log}"
  cat >"${FAKE_BIN}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${docker_log}"
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"

  mkdir -p "${FAKE_ROOT}/.agents/proposals" "${FAKE_ROOT}/mobile-appium/.pnpm-store"
  printf 'p\n' >"${FAKE_ROOT}/.agents/proposals/p.md"

  run env HOME="${FAKE_HOME}" TMPDIR="${FAKE_TMP}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C "${FAKE_ROOT}/scripts/limpieza.sh" --deep --quiet
  assert_success
  [ ! -d "${FAKE_ROOT}/.agents/proposals" ]
  [ ! -d "${FAKE_ROOT}/mobile-appium/.pnpm-store" ]
  run grep -F "system prune" "${docker_log}"
  assert_failure

  : >"${docker_log}"
  run env HOME="${FAKE_HOME}" TMPDIR="${FAKE_TMP}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C "${FAKE_ROOT}/scripts/limpieza.sh" --docker-prune --quiet
  assert_failure 1
  assert_output --partial "--yes"
  run grep -F "system prune" "${docker_log}"
  assert_failure

  : >"${docker_log}"
  run env HOME="${FAKE_HOME}" TMPDIR="${FAKE_TMP}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C "${FAKE_ROOT}/scripts/limpieza.sh" --docker-prune --yes --quiet
  assert_success
  run grep -F "system prune -af --volumes" "${docker_log}"
  assert_success

  run grep -F -- "--network none" "${FAKE_ROOT}/scripts/limpieza.sh"
  assert_success
}

@test "limpieza.sh: cubre parada de compose, contenedores exited con working_dir coincidente, example/ y banner sin --quiet" {
  local cid_ws="${BATS_TEST_TMPDIR}/limp_compose_ws"
  local cid_bin="${BATS_TEST_TMPDIR}/limp_compose_bin"
  local cid_log="${BATS_TEST_TMPDIR}/limp_compose.log"
  local fake_home="${BATS_TEST_TMPDIR}/limp_compose_home"
  mkdir -p "${cid_ws}/scripts" "${cid_ws}/fastapi" "${cid_ws}/mcp-server/example/node_modules" "${cid_bin}" "${fake_home}"
  cp "${CLEAN_SCRIPT}" "${cid_ws}/scripts/limpieza.sh"
  chmod +x "${cid_ws}/scripts/limpieza.sh"
  printf 'services:\n  api:\n    image: alpine\n' >"${cid_ws}/fastapi/docker-compose.qa.yml"
  printf 'x\n' >"${cid_ws}/mcp-server/example/node_modules/mod.js"

  cat >"${cid_bin}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${cid_log}"
case "\$1" in
  ps)
    printf 'cid_match\ncid_other\n'
    ;;
  inspect)
    if [[ "\$*" == *"cid_match"* ]]; then
      printf '%s|proj_match\n' "${cid_ws}"
    else
      printf '/unrelated/path|proj_other\n'
    fi
    ;;
  compose)
    exit 0
    ;;
esac
exit 0
EOF
  chmod +x "${cid_bin}/docker"

  run env HOME="${fake_home}" TMPDIR="${BATS_TEST_TMPDIR}" PATH="${cid_bin}:/usr/bin:/bin" LC_ALL=C "${cid_ws}/scripts/limpieza.sh"
  assert_success
  assert_output --partial "[Clean 11X]"
  [ ! -d "${cid_ws}/mcp-server/example/node_modules" ]
  run grep -F "compose --profile * -f docker-compose.qa.yml down" "${cid_log}"
  assert_success
  run grep -F "rm -fv cid_match" "${cid_log}"
  assert_success
  run grep -F "network rm proj_match_default" "${cid_log}"
  assert_success
  run grep -F "rm -fv cid_other" "${cid_log}"
  assert_failure
}

@test "limpieza.sh: fallback docker compose down sin --profile y omite etiqueta vacía" {
  local fb_ws="${BATS_TEST_TMPDIR}/limp_fb_ws"
  local fb_bin="${BATS_TEST_TMPDIR}/limp_fb_bin"
  local fb_log="${BATS_TEST_TMPDIR}/limp_fb.log"
  local fake_home="${BATS_TEST_TMPDIR}/limp_fb_home"
  mkdir -p "${fb_ws}/scripts" "${fb_ws}/fastapi" "${fb_bin}" "${fake_home}"
  cp "${CLEAN_SCRIPT}" "${fb_ws}/scripts/limpieza.sh"
  chmod +x "${fb_ws}/scripts/limpieza.sh"
  printf 'services:\n  api:\n    image: alpine\n' >"${fb_ws}/fastapi/docker-compose.qa.yml"

  cat >"${fb_bin}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${fb_log}"
case "\$1" in
  ps) printf 'cid_empty\n' ;;
  inspect) printf '<no value>|<no value>\n' ;;
  compose)
    if [[ "\$*" == *"--profile"* ]]; then exit 1; fi
    exit 1
    ;;
esac
exit 0
EOF
  chmod +x "${fb_bin}/docker"

  run env HOME="${fake_home}" TMPDIR="${BATS_TEST_TMPDIR}" PATH="${fb_bin}:/usr/bin:/bin" LC_ALL=C "${fb_ws}/scripts/limpieza.sh" --quiet
  assert_success
  run grep -F "compose -f docker-compose.qa.yml down" "${fb_log}"
  assert_success
  run grep -F "rm -fv cid_empty" "${fb_log}"
  assert_failure
}
