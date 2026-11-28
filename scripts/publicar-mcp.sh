#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Publicación autónoma del Servidor MCP (@sinfallas/mcp-qa-11x) a npmjs.org
# Cumple estrictamente con la Regla Cero (100% Docker efímero sin runners externos).

LC_ALL=C
set -euo pipefail

# 1. Comprobación de no-root (solo aplicable fuera de contenedores)
if [[ "${EUID}" -eq 0 ]] && [ ! -f /.dockerenv ]; then
  echo -e "\e[31mERROR: No debe ejecutar este script como root en el host.\e[0m" >&2
  exit 1
fi

DRY_RUN=false
SKIP_TESTS=false
PUBLISH_REGISTRY=false
REGISTRY_ONLY=false
CLI_OTP=""
IMAGE_NAME="sinfallas/base-node-ionic:26@sha256:275f3d8bbfef87f4e836e4f77d92c0d199821154079b050eaef53ce33ae6de60"
PY_IMAGE_NAME="sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4"
MCP_REGISTRY_URL="${MCP_REGISTRY_URL:-https://registry.modelcontextprotocol.io}"
MCP_PUBLISHER_VERSION="v1.8.16"
MCP_PUBLISHER_SHA256_AMD64="6e2f799550cf843c6fd3350498d56cc49be3dc0af1e6237eb0e6435c7a9d5c05"
MCP_PUBLISHER_SHA256_ARM64="5a967e51a24389b496f65e02fc9ce6bb187763c1de59e37a8f3018323e295a6a"
HAS_ENV_NPM_REGISTRY=0
if [ -n "${NPM_REGISTRY:-}" ]; then
  HAS_ENV_NPM_REGISTRY=1
fi
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org/}"

# Procesar argumentos CLI
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --registry)
      PUBLISH_REGISTRY=true
      shift
      ;;
    --registry-only)
      PUBLISH_REGISTRY=true
      REGISTRY_ONLY=true
      shift
      ;;
    --otp)
      if [[ -z "${2:-}" ]] || [[ "${2:-}" == -* ]]; then
        echo "ERROR: La opción --otp requiere un código de 6 dígitos (ej. --otp 123456)." >&2
        exit 1
      fi
      CLI_OTP="$2"
      shift 2
      ;;
    --otp=*)
      CLI_OTP="${1#*=}"
      if [[ -z "${CLI_OTP}" ]]; then
        echo "ERROR: La opción --otp requiere un código de 6 dígitos (ej. --otp=123456)." >&2
        exit 1
      fi
      shift
      ;;
    -h | --help)
      echo "══════════════════════════════════════════════════════════════════════"
      echo "  📦 Publicador Autónomo de Servidor MCP (@sinfallas/mcp-qa-11x)     "
      echo "══════════════════════════════════════════════════════════════════════"
      echo "Uso: ./scripts/publicar-mcp.sh [OPCIONES]"
      echo ""
      echo "Opciones:"
      echo "  --dry-run       Ejecuta linters, tests y empaquetado sin publicar a npmjs"
      echo "  --skip-tests    Omite la ejecución de pruebas unitarias si ya fueron validadas"
      echo "  --registry      Publica también server.json en registry.modelcontextprotocol.io (Docker efímero)"
      echo "  --registry-only Publica solo server.json en el MCP Registry oficial (requiere versión ya en npmjs con mcpName)"
      echo "  --otp <código>  Código 2FA/OTP de 6 dígitos (si el token no tiene Bypass 2FA)"
      echo "  -h, --help      Muestra esta ayuda"
      echo ""
      echo "Autenticación:"
      echo "  Crea un archivo '.env' en la raíz con: NPM_TOKEN=npm_tu_token_aqui"
      echo "  o expórtalo en tu sesión: export NPM_TOKEN=npm_..."
      echo "  (Para publicar sin que pida 2FA/OTP, marca 'Bypass 2FA' al crear el token en npmjs.com)"
      echo "  Para MCP Registry bajo namespaces de organización (--registry / --registry-only):"
      echo "  configura MCP_GITHUB_TOKEN=<Classic PAT con scope read:org> en .env o entorno."
      echo "══════════════════════════════════════════════════════════════════════"
      exit 0
      ;;
    *)
      echo "Opción no reconocida: $1" >&2
      echo "Use --help para ver las opciones disponibles." >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${QA11X_REPO_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
MCP_DIR="${REPO_ROOT}/mcp-server"
PACKAGE_JSON="${MCP_DIR}/package.json"

if [ ! -f "${PACKAGE_JSON}" ]; then
  echo -e "\e[31mERROR: No se encontró mcp-server/package.json en ${MCP_DIR}.\e[0m" >&2
  exit 1
fi

PKG_NAME="$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${PACKAGE_JSON}" | head -n 1)"
PKG_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${PACKAGE_JSON}" | head -n 1)"

