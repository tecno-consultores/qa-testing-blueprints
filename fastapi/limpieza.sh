#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
# Propósito: Script de limpieza y purga profunda para el entorno QA FastAPI (Estándar 11X)
# Erradica bloqueos de permisos generados por Docker (UID 0 / root) sin requerir sudo mediante Alpine efímero.

LC_ALL=C
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "=============================================================================="
echo "      🧹 Limpieza y Saneamiento QA FastAPI (Estándar Corporativo 11X)         "
echo "=============================================================================="

echo "[1/4] Deteniendo contenedores efímeros y redes de prueba..."
docker compose -f docker-compose.qa.yml down --remove-orphans -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile chaos down --remove-orphans -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile graphify down --remove-orphans -v 2>/dev/null || true

echo "[2/4] Eliminando artefactos temporales de pruebas, cobertura y linters..."
rm -f .coverage .coverage.* zap-report.html zap.yaml chaos-report.html profile.svg mutmut-*.json trivy-results* ./*.log 2>/dev/null || true
rm -rf .mypy_cache .pytest_cache .ruff_cache .hypothesis .schemathesis .tox .uv/ htmlcov/ mutants/ .mutmut-cache/ target/ test/target/ karate.jar prometheus_data/ .trivycache 2>/dev/null || true
rm -rf .venv venv dist 2>/dev/null || true

# Purgar caché de Graphify preservando el reporte semántico del grafo AST
if [ -d "graphify-out" ]; then
  find graphify-out/ -mindepth 1 ! -name 'GRAPH_REPORT.md' ! -name 'graph.html' ! -name 'graph.json' -delete 2>/dev/null || true
fi

# Eliminación de bytecode compilado
find . -type d -name "__pycache__" -not -path "*/.git/*" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.py[cod]" -not -path "*/.git/*" -delete 2>/dev/null || true

echo "[3/4] Saneando residuos generados con privilegios root por Docker (Fallback Alpine)..."
if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "${SCRIPT_DIR}:/work" alpine sh -c "\
    rm -rf /work/.coverage /work/.coverage.* /work/.mypy_cache /work/.pytest_cache \
           /work/.ruff_cache /work/.hypothesis /work/.schemathesis /work/.tox \
           /work/.uv /work/htmlcov /work/mutants /work/.mutmut-cache /work/target \
           /work/test/target /work/karate.jar /work/prometheus_data /work/.trivycache \
           /work/.venv /work/venv /work/dist 2>/dev/null || true; \
    find /work -type d -name '__pycache__' -not -path '*/.git/*' -exec rm -rf {} + 2>/dev/null || true; \
    find /work -type f -name '*.py[cod]' -not -path '*/.git/*' -delete 2>/dev/null || true" 2>/dev/null || true
fi

echo "[4/4] Normalizando titularidad de archivos para el usuario del host (UID $(id -u):$(id -g))..."
if command -v docker >/dev/null 2>&1; then
  CURRENT_UID="$(id -u)"
  CURRENT_GID="$(id -g)"
  docker run --rm -v "${SCRIPT_DIR}:/work" alpine sh -c "\
    chown -R ${CURRENT_UID}:${CURRENT_GID} /work/src /work/tests /work/test /work/scripts /work/alembic /work/docs 2>/dev/null || true; \
    find /work -maxdepth 1 -user 0 -exec chown ${CURRENT_UID}:${CURRENT_GID} {} + 2>/dev/null || true" 2>/dev/null || true
fi

# Poda profunda de Docker solo si se solicita explícitamente
if [ "${1:-}" = "--deep" ] || [ "${1:-}" = "--docker-prune" ]; then
  echo "🧹 Ejecutando poda profunda de recursos huérfanos de Docker..."
  docker system prune -af --volumes 2>/dev/null || true
fi

echo "=============================================================================="
echo "✔ Limpieza de FastAPI QA finalizada exitosamente."
echo "=============================================================================="
exit 0
