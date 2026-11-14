#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Script universal de limpieza y saneamiento de espacio de trabajo (Estándar QA 11X)
# Erradica restos de pruebas, basura de SO/editores y bloqueos de permisos Docker (UID 0 / 10001) sin sudo.

LC_ALL=C
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

QUIET=false
DEEP_PRUNE=false
for arg in "$@"; do
  case "${arg}" in
    -q | --quiet) QUIET=true ;;
    --deep | --docker-prune) DEEP_PRUNE=true ;;
  esac
done

clean_scope_dir() {
  local dir="$1"
  local preserve_dist="${2:-false}"

  rm -f \
    "${dir}/.coverage" "${dir}"/.coverage.* "${dir}/coverage.xml" "${dir}/junit.xml" \
    "${dir}"/trivy-results* "${dir}/sbom.cyclonedx.json" "${dir}"/sbom-*.cdx.json \
    "${dir}/cbom.cyclonedx.json" "${dir}"/cbom-*.cdx.json \
    "${dir}/mutmut-stats.json" "${dir}"/mutmut-*.json \
    "${dir}/.phpunit.result.cache" "${dir}/.php-cs-fixer.cache" "${dir}/.php-cs-fixer.dist.cache" \
    "${dir}/infection.log" "${dir}/infection-summary.log" "${dir}/infection-report.json" \
    "${dir}/zap-report.html" "${dir}/zap-report.json" "${dir}/zap-report.xml" "${dir}/zap-report.md" \
    "${dir}/chaos-report.html" "${dir}/chaos-report.json" \
    "${dir}/k6-summary.json" "${dir}/k6-results.json" "${dir}/locust-report.html" \
    "${dir}/release-readiness.json" "${dir}/release-readiness.md" \
    "${dir}/promptfoo-output.json" "${dir}/promptfoo-output.html" \
    "${dir}/deepeval-results.json" "${dir}/qa-11x-last-failure.json" \
    "${dir}/dependency-reduced-pom.xml" "${dir}/profile.svg" "${dir}/.Python" \
    "${dir}/.pnp" "${dir}/.pnp.js" "${dir}/.pnp.cjs" "${dir}/.pnp.loader.mjs" \
    "${dir}/.task_scratchpad.md" "${dir}"/.agents/*.scratchpad.md \
    "${dir}"/*.clinic-*.html "${dir}"/*.log \
    "${dir}"/npm-debug.log* "${dir}"/yarn-debug.log* "${dir}"/yarn-error.log* "${dir}"/pnpm-debug.log* \
    "${dir}"/hs_err_pid*.log "${dir}"/*.tsbuildinfo "${dir}"/*.heapsnapshot "${dir}"/*.cpuprofile \
    "${dir}"/sinfallas-mcp-qa-11x-*.tgz "${dir}/karate.jar" "${dir}"/karate-*.jar 2>/dev/null || true

  rm -rf \
    "${dir}/.pnpm-store" "${dir}/.turbo" "${dir}/.pytest_cache" "${dir}/.mypy_cache" "${dir}/.ruff_cache" \
    "${dir}/.hypothesis" "${dir}/.schemathesis" "${dir}/.tox" "${dir}/.nox" "${dir}/.uv" "${dir}/.eggs" \
    "${dir}/.benchmarks" "${dir}/.pdm-build" "${dir}/pip-wheel-metadata" \
    "${dir}/.phpunit.cache" "${dir}/.psalm" "${dir}/htmlcov" "${dir}/coverage_report" "${dir}/.bats-battery" \
    "${dir}/mutants" "${dir}/.mutmut-cache" "${dir}/target" "${dir}/test/target" "${dir}/.trivycache" \
    "${dir}/allure-results" "${dir}/allure-report" "${dir}/.allure" "${dir}/.deepeval" "${dir}/.promptfoo" \
    "${dir}/.agents/tmp" "${dir}/dist-ssr" "${dir}/.nuxt" "${dir}/.next" "${dir}/.output" "${dir}/.svelte-kit" \
    "${dir}/.vite" "${dir}/.vite-ssg-temp" "${dir}/.parcel-cache" "${dir}/storybook-static" \
    "${dir}/coverage" "${dir}/.nyc_output" "${dir}/.stryker-tmp" "${dir}/.clinic" \
    "${dir}/test-results" "${dir}/playwright-report" "${dir}/blob-report" "${dir}/playwright/.cache" \
    "${dir}/cypress/videos" "${dir}/cypress/screenshots" "${dir}/nginx-logs" "${dir}/reports" \
    "${dir}/.lighthouseci" "${dir}/lhci-reports" "${dir}/.lhcache" "${dir}/.eslintcache" "${dir}/.stylelintcache" \
    "${dir}/prometheus_data" 2>/dev/null || true

  if [ "${preserve_dist}" != "true" ]; then
    rm -rf "${dir}/dist" 2>/dev/null || true
  fi

  if [ -d "${dir}/graphify-out" ]; then
    find "${dir}/graphify-out" -mindepth 1 -maxdepth 1 \
      ! -name 'GRAPH_REPORT.md' ! -name 'graph.html' ! -name 'graph.json' ! -name 'manifest.json' \
      -exec rm -rf {} + 2>/dev/null || true
  fi
}

# 1. Detener contenedores efímeros, perfiles Compose y huérfanos clean-room (excluyendo fixtures semilla de example/)
if command -v docker >/dev/null 2>&1; then
  find . -maxdepth 3 -name "docker-compose*.yml" \
    -not -path "*/.git/*" \
    -not -path "*/node_modules/*" \
    -not -path "./mcp-server/example/*" | while IFS= read -r compose_file; do
    compose_dir="$(dirname "${compose_file}")"
    compose_name="${compose_file##*/}"
    (
      cd "${compose_dir}" && (
        docker compose --profile "*" -f "${compose_name}" down --remove-orphans -v >/dev/null 2>&1 ||
          docker compose -f "${compose_name}" down --remove-orphans -v >/dev/null 2>&1 ||
          true
      )
    )
  done

  while IFS= read -r cid; do
    [ -n "${cid}" ] || continue
    meta="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}|{{index .Config.Labels "com.docker.compose.project"}}' "${cid}" 2>/dev/null || true)"
    IFS='|' read -r wdir proj <<EOF