echo "══════════════════════════════════════════════════════════════════════"
echo "  🚀 Publicador Autónomo de Servidor MCP a npmjs (Estándar 11X)        "
echo "══════════════════════════════════════════════════════════════════════"
echo "  Paquete:  ${PKG_NAME}"
echo "  Versión:  ${PKG_VERSION}"
echo "  Modo:     $([ "$DRY_RUN" = true ] && echo "🔍 Simulación (Dry-Run)" || echo "🌐 Publicación en Vivo")"
echo "══════════════════════════════════════════════════════════════════════"

read_dotenv_value() {
  local key="$1"
  local env_path="$2"
  local raw_line raw_val first_char

  raw_line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "${env_path}" | head -n 1 || true)"
  if [ -z "${raw_line}" ]; then
    return 0
  fi
  raw_val="${raw_line#*=}"
  raw_val="${raw_val#"${raw_val%%[![:space:]]*}"}"
  first_char="${raw_val%"${raw_val#?}"}"
  if [ "${first_char}" = '"' ]; then
    raw_val="${raw_val#\"}"
    raw_val="${raw_val%%\"*}"
  elif [ "${first_char}" = "'" ]; then
    raw_val="${raw_val#\'}"
    raw_val="${raw_val%%\'*}"
  else
    raw_val="${raw_val%%#*}"
    raw_val="${raw_val%"${raw_val##*[![:space:]]}"}"
  fi
  printf '%s' "${raw_val}"
}

# 2. Cargar token de autenticación desde .env en la raíz
ENV_FILE="${REPO_ROOT}/.env"
if [ -f "${ENV_FILE}" ]; then
  ENV_PERMS=$(stat -c "%a" "${ENV_FILE}" 2>/dev/null || stat -f "%Lp" "${ENV_FILE}" 2>/dev/null || echo "600")
  if [ "${ENV_PERMS}" != "600" ]; then
    echo "🔒 Ajustando permisos de seguridad en .env (${ENV_PERMS} -> 600)..."
    chmod 600 "${ENV_FILE}"
  fi
  echo -e "\n📄 Cargando variables de autenticación desde .env..."
  TOKEN_VAL="$(read_dotenv_value 'NPM_TOKEN' "${ENV_FILE}")"
  if [ -z "${NPM_TOKEN:-}" ] && [ -n "${TOKEN_VAL}" ]; then
    NPM_TOKEN="${TOKEN_VAL}"
  fi
  REG_VAL="$(read_dotenv_value 'NPM_REGISTRY' "${ENV_FILE}")"
  if [ "${HAS_ENV_NPM_REGISTRY}" -eq 0 ] && [ -n "${REG_VAL}" ]; then
    NPM_REGISTRY="${REG_VAL}"
  fi
  OTP_VAL="$(read_dotenv_value 'NPM_OTP' "${ENV_FILE}")"
  if [ -z "${NPM_OTP:-}" ] && [ -n "${OTP_VAL}" ]; then
    NPM_OTP="${OTP_VAL}"
  fi
  MCP_GH_TOKEN_VAL="$(read_dotenv_value 'MCP_GITHUB_TOKEN' "${ENV_FILE}")"
  if [ -z "${MCP_GITHUB_TOKEN:-}" ] && [ -n "${MCP_GH_TOKEN_VAL}" ]; then
    MCP_GITHUB_TOKEN="${MCP_GH_TOKEN_VAL}"
  fi
fi

if [ -n "${MCP_GITHUB_TOKEN:-}" ]; then
  if [[ "${MCP_GITHUB_TOKEN}" == *"TU_TOKEN"* ]] || [[ "${MCP_GITHUB_TOKEN}" == *"placeholder"* ]] || [[ "${MCP_GITHUB_TOKEN}" =~ ^ghp_[xX]+$ ]]; then
    MCP_GITHUB_TOKEN=""
  fi
fi

if [ -n "${CLI_OTP}" ]; then
  NPM_OTP="${CLI_OTP}"
fi

# Validar presencia del token si no estamos en dry-run ni en modo registry-only
if [ "$DRY_RUN" = false ] && [ "$REGISTRY_ONLY" = false ]; then
  if [ -z "${NPM_TOKEN:-}" ] || [[ "${NPM_TOKEN}" == *"TU_TOKEN"* ]] || [[ "${NPM_TOKEN}" == *"placeholder"* ]] || [[ "${NPM_TOKEN}" =~ ^npm_[xX]+$ ]]; then
    echo -e "\n\e[31m❌ ERROR: Variable NPM_TOKEN no configurada o contiene el valor de ejemplo.\e[0m" >&2
    echo "💡 Para publicar en npmjs.com sin runners externos:" >&2
    echo "   1. Copie el archivo de ejemplo: cp .env.example .env" >&2
    echo "   2. Configure su token real de npmjs: NPM_TOKEN=npm_..." >&2
    echo "   3. O pruebe en modo simulación: ./scripts/publicar-mcp.sh --dry-run" >&2
    exit 1
  fi
  echo "✔ Token de autenticación NPM_TOKEN detectado."
fi

# 3. Paso 0: Saneamiento previo del espacio de trabajo
echo "🧹 [0/6] Saneando espacio de trabajo..."
"${REPO_ROOT}/scripts/limpieza.sh" --quiet

CURRENT_UID="$(id -u)"
CURRENT_GID="$(id -g)"

if [ -f "${REPO_ROOT}/.agents/scripts/bump_version_11x.py" ]; then
  echo "🔢 [Pre-Check] Verificando paridad de versión SemVer (bump_version_11x.py --check)..."
  docker run --rm --network none --restart=no --security-opt=no-new-privileges:true -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp -v "${REPO_ROOT}:/repo:ro" -w /repo "${PY_IMAGE_NAME}" python3 .agents/scripts/bump_version_11x.py --check
fi

if [ -f "${REPO_ROOT}/.agents/scripts/sync_governance.py" ] && [ -f "${REPO_ROOT}/manifest.json" ]; then
  echo "🛡️ [Pre-Check] Verificando sincronía SHA-256 y presupuestos (sync_governance.py --check)..."
  docker run --rm --network none --restart=no --security-opt=no-new-privileges:true -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -v "${REPO_ROOT}:/repo:ro" -w /repo "${PY_IMAGE_NAME}" python3 .agents/scripts/sync_governance.py --check
fi

for cl in CHANGELOG.md CHANGELOG.es.md mcp-server/CHANGELOG.md mcp-server/CHANGELOG.es.md; do
  if [ -f "${REPO_ROOT}/${cl}" ] && ! grep -qF "## [${PKG_VERSION}]" "${REPO_ROOT}/${cl}"; then
    echo -e "\e[31m❌ ERROR [Pre-Check]: ${cl} no contiene entrada para la versión ## [${PKG_VERSION}].\e[0m" >&2
    exit 1
  fi
done

if [ "${DRY_RUN}" = false ] && [ -e "${REPO_ROOT}/.git" ] && command -v git >/dev/null 2>&1; then
  if [ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]; then
    echo -e "\e[31m❌ ERROR [Pre-Check]: El árbol Git tiene cambios sin confirmar; haga commit limpio antes de publicar en vivo.\e[0m" >&2
    exit 1
  fi
fi

read_json_string_field() {
  local key="$1"
  local file_path="$2"
  sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "${file_path}" | head -n 1
}

resolve_mcp_publisher_asset() {
  local host_arch="${MCP_PUBLISHER_ARCH:-$(uname -m)}"
  case "${host_arch}" in
    x86_64 | amd64)
      MCP_PUB_URL="https://github.com/modelcontextprotocol/registry/releases/download/${MCP_PUBLISHER_VERSION}/mcp-publisher_linux_amd64.tar.gz"
      MCP_PUB_SHA="${MCP_PUBLISHER_SHA256_AMD64}"
      ;;
    aarch64 | arm64)
      MCP_PUB_URL="https://github.com/modelcontextprotocol/registry/releases/download/${MCP_PUBLISHER_VERSION}/mcp-publisher_linux_arm64.tar.gz"
      MCP_PUB_SHA="${MCP_PUBLISHER_SHA256_ARM64}"
      ;;
    *)
      echo -e "\e[31m❌ ERROR [MCP Registry]: Arquitectura no soportada para mcp-publisher: ${host_arch}\e[0m" >&2
      exit 1
      ;;
  esac
}

