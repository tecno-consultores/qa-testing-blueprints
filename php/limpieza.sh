#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Script de limpieza y purga profunda para el entorno QA PHP 8.2-8.5 (Estándar 11X)
# Erradica bloqueos de permisos generados por Docker (UID 0 / root) sin requerir sudo mediante Alpine efímero.

LC_ALL=C
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

QUIET=false
DEEP_PRUNE=false
for arg in "$@"; do
  case "${arg}" in
    -q|--quiet) QUIET=true ;;
    --deep|--docker-prune) DEEP_PRUNE=true ;;
  esac
done

docker compose -f docker-compose.qa.yml down --remove-orphans -v >/dev/null 2>&1 || true
docker compose -f docker-compose.qa.yml --profile chaos down --remove-orphans -v >/dev/null 2>&1 || true

rm -f .phpunit.result.cache infection.log infection-summary.log sbom.cyclonedx.json sbom-*.cdx.json zap-report.html zap-report.json .task_scratchpad.md ./*.log 2>/dev/null || true
rm -rf .phpunit.cache htmlcov/ target/ test/target/ karate.jar .trivycache 2>/dev/null || true

CURRENT_UID="$(id -u)"
CURRENT_GID="$(id -g)"
if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "${SCRIPT_DIR}:/work" alpine sh -c "\
    rm -rf /work/.phpunit.cache /work/.phpunit.result.cache /work/htmlcov \
           /work/infection.log /work/infection-summary.log /work/sbom.cyclonedx.json /work/sbom-*.cdx.json \
           /work/target /work/test/target /work/karate.jar /work/.trivycache 2>/dev/null || true; \
    chown -R ${CURRENT_UID}:${CURRENT_GID} /work/src /work/tests /work/test /work/config 2>/dev/null || true; \
    find /work -maxdepth 1 -user 0 -exec chown ${CURRENT_UID}:${CURRENT_GID} {} + 2>/dev/null || true" >/dev/null 2>&1 || true
fi

if [ "${DEEP_PRUNE}" = true ]; then
  rm -rf .agents/backups .agents/proposals .agents/.qa-evidence.json 2>/dev/null || true
  docker system prune -af --volumes >/dev/null 2>&1 || true
fi

if [ "${QUIET}" = false ]; then
  echo "✔ [Clean PHP 11X] Contenedores, cachés y permisos saneados (UID ${CURRENT_UID}:${CURRENT_GID})."
fi
exit 0
