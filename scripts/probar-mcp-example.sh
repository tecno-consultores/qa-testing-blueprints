#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Certificar en contenedor Docker efímero (Rule Zero) las 12 tools,
#            9 resources y 3 subcomandos CLI de @sinfallas/mcp-qa-11x contra el
#            proyecto semilla real mcp-server/example/ (modo Clean-Room por defecto).

LC_ALL=C
set -euo pipefail

if [[ "${EUID}" -eq 0 ]] && [ ! -f /.dockerenv ]; then
  echo -e "\e[31mERROR: No debe ejecutar este script como root en el host.\e[0m" >&2
  exit 1
fi

IN_PLACE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --in-place)
      IN_PLACE=true
      shift
      ;;
    -h | --help)
      echo "Uso: ./scripts/probar-mcp-example.sh [--in-place]"
      echo "  (por defecto)  Clona el árbol sin node_modules/dist y valida install + build + E2E stdio en Docker efímero."
      echo "  --in-place     Ejecuta build + E2E stdio en Docker efímero reutilizando el árbol actual."
      exit 0
      ;;
    *)
      echo "Opción no reconocida: $1" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CURRENT_UID="$(id -u)"
CURRENT_GID="$(id -g)"

if [ "${IN_PLACE}" = true ]; then
  echo "🧪 [MCP Example E2E] Ejecutando certificación E2E stdio (modo in-place en Docker efímero)..."
  QA_UID="${CURRENT_UID}" QA_GID="${CURRENT_GID}" \
    docker compose -f "${REPO_ROOT}/mcp-server/docker-compose.qa.yml" run --rm \
    -u "${CURRENT_UID}:${CURRENT_GID}" \
    -e QA_BLUEPRINTS_LOCAL_PATH=/app \
    mcp-server bash -c "[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run build && pnpm run test:example"
  exit 0
fi

CACHE_BASE="${HOME}/.cache"
mkdir -p "${CACHE_BASE}"
CLEANROOM_DIR="$(mktemp -d "${CACHE_BASE}/qa_mcp_cleanroom_XXXXXX")"

cleanup() {
  rm -rf "${CLEANROOM_DIR}" 2>/dev/null || \
    docker run --rm -v "${CLEANROOM_DIR}:/clean" alpine rm -rf /clean/* /clean/.[!.]* 2>/dev/null || true
  rm -rf "${CLEANROOM_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

echo "🧼 [Clean-Room 1/2] Preparando árbol aislado sin node_modules ni dist..."
tar -C "${REPO_ROOT}" \
  --exclude='./.git' \
  --exclude='./mcp-server/node_modules' \
  --exclude='./mcp-server/dist' \
  --exclude='./mcp-server/coverage' \
  --exclude='./.trivycache' \
  --exclude='./graphify-out' \
  --exclude='./mcp-server/graphify-out' \
  -cf - . | tar -C "${CLEANROOM_DIR}" -xf -

echo "🐳 [Clean-Room 2/2] Hidratando desde cero (pnpm install --frozen-lockfile), compilando y probando mcp-server/example/..."
QA_UID="${CURRENT_UID}" QA_GID="${CURRENT_GID}" \
  docker compose -f "${CLEANROOM_DIR}/mcp-server/docker-compose.qa.yml" run --rm \
  -u "${CURRENT_UID}:${CURRENT_GID}" \
  -e QA_BLUEPRINTS_LOCAL_PATH=/app \
  mcp-server bash -c "pnpm install --frozen-lockfile --silent && pnpm --silent run build && pnpm run test:example"

echo "✅ [Clean-Room E2E] Instalación limpia + compilación + 12 tools / 9 resources / 3 CLI verificadas."