validate_mcp_registry_prerequisites() {
  SERVER_JSON="${REPO_ROOT}/server.json"
  if [ ! -f "${SERVER_JSON}" ]; then
    echo -e "\e[31m❌ ERROR [MCP Registry]: No se encontró server.json en ${REPO_ROOT}.\e[0m" >&2
    exit 1
  fi
  PKG_MCP_NAME="$(read_json_string_field "mcpName" "${PACKAGE_JSON}")"
  SERVER_NAME="$(read_json_string_field "name" "${SERVER_JSON}")"
  SERVER_VERSION="$(read_json_string_field "version" "${SERVER_JSON}")"
  if [ -z "${PKG_MCP_NAME}" ] || [ "${SERVER_NAME}" != "${PKG_MCP_NAME}" ]; then
    echo -e "\e[31m❌ ERROR [MCP Registry]: server.json#name (${SERVER_NAME:-vacío}) no coincide con mcp-server/package.json#mcpName (${PKG_MCP_NAME:-ausente}).\e[0m" >&2
    exit 1
  fi
  if [ "${SERVER_VERSION}" != "${PKG_VERSION}" ]; then
    echo -e "\e[31m❌ ERROR [MCP Registry]: server.json#version (${SERVER_VERSION:-vacío}) != mcp-server/package.json#version (${PKG_VERSION}).\e[0m" >&2
    exit 1
  fi
  echo "✔ [MCP Registry] Paridad local verificada (${SERVER_NAME}@${SERVER_VERSION})."
}