${meta}
EOF
    case "${wdir}" in
      "" | "<no value>") continue ;;
      "${REPO_ROOT}"* | "${HOME}/.cache/qa_mcp_cleanroom_"* | /tmp/qa_mcp_cleanroom_* | "${TMPDIR:-/tmp}/qa_mcp_cleanroom_"* | /tmp/qa-11x-* | "${TMPDIR:-/tmp}/qa-11x-"* | /tmp/qa11x-* | "${TMPDIR:-/tmp}/qa11x-"*)
        docker rm -fv "${cid}" >/dev/null 2>&1 || true
        if [ -n "${proj}" ] && [ "${proj}" != "<no value>" ]; then
          docker network rm "${proj}_default" >/dev/null 2>&1 || true
        fi
        ;;
    esac
  done < <(docker ps -aq --filter status=exited --filter status=created --filter status=dead 2>/dev/null || true)
fi

# 2. Purga determinista de restos efímeros en caché del usuario y directorios temporales
tmp_base="${TMPDIR:-/tmp}"
rm -rf \
  "${HOME}/.cache/qa_mcp_cleanroom_"* \
  "${tmp_base}/qa_mcp_cleanroom_"* /tmp/qa_mcp_cleanroom_* \
  "${tmp_base}/qa-11x-last-failure.json" /tmp/qa-11x-last-failure.json \
  "${tmp_base}/qa11x-certify."* /tmp/qa11x-certify.* \
  "${tmp_base}/qa-11x-mcp-example-e2e-"* /tmp/qa-11x-mcp-example-e2e-* \
  "${tmp_base}/qa-11x-"* /tmp/qa-11x-* \
  "${tmp_base}/qa11x-"* /tmp/qa11x-* \
  "${tmp_base}/qa11x_"* /tmp/qa11x_* \
  "${tmp_base}/qa_install_skill_test_"* /tmp/qa_install_skill_test_* \
  "${tmp_base}/qa_blueprint_test_"* /tmp/qa_blueprint_test_* \
  "${tmp_base}/qa-t14-resilience-"* /tmp/qa-t14-resilience-* \
  "${tmp_base}/qa-prompt-guard-e2e-"* /tmp/qa-prompt-guard-e2e-* \
  "${tmp_base}/qa-inspect-test-"* /tmp/qa-inspect-test-* \
  "${tmp_base}/qa-reconcile-agents-test-"* /tmp/qa-reconcile-agents-test-* \
  "${tmp_base}/qa-init-agents-test-"* /tmp/qa-init-agents-test-* \
  "${tmp_base}/qa-tools-test-"* /tmp/qa-tools-test-* \
  "${tmp_base}/qa-fetcher-test-"* /tmp/qa-fetcher-test-* \
  "${tmp_base}/qa-18-test-"* /tmp/qa-18-test-* \
  "${tmp_base}/qa-evolution-test-"* /tmp/qa-evolution-test-* \
  "${tmp_base}/qa-merger-test-"* /tmp/qa-merger-test-* \
  "${tmp_base}/qa-calm-"* /tmp/qa-calm-* \
  "${tmp_base}/mcp-edge-tests-"* /tmp/mcp-edge-tests-* \
  "${tmp_base}/mcp-sec-test-"* /tmp/mcp-sec-test-* \
  "${tmp_base}/mcp-gate-test-"* /tmp/mcp-gate-test-* \
  "${tmp_base}/mcp-runner-test-"* /tmp/mcp-runner-test-* \
  "${tmp_base}/smoke_fastapi_"* /tmp/smoke_fastapi_* \
  "${tmp_base}/smoke_vue3_"* /tmp/smoke_vue3_* \
  "${tmp_base}/smoke_react-frontend_"* /tmp/smoke_react-frontend_* \
  "${tmp_base}/smoke_node-backend_"* /tmp/smoke_node-backend_* \
  "${tmp_base}/smoke_python_"* /tmp/smoke_python_* \
  "${tmp_base}/smoke_php_"* /tmp/smoke_php_* \
  "${tmp_base}/smoke_bash-scripts_"* /tmp/smoke_bash-scripts_* \
  "${tmp_base}/graphify_ast_"*.log /tmp/graphify_ast_*.log 2>/dev/null || true

