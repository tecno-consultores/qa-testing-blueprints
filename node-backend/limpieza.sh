#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
# Propósito: Script de limpieza y purga profunda para el entorno QA Node.js (Estándar 11X)
# Erradica bloqueos de permisos generados por Docker (UID 0 / root) sin requerir sudo mediante Alpine efímero.

LC_ALL=C
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "=============================================================================="
echo "      🧹 Limpieza y Saneamiento QA Node.js (Estándar Corporativo 11X)         "
echo "=============================================================================="

echo "[1/4] Deteniendo contenedores efímeros y redes de prueba..."
docker compose -f docker-compose.qa.yml down --remove-orphans -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile chaos down --remove-orphans -v 2>/dev/null || true
docker compose -f docker-compose.qa.yml --profile graphify down --remove-orphans -v 2>/dev/null || true

echo "[2/4] Eliminando artefactos temporales de pruebas, cobertura y compilación..."
rm -f zap-report.html chaos-report.json chaos-report.html trivy-results* ./*.clinic-*.html ./*.log ./*.tsbuildinfo 2>/dev/null || true
rm -rf node_modules dist .stryker-tmp coverage target test/target .clinic prometheus_data .eslintcache .trivycache karate.jar 2>/dev/null || true

# Purgar caché de Graphify preservando el reporte semántico del grafo AST
if [ -d "graphify-out" ]; then
  find graphify-out/ -mindepth 1 ! -name 'GRAPH_REPORT.md' ! -name 'graph.html' ! -name 'graph.json' -delete 2>/dev/null || true
fi

echo "[3/4] Saneando residuos generados con privilegios root por Docker (Fallback Alpine)..."
if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "${SCRIPT_DIR}:/work" alpine sh -c "\
    rm -rf /work/node_modules /work/dist /work/.stryker-tmp /work/coverage \
           /work/target /work/test/target /work/.clinic /work/prometheus_data \
           /work/.eslintcache /work/.trivycache /work/karate.jar 2>/dev/null || true" 2>/dev/null || true
fi

echo "[4/4] Normalizando titularidad de archivos para el usuario del host (UID $(id -u):$(id -g))..."
if command -v docker >/dev/null 2>&1; then
  CURRENT_UID="$(id -u)"
  CURRENT_GID="$(id -g)"
  docker run --rm -v "${SCRIPT_DIR}:/work" alpine sh -c "\
    chown -R ${CURRENT_UID}:${CURRENT_GID} /work/src /work/tests /work/test /work/scripts /work/docs 2>/dev/null || true; \
    find /work -maxdepth 1 -user 0 -exec chown ${CURRENT_UID}:${CURRENT_GID} {} + 2>/dev/null || true" 2>/dev/null || true
fi

# Poda profunda de Docker solo si se solicita explícitamente
if [ "${1:-}" = "--deep" ] || [ "${1:-}" = "--docker-prune" ]; then
  echo "🧹 Ejecutando poda profunda de recursos huérfanos de Docker..."
  docker system prune -af --volumes 2>/dev/null || true
fi

echo "=============================================================================="
echo "✔ Limpieza de Node.js QA finalizada exitosamente."
echo "=============================================================================="
exit 0
