#!/bin/sh
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# ==============================================================================
# 🧠 scripts/install-skill.sh — Instalador Universal de Skills QA 11X
#
# Descarga e instala el catálogo completo de 5 skills ('qa-11x-architect',
# 'refactoring-ui', 'docker-trivy-keydb-hardening', 'graphify-ast-navigator' y
# 'qa-11x-docker-certifier') con verificación criptográfica SHA-256
# (DISA ASD STIG V6R5 V-222513 / APSC-DV-001430) sin necesidad de clonar el
# repositorio completo (Arquitectura Zero-Clone).
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/scripts/install-skill.sh | sh
#   ./scripts/install-skill.sh [--target antigravity|claude|cursor|hermes|workspace|all]
# ==============================================================================

set -eu

REPO="tecno-consultores/qa-testing-blueprints"
DEFAULT_BRANCH="main"
RAW_BASE_URL="https://raw.githubusercontent.com/${REPO}/${DEFAULT_BRANCH}"

# Colores para salida de terminal (si soporta TTY)
if [ -t 1 ]; then
  C_RESET="\033[0m"
  C_BOLD="\033[1m"
  C_CYAN="\033[36m"
  C_GREEN="\033[32m"
  C_YELLOW="\033[33m"
  C_RED="\033[31m"
else
  C_RESET=""
  C_BOLD=""
  C_CYAN=""
  C_GREEN=""
  C_YELLOW=""
  C_RED=""
fi

log_info() {
  printf "%b[INFO]%b %s\n" "${C_CYAN}" "${C_RESET}" "$1"
}

log_ok() {
  printf "%b[OK]%b %s\n" "${C_GREEN}" "${C_RESET}" "$1"
}

log_warn() {
  printf "%b[ADVERTENCIA]%b %s\n" "${C_YELLOW}" "${C_RESET}" "$1"
}

log_error() {
  printf "%b[ERROR]%b %s\n" "${C_RED}" "${C_RESET}" "$1" >&2
}

# Limpieza segura al salir
TMP_DIR=""
cleanup() {
  if [ -n "${TMP_DIR:-}" ] && [ -d "${TMP_DIR}" ]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT INT TERM

# Función para calcular SHA-256 en POSIX sh
compute_sha256() {
  _file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${_file}" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${_file}" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "${_file}" | awk '{print $NF}'
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], 'rb').read()).hexdigest())" "${_file}"
  else
    log_error "No se encontró ninguna herramienta para calcular SHA-256 (sha256sum, shasum, openssl, python3)."
    return 1
  fi
}

# Función para descargar archivos de red
fetch_file() {
  _url="$1"
  _dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "${_url}" -o "${_dest}"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "${_dest}" "${_url}"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import urllib.request, sys; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])" "${_url}" "${_dest}"
  else
    log_error "No se encontró ni curl, ni wget, ni python3 para descargar archivos."
    return 1
  fi
}

# Parsear argumentos de línea de comandos
TARGET_ARG=""
INCLUDE_SCRIPTS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target | -t)
      if [ -n "${2:-}" ]; then
        TARGET_ARG="$2"
        shift 2
      else
        log_error "La opción --target requiere un argumento."
        exit 1
      fi
      ;;
    --target=*)
      TARGET_ARG="${1#*=}"
      shift
      ;;
    --include-scripts)
      INCLUDE_SCRIPTS=1
      shift
      ;;
    --help | -h)
      printf "%bInstalador Universal de Skills QA 11X%b\n" "${C_BOLD}" "${C_RESET}"
      printf "Uso: install-skill.sh [opciones]\n\n"
      printf "Opciones:\n"
      printf "  --target, -t <entorno>   Destino: auto (defecto) | workspace | antigravity | claude | cursor | hermes | all\n"
      printf "  --include-scripts        Instala también .agents/scripts/* y scripts/* (excluyendo publicar-mcp.sh) en el proyecto actual\n"
      printf "  --help, -h               Muestra esta ayuda\n"
      exit 0
      ;;
    *)
      log_warn "Argumento desconocido ignorado: $1"
      shift
      ;;
  esac
done

TARGET_SELECTION="${TARGET_ARG:-${QA_SKILL_TARGET:-${TARGET:-auto}}}"

case "${TARGET_SELECTION}" in
  "" | auto | all | workspace | local | antigravity | claude | cursor | hermes) ;;
  *)
    log_error "Destino --target inválido: '${TARGET_SELECTION}'. Valores permitidos: auto, workspace, antigravity, claude, cursor, hermes, all."
    exit 1
    ;;
esac

# Banner de Inicio
printf "\n%b══════════════════════════════════════════════════════════════════════%b\n" "${C_CYAN}" "${C_RESET}"
printf "%b   🧠 Instalador Universal de Skills QA 11X (Estándar Corporativo)    %b\n" "${C_BOLD}" "${C_RESET}"
printf "%b══════════════════════════════════════════════════════════════════════%b\n\n" "${C_CYAN}" "${C_RESET}"