# 3. Purga en raíz y subcarpetas (monorepos, stacks y arnés example/)
# Nota: Se preservan mcp-server/dist, .qa-11x-version, .agents/ACTIVE_TASK.md y graphify-out/{graph.json,GRAPH_REPORT.md,graph.html,manifest.json}
rm -f ./ACTIVE_TASK.md 2>/dev/null || true
clean_scope_dir "." "false"

for sub in backend frontend fastapi vue3 react-frontend node-backend python php bash-scripts ai-evals mcp-server mcp-server/example mcp-server/example/backend mcp-server/example/frontend; do
  if [ -d "${sub}" ]; then
    if [ "${sub}" = "mcp-server" ]; then
      clean_scope_dir "${sub}" "true"
    else
      clean_scope_dir "${sub}" "false"
    fi
  fi
done

if [ -d "mcp-server/example" ]; then
  rm -rf \
    mcp-server/example/node_modules \
    mcp-server/example/frontend/node_modules \
    mcp-server/example/backend/.venv \
    mcp-server/example/backend/venv \
    mcp-server/example/.qa-11x-version \
    mcp-server/example/.agents/.qa-evidence.json \
    mcp-server/example/.agents/backups \
    mcp-server/example/.agents/proposals 2>/dev/null || true
fi

# 4. Barrido recursivo de cachés Python, basura del SO, editores y conflictos mal ubicados
find . \
  \( -name ".git" -o -name "node_modules" -o -name ".venv" -o -name "venv" -o -name "vendor" \) -prune \
  -o -type d \( -name "__pycache__" -o -name "*.egg-info" \) -prune -exec rm -rf {} + 2>/dev/null || true

find . \
  \( -name ".git" -o -name "node_modules" -o -name ".venv" -o -name "venv" -o -name "vendor" \) -prune \
  -o -type f \( \
    -name "*.py[cod]" -o -name "*\$py.class" -o \
    -name ".DS_Store" -o -name "._*" -o -name "Thumbs.db" -o -name "ehthumbs.db" -o -name "Desktop.ini" -o \
    -name "*.swp" -o -name "*.swo" -o -name "*.swn" -o -name "*~" -o -name ".#*" -o -name "#*#" -o \
    -name "*.orig" -o -name "*.rej" -o -name "*.bak" \
  \) -exec rm -f {} + 2>/dev/null || true

