#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Script de limpieza y purga profunda para el entorno QA FastAPI (Estándar 11X)
# Erradica bloqueos de permisos generados por Docker (UID 0 / UID 10001) sin requerir sudo mediante Alpine efímero.

LC_ALL=C
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

QUIET=false
DEEP_PRUNE=false
for arg in "$@"; do
  case "${arg}" in
    -q | --quiet) QUIET=true ;;
    --deep | --docker-prune) DEEP_PRUNE=true ;;
  esac
done

if command -v docker >/dev/null 2>&1; then
  docker compose --profile "*" -f docker-compose.qa.yml down --remove-orphans -v >/dev/null 2>&1 ||
    docker compose -f docker-compose.qa.yml down --remove-orphans -v >/dev/null 2>&1 || true
fi

tmp_base="${TMPDIR:-/tmp}"
rm -rf "${tmp_base}/qa-11x-last-failure.json" /tmp/qa-11x-last-failure.json \
  "${tmp_base}/qa11x-certify."* /tmp/qa11x-certify.* 2>/dev/null || true

rm -f ./ACTIVE_TASK.md .coverage .coverage.* coverage.xml junit.xml \
  zap-report.html zap-report.json zap-report.xml zap-report.md \
  chaos-report.html chaos-report.json k6-summary.json k6-results.json locust-report.html \
  release-readiness.json release-readiness.md promptfoo-output.json promptfoo-output.html deepeval-results.json qa-11x-last-failure.json \
  profile.svg mutmut-stats.json mutmut-*.json trivy-results* sbom.cyclonedx.json sbom-*.cdx.json cbom.cyclonedx.json cbom-*.cdx.json \
  .Python .task_scratchpad.md .agents/*.scratchpad.md ./*.log 2>/dev/null || true
rm -rf .mypy_cache .pytest_cache .ruff_cache .hypothesis .schemathesis .tox .nox .uv/ .eggs/ .benchmarks/ .pdm-build/ pip-wheel-metadata/ \
  htmlcov/ mutants/ .mutmut-cache/ target/ test/target/ karate.jar karate-*.jar prometheus_data/ .trivycache \
  allure-results/ allure-report/ .allure/ .deepeval/ .promptfoo/ .agents/tmp/ .venv venv dist 2>/dev/null || true

if [ -d "graphify-out" ]; then
  find graphify-out/ -mindepth 1 -maxdepth 1 ! -name 'GRAPH_REPORT.md' ! -name 'graph.html' ! -name 'graph.json' ! -name 'manifest.json' -exec rm -rf {} + 2>/dev/null || true
fi

find . \( -name ".git" -o -name "node_modules" -o -name ".venv" -o -name "venv" -o -name "vendor" \) -prune \
  -o -type d \( -name "__pycache__" -o -name "*.egg-info" \) -prune -exec rm -rf {} + 2>/dev/null || true
find . \( -name ".git" -o -name "node_modules" -o -name ".venv" -o -name "venv" -o -name "vendor" \) -prune \
  -o -type f \( -name "*.py[cod]" -o -name "*\$py.class" -o -name ".DS_Store" -o -name "._*" -o -name "Thumbs.db" -o -name "ehthumbs.db" -o -name "Desktop.ini" -o -name "*.swp" -o -name "*.swo" -o -name "*.swn" -o -name "*~" -o -name ".#*" -o -name "#*#" -o -name "*.orig" -o -name "*.rej" -o -name "*.bak" \) -exec rm -f {} + 2>/dev/null || true

CURRENT_UID="$(id -u)"
CURRENT_GID="$(id -g)"
if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "${SCRIPT_DIR}:/work" alpine sh -c "\
    rm -rf /work/.coverage /work/.coverage.* /work/.mypy_cache /work/.pytest_cache \
           /work/.ruff_cache /work/.hypothesis /work/.schemathesis /work/.tox /work/.nox \
           /work/.uv /work/.eggs /work/.benchmarks /work/htmlcov /work/mutants /work/.mutmut-cache /work/target \
           /work/test/target /work/karate.jar /work/karate-*.jar /work/prometheus_data /work/.trivycache \
           /work/allure-results /work/allure-report /work/.allure /work/.deepeval /work/.promptfoo \
           /work/.venv /work/venv /work/dist 2>/dev/null || true; \
    find /work \( -name '.git' -o -name 'node_modules' \) -prune -o -type d \( -name '__pycache__' -o -name '*.egg-info' \) -prune -exec rm -rf {} + 2>/dev/null || true; \
    find /work \( -name '.git' -o -name 'node_modules' \) -prune -o -type f \( -name '*.py[cod]' -o -name '.DS_Store' -o -name 'Thumbs.db' -o -name '*.swp' -o -name '*.swo' -o -name '*~' -o -name '*.orig' -o -name '*.rej' -o -name '*.bak' \) -exec rm -f {} + 2>/dev/null || true; \
    chown -R ${CURRENT_UID}:${CURRENT_GID} /work/src /work/tests /work/test /work/scripts /work/alembic /work/docs 2>/dev/null || true; \
    find /work -maxdepth 2 \( -user 0 -o -user 10001 \) -exec chown ${CURRENT_UID}:${CURRENT_GID} {} + 2>/dev/null || true" >/dev/null 2>&1 || true
fi

if [ "${DEEP_PRUNE}" = true ]; then
  rm -rf .agents/backups .agents/proposals .agents/.qa-evidence.json 2>/dev/null || true
  if command -v docker >/dev/null 2>&1; then
    docker system prune -af --volumes >/dev/null 2>&1 || true
  fi
fi

if [ "${QUIET}" = false ]; then
  echo "✔ [Clean FastAPI 11X] Contenedores, cachés y permisos saneados (UID ${CURRENT_UID}:${CURRENT_GID})."
fi
exit 0
