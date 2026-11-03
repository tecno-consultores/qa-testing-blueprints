#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
# Propósito: Script unificado de limpieza y saneamiento de artefactos temporales y cachés (Estándar QA 11X)

LC_ALL=C
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo "=============================================================================="
echo "      🧹 Limpieza y Saneamiento del Espacio de Trabajo (Estándar QA 11X)      "
echo "=============================================================================="

echo "[1/4] Deteniendo contenedores efímeros y redes de prueba..."
if [ -f mcp-server/docker-compose.qa.yml ]; then
  docker compose -f mcp-server/docker-compose.qa.yml down --remove-orphans -v 2>/dev/null || true
fi
docker ps -q --filter "name=qa-testing-blueprints" | xargs -r docker stop 2>/dev/null || true

echo "[2/4] Eliminando artefactos temporales de pruebas, cobertura y linters..."
# Artefactos locales estándar
rm -f .coverage .coverage.* trivy-results* mutmut-*.json ./*.log 2>/dev/null || true
rm -rf .pytest_cache .mypy_cache .ruff_cache .tox .uv/ htmlcov/ mutants/ .mutmut-cache/ target/ test/target/ karate.jar .trivycache 2>/dev/null || true
rm -rf mcp-server/dist mcp-server/coverage mcp-server/.turbo mcp-server/test-results mcp-server/.eslintcache 2>/dev/null || true
rm -f mcp-server/*.tsbuildinfo mcp-server/*.log 2>/dev/null || true

# Bytecode compilado de Python
find . -type d -name "__pycache__" -not -path "*/.git/*" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.py[cod]" -not -path "*/.git/*" -delete 2>/dev/null || true

echo "[3/4] Saneando residuos generados con privilegios root por Docker (Fallback Alpine)..."
# Si quedan carpetas o archivos bloqueados con UID 0 (root), usar contenedor efímero Alpine para purgarlos
ROOT_RESIDUALS=0
if [ -e .coverage ] || [ -d .pnpm-store ] || [ -d .pytest_cache ] || [ -d .mypy_cache ] || [ -d .ruff_cache ] || [ -d .trivycache ]; then
  ROOT_RESIDUALS=1
fi

if [ "${ROOT_RESIDUALS}" -eq 1 ] && command -v docker >/dev/null 2>&1; then
  docker run --rm -v "${REPO_ROOT}:/workspace" alpine sh -c "\
    rm -rf /workspace/.coverage /workspace/.coverage.* /workspace/.pnpm-store \
           /workspace/.pytest_cache /workspace/.mypy_cache /workspace/.ruff_cache \
           /workspace/.tox /workspace/.uv /workspace/htmlcov /workspace/mutants \
           /workspace/.mutmut-cache /workspace/target /workspace/test/target \
           /workspace/karate.jar /workspace/.trivycache \
           /workspace/mcp-server/dist /workspace/mcp-server/coverage \
           /workspace/mcp-server/.turbo /workspace/mcp-server/test-results 2>/dev/null || true; \
    find /workspace -type d -name '__pycache__' -not -path '*/.git/*' -exec rm -rf {} + 2>/dev/null || true; \
    find /workspace -type f -name '*.py[cod]' -not -path '*/.git/*' -delete 2>/dev/null || true" 2>/dev/null || true
fi

echo "[4/4] Normalizando titularidad de archivos para el usuario del host (UID $(id -u):$(id -g))..."
if command -v docker >/dev/null 2>&1; then
  CURRENT_UID="$(id -u)"
  CURRENT_GID="$(id -g)"
  docker run --rm -v "${REPO_ROOT}:/workspace" alpine sh -c "\
    chown -R ${CURRENT_UID}:${CURRENT_GID} /workspace/mcp-server /workspace/scripts /workspace/.agents 2>/dev/null || true; \
    find /workspace -maxdepth 1 -user 0 -exec chown ${CURRENT_UID}:${CURRENT_GID} {} + 2>/dev/null || true" 2>/dev/null || true
fi

# Poda profunda opcional de Docker si se solicita mediante bandera --deep o --docker-prune
if [ "${1:-}" = "--deep" ] || [ "${1:-}" = "--docker-prune" ]; then
  echo "🧹 Ejecutando poda profunda de recursos huérfanos de Docker..."
  docker system prune -af --volumes 2>/dev/null || true
fi

echo "=============================================================================="
echo "✔ Limpieza y saneamiento completados exitosamente sin alterar fuentes."
echo "=============================================================================="
exit 0