# 5. Fallback con contenedor efímero Alpine para archivos creados por UID 0 (root) o UID 10001 (base-node-ionic) y normalización UID:GID
CURRENT_UID="$(id -u)"
CURRENT_GID="$(id -g)"
if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "${REPO_ROOT}:/workspace" alpine sh -c "\
    rm -rf /workspace/.coverage /workspace/.coverage.* /workspace/.pnpm-store /workspace/.turbo \
           /workspace/*/.pnpm-store /workspace/*/.turbo /workspace/mcp-server/example/.pnpm-store \
           /workspace/mcp-server/example/node_modules /workspace/mcp-server/example/frontend/node_modules \
           /workspace/mcp-server/example/backend/.venv /workspace/mcp-server/example/backend/venv \
           /workspace/.pytest_cache /workspace/.mypy_cache /workspace/.ruff_cache \
           /workspace/.hypothesis /workspace/.schemathesis /workspace/.tox /workspace/.nox /workspace/.uv /workspace/.eggs \
           /workspace/.phpunit.cache /workspace/.psalm /workspace/htmlcov /workspace/coverage_report /workspace/.bats-battery \
           /workspace/mutants /workspace/.mutmut-cache /workspace/target /workspace/test/target \
           /workspace/karate.jar /workspace/karate-*.jar /workspace/.trivycache \
           /workspace/allure-results /workspace/allure-report /workspace/.allure \
           /workspace/.deepeval /workspace/.promptfoo /workspace/.nyc_output \
           /workspace/mcp-server/coverage /workspace/mcp-server/test/target \
           /workspace/backend/.pytest_cache /workspace/backend/.mypy_cache /workspace/backend/.ruff_cache /workspace/backend/htmlcov \
           /workspace/frontend/dist /workspace/frontend/coverage /workspace/frontend/.vite \
           /workspace/fastapi/.pytest_cache /workspace/fastapi/.mypy_cache /workspace/fastapi/.ruff_cache /workspace/fastapi/htmlcov \
           /workspace/vue3/dist /workspace/vue3/coverage /workspace/vue3/.vite \
           /workspace/react-frontend/dist /workspace/react-frontend/coverage /workspace/react-frontend/.vite \
           /workspace/node-backend/dist /workspace/node-backend/coverage /workspace/node-backend/.clinic \
           /workspace/python/.pytest_cache /workspace/python/.mypy_cache /workspace/python/.ruff_cache /workspace/python/htmlcov /workspace/python/dist \
           /workspace/php/.phpunit.cache /workspace/php/.psalm /workspace/php/htmlcov /workspace/php/target /workspace/php/test/target \
           /workspace/bash-scripts/coverage_report /workspace/bash-scripts/.bats-battery /workspace/bash-scripts/target /workspace/bash-scripts/test/target 2>/dev/null || true; \
    find /workspace \( -name '.git' -o -name 'node_modules' \) -prune -o -type d \( -name '__pycache__' -o -name '*.egg-info' \) -prune -exec rm -rf {} + 2>/dev/null || true; \
    find /workspace \( -name '.git' -o -name 'node_modules' \) -prune -o -type f \( -name '*.py[cod]' -o -name '.DS_Store' -o -name 'Thumbs.db' -o -name '*.swp' -o -name '*.swo' -o -name '*~' -o -name '*.orig' -o -name '*.rej' -o -name '*.bak' \) -exec rm -f {} + 2>/dev/null || true; \
    chown -R ${CURRENT_UID}:${CURRENT_GID} /workspace/src /workspace/tests /workspace/test /workspace/scripts /workspace/docs /workspace/mcp-server /workspace/.agents /workspace/graphify-out /workspace/*/graphify-out 2>/dev/null || true; \
    find /workspace \( -name '.git' -o -name 'node_modules' \) -prune -o \( -user 0 -o -user 10001 \) -exec chown ${CURRENT_UID}:${CURRENT_GID} {} + 2>/dev/null || true" >/dev/null 2>&1 || true
fi

if [ "${DEEP_PRUNE}" = true ]; then
  rm -rf .agents/backups .agents/proposals .agents/.qa-evidence.json \
    ./*/.agents/backups ./*/.agents/proposals ./*/.agents/.qa-evidence.json \
    "${HOME}/.cache/qa-11x-blueprints" "${tmp_base}/.qa11x_trivy_cache_"* /tmp/.qa11x_trivy_cache_* 2>/dev/null || true
  if command -v docker >/dev/null 2>&1; then
    docker system prune -af --volumes >/dev/null 2>&1 || true
  fi
fi

if [ "${QUIET}" = false ]; then
  echo "✔ [Clean 11X] Contenedores, cachés, basura de SO/editores y permisos saneados (UID ${CURRENT_UID}:${CURRENT_GID})."
fi
exit 0