# Crear directorio temporal
TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'qa11x_install')"

# Obtener manifest.json (local si existe y se configuró, o remoto de GitHub)
MANIFEST_FILE="${TMP_DIR}/manifest.json"
if [ -n "${QA_BLUEPRINTS_LOCAL_PATH:-}" ] && [ -f "${QA_BLUEPRINTS_LOCAL_PATH}/manifest.json" ]; then
  log_info "Utilizando manifiesto local desde: ${QA_BLUEPRINTS_LOCAL_PATH}/manifest.json"
  cp "${QA_BLUEPRINTS_LOCAL_PATH}/manifest.json" "${MANIFEST_FILE}"
elif [ -f "./manifest.json" ]; then
  log_info "Utilizando manifiesto detectado en directorio actual: ./manifest.json"
  cp "./manifest.json" "${MANIFEST_FILE}"
else
  log_info "Descargando manifiesto criptográfico remoto desde GitHub..."
  fetch_file "${RAW_BASE_URL}/manifest.json" "${MANIFEST_FILE}"
fi

# Extraer lista de archivos de todas las skills indexadas en .agents/skills/
# Formato de salida: <path> <sha256> <size>
SKILL_INDEX="${TMP_DIR}/skill_files.txt"
if command -v jq >/dev/null 2>&1; then
  jq -r '.agent_governance_files[] | select(.path | startswith(".agents/skills/")) | "\(.path) \(.sha256) \(.size_bytes)"' "${MANIFEST_FILE}" >"${SKILL_INDEX}"
elif command -v python3 >/dev/null 2>&1; then
  python3 -c '
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
gov = data.get("agent_governance_files", [])
for item in gov:
    p = item.get("path", "")
    if p.startswith(".agents/skills/"):
        sha = item.get("sha256", "")
        size = item.get("size_bytes", 0)
        print(f"{p} {sha} {size}")
' "${MANIFEST_FILE}" >"${SKILL_INDEX}"
else
  log_error "Se requiere 'jq' o 'python3' para analizar el manifiesto JSON."
  exit 1
fi

TOTAL_FILES="$(wc -l <"${SKILL_INDEX}" | tr -d ' ')"
if [ "${TOTAL_FILES}" -eq 0 ]; then
  log_error "No se encontraron archivos de skills en manifest.json."
  exit 1
fi
log_ok "Manifiesto verificado. Archivos de skills indexados: ${TOTAL_FILES}"

# Determinar directorios de destino
HOME_DIR="${HOME:-$(eval echo "~")}"

resolve_destination_dirs() {
  _target="$1"
  _pwd="$(pwd)"
  case "${_target}" in
    workspace | local)
      printf "%s/.agents/skills\n" "${_pwd}"
      ;;
    antigravity)
      printf "%s/.gemini/config/skills\n" "${HOME_DIR}"
      ;;
    claude)
      printf "%s/.claude/skills\n" "${HOME_DIR}"
      ;;
    cursor)
      printf "%s/.cursor/skills\n" "${HOME_DIR}"
      ;;
    hermes)
      printf "%s/.hermes/skills\n" "${HOME_DIR}"
      ;;
    all | auto | "")
      # Autodetección inteligente global (auto / all): instala exclusivamente en los agentes globales detectados
      # y solo usa <proyecto>/.agents/skills como fallback si no existe ningún agente global en $HOME
      _found_any=0
      if [ -d "${HOME_DIR}/.gemini" ] || [ -d "${HOME_DIR}/.gemini/antigravity" ]; then
        printf "%s/.gemini/config/skills\n" "${HOME_DIR}"
        _found_any=1
      fi
      if [ -d "${HOME_DIR}/.claude" ]; then
        printf "%s/.claude/skills\n" "${HOME_DIR}"
        _found_any=1
      fi
      if [ -d "${HOME_DIR}/.hermes" ]; then
        printf "%s/.hermes/skills\n" "${HOME_DIR}"
        _found_any=1
      fi
      if [ -d "${HOME_DIR}/.cursor" ]; then
        printf "%s/.cursor/skills\n" "${HOME_DIR}"
        _found_any=1
      fi
      if [ "${_found_any}" -eq 0 ]; then
        printf "%s/.agents/skills\n" "${_pwd}"
      fi
      ;;
  esac
}

DEST_DIRS="$(resolve_destination_dirs "${TARGET_SELECTION}")"

log_info "Destinos de instalación resueltos:"
printf '%s\n' "${DEST_DIRS}" | while IFS= read -r d; do
  [ -z "${d}" ] && continue
  printf "  - %b%s%b\n" "${C_BOLD}" "${d}" "${C_RESET}"
done