publish_mcp_registry() {
  resolve_mcp_publisher_asset
  echo -e "\n🌐 [MCP Registry] Validando ${SERVER_NAME}@${SERVER_VERSION} contra ${MCP_REGISTRY_URL}..."
  REMOTE_MCP_NAME="$(
    docker run --rm --restart=no --security-opt=no-new-privileges:true -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp "${IMAGE_NAME}" \
      npm view "${PKG_NAME}@${PKG_VERSION}" mcpName --registry="${NPM_REGISTRY}" --silent 2>/dev/null | head -n 1 | tr -d '[:space:]' || true
  )"
  if [ "${REMOTE_MCP_NAME}" != "${SERVER_NAME}" ]; then
    if [ "${DRY_RUN}" = true ]; then
      echo "ℹ️ Aviso [MCP Registry]: ${PKG_NAME}@${PKG_VERSION} en npmjs aún no expone mcpName=${SERVER_NAME} (actual: ${REMOTE_MCP_NAME:-ausente})."
    else
      echo -e "\e[31m❌ ERROR [MCP Registry]: ${PKG_NAME}@${PKG_VERSION} en npmjs no expone mcpName=${SERVER_NAME} (actual: ${REMOTE_MCP_NAME:-ausente}).\e[0m" >&2
      echo "💡 Incremente la versión, publique primero en npmjs (make publish-mcp) y luego ejecute: make publish-mcp-registry" >&2
      exit 1
    fi
  else
    echo "✔ [MCP Registry] Propiedad npm verificada en vivo (${PKG_NAME}@${PKG_VERSION} -> ${REMOTE_MCP_NAME})."
  fi

  local reg_tty_args=()
  local reg_auth_env_args=()
  local auth_method="github"
  local reg_mode="validate"
  if [ "${DRY_RUN}" = false ]; then
    reg_mode="publish"
    if [ "${GITHUB_ACTIONS:-false}" = "true" ] && [ -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]; then
      auth_method="github-oidc"
      reg_auth_env_args+=(-e GITHUB_ACTIONS -e ACTIONS_ID_TOKEN_REQUEST_URL -e ACTIONS_ID_TOKEN_REQUEST_TOKEN)
    elif [ -n "${MCP_GITHUB_TOKEN:-}" ]; then
      auth_method="github-token"
      export MCP_GITHUB_TOKEN
      reg_auth_env_args+=(-e MCP_GITHUB_TOKEN)
    elif [ -t 0 ] && [ -t 1 ]; then reg_tty_args=(-it); fi
    echo "🚀 Publicando ${SERVER_NAME}@${SERVER_VERSION} en ${MCP_REGISTRY_URL} (auth: ${auth_method})..."
  fi

  if ! docker run --rm --restart=no --security-opt=no-new-privileges:true ${reg_tty_args[@]+"${reg_tty_args[@]}"} \
    -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp \
    -e MCP_PUB_URL="${MCP_PUB_URL}" -e MCP_PUB_SHA="${MCP_PUB_SHA}" \
    -e MCP_MODE="${reg_mode}" -e MCP_AUTH="${auth_method}" \
    ${reg_auth_env_args[@]+"${reg_auth_env_args[@]}"} \
    -v "${SERVER_JSON}:/app/server.json:ro" -w /app "${IMAGE_NAME}" \
    sh -c 'set -eu; curl -fsSL "$MCP_PUB_URL" -o /tmp/m.tgz; printf "%s  /tmp/m.tgz\n" "$MCP_PUB_SHA" | sha256sum -c - >/dev/null; tar -xzf /tmp/m.tgz -C /tmp mcp-publisher; /tmp/mcp-publisher validate /app/server.json; if [ "$MCP_MODE" = publish ]; then if [ "$MCP_AUTH" = github-token ]; then /tmp/mcp-publisher login github --token "$MCP_GITHUB_TOKEN"; else /tmp/mcp-publisher login "$MCP_AUTH"; fi && /tmp/mcp-publisher publish /app/server.json; fi'; then
    echo -e "\e[31m❌ ERROR [MCP Registry]: Falló la validación o publicación con mcp-publisher (${MCP_PUBLISHER_VERSION}).\e[0m" >&2
    echo "💡 Para namespaces de organización (io.github.tecno-consultores/*), configure MCP_GITHUB_TOKEN (Classic PAT con scope read:org en .env) o ejecute con GitHub OIDC." >&2
    exit 1
  fi

  if [ "${DRY_RUN}" = true ]; then
    echo "✔ [MCP Registry] Simulación completada: server.json validado con mcp-publisher ${MCP_PUBLISHER_VERSION}."
    return 0
  fi

  echo "🔍 Verificando indexación en ${MCP_REGISTRY_URL}/v0.1/servers..."
  if docker run --rm --restart=no --security-opt=no-new-privileges:true -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp "${IMAGE_NAME}" \
    curl -fsSL "${MCP_REGISTRY_URL}/v0.1/servers?search=${SERVER_NAME}" 2>/dev/null | grep -qF "${SERVER_NAME}"; then
    echo -e "\e[32m✔ [MCP Registry] ${SERVER_NAME}@${SERVER_VERSION} visible en ${MCP_REGISTRY_URL}.\e[0m"
  else
    echo -e "\e[33m⚠️ Aviso [MCP Registry]: Publicación enviada; la indexación en ${MCP_REGISTRY_URL} puede tardar unos segundos.\e[0m"
  fi
}

