#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
# Propósito: Script universal de limpieza y saneamiento de espacio de trabajo (Estándar QA 11X)
# Erradica bloqueos de permisos generados por Docker (UID 0 / root) sin requerir sudo mediante Alpine efímero.

LC_ALL=C
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

QUIET=false
DEEP_PRUNE=false
for arg in "$@"; do
  case "${arg}" in
    -q|--quiet) QUIET=true ;;
    --deep|--docker-prune) DEEP_PRUNE=true ;;
  esac
done

# 1. Detener contenedores efímeros y redes huérfanas
find . -maxdepth 3 -name "docker-compose*.yml" -not -path "*/.git/*" | while read -r compose_file; do
  compose_dir="$(dirname "${compose_file}")"
  (cd "${compose_dir}" && docker compose -f "$(basename "${compose_file}")" down --remove-orphans -v >/dev/null 2>&1 || true)
done

# 2. Eliminación de artefactos locales estándar
rm -f .coverage .coverage.* trivy-results* mutmut-*.json ./*.log ./*.tsbuildinfo 2>/dev/null || true
rm -rf .pytest_cache .mypy_cache .ruff_cache .tox .uv/ htmlcov/ mutants/ .mutmut-cache/ target/ test/target/ karate.jar .trivycache 2>/dev/null || true
rm -rf dist dist-ssr .vite .vite-ssg-temp coverage .stryker-tmp test-results playwright-report blob-report reports .lighthouseci lhci-reports .lhcache .eslintcache .stylelintcache 2>/dev/null || true

# Limpieza recursiva en subcarpetas (monorepos o stacks)
for sub in backend frontend fastapi vue3 react-frontend node-backend python php mcp-server; do
  if [ -d "${sub}" ]; then
    rm -f "${sub}/.coverage" "${sub}/.coverage.*" "${sub}"/*.log "${sub}"/*.tsbuildinfo "${sub}"/zap-report.html "${sub}"/chaos-report.html "${sub}"/profile.svg 2>/dev/null || true
    rm -rf "${sub}/.pytest_cache" "${sub}/.mypy_cache" "${sub}/.ruff_cache" "${sub}/.tox" "${sub}/.uv" "${sub}/htmlcov" "${sub}/mutants" "${sub}/.mutmut-cache" "${sub}/target" "${sub}/test/target" "${sub}/prometheus_data" 2>/dev/null || true
    rm -rf "${sub}/dist" "${sub}/dist-ssr" "${sub}/.vite" "${sub}/coverage" "${sub}/.stryker-tmp" "${sub}/test-results" "${sub}/playwright-report" "${sub}/blob-report" "${sub}/reports" "${sub}/.lighthouseci" "${sub}/lhci-reports" "${sub}/.lhcache" "${sub}/.eslintcache" 2>/dev/null || true
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

# 3. Fallback con contenedor efímero Alpine para archivos creados como root por Docker y normalización UID:GID
CURRENT_UID="$(id -u)"
CURRENT_GID="$(id -g)"
if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "${REPO_ROOT}:/workspace" alpine sh -c "\
    rm -rf /workspace/.coverage /workspace/.coverage.* /workspace/.pnpm-store \
           /workspace/.pytest_cache /workspace/.mypy_cache /workspace/.ruff_cache \
           /workspace/.tox /workspace/.uv /workspace/htmlcov /workspace/mutants \
           /workspace/.mutmut-cache /workspace/target /workspace/test/target \
           /workspace/karate.jar /workspace/.trivycache \
           /workspace/mcp-server/dist /workspace/mcp-server/coverage \
           /workspace/backend/.pytest_cache /workspace/backend/.mypy_cache /workspace/backend/.ruff_cache /workspace/backend/htmlcov \
           /workspace/frontend/dist /workspace/frontend/coverage /workspace/frontend/.vite \
           /workspace/fastapi/.pytest_cache /workspace/fastapi/.mypy_cache /workspace/fastapi/.ruff_cache /workspace/fastapi/htmlcov \
           /workspace/vue3/dist /workspace/vue3/coverage /workspace/vue3/.vite 2>/dev/null || true; \
    find /workspace -type d -name '__pycache__' -not -path '*/.git/*' -exec rm -rf {} + 2>/dev/null || true; \
    find /workspace -type f -name '*.py[cod]' -not -path '*/.git/*' -delete 2>/dev/null || true; \
    chown -R ${CURRENT_UID}:${CURRENT_GID} /workspace/src /workspace/tests /workspace/test /workspace/scripts /workspace/docs /workspace/mcp-server /workspace/.agents /workspace/graphify-out /workspace/*/graphify-out 2>/dev/null || true; \
    find /workspace -maxdepth 1 -user 0 -exec chown ${CURRENT_UID}:${CURRENT_GID} {} + 2>/dev/null || true" >/dev/null 2>&1 || true
fi

if [ "${DEEP_PRUNE}" = true ]; then
  rm -rf .agents/backups 2>/dev/null || true
  docker system prune -af --volumes >/dev/null 2>&1 || true
fi

if [ "${QUIET}" = false ]; then
  echo "✔ [Clean 11X] Contenedores detenidos, cachés purgados y permisos normalizados (UID ${CURRENT_UID}:${CURRENT_GID})."
fi
exit 0
