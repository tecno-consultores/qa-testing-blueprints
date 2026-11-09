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
CLI_OTP=""
IMAGE_NAME="sinfallas/base-node-ionic:26"
NPM_REGISTRY="https://registry.npmjs.org/"

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
      echo "  --otp <código>  Código 2FA/OTP de 6 dígitos (si el token no tiene Bypass 2FA)"
      echo "  -h, --help      Muestra esta ayuda"
      echo ""
      echo "Autenticación:"
      echo "  Crea un archivo '.env' en la raíz con: NPM_TOKEN=npm_tu_token_aqui"
      echo "  o expórtalo en tu sesión: export NPM_TOKEN=npm_..."
      echo "  (Para publicar sin que pida 2FA/OTP, marca 'Bypass 2FA' al crear el token en npmjs.com)"
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
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MCP_DIR="${REPO_ROOT}/mcp-server"
PACKAGE_JSON="${MCP_DIR}/package.json"

if [ ! -f "${PACKAGE_JSON}" ]; then
  echo -e "\e[31mERROR: No se encontró mcp-server/package.json en ${MCP_DIR}.\e[0m" >&2
  exit 1
fi

PKG_NAME=$(grep -m 1 '"name":' "${PACKAGE_JSON}" | cut -d '"' -f 4)
PKG_VERSION=$(grep -m 1 '"version":' "${PACKAGE_JSON}" | cut -d '"' -f 4)

echo "══════════════════════════════════════════════════════════════════════"
echo "  🚀 Publicador Autónomo de Servidor MCP a npmjs (Estándar 11X)        "
echo "══════════════════════════════════════════════════════════════════════"
echo "  Paquete:  ${PKG_NAME}"
echo "  Versión:  ${PKG_VERSION}"
echo "  Modo:     $([ "$DRY_RUN" = true ] && echo "🔍 Simulación (Dry-Run)" || echo "🌐 Publicación en Vivo")"
echo "══════════════════════════════════════════════════════════════════════"