if [ "${PUBLISH_REGISTRY}" = true ]; then
  validate_mcp_registry_prerequisites
fi

if [ "${REGISTRY_ONLY}" = true ]; then
  publish_mcp_registry
  "${REPO_ROOT}/scripts/limpieza.sh" --quiet
  exit 0
fi

ensure_fresh_dist_before_pack() {
  local dist_dir="${MCP_DIR}/dist"
  local dist_entry="${dist_dir}/index.js"
  local src_dir="${MCP_DIR}/src"
  local stale_files=""
  local map_files=""

  if [ -d "${src_dir}" ] && [ -f "${dist_entry}" ]; then
    stale_files="$(find "${src_dir}" -type f -newer "${dist_entry}" -print -quit 2>/dev/null || true)"
  fi
  if [ -d "${dist_dir}" ]; then
    map_files="$(find "${dist_dir}" -type f -name '*.map' -print -quit 2>/dev/null || true)"
  fi

  if [ ! -f "${dist_entry}" ] || [ -n "${stale_files}" ] || [ -n "${map_files}" ]; then
    echo "🔄 [Pre-Pack] dist/index.js ausente o desactualizado (o con *.map residuales) respecto a mcp-server/src/; recompilando en Docker..."
    docker run --rm --network none --restart=no --security-opt=no-new-privileges:true -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -e pnpm_config_manage_package_manager_versions=false -v "${MCP_DIR}:/app" -w /app "${IMAGE_NAME}" pnpm --silent run build
    stale_files=""
    map_files=""
    if [ -d "${src_dir}" ] && [ -f "${dist_entry}" ]; then
      stale_files="$(find "${src_dir}" -type f -newer "${dist_entry}" -print -quit 2>/dev/null || true)"
    fi
    if [ -d "${dist_dir}" ]; then
      map_files="$(find "${dist_dir}" -type f -name '*.map' -print -quit 2>/dev/null || true)"
    fi
    if [ ! -f "${dist_entry}" ] || [ -n "${stale_files}" ] || [ -n "${map_files}" ]; then
      echo -e "\e[31m❌ ERROR [Pre-Pack]: dist/index.js ausente o desactualizado (o con *.map residuales: ${map_files:-${stale_files:-dist/index.js}}).\e[0m" >&2
      exit 1
    fi
  fi
  echo "✔ [Pre-Pack] dist/index.js presente y actualizado respecto a mcp-server/src/."
}

