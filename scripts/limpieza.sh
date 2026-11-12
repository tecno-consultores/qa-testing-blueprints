#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Script universal de limpieza y saneamiento de espacio de trabajo (Estándar QA 11X)
# Erradica bloqueos de permisos generados por Docker (UID 0 / UID 10001) sin requerir sudo mediante Alpine efímero.

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

# 1. Detener contenedores efímeros y redes huérfanas (excluyendo node_modules y fixtures semilla de example/)
find . -maxdepth 3 -name "docker-compose*.yml" \
  -not -path "*/.git/*" \
  -not -path "*/node_modules/*" \
  -not -path "./mcp-server/example/*" | while read -r compose_file; do
  compose_dir="$(dirname "${compose_file}")"
  (cd "${compose_dir}" && docker compose -f "$(basename "${compose_file}")" down --remove-orphans -v >/dev/null 2>&1 || true)
done

# 2. Eliminación de artefactos locales estándar y directorios efímeros E2E / clean-room huérfanos
rm -rf "${HOME}/.cache/qa_mcp_cleanroom_"* "${TMPDIR:-/tmp}/qa-11x-mcp-example-e2e-"* /tmp/qa-11x-mcp-example-e2e-* 2>/dev/null || true
rm -f .coverage .coverage.* coverage.xml junit.xml trivy-results* sbom.cyclonedx.json sbom-*.cdx.json mutmut-stats.json mutmut-*.json \
  .phpunit.result.cache infection.log infection-summary.log zap-report.html zap-report.json chaos-report.html chaos-report.json \
  profile.svg .task_scratchpad.md .agents/*.scratchpad.md ./*.log ./*.tsbuildinfo /tmp/graphify_ast_*.log 2>/dev/null || true
rm -rf .pnpm-store .turbo .pytest_cache .mypy_cache .ruff_cache .hypothesis .schemathesis .tox .uv/ .phpunit.cache \
  htmlcov/ coverage_report/ .bats-battery/ mutants/ .mutmut-cache/ target/ test/target/ karate.jar .trivycache 2>/dev/null || true
rm -rf dist dist-ssr .nuxt .vite .vite-ssg-temp coverage .stryker-tmp .clinic test-results playwright-report blob-report \
  reports .lighthouseci lhci-reports .lhcache .eslintcache .stylelintcache 2>/dev/null || true

# Limpieza recursiva en subcarpetas (monorepos, stacks y arnés example/)
# Nota: Se preservan mcp-server/dist, .qa-11x-version, zap.yaml y graphify-out/{graph.json,GRAPH_REPORT.md,graph.html}
for sub in backend frontend fastapi vue3 react-frontend node-backend python php bash-scripts mcp-server mcp-server/example mcp-server/example/backend mcp-server/example/frontend; do
  if [ -d "${sub}" ]; then
    rm -f "${sub}/.coverage" "${sub}"/.coverage.* "${sub}/coverage.xml" "${sub}/junit.xml" "${sub}"/trivy-results* \
      "${sub}/sbom.cyclonedx.json" "${sub}"/sbom-*.cdx.json "${sub}/mutmut-stats.json" "${sub}"/mutmut-*.json \
      "${sub}/.phpunit.result.cache" "${sub}/infection.log" "${sub}/infection-summary.log" \
      "${sub}/zap-report.html" "${sub}/zap-report.json" "${sub}/chaos-report.html" "${sub}/chaos-report.json" \
      "${sub}/profile.svg" "${sub}/.task_scratchpad.md" "${sub}"/.agents/*.scratchpad.md \
      "${sub}"/*.clinic-*.html "${sub}"/*.log "${sub}"/*.tsbuildinfo 2>/dev/null || true
    rm -rf "${sub}/.pnpm-store" "${sub}/.turbo" "${sub}/.pytest_cache" "${sub}/.mypy_cache" "${sub}/.ruff_cache" \
      "${sub}/.hypothesis" "${sub}/.schemathesis" "${sub}/.tox" "${sub}/.uv" "${sub}/.phpunit.cache" \
      "${sub}/htmlcov" "${sub}/coverage_report" "${sub}/.bats-battery" "${sub}/mutants" "${sub}/.mutmut-cache" \
      "${sub}/target" "${sub}/test/target" "${sub}/karate.jar" "${sub}/prometheus_data" "${sub}/.trivycache" 2>/dev/null || true
    rm -rf "${sub}/dist-ssr" "${sub}/.nuxt" "${sub}/.vite" "${sub}/.vite-ssg-temp" "${sub}/coverage" "${sub}/.stryker-tmp" \
      "${sub}/.clinic" "${sub}/test-results" "${sub}/playwright-report" "${sub}/blob-report" "${sub}/reports" \
      "${sub}/.lighthouseci" "${sub}/lhci-reports" "${sub}/.lhcache" "${sub}/.eslintcache" "${sub}/.stylelintcache" 2>/dev/null || true
    if [ "${sub}" != "mcp-server" ]; then
      rm -rf "${sub}/dist" 2>/dev/null || true
    fi
    if [ -d "${sub}/graphify-out" ]; then
      rm -rf "${sub}/graphify-out/cache" "${sub}/graphify-out/20"* 2>/dev/null || true
      rm -f "${sub}/graphify-out/.graphify_"* "${sub}/graphify-out/.cloud-cta-shown" 2>/dev/null || true
    fi
  fi
done

if [ -d "graphify-out" ]; then
  rm -rf graphify-out/cache graphify-out/20* 2>/dev/null || true
  rm -f graphify-out/.graphify_* graphify-out/.cloud-cta-shown 2>/dev/null || true
fi

find . -type d -name "__pycache__" -not -path "*/.git/*" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.py[cod]" -not -path "*/.git/*" -delete 2>/dev/null || true

# 3. Fallback con contenedor efímero Alpine para archivos creados por UID 0 (root) o UID 10001 (base-node-ionic) y normalización UID:GID
CURRENT_UID="$(id -u)"
CURRENT_GID="$(id -g)"
if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "${REPO_ROOT}:/workspace" alpine sh -c "\
    rm -rf /workspace/.coverage /workspace/.coverage.* /workspace/.pnpm-store /workspace/.turbo \
           /workspace/*/.pnpm-store /workspace/*/.turbo /workspace/mcp-server/example/.pnpm-store \
           /workspace/.pytest_cache /workspace/.mypy_cache /workspace/.ruff_cache \
           /workspace/.hypothesis /workspace/.schemathesis /workspace/.tox /workspace/.uv \
           /workspace/.phpunit.cache /workspace/htmlcov /workspace/coverage_report /workspace/.bats-battery \
           /workspace/mutants /workspace/.mutmut-cache /workspace/target /workspace/test/target \
           /workspace/karate.jar /workspace/.trivycache \
           /workspace/mcp-server/coverage /workspace/mcp-server/test/target \
           /workspace/backend/.pytest_cache /workspace/backend/.mypy_cache /workspace/backend/.ruff_cache /workspace/backend/htmlcov \
           /workspace/frontend/dist /workspace/frontend/coverage /workspace/frontend/.vite \
           /workspace/fastapi/.pytest_cache /workspace/fastapi/.mypy_cache /workspace/fastapi/.ruff_cache /workspace/fastapi/htmlcov \
           /workspace/vue3/dist /workspace/vue3/coverage /workspace/vue3/.vite \
           /workspace/react-frontend/dist /workspace/react-frontend/coverage /workspace/react-frontend/.vite \
           /workspace/node-backend/dist /workspace/node-backend/coverage /workspace/node-backend/.clinic \
           /workspace/python/.pytest_cache /workspace/python/.mypy_cache /workspace/python/.ruff_cache /workspace/python/htmlcov /workspace/python/dist \
           /workspace/php/.phpunit.cache /workspace/php/htmlcov /workspace/php/target /workspace/php/test/target \
           /workspace/bash-scripts/coverage_report /workspace/bash-scripts/.bats-battery /workspace/bash-scripts/target /workspace/bash-scripts/test/target 2>/dev/null || true; \
    find /workspace -type d -name '__pycache__' -not -path '*/.git/*' -exec rm -rf {} + 2>/dev/null || true; \
    find /workspace -type f -name '*.py[cod]' -not -path '*/.git/*' -delete 2>/dev/null || true; \
    chown -R ${CURRENT_UID}:${CURRENT_GID} /workspace/src /workspace/tests /workspace/test /workspace/scripts /workspace/docs /workspace/mcp-server /workspace/.agents /workspace/graphify-out /workspace/*/graphify-out 2>/dev/null || true; \
    find /workspace -not -path '*/.git/*' -not -path '*/node_modules/*' \( -user 0 -o -user 10001 \) -exec chown ${CURRENT_UID}:${CURRENT_GID} {} + 2>/dev/null || true" >/dev/null 2>&1 || true
fi

if [ "${DEEP_PRUNE}" = true ]; then
  rm -rf .agents/backups .agents/proposals .agents/.qa-evidence.json \
    ./*/.agents/backups ./*/.agents/proposals ./*/.agents/.qa-evidence.json \
    "${HOME}/.cache/qa-11x-blueprints" /tmp/.qa11x_trivy_cache_* 2>/dev/null || true
  docker system prune -af --volumes >/dev/null 2>&1 || true
fi

if [ "${QUIET}" = false ]; then
  echo "✔ [Clean 11X] Contenedores detenidos, cachés purgados y permisos normalizados (UID ${CURRENT_UID}:${CURRENT_GID})."
fi
exit 0
