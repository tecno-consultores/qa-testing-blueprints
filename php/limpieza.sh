#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Script de limpieza y purga profunda para el entorno QA PHP 8.2-8.5 (Estándar 11X)
# Erradica bloqueos de permisos generados por Docker (UID 0 / UID 10001 / UID no-coincidente) sin requerir sudo mediante Alpine efímero.

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

CURRENT_UID="$(id -u)"
CURRENT_GID="$(id -g)"
tmp_base="${TMPDIR:-/tmp}"
rm -rf "${tmp_base}/qa-11x-last-failure.json" /tmp/qa-11x-last-failure.json \
  "${tmp_base}/qa11x-certify."* /tmp/qa11x-certify.* 2>/dev/null || true
find "${tmp_base}" -maxdepth 1 -user "${CURRENT_UID}" \( -name 'qa-11x-last-failure.json' -o -name 'qa11x-certify.*' \) -exec rm -rf {} + 2>/dev/null || true

rm -f ./ACTIVE_TASK.md .phpunit.result.cache .php-cs-fixer.cache .php-cs-fixer.dist.cache \
  infection.log infection-summary.log infection-report.json \
  k6-summary.json k6-results.json chaos-report.html chaos-report.json \
  sbom.cyclonedx.json sbom-*.cdx.json cbom.cyclonedx.json cbom-*.cdx.json \
  zap-report.html zap-report.json openapi.json release-readiness.json release-readiness.md qa-11x-last-failure.json \
  dependency-reduced-pom.xml .task_scratchpad.md .agents/*.scratchpad.md ./*.log 2>/dev/null || true
rm -rf .phpunit.cache .psalm htmlcov/ reports/ prometheus_data/ target/ test/target/ karate.jar karate-*.jar .trivycache \
  allure-results/ allure-report/ .allure/ .agents/tmp/ 2>/dev/null || true

if [ -d "graphify-out" ]; then
  find graphify-out/ -mindepth 1 -maxdepth 1 ! -name 'GRAPH_REPORT.md' ! -name 'graph.html' ! -name 'graph.json' ! -name 'manifest.json' -exec rm -rf {} + 2>/dev/null || true
fi

find . \( -name ".git" -o -name "node_modules" -o -name ".venv" -o -name "venv" -o -name "vendor" \) -prune \
  -o -type f \( -name ".DS_Store" -o -name "._*" -o -name "Thumbs.db" -o -name "ehthumbs.db" -o -name "Desktop.ini" -o -name "*.swp" -o -name "*.swo" -o -name "*.swn" -o -name "*~" -o -name ".#*" -o -name "#*#" -o -name "*.orig" -o -name "*.rej" -o -name "*.bak" \) -exec rm -f {} + 2>/dev/null || true

if command -v docker >/dev/null 2>&1; then
  docker run --rm --network none --security-opt=no-new-privileges:true -v "${SCRIPT_DIR}:/work" alpine:3.21@sha256:bc21487101ae47172509130ee1092cc273a831968d64b617776d1f69c81e42ab sh -c '
    rm -rf /work/.phpunit.cache /work/.phpunit.result.cache /work/.php-cs-fixer.cache /work/.php-cs-fixer.dist.cache /work/.psalm /work/htmlcov \
      /work/infection.log /work/infection-summary.log /work/infection-report.json \
      /work/k6-summary.json /work/k6-results.json /work/chaos-report.html /work/chaos-report.json \
      /work/reports /work/prometheus_data /work/openapi.json /work/sbom.cyclonedx.json /work/sbom-*.cdx.json /work/cbom.cyclonedx.json /work/cbom-*.cdx.json \
      /work/target /work/test/target /work/karate.jar /work/karate-*.jar /work/.trivycache \
      /work/allure-results /work/allure-report /work/.allure 2>/dev/null || true
    if [ "$3" = "true" ]; then
      rm -rf /work/vendor 2>/dev/null || true
    fi
    find /work \( -name ".git" -o -name "node_modules" -o -name ".venv" -o -name "venv" -o -name "vendor" \) -prune -o -type f \( -name ".DS_Store" -o -name "Thumbs.db" -o -name "*.swp" -o -name "*.swo" -o -name "*~" -o -name "*.orig" -o -name "*.rej" -o -name "*.bak" \) -exec rm -f {} + 2>/dev/null || true
    chown -hR "$1:$2" /work/src /work/tests /work/test /work/config /work/public /work/migrations 2>/dev/null || true
    find /work \( -name ".git" -o -name "node_modules" -o -name ".venv" -o -name "venv" -o -name "vendor" \) -prune -o \( -user 0 -o -user 10001 -o ! -user "$1" -o ! -group "$2" \) -exec chown -h "$1:$2" {} + 2>/dev/null || true
  ' _ "${CURRENT_UID}" "${CURRENT_GID}" "${DEEP_PRUNE}" >/dev/null 2>&1 || true
fi

if [ "${DEEP_PRUNE}" = true ]; then
  rm -rf vendor .agents/backups .agents/proposals .agents/.qa-evidence.json 2>/dev/null || true
  if command -v docker >/dev/null 2>&1; then
    docker compose --profile "*" -f docker-compose.qa.yml down -v --rmi local --remove-orphans >/dev/null 2>&1 ||
      docker compose -f docker-compose.qa.yml down -v --rmi local --remove-orphans >/dev/null 2>&1 || true
  fi
fi

if [ "${QUIET}" = false ]; then
  echo "✔ [Clean PHP 11X] Contenedores, cachés y permisos saneados (UID ${CURRENT_UID}:${CURRENT_GID})."
fi
exit 0