# 4. Paso 1: Hidratación de dependencias y Verificación de Calidad (Rule Zero)
MCP_EXTRA_VOLS=()
if [ -f "${REPO_ROOT}/lefthook.yml" ]; then
  MCP_EXTRA_VOLS+=(-v "${REPO_ROOT}/lefthook.yml:/lefthook.yml:ro")
fi
for dir in mobile-appium vibe-rescue .github architecture .agents fastapi python node-backend vue3 react-frontend php bash-scripts ai-evals; do
  if [ -d "${REPO_ROOT}/${dir}" ]; then
    MCP_EXTRA_VOLS+=(-v "${REPO_ROOT}/${dir}:/${dir}:ro")
  fi
done

echo "🔍 [1/6] Verificando dependencias, Lint & Typecheck en Docker efímero..."
docker run --rm --restart=no --security-opt=no-new-privileges:true -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -e pnpm_config_manage_package_manager_versions=false -v "${MCP_DIR}:/app" ${MCP_EXTRA_VOLS[@]+"${MCP_EXTRA_VOLS[@]}"} -w /app "${IMAGE_NAME}" sh -c \
  "pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && pnpm --silent run lint && pnpm --silent run typecheck"

# 5. Paso 2: Compilación TypeScript a dist/ (requerido antes de suites live-mcp-protocol stdio)
echo "⚙️ [2/6] Compilando TypeScript a dist/..."
docker run --rm --network none --restart=no --security-opt=no-new-privileges:true -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -e pnpm_config_manage_package_manager_versions=false -v "${MCP_DIR}:/app" -w /app "${IMAGE_NAME}" pnpm --silent run build

# 6. Paso 3: Pruebas Unitarias con Cobertura >= 95%
if [ "$SKIP_TESTS" = false ]; then
  echo "🧪 [3/6] Ejecutando pruebas unitarias con cobertura en Docker efímero..."
  docker run --rm --network none --restart=no --security-opt=no-new-privileges:true -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -e pnpm_config_manage_package_manager_versions=false -v "${MCP_DIR}:/app" ${MCP_EXTRA_VOLS[@]+"${MCP_EXTRA_VOLS[@]}"} -w /app "${IMAGE_NAME}" pnpm --silent run test:unit
else
  echo "🧪 [3/6] Omitiendo pruebas unitarias (--skip-tests activado)."
fi

# 7. Paso 4: Certificación E2E Real sobre stdio con mcp-server/example/ + verify-v2.sh
echo "🎯 [4/6] Certificando 20 tools + 13 resources + quickstart + Clean-Room tarball..."
docker run --rm --network none --restart=no --security-opt=no-new-privileges:true -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp -e QA_BLUEPRINTS_LOCAL_PATH=/repo -e pnpm_config_manage_package_manager_versions=false -v "${REPO_ROOT}:/repo:ro" -v "${MCP_DIR}:/app" -w /app "${IMAGE_NAME}" sh -c 'pnpm --silent run test:example && bash ./example/verify-v2.sh'

# 8. Paso 5: Verificación explícita de compilación pre-pack y Auditoría de empaquetado (Dry-Run de npm pack)
ensure_fresh_dist_before_pack
echo "📦 [5/6] Validando empaquetado (npm pack --dry-run)..."
PACK_OUTPUT=$(docker run --rm --network none --restart=no --security-opt=no-new-privileges:true -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp -v "${MCP_DIR}:/app" -w /app "${IMAGE_NAME}" npm pack --dry-run 2>&1)
if printf '%s\n' "${PACK_OUTPUT}" | grep -qE '(^|[[:space:]])(src/|.*\.map$)'; then
  echo -e "\e[31m❌ ERROR [Pre-Pack]: Archivos src/ o *.map expuestos en npm pack --dry-run.\e[0m" >&2
  exit 1
