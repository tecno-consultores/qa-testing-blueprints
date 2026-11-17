#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Certificar en contenedor Docker efímero (Rule Zero) las 19 tools,
#            13 resources, 5 subcomandos CLI y tarball v3.1.0 de @sinfallas/mcp-qa-11x
#            contra mcp-server/example/, verify-v2.sh y validación funcional del
#            tarball empaquetado (Clean-Room por defecto).

LC_ALL=C
set -euo pipefail

if [[ "${EUID}" -eq 0 ]] && [ ! -f /.dockerenv ]; then
  echo -e "\e[31mERROR: No debe ejecutar este script como root en el host.\e[0m" >&2
  exit 1
fi

IN_PLACE=false
OFFLINE=false
VERIFY_TARBALL_ONLY=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --in-place)
      IN_PLACE=true
      shift
      ;;
    --offline)
      OFFLINE=true
      shift
      ;;
    --verify-tarball)
      VERIFY_TARBALL_ONLY=true
      shift
      ;;
    -h | --help)
      echo "Uso: ./scripts/probar-mcp-example.sh [--in-place] [--offline] [--verify-tarball]"
      echo "  (por defecto)      Clona el árbol sin node_modules/dist y valida install + build + E2E stdio + tarball en Docker efímero."
      echo "  --in-place         Ejecuta build + E2E stdio + tarball en Docker efímero reutilizando el árbol actual."
      echo "  --offline          Fuerza resolución de dependencias offline (pnpm install --frozen-lockfile --offline)."
      echo "  --verify-tarball   Valida empaquetado tarball y CLI sobre un paquete MCP ya compilado."
      exit 0
      ;;
    *)
      echo "Opción no reconocida: $1" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${QA11X_REPO_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
CURRENT_UID="$(id -u)"
CURRENT_GID="$(id -g)"

PNPM_INSTALL_FLAGS="--frozen-lockfile --silent"
if [ "${OFFLINE}" = true ]; then
  PNPM_INSTALL_FLAGS="--frozen-lockfile --offline --silent"
fi

verify_tarball_cli() {
  local pack_tmp tarball_file tar_list bin_entry req_entry
  pack_tmp="$(mktemp -d /tmp/qa11x-tarball-cli-XXXXXX)"
  tarball_file="$(npm pack --silent --pack-destination "${pack_tmp}" | tail -n 1)"
  tar_list="$(tar -tzf "${pack_tmp}/${tarball_file}")"
  for req_entry in "package/package.json" "package/LICENSE" "package/README.md" "package/README.es.md" "package/CHANGELOG.md" "package/CHANGELOG.es.md" "package/dist/index.js"; do
    if ! printf "%s\n" "${tar_list}" | grep -qx "${req_entry}"; then
      echo "FAIL [Tarball CLI] Falta ${req_entry} en ${tarball_file}" >&2
      rm -rf "${pack_tmp}"
      return 1
    fi
  done
  if printf "%s\n" "${tar_list}" | grep -q "^package/src/"; then
    echo "FAIL [Tarball CLI] Fuentes src/ filtradas en ${tarball_file}" >&2
    rm -rf "${pack_tmp}"
    return 1
  fi
  mkdir -p "${pack_tmp}/installed" "${pack_tmp}/proj" "${pack_tmp}/home"
  tar -xzf "${pack_tmp}/${tarball_file}" -C "${pack_tmp}/installed" --strip-components=1
  ln -s "$(pwd)/node_modules" "${pack_tmp}/installed/node_modules"
  bin_entry="${pack_tmp}/installed/dist/index.js"
  if ! HOME="${pack_tmp}/home" QA11X_WORKSPACE_ROOTS="${pack_tmp}" QA_DISABLE_AUTO_SYNC=1 node "${bin_entry}" init-agents --project-path "${pack_tmp}/proj" --lang es >/dev/null ||
    [ ! -f "${pack_tmp}/proj/AGENTS.md" ] ||
    ! HOME="${pack_tmp}/home" QA11X_WORKSPACE_ROOTS="${pack_tmp}" QA_DISABLE_AUTO_SYNC=1 node "${bin_entry}" reconcile-agents --project-path "${pack_tmp}/proj" --dry-run >/dev/null ||
    ! HOME="${pack_tmp}/home" QA11X_WORKSPACE_ROOTS="${pack_tmp}" QA_DISABLE_AUTO_SYNC=1 node "${bin_entry}" quickstart "${pack_tmp}/proj" --tier standard --lang en --dry-run --json >/dev/null; then
    rm -rf "${pack_tmp}"
    return 1
  fi
  rm -rf "${pack_tmp}"
  echo "✔ [Tarball CLI] Empaquetado real (LICENSE + EN/ES docs + dist) e init-agents/reconcile-agents/quickstart OK"
}

if [ "${VERIFY_TARBALL_ONLY}" = true ]; then
  verify_tarball_cli
  exit $?
fi

if [ "${IN_PLACE}" = true ]; then
  echo "🧪 [MCP Example E2E] Ejecutando certificación E2E stdio (modo in-place en Docker efímero)..."
  rc=0
  QA_UID="${CURRENT_UID}" QA_GID="${CURRENT_GID}" \
    docker compose -f "${REPO_ROOT}/mcp-server/docker-compose.qa.yml" run --rm -T \
    -u "${CURRENT_UID}:${CURRENT_GID}" \
    -e QA_BLUEPRINTS_LOCAL_PATH=/app \
    -e pnpm_config_manage_package_manager_versions=false \
    mcp-server bash -c "[ -d node_modules/.bin ] || pnpm install ${PNPM_INSTALL_FLAGS}; pnpm --silent run build && pnpm run test:example && bash ./example/verify-v2.sh && $(declare -f verify_tarball_cli) && verify_tarball_cli" || rc=$?
  docker compose -f "${REPO_ROOT}/mcp-server/docker-compose.qa.yml" rm -sf pnpm-store-init >/dev/null 2>&1 || true
  exit "${rc}"
fi

CACHE_BASE="${HOME}/.cache"
mkdir -p "${CACHE_BASE}"
CLEANROOM_DIR="$(mktemp -d "${CACHE_BASE}/qa_mcp_cleanroom_XXXXXX")"
CLEANROOM_PROJECT="qa_cleanroom_$$"

cleanup() {
  docker compose -p "${CLEANROOM_PROJECT}" -f "${CLEANROOM_DIR}/mcp-server/docker-compose.qa.yml" down --remove-orphans >/dev/null 2>&1 || true
  rm -rf "${CLEANROOM_DIR}" 2>/dev/null ||
    docker run --rm -v "${CLEANROOM_DIR}:/clean" alpine:3.21@sha256:bc21487101ae47172509130ee1092cc273a831968d64b617776d1f69c81e42ab rm -rf /clean/* /clean/.[!.]* 2>/dev/null || true
  rm -rf "${CLEANROOM_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

echo "🧼 [Clean-Room 1/2] Preparando árbol aislado sin node_modules ni dist..."
tar -C "${REPO_ROOT}" \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./.env.*' \
  --exclude='./.agents/.cache' \
  --exclude='./.agents/artifacts' \
  --exclude='./mcp-server/node_modules' \
  --exclude='./mcp-server/dist' \
  --exclude='./mcp-server/coverage' \
  --exclude='./.trivycache' \
  --exclude='./graphify-out' \
  --exclude='*/graphify-out' \
  -cf - . | tar -C "${CLEANROOM_DIR}" -xf -

echo "🐳 [Clean-Room 2/2] Hidratando desde cero (pnpm install --frozen-lockfile), compilando y probando mcp-server/example/..."
QA_UID="${CURRENT_UID}" QA_GID="${CURRENT_GID}" \
  docker compose -p "${CLEANROOM_PROJECT}" -f "${CLEANROOM_DIR}/mcp-server/docker-compose.qa.yml" run --rm -T \
  -u "${CURRENT_UID}:${CURRENT_GID}" \
  -e QA_BLUEPRINTS_LOCAL_PATH=/app \
  -e pnpm_config_manage_package_manager_versions=false \
  mcp-server bash -c "pnpm install ${PNPM_INSTALL_FLAGS} && pnpm --silent run build && pnpm run test:example && bash ./example/verify-v2.sh && $(declare -f verify_tarball_cli) && verify_tarball_cli"

echo "✅ [Clean-Room E2E] Instalación limpia + compilación + 19 tools / 13 resources / quickstart / verify-v2.sh / tarball CLI verificadas."
