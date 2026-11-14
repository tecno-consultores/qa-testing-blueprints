#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Script de limpieza y purga profunda para el entorno QA Vue 3 (Estándar 11X)
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

rm -f ./ACTIVE_TASK.md ./*.log ./*.tsbuildinfo ./*.heapsnapshot ./*.cpuprofile \
  npm-debug.log* yarn-debug.log* yarn-error.log* pnpm-debug.log* \
  .pnp .pnp.js .pnp.cjs .pnp.loader.mjs \
  trivy-results* sbom.cyclonedx.json sbom-*.cdx.json cbom.cyclonedx.json cbom-*.cdx.json \
  zap-report.html zap-report.json release-readiness.json release-readiness.md \
  promptfoo-output.json promptfoo-output.html deepeval-results.json qa-11x-last-failure.json \
  .task_scratchpad.md .agents/*.scratchpad.md 2>/dev/null || true
rm -rf node_modules .pnpm-store .turbo dist dist-ssr .nuxt .next .output .svelte-kit .vite .vite-ssg-temp .parcel-cache storybook-static 2>/dev/null || true
rm -rf test-results playwright-report blob-report playwright/.cache cypress/videos cypress/screenshots nginx-logs reports target test/target coverage .nyc_output .stryker-tmp 2>/dev/null || true
rm -rf lhci-reports .lhcache .lighthouseci prometheus_data .eslintcache .stylelintcache .trivycache karate.jar karate-*.jar \
  allure-results/ allure-report/ .allure/ .deepeval/ .promptfoo/ .agents/tmp/ 2>/dev/null || true

if [ -d "graphify-out" ]; then
  find graphify-out/ -mindepth 1 -maxdepth 1 ! -name 'GRAPH_REPORT.md' ! -name 'graph.html' ! -name 'graph.json' ! -name 'manifest.json' -exec rm -rf {} + 2>/dev/null || true
fi

find . \( -name ".git" -o -name "node_modules" -o -name ".venv" -o -name "venv" -o -name "vendor" \) -prune \
  -o -type f \( -name ".DS_Store" -o -name "._*" -o -name "Thumbs.db" -o -name "ehthumbs.db" -o -name "Desktop.ini" -o -name "*.swp" -o -name "*.swo" -o -name "*.swn" -o -name "*~" -o -name ".#*" -o -name "#*#" -o -name "*.orig" -o -name "*.rej" -o -name "*.bak" \) -exec rm -f {} + 2>/dev/null || true

CURRENT_UID="$(id -u)"
CURRENT_GID="$(id -g)"
if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "${SCRIPT_DIR}:/work" alpine sh -c "\
    rm -rf /work/node_modules /work/.pnpm-store /work/.turbo /work/dist /work/dist-ssr /work/.nuxt /work/.next /work/.output /work/.svelte-kit /work/.vite /work/.parcel-cache /work/storybook-static \
           /work/test-results /work/playwright-report /work/blob-report /work/playwright/.cache /work/cypress/videos /work/cypress/screenshots /work/nginx-logs /work/reports \
           /work/target /work/test/target /work/coverage /work/.nyc_output /work/.stryker-tmp \
           /work/lhci-reports /work/.lhcache /work/.lighthouseci \
           /work/prometheus_data /work/.eslintcache /work/.stylelintcache \
           /work/.trivycache /work/karate.jar /work/karate-*.jar \
           /work/allure-results /work/allure-report /work/.allure /work/.deepeval /work/.promptfoo 2>/dev/null || true; \
    find /work \( -name '.git' -o -name 'node_modules' \) -prune -o -type f \( -name '.DS_Store' -o -name 'Thumbs.db' -o -name '*.swp' -o -name '*.swo' -o -name '*~' -o -name '*.orig' -o -name '*.rej' -o -name '*.bak' \) -exec rm -f {} + 2>/dev/null || true; \
    chown -R ${CURRENT_UID}:${CURRENT_GID} /work/src /work/tests /work/test /work/scripts /work/docs 2>/dev/null || true; \
    find /work -maxdepth 2 \( -user 0 -o -user 10001 \) -exec chown ${CURRENT_UID}:${CURRENT_GID} {} + 2>/dev/null || true" >/dev/null 2>&1 || true
fi

if [ "${DEEP_PRUNE}" = true ]; then
  rm -rf .agents/backups .agents/proposals .agents/.qa-evidence.json 2>/dev/null || true
  if command -v docker >/dev/null 2>&1; then
    docker system prune -af --volumes >/dev/null 2>&1 || true
  fi
fi

if [ "${QUIET}" = false ]; then
  echo "✔ [Clean Vue3 11X] Contenedores, cachés y permisos saneados (UID ${CURRENT_UID}:${CURRENT_GID})."
fi
exit 0