fi
PACK_SUMMARY=$(printf '%s\n' "${PACK_OUTPUT}" | grep -E "package size:|unpacked size:|total files:|\.tgz" || true)
# shellcheck disable=SC2001
echo "${PACK_SUMMARY}" | sed 's/^/  /'

# 9. Paso 6: Verificación de versión y publicación
echo -e "\n🌐 [Paso 6/6] Verificando estado del paquete en ${NPM_REGISTRY}..."

ESCAPED_PKG_VERSION="${PKG_VERSION//./\\.}"
REMOTE_EXISTS=false
if docker run --rm --restart=no --security-opt=no-new-privileges:true -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp "${IMAGE_NAME}" npm view "${PKG_NAME}@${PKG_VERSION}" version --registry="${NPM_REGISTRY}" 2>/dev/null | grep -q "^${ESCAPED_PKG_VERSION}$"; then
  REMOTE_EXISTS=true
fi

if [ "$REMOTE_EXISTS" = true ]; then
  if [ "$DRY_RUN" = true ]; then
    echo -e "ℹ️ Aviso: La versión ${PKG_VERSION} de ${PKG_NAME} ya existe en npmjs (esperado en simulación)."
  else
    echo -e "\n\e[31m❌ ERROR: La versión ${PKG_VERSION} de ${PKG_NAME} ya está publicada en npmjs.org.\e[0m" >&2
    echo "💡 Para publicar una actualización:" >&2
    echo "   1. Incremente la versión en mcp-server/package.json (ej. de ${PKG_VERSION} a la siguiente versión semántica)." >&2
    echo "   2. Actualice CHANGELOG.md y ejecute nuevamente este script." >&2
    exit 1
  fi
else
  echo "✔ La versión ${PKG_VERSION} no existe aún en npmjs.org. Lista para publicación inicial."
fi

if [ "$DRY_RUN" = true ]; then
  if [ "${PUBLISH_REGISTRY}" = true ]; then
    publish_mcp_registry
  fi
  echo "══════════════════════════════════════════════════════════════════════"
  echo -e "\e[32m  🎉 SIMULACIÓN EXITOSA: El paquete ${PKG_NAME}@${PKG_VERSION} cumple 100% con el Estándar 11X \e[0m"
  echo "  Para publicar en vivo, configure NPM_TOKEN en .env y ejecute:"
  echo "  ./scripts/publicar-mcp.sh"
  echo "══════════════════════════════════════════════════════════════════════"
  exit 0
fi

# Publicación real con inyección de token efímero en memoria y soporte interactivo 2FA/OTP
ensure_fresh_dist_before_pack
echo -e "\n🚀 Publicando ${PKG_NAME}@${PKG_VERSION} en npmjs.org..."
echo "💡 Nota: Si su cuenta de npmjs requiere confirmación 2FA y el token no tiene \"Bypass 2FA\","
echo "   abra la URL https://www.npmjs.com/auth/cli/... que aparecerá abajo en su navegador para autorizar."

DOCKER_TTY_ARGS=()
if [ -t 0 ] && [ -t 1 ]; then
  DOCKER_TTY_ARGS=(-it)
fi

export NPM_TOKEN
export NPM_OTP="${NPM_OTP:-}"
export NPM_REGISTRY
PROVENANCE_ARG=""
DOCKER_PROVENANCE_ENV_ARGS=()
if [ "${GITHUB_ACTIONS:-false}" = "true" ] && [ -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]; then
  PROVENANCE_ARG=" --provenance"
  for oidc_var in \
    GITHUB_ACTIONS \
    ACTIONS_ID_TOKEN_REQUEST_URL \
    ACTIONS_ID_TOKEN_REQUEST_TOKEN \
    GITHUB_REPOSITORY \
    GITHUB_REPOSITORY_ID \
    GITHUB_REPOSITORY_OWNER_ID \
    GITHUB_RUN_ID \
    GITHUB_RUN_ATTEMPT \
    GITHUB_SHA \
    GITHUB_REF \
    GITHUB_WORKFLOW_REF \
    GITHUB_SERVER_URL \
    GITHUB_EVENT_NAME; do
    if [ -n "${!oidc_var:-}" ]; then
      DOCKER_PROVENANCE_ENV_ARGS+=(-e "${oidc_var}")
    fi
  done
fi