# 2. Cargar token de autenticación desde .env en la raíz
ENV_FILE="${REPO_ROOT}/.env"
if [ -f "${ENV_FILE}" ]; then
  echo -e "\n📄 Cargando variables de autenticación desde .env..."
  TOKEN_VAL=$(grep -E '^\s*NPM_TOKEN=' "${ENV_FILE}" | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ' || true)
  if [ -n "${TOKEN_VAL}" ]; then
    NPM_TOKEN="${TOKEN_VAL}"
  fi
  REG_VAL=$(grep -E '^\s*NPM_REGISTRY=' "${ENV_FILE}" | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ' || true)
  if [ -n "${REG_VAL}" ]; then
    NPM_REGISTRY="${REG_VAL}"
  fi
  OTP_VAL=$(grep -E '^\s*NPM_OTP=' "${ENV_FILE}" | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ' || true)
  if [ -n "${OTP_VAL}" ]; then
    NPM_OTP="${OTP_VAL}"
  fi
fi

if [ -n "${CLI_OTP}" ]; then
  NPM_OTP="${CLI_OTP}"
fi

# Validar presencia del token si no estamos en dry-run
if [ "$DRY_RUN" = false ]; then
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
echo "🧹 [0/5] Saneando espacio de trabajo..."
"${REPO_ROOT}/scripts/limpieza.sh" --quiet

# 4. Paso 1: Verificación de Calidad y Linting (Rule Zero)
echo "🔍 [1/5] Ejecutando Lint & Typecheck en Docker efímero..."
docker run --rm -v "${MCP_DIR}:/app" -w /app "${IMAGE_NAME}" pnpm --silent run lint
docker run --rm -v "${MCP_DIR}:/app" -w /app "${IMAGE_NAME}" pnpm --silent run typecheck

# 5. Paso 2: Pruebas Unitarias con Cobertura >= 95%
if [ "$SKIP_TESTS" = false ]; then
  echo "🧪 [2/5] Ejecutando pruebas unitarias con cobertura en Docker efímero..."
  docker run --rm -v "${MCP_DIR}:/app" -w /app "${IMAGE_NAME}" pnpm --silent run test:unit
else
  echo "🧪 [2/5] Omitiendo pruebas unitarias (--skip-tests activado)."
fi

# 6. Paso 3: Compilación TypeScript a dist/
echo "⚙️ [3/5] Compilando TypeScript a dist/..."
docker run --rm -v "${MCP_DIR}:/app" -w /app "${IMAGE_NAME}" pnpm --silent run build

# 7. Paso 4: Auditoría de empaquetado (Dry-Run de npm pack)
echo "📦 [4/5] Validando empaquetado (npm pack --dry-run)..."
PACK_SUMMARY=$(docker run --rm -v "${MCP_DIR}:/app" -w /app "${IMAGE_NAME}" npm pack --dry-run 2>&1 | grep -E "package size:|unpacked size:|total files:|\.tgz" || true)
# shellcheck disable=SC2001
echo "${PACK_SUMMARY}" | sed 's/^/  /'

# 8. Paso 5: Verificación de versión y publicación
echo -e "\n🌐 [Paso 5/5] Verificando estado del paquete en ${NPM_REGISTRY}..."

REMOTE_EXISTS=false
if docker run --rm "${IMAGE_NAME}" npm view "${PKG_NAME}@${PKG_VERSION}" version --registry="${NPM_REGISTRY}" 2>/dev/null | grep -q "^${PKG_VERSION}$"; then
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
  echo "══════════════════════════════════════════════════════════════════════"
  echo -e "\e[32m  🎉 SIMULACIÓN EXITOSA: El paquete ${PKG_NAME}@${PKG_VERSION} cumple 100% con el Estándar 11X \e[0m"
  echo "  Para publicar en vivo, configure NPM_TOKEN en .env y ejecute:"
  echo "  ./scripts/publicar-mcp.sh"
  echo "══════════════════════════════════════════════════════════════════════"
  exit 0
fi

# Publicación real con inyección de token efímero en memoria y soporte interactivo 2FA/OTP
echo -e "\n🚀 Publicando ${PKG_NAME}@${PKG_VERSION} en npmjs.org..."
echo "💡 Nota: Si su cuenta de npmjs requiere confirmación 2FA y el token no tiene 'Bypass 2FA',"
echo "   abra la URL https://www.npmjs.com/auth/cli/... que aparecerá abajo en su navegador para autorizar."

DOCKER_TTY_ARGS=()
if [ -t 0 ] && [ -t 1 ]; then
  DOCKER_TTY_ARGS=(-it)
fi

if ! docker run --rm "${DOCKER_TTY_ARGS[@]}" \
  -v "${MCP_DIR}:/app" \
  -w /app \
  -e NPM_TOKEN="${NPM_TOKEN}" \
  -e NPM_OTP="${NPM_OTP:-}" \
  "${IMAGE_NAME}" \
  sh -c 'npm config set //registry.npmjs.org/:_authToken "${NPM_TOKEN}" && if [ -n "${NPM_OTP:-}" ]; then npm publish --access public --no-browser --otp="${NPM_OTP}"; else npm publish --access public --no-browser; fi'; then
  echo -e "\n\e[31m❌ ERROR: No se completó la publicación en npmjs.org (posible requerimiento 2FA / EOTP).\e[0m" >&2
  echo "💡 Soluciones:" >&2
  echo "   1. Ejecute desde su terminal interactiva y abra en el navegador el enlace https://www.npmjs.com/auth/cli/... cuando aparezca." >&2
  echo "   2. Pase su código 2FA de 6 dígitos directamente: ./scripts/publicar-mcp.sh --skip-tests --otp 123456" >&2
  echo "   3. O regenere su Granular Access Token en npmjs.com marcando la casilla '[x] Bypass two-factor authentication (2FA)'." >&2
  exit 1
fi

echo -e "\n🔍 Verificando propagación en el CDN de ${NPM_REGISTRY}..."
VERIFY_ATTEMPTS=6
VERIFY_DELAY=5
VERIFIED_REMOTE_VERSION=""

for attempt in $(seq 1 "${VERIFY_ATTEMPTS}"); do
  VERIFIED_REMOTE_VERSION="$(
    docker run --rm "${IMAGE_NAME}" \
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

# Saneamiento final
"${REPO_ROOT}/scripts/limpieza.sh" --quiet

echo "🎉 PUBLICACIÓN EXITOSA: ${PKG_NAME}@${PKG_VERSION} disponible vía: npx -y ${PKG_NAME}"
exit 0
