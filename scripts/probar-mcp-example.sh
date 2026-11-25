#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Certificar en contenedor Docker efímero (Rule Zero) las 19 tools,
#            13 resources, 12 subcomandos CLI y tarball v3.8.1 de @sinfallas/mcp-qa-11x
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
      echo "  --offline          Fuerza resolución de dependencias offline (pnpm --offline; backend requiere fastapi/httpx o QA_UV_CACHE_DIR)."
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
PY_QA_IMAGE="${QA_PY_IMAGE:-sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4}"

run_example_backend_python_qa() {
  local example_root="$1"
  local -a net_args=()
  local -a uv_cache_args=()
  local uv_offline_flag=""
  local uv_cache_src="${QA_UV_CACHE_DIR:-${UV_CACHE_DIR:-}}"
  if [ -n "${uv_cache_src}" ] && [ -d "${uv_cache_src}" ]; then
    uv_cache_args=(-v "${uv_cache_src}:/tmp/uv-cache")
  fi
  if [ "${OFFLINE}" = true ]; then
    net_args=(--network none)
    uv_offline_flag="--offline"
  fi
  echo "🐍 [MCP Example Backend] Ejecutando ruff, mypy --strict y FastAPI TestClient (>=95%, 0 skips) en Docker efímero..."
  docker run --rm "${net_args[@]}" --security-opt=no-new-privileges:true \
    -u "${CURRENT_UID}:${CURRENT_GID}" \
    -e HOME=/tmp \
    -e COVERAGE_FILE=/tmp/.coverage \
    -e UV_CACHE_DIR=/tmp/uv-cache \
    -e RUFF_CACHE_DIR=/tmp/.ruff_cache \
    -e PYTHONDONTWRITEBYTECODE=1 \
    -e PYTHONPATH=/app/backend/src \
    -e QA_UV_OFFLINE="${uv_offline_flag}" \
    "${uv_cache_args[@]}" \
    -v "${example_root}:/app:ro" \
    -w /app/backend \
    "${PY_QA_IMAGE}" \
    sh -c 'QA_VENV_DIR="${QA_VENV_DIR:-/tmp/qa-venv}"; ruff check --select E,F,W,I,UP,B,C901,PLR0913 src/ tests/ && ruff format --check src/ tests/ && mypy --strict --cache-dir=/tmp/mypy src/ tests/*.unit.py && if python3 -c "import fastapi, httpx" >/dev/null 2>&1; then PY_BIN=python3; else uv venv -q --system-site-packages "$QA_VENV_DIR" && if [ "${QA_UV_OFFLINE:-}" = "--offline" ]; then uv pip install -q --offline --python "$QA_VENV_DIR/bin/python" fastapi httpx || { echo "❌ Modo --offline sin fastapi/httpx preinstalados ni cache UV (UV_CACHE_DIR)." >&2; exit 1; }; else uv pip install -q --python "$QA_VENV_DIR/bin/python" fastapi httpx; fi && PY_BIN="$QA_VENV_DIR/bin/python"; fi && "$PY_BIN" -m pytest --import-mode=importlib --cov=src --cov-fail-under=95 --cov-report=term-missing -rs -v tests/*.unit.py'
}

PNPM_INSTALL_FLAGS="--frozen-lockfile --prefer-offline --trust-lockfile --silent"
if [ "${OFFLINE}" = true ]; then
  PNPM_INSTALL_FLAGS="--frozen-lockfile --offline --trust-lockfile --silent"
fi