# Descargar y validar criptográficamente cada archivo en TMP_DIR
VERIFIED_STAGING="${TMP_DIR}/staging"
mkdir -p "${VERIFIED_STAGING}"
VERIFIED_COUNT=0

while read -r rel_path expected_sha _; do
  [ -z "${rel_path}" ] && continue

  skill_rel_path="${rel_path#.agents/skills/}"
  staging_dest="${VERIFIED_STAGING}/${skill_rel_path}"
  staging_dir="$(dirname "${staging_dest}")"
  mkdir -p "${staging_dir}"

  if [ -n "${QA_BLUEPRINTS_LOCAL_PATH:-}" ] && [ -f "${QA_BLUEPRINTS_LOCAL_PATH}/${rel_path}" ]; then
    cp "${QA_BLUEPRINTS_LOCAL_PATH}/${rel_path}" "${staging_dest}"
  elif [ -f "./${rel_path}" ]; then
    cp "./${rel_path}" "${staging_dest}"
  else
    file_url="${RAW_BASE_URL}/${rel_path}"
    fetch_file "${file_url}" "${staging_dest}"
  fi

  # Verificación criptográfica obligatoria (DISA STIG V-222513)
  actual_sha="$(compute_sha256 "${staging_dest}")"
  if [ "${actual_sha}" != "${expected_sha}" ]; then
    log_error "🚨 VIOLACIÓN DE INTEGRIDAD CRIPTOGRÁFICA (DISA ASD STIG V6R5 V-222513)"
    log_error "Archivo: ${rel_path} | Esperado: ${expected_sha} | Actual: ${actual_sha}"
    log_error "La instalación ha sido abortada por seguridad."
    exit 1
  fi
  VERIFIED_COUNT=$((VERIFIED_COUNT + 1))
done <"${SKILL_INDEX}"

log_ok "Integridad SHA-256 certificada (${VERIFIED_COUNT}/${TOTAL_FILES} archivos verificados)."

# Instalar archivos validados en cada destino
printf '%s\n' "${DEST_DIRS}" | while IFS= read -r dest; do
  [ -z "${dest}" ] && continue
  mkdir -p "${dest}"
  cp -R "${VERIFIED_STAGING}/"* "${dest}/"
  log_ok "Skills instaladas en: ${dest}"
done

# Instalación opcional de scripts Thin-Repo (--include-scripts), excluyendo publicar-mcp.sh
if [ "${INCLUDE_SCRIPTS}" -eq 1 ]; then
  SCRIPT_INDEX="${TMP_DIR}/script_files.txt"
  if command -v jq >/dev/null 2>&1; then
    jq -r '((.agent_governance_files // []) + (.common_files // []))[] | select((.path | startswith(".agents/scripts/") or startswith("scripts/")) and (.path != "scripts/publicar-mcp.sh")) | "\(.path) \(.sha256)"' "${MANIFEST_FILE}" >"${SCRIPT_INDEX}"
  else
    python3 -c '
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
items = data.get("agent_governance_files", []) + data.get("common_files", [])
for item in items:
    p = item.get("path", "")
    if (p.startswith(".agents/scripts/") or p.startswith("scripts/")) and p != "scripts/publicar-mcp.sh":
        print(f"{p} {item.get(\"sha256\", \"\")}")
' "${MANIFEST_FILE}" >"${SCRIPT_INDEX}"
  fi

  while read -r s_path s_sha; do
    [ -z "${s_path}" ] && continue
    s_tmp="${TMP_DIR}/script_$(basename "${s_path}")"
    if [ -n "${QA_BLUEPRINTS_LOCAL_PATH:-}" ] && [ -f "${QA_BLUEPRINTS_LOCAL_PATH}/${s_path}" ]; then
      cp "${QA_BLUEPRINTS_LOCAL_PATH}/${s_path}" "${s_tmp}"
    elif [ -f "./${s_path}" ]; then
      cp "./${s_path}" "${s_tmp}"
    else
      fetch_file "${RAW_BASE_URL}/${s_path}" "${s_tmp}"
    fi
    actual_s_sha="$(compute_sha256 "${s_tmp}")"
    if [ "${actual_s_sha}" != "${s_sha}" ]; then
      log_error "Violación SHA-256 en script: ${s_path}"
      exit 1
    fi
    mkdir -p "$(dirname "./${s_path}")"
    cp "${s_tmp}" "./${s_path}"
    chmod +x "./${s_path}"
  done <"${SCRIPT_INDEX}"
  log_ok "Scripts de automatización instalados en $(pwd) (excluyendo publicar-mcp.sh)."
fi

printf "✅ Instalación de Skills QA 11X Completada con Éxito (5 skills: qa-11x-architect, refactoring-ui, docker-trivy-keydb-hardening, graphify-ast-navigator, qa-11x-docker-certifier).\n"