if ! docker run --rm --restart=no --security-opt=no-new-privileges:true ${DOCKER_TTY_ARGS[@]+"${DOCKER_TTY_ARGS[@]}"} \
  -u "${CURRENT_UID}:${CURRENT_GID}" \
  -e HOME=/tmp \
  -v "${MCP_DIR}:/app" \
  -w /app \
  -e NPM_TOKEN \
  -e NPM_OTP \
  -e NPM_REGISTRY \
  ${DOCKER_PROVENANCE_ENV_ARGS[@]+"${DOCKER_PROVENANCE_ENV_ARGS[@]}"} \
  "${IMAGE_NAME}" \
  sh -c 'umask 077; reg_norm="${NPM_REGISTRY%/}/"; reg_host="${reg_norm#http://}"; reg_host="${reg_host#https://}"; reg_host="${reg_host#//}"; trap "rm -f /tmp/.npmrc" EXIT; printf "//%s:_authToken=%s\nregistry=%s\n" "${reg_host}" "${NPM_TOKEN}" "${NPM_REGISTRY}" > /tmp/.npmrc && chmod 600 /tmp/.npmrc && export NPM_CONFIG_USERCONFIG=/tmp/.npmrc && if [ -n "${NPM_OTP:-}" ]; then export NPM_CONFIG_OTP="${NPM_OTP}"; fi && npm publish --access public --no-browser'"${PROVENANCE_ARG}"' --registry="${NPM_REGISTRY}"'; then
  echo -e "\n\e[31m❌ ERROR: No se completó la publicación en npmjs.org (posible requerimiento 2FA / EOTP).\e[0m" >&2
  echo "💡 Soluciones:" >&2
  echo "   1. Ejecute desde su terminal interactiva y abra en el navegador el enlace https://www.npmjs.com/auth/cli/... cuando aparezca." >&2
  echo "   2. Pase su código 2FA de 6 dígitos directamente: ./scripts/publicar-mcp.sh --skip-tests --otp 123456" >&2
  echo "   3. O regenere su Granular Access Token en npmjs.com marcando la casilla \"[x] Bypass two-factor authentication (2FA)\"." >&2
  exit 1
fi

echo -e "\n🔍 Verificando propagación en el CDN de ${NPM_REGISTRY}..."
VERIFY_ATTEMPTS=6
VERIFY_DELAY=5
VERIFIED_REMOTE_VERSION=""

for attempt in $(seq 1 "${VERIFY_ATTEMPTS}"); do
  VERIFIED_REMOTE_VERSION="$(
    docker run --rm --restart=no --security-opt=no-new-privileges:true -u "${CURRENT_UID}:${CURRENT_GID}" -e HOME=/tmp "${IMAGE_NAME}" \
      npm view "${PKG_NAME}@${PKG_VERSION}" version --registry "${NPM_REGISTRY}" --silent 2>/dev/null |
      grep -E '^[0-9]+\.[0-9]+\.[0-9]+' |
      head -n 1 |
      tr -d '[:space:]' || true
  )"
  if [ "${VERIFIED_REMOTE_VERSION}" = "${PKG_VERSION}" ]; then
    echo -e "\e[32m✔ Versión ${PKG_VERSION} verificada y disponible en el CDN de npmjs (intento ${attempt}/${VERIFY_ATTEMPTS}).\e[0m"
    break
  fi
  if [ "${attempt}" -lt "${VERIFY_ATTEMPTS}" ]; then
    echo "⏳ Esperando propagación asíncrona del CDN de npmjs (intento ${attempt}/${VERIFY_ATTEMPTS}, reintentando en ${VERIFY_DELAY}s)..."
    sleep "${VERIFY_DELAY}"
  fi
done

if [ "${VERIFIED_REMOTE_VERSION}" != "${PKG_VERSION}" ]; then
  echo -e "\e[33m⚠️ Aviso: npm publish concluyó con éxito (+ ${PKG_NAME}@${PKG_VERSION}), pero el CDN de npmjs aún está procesando la propagación inicial.\e[0m"
  echo "   Estará visible en unos instantes ejecutando: npm view ${PKG_NAME} version"
fi

if [ "${PUBLISH_REGISTRY}" = true ]; then
  publish_mcp_registry
fi

# Saneamiento final
"${REPO_ROOT}/scripts/limpieza.sh" --quiet

echo "🎉 PUBLICACIÓN EXITOSA: ${PKG_NAME}@${PKG_VERSION} disponible vía: npx -y ${PKG_NAME}"
exit 0