verify_tarball_cli() {
  local pack_tmp tarball_file tar_list bin_entry req_entry mcp_dir
  mcp_dir="$(pwd -P)"
  if [ ! -f "${mcp_dir}/package.json" ] && [ -f "${mcp_dir}/mcp-server/package.json" ]; then
    mcp_dir="${mcp_dir}/mcp-server"
  fi
  pack_tmp="$(mktemp -d /tmp/qa11x-tarball-cli-XXXXXX)"
  tarball_file="$(cd "${mcp_dir}" && npm pack --silent --pack-destination "${pack_tmp}" | tail -n 1)"
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
  if printf "%s\n" "${tar_list}" | grep -q "[.]map\$"; then
    echo "FAIL [Tarball CLI] Archivos .map filtrados en ${tarball_file}" >&2
    rm -rf "${pack_tmp}"
    return 1
  fi
  mkdir -p "${pack_tmp}/installed" "${pack_tmp}/proj" "${pack_tmp}/home"
  tar -xzf "${pack_tmp}/${tarball_file}" -C "${pack_tmp}/installed" --strip-components=1
  ln -s "${mcp_dir}/node_modules" "${pack_tmp}/installed/node_modules"
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
  if [ -f "${QA11X_DOCKERENV_PATH:-/.dockerenv}" ] || [ "${QA11X_INSIDE_DOCKER:-0}" = "1" ]; then
    verify_tarball_cli
    exit $?
  fi
  NODE_QA_IMAGE="${QA_NODE_IMAGE:-sinfallas/base-node-ionic:26@sha256:275f3d8bbfef87f4e836e4f77d92c0d199821154079b050eaef53ce33ae6de60}"
  exec docker run --rm --network none --security-opt=no-new-privileges:true \
    -u "${CURRENT_UID}:${CURRENT_GID}" \
    -e HOME=/tmp \
    -e QA11X_INSIDE_DOCKER=1 \
    -v "${REPO_ROOT}/mcp-server:/app" \
    -w /app \
    "${NODE_QA_IMAGE}" \
    bash -c "$(declare -f verify_tarball_cli) && verify_tarball_cli"
fi

if [ "${IN_PLACE}" = true ]; then
  echo "🧪 [MCP Example E2E] Ejecutando certificación E2E stdio (modo in-place en Docker efímero)..."
  rc=0
  QA_UID="${CURRENT_UID}" QA_GID="${CURRENT_GID}" \
    docker compose -f "${REPO_ROOT}/mcp-server/docker-compose.qa.yml" run --rm -T \
    -u "${CURRENT_UID}:${CURRENT_GID}" \
    -e QA_BLUEPRINTS_LOCAL_PATH=/app \
    -e pnpm_config_verify_deps_before_run=false \
    -e pnpm_config_manage_package_manager_versions=false \
    mcp-server bash -c "[ -d node_modules/.bin ] || pnpm install ${PNPM_INSTALL_FLAGS}; pnpm --silent run build && pnpm run test:example && bash ./example/verify-v2.sh && $(declare -f verify_tarball_cli) && verify_tarball_cli" || rc=$?
  docker compose -f "${REPO_ROOT}/mcp-server/docker-compose.qa.yml" rm -sf pnpm-store-init >/dev/null 2>&1 || true
  if [ "${rc}" -eq 0 ]; then
    run_example_backend_python_qa "${REPO_ROOT}/mcp-server/example" || rc=$?
  fi
  exit "${rc}"
fi

CACHE_BASE="${HOME}/.cache"
mkdir -p "${CACHE_BASE}"
CLEANROOM_DIR="$(mktemp -d "${CACHE_BASE}/qa_mcp_cleanroom_XXXXXX")"
CLEANROOM_PROJECT="qa_cleanroom_$$"

cleanup() {
  docker compose -p "${CLEANROOM_PROJECT}" -f "${CLEANROOM_DIR}/mcp-server/docker-compose.qa.yml" down --remove-orphans >/dev/null 2>&1 || true
  rm -rf "${CLEANROOM_DIR}" 2>/dev/null ||
    docker run --rm --network none --security-opt=no-new-privileges:true -v "${CLEANROOM_DIR}:/clean" alpine:3.21@sha256:bc21487101ae47172509130ee1092cc273a831968d64b617776d1f69c81e42ab rm -rf /clean/* /clean/.[!.]* 2>/dev/null || true
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
  -e pnpm_config_verify_deps_before_run=false \
  -e pnpm_config_manage_package_manager_versions=false \
  mcp-server bash -c "pnpm install ${PNPM_INSTALL_FLAGS} && pnpm --silent run build && pnpm run test:example && bash ./example/verify-v2.sh && $(declare -f verify_tarball_cli) && verify_tarball_cli"

run_example_backend_python_qa "${CLEANROOM_DIR}/mcp-server/example"

echo "✅ [Clean-Room E2E] Instalación limpia + compilación + 19 tools / 13 resources / 12 CLI / verify-v2.sh / tarball CLI / example backend Python QA verificados."
