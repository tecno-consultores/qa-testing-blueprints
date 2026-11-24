#!/bin/sh
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

# ==============================================================================
# 🧠 scripts/install-skill.sh — Instalador Universal de Skills QA 11X
#
# Descarga e instala el catálogo completo de 11 skills QA-11X modulares
# ('qa-11x-architect', 'qa-11x-devsecops-hardener', 'qa-11x-systematic-debugging',
# 'qa-11x-screenplay-builder', 'qa-11x-llm-evaluator', 'qa-11x-vibe-rescue',
# 'qa-11x-docker-certifier', 'docker-trivy-keydb-hardening',
# 'graphify-ast-navigator', 'refactoring-ui' y 'tactical-patterns-11x') con verificación criptográfica SHA-256
# (DISA ASD STIG V6R5 V-222513 / APSC-DV-001430) sin necesidad de clonar el
# repositorio completo (Arquitectura Zero-Clone).
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/tecno-consultores/qa-testing-blueprints/main/scripts/install-skill.sh | sh
#   ./scripts/install-skill.sh [--target antigravity|claude|cursor|windsurf|codex|hermes|workspace|all] [--dry-run]
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
  printf "%b[WARN]%b %s\n" "${C_YELLOW}" "${C_RESET}" "$1" >&2
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
LANG_ARG=""
INCLUDE_SCRIPTS=0
INIT_AGENTS=0
DRY_RUN=0
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
    --lang | -l)
      if [ -n "${2:-}" ]; then
        LANG_ARG="$2"
        shift 2
      else
        log_error "La opción --lang requiere un argumento (auto|es|en)." && exit 1
      fi
      ;;
    --lang=*)
      LANG_ARG="${1#*=}"
      shift
      ;;
    --include-scripts)
      INCLUDE_SCRIPTS=1
      shift
      ;;
    --init-agents)
      INIT_AGENTS=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help | -h)
      printf "%bInstalador Universal de Skills QA 11X%b\n" "${C_BOLD}" "${C_RESET}"
      printf "Uso: install-skill.sh [opciones]\n\n"
      printf "Opciones:\n"
      printf "  --target, -t <entorno>   Destino: auto (defecto) | workspace | antigravity | claude | cursor | windsurf | codex | hermes | all\n"
      printf "  --lang, -l <auto|es|en>  Política de idioma (defecto: conserva idioma previo o auto)\n"
      printf "  --include-scripts        Instala también .agents/scripts/* y archivos comunes (excluye monorepo y protege scripts/* propios)\n"
      printf "  --init-agents            Inyecta o actualiza el bloque conector Thin-Repo en AGENTS.md del proyecto\n"
      printf "  --dry-run                Muestra el plan de instalación sin escribir archivos en disco\n"
      printf "  --help, -h               Muestra esta ayuda\n"
      exit 0
      ;;
    *)
      log_error "Opción CLI desconocida: $1. Use --help para ver las opciones válidas."
      exit 1
      ;;
  esac
done

EXPLICIT_LANG="${LANG_ARG:-${QA_OUTPUT_LANG:-}}"
if [ -n "${EXPLICIT_LANG}" ]; then
  EXPLICIT_LANG="$(printf '%s' "${EXPLICIT_LANG}" | tr '[:upper:]' '[:lower:]')"
  if [ "${EXPLICIT_LANG}" != "auto" ] && [ "${EXPLICIT_LANG}" != "es" ] && [ "${EXPLICIT_LANG}" != "en" ]; then
    log_error "Modo de idioma inválido: '${EXPLICIT_LANG}'. Valores permitidos: auto, es, en." && exit 1
  fi
fi

TARGET_SELECTION="${TARGET_ARG:-${QA_SKILL_TARGET:-${TARGET:-auto}}}"

case "${TARGET_SELECTION}" in
  "" | auto | all | workspace | local | antigravity | claude | cursor | windsurf | codex | hermes) ;;
  *)
    log_error "Destino --target inválido: '${TARGET_SELECTION}'. Valores permitidos: auto, workspace, antigravity, claude, cursor, windsurf, codex, hermes, all."
    exit 1
    ;;
esac

HOME_DIR="${HOME:-$(eval echo "~")}"
[ "${HOME_DIR}" != "/" ] && HOME_DIR="${HOME_DIR%/}"
PWD_REAL="$(cd "$(pwd)" 2>/dev/null && pwd -P)"
HOME_REAL="$(cd "${HOME_DIR}" 2>/dev/null && pwd -P || printf '%s' "${HOME_DIR}")"
IN_HOME_DIR=0
if [ "${PWD_REAL}" = "${HOME_REAL}" ]; then
  IN_HOME_DIR=1
fi

if [ "${IN_HOME_DIR}" -eq 1 ]; then
  case "${TARGET_SELECTION}" in
    workspace | local)
      log_error "Guardia \$HOME: no ejecute --target ${TARGET_SELECTION} con cwd=${HOME_DIR}. Use --target antigravity|all o ejecute desde un proyecto."
      exit 1
      ;;
  esac
fi

# Banner de Inicio
printf "\n%b══════════════════════════════════════════════════════════════════════%b\n" "${C_CYAN}" "${C_RESET}"
printf "%b   🧠 Instalador Universal de Skills QA 11X (Estándar Corporativo)    %b\n" "${C_BOLD}" "${C_RESET}"
printf "%b══════════════════════════════════════════════════════════════════════%b\n\n" "${C_CYAN}" "${C_RESET}"

# Crear directorio temporal
TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'qa11x_install')"

# Obtener manifest.json (local si existe y se configuró, o remoto de GitHub)
is_qa11x_local_manifest() {
  grep -q '"agent_governance_files"' "$1" 2>/dev/null &&
    grep -q '"tecno-consultores/qa-testing-blueprints"' "$1" 2>/dev/null
}

USING_LOCAL_MANIFEST=0
MANIFEST_FILE="${TMP_DIR}/manifest.json"
if [ -n "${QA_BLUEPRINTS_LOCAL_PATH:-}" ] && [ -f "${QA_BLUEPRINTS_LOCAL_PATH}/manifest.json" ]; then
  log_info "Utilizando manifiesto local desde: ${QA_BLUEPRINTS_LOCAL_PATH}/manifest.json"
  cp "${QA_BLUEPRINTS_LOCAL_PATH}/manifest.json" "${MANIFEST_FILE}"
  USING_LOCAL_MANIFEST=1
elif [ -f "./manifest.json" ] && is_qa11x_local_manifest "./manifest.json"; then
  log_warn "Detectado ./manifest.json de qa-testing-blueprints sin QA_BLUEPRINTS_LOCAL_PATH; usando copia local."
  cp "./manifest.json" "${MANIFEST_FILE}"
  USING_LOCAL_MANIFEST=1
else
  if [ -f "./manifest.json" ]; then
    log_warn "Se detectó ./manifest.json ajeno a QA-11X (ej. manifiesto web/PWA); ignorando archivo local y descargando remoto."
  fi
  log_info "Descargando manifiesto criptográfico remoto desde GitHub..."
  fetch_file "${RAW_BASE_URL}/manifest.json" "${MANIFEST_FILE}"
fi

run_manifest_py() {
  _py_code="$1"
  _py_image="${QA_PYTHON_IMAGE:-sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4}"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "${_py_code}" "${MANIFEST_FILE}"
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm --network none --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -v "${TMP_DIR}:/qa-tmp:ro" "${_py_image}" python3 -c "${_py_code}" "/qa-tmp/manifest.json"
  else
    log_error "Se requiere 'jq', 'python3' o 'docker' para analizar el manifiesto JSON."
    return 1
  fi
}

# Extraer lista de archivos de todas las skills indexadas en .agents/skills/
# Formato de salida: <path> <sha256> <size>
SKILL_INDEX="${TMP_DIR}/skill_files.txt"
if command -v jq >/dev/null 2>&1; then
  BLUEPRINT_VERSION="$(jq -r '.blueprint_version // "unknown"' "${MANIFEST_FILE}")"
  jq -r '.agent_governance_files[] | select(.path | startswith(".agents/skills/")) | "\(.path) \(.sha256) \(.size_bytes)"' "${MANIFEST_FILE}" >"${SKILL_INDEX}"
else
  BLUEPRINT_VERSION="$(run_manifest_py 'import json, sys; print(json.load(open(sys.argv[1], encoding="utf-8")).get("blueprint_version", "unknown"))')" || exit 1
  run_manifest_py '
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
gov = data.get("agent_governance_files", [])
for item in gov:
    p = item.get("path", "")
    if p.startswith(".agents/skills/"):
        sha = item.get("sha256", "")
        size = item.get("size_bytes", 0)
        print(f"{p} {sha} {size}")
' >"${SKILL_INDEX}" || exit 1
fi

TOTAL_FILES="$(wc -l <"${SKILL_INDEX}" | tr -d ' ')"
if [ "${TOTAL_FILES}" -eq 0 ]; then
  log_error "No se encontraron archivos de skills en manifest.json."
  exit 1
fi
log_ok "Manifiesto verificado. Archivos de skills indexados: ${TOTAL_FILES}"

emit_gemini_skill_dirs() {
  printf "%s/.gemini/config/skills\n" "${HOME_DIR}"
  if [ -d "${HOME_DIR}/.gemini/antigravity" ]; then
    printf "%s/.gemini/antigravity/skills\n" "${HOME_DIR}"
  fi
}

detect_global_agent_dirs() {
  if [ -d "${HOME_DIR}/.gemini" ]; then
    emit_gemini_skill_dirs
  fi
  if [ -d "${HOME_DIR}/.claude" ]; then
    printf "%s/.claude/skills\n" "${HOME_DIR}"
  fi
  if [ -d "${HOME_DIR}/.hermes" ]; then
    printf "%s/.hermes/skills\n" "${HOME_DIR}"
  fi
  if [ -d "${HOME_DIR}/.cursor" ]; then
    printf "%s/.cursor/skills\n" "${HOME_DIR}"
  fi
  if [ -d "${HOME_DIR}/.codeium/windsurf" ]; then
    printf "%s/.codeium/windsurf/skills\n" "${HOME_DIR}"
  fi
  if [ -d "${HOME_DIR}/.codex" ]; then
    printf "%s/.codex/skills\n" "${HOME_DIR}"
  fi
}

resolve_destination_dirs() {
  _target="$1"
  _pwd="$(pwd)"
  case "${_target}" in
    workspace | local)
      printf "%s/.agents/skills\n" "${_pwd}"
      ;;
    antigravity)
      emit_gemini_skill_dirs
      ;;
    claude)
      printf "%s/.claude/skills\n" "${HOME_DIR}"
      ;;
    cursor)
      printf "%s/.cursor/skills\n" "${HOME_DIR}"
      ;;
    windsurf)
      printf "%s/.codeium/windsurf/skills\n" "${HOME_DIR}"
      ;;
    codex)
      printf "%s/.codex/skills\n" "${HOME_DIR}"
      ;;
    hermes)
      printf "%s/.hermes/skills\n" "${HOME_DIR}"
      ;;
    all)
      _detected="$(detect_global_agent_dirs || true)"
      if [ -n "${_detected}" ]; then
        printf '%s\n' "${_detected}"
      else
        emit_gemini_skill_dirs
        printf "%s/.claude/skills\n" "${HOME_DIR}"
        printf "%s/.hermes/skills\n" "${HOME_DIR}"
        printf "%s/.cursor/skills\n" "${HOME_DIR}"
        printf "%s/.codeium/windsurf/skills\n" "${HOME_DIR}"
        printf "%s/.codex/skills\n" "${HOME_DIR}"
      fi
      ;;
    auto | "")
      _detected="$(detect_global_agent_dirs || true)"
      if [ -n "${_detected}" ]; then
        printf '%s\n' "${_detected}"
      elif [ "${IN_HOME_DIR}" -eq 1 ]; then
        emit_gemini_skill_dirs
      else
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

extract_script_index() {
  _out_idx="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r '
      [
        ((.common_files // [])[] | select(.path != ".env.example" and .path != "scripts/publicar-mcp.sh" and .path != "scripts/probar-mcp-example.sh" and .path != "scripts/install-skill.sh")),
        ((.agent_governance_files // [])[] | select(((.path | startswith(".agents/scripts/") or startswith(".agents/schemas/") or startswith("scripts/")) or .path == ".agents/ACTIVE_TASK.md.example") and .path != "scripts/publicar-mcp.sh" and .path != "scripts/probar-mcp-example.sh" and .path != "scripts/install-skill.sh" and .path != ".agents/scripts/bump_version_11x.py" and .path != ".agents/scripts/sync_governance.py"))
      ] | unique_by(.path)[] | "\(.path)|\(.target_name // .path)|\(.merge_strategy // "")|\(.sha256)"
    ' "${MANIFEST_FILE}" >"${_out_idx}"
  else
    run_manifest_py '
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
excluded = {".env.example", "scripts/publicar-mcp.sh", "scripts/probar-mcp-example.sh", "scripts/install-skill.sh", ".agents/scripts/bump_version_11x.py", ".agents/scripts/sync_governance.py"}
seen = set()
for item in data.get("common_files", []):
    p = item.get("path", "")
    if not p or p in excluded or p in seen:
        continue
    seen.add(p)
    tgt = item.get("target_name") or p
    strat = item.get("merge_strategy") or ""
    sha = item.get("sha256", "")
    print(f"{p}|{tgt}|{strat}|{sha}")
for item in data.get("agent_governance_files", []):
    p = item.get("path", "")
    if not p or p in excluded or p in seen:
        continue
    if p.startswith(".agents/scripts/") or p.startswith(".agents/schemas/") or p.startswith("scripts/") or p == ".agents/ACTIVE_TASK.md.example":
        seen.add(p)
        tgt = item.get("target_name") or p
        strat = item.get("merge_strategy") or ""
        sha = item.get("sha256", "")
        print(f"{p}|{tgt}|{strat}|{sha}")
' >"${_out_idx}" || exit 1
  fi
}

# Validar que la ruta relativa no contenga path traversal ni escapes vía symlink
validate_contained_rel_path() {
  _v_base="$1"
  _v_rel="$2"
  _v_label="$3"
  case "${_v_rel}" in
    "" | /* | *\\* | .. | ../* | */../* | */..)
      log_error "🚨 VIOLACIÓN DE SEGURIDAD (Path Traversal) en ${_v_label}: '${_v_rel}'" && exit 1
      ;;
  esac
  if printf '%s' "${_v_rel}" | LC_ALL=C grep -q '[[:cntrl:]]'; then
    log_error "🚨 VIOLACIÓN DE SEGURIDAD (Caracteres de control) en ${_v_label}: '${_v_rel}'" && exit 1
  fi
  if command -v realpath >/dev/null 2>&1 && realpath -m "${_v_base}" >/dev/null 2>&1; then
    _v_base_real="$(realpath -m "${_v_base}")"
    _v_target_real="$(realpath -m "${_v_base_real}/${_v_rel}")"
    if [ "${_v_target_real#"${_v_base_real}/"}" = "${_v_target_real}" ]; then
      log_error "🚨 VIOLACIÓN DE SEGURIDAD (Escape de directorio / Symlink) en ${_v_label}: '${_v_rel}'" && exit 1
    fi
  elif command -v python3 >/dev/null 2>&1; then
    if ! python3 -c 'import os, sys; b = os.path.realpath(sys.argv[1]); t = os.path.realpath(os.path.join(b, sys.argv[2])); sys.exit(0 if t.startswith(b + os.sep) else 1)' "${_v_base}" "${_v_rel}"; then
      log_error "🚨 VIOLACIÓN DE SEGURIDAD (Escape de directorio / Symlink) en ${_v_label}: '${_v_rel}'" && exit 1
    fi
  else
    _v_chk="${_v_base}"
    _v_rem="${_v_rel}"
    while [ -n "${_v_rem}" ]; do
      case "${_v_rem}" in
        */*)
          _v_part="${_v_rem%%/*}"
          _v_rem="${_v_rem#*/}"
          ;;
        *)
          _v_part="${_v_rem}"
          _v_rem=""
          ;;
      esac
      [ -n "${_v_part}" ] || continue
      if [ "${_v_part}" = "." ]; then
        continue
      fi
      _v_chk="${_v_chk}/${_v_part}"
      if [ -L "${_v_chk}" ]; then
        log_error "🚨 VIOLACIÓN DE SEGURIDAD (Escape de directorio / Symlink) en ${_v_label}: '${_v_rel}'" && exit 1
      fi
    done
    if [ "${_v_chk}" = "${_v_base}" ]; then
      log_error "🚨 VIOLACIÓN DE SEGURIDAD (Escape de directorio / Symlink) en ${_v_label}: '${_v_rel}'" && exit 1
    fi
  fi
}

assert_safe_target_file() {
  _s_file="$1"
  _s_label="$2"
  if [ -L "${_s_file}" ]; then
    log_error "🚨 VIOLACIÓN DE SEGURIDAD (Symlink rechazado) en ${_s_label}: '${_s_file}'" && exit 1
  fi
}

assert_no_symlink_segments() {
  _ns_base="$1"
  _ns_rel="$2"
  _ns_label="$3"
  validate_contained_rel_path "${_ns_base}" "${_ns_rel}" "${_ns_label}"
  _ns_chk="${_ns_base%/}"
  _ns_rem="${_ns_rel}"
  while [ -n "${_ns_rem}" ]; do
    case "${_ns_rem}" in
      */*)
        _ns_part="${_ns_rem%%/*}"
        _ns_rem="${_ns_rem#*/}"
        ;;
      *)
        _ns_part="${_ns_rem}"
        _ns_rem=""
        ;;
    esac
    [ -n "${_ns_part}" ] || continue
    [ "${_ns_part}" = "." ] && continue
    _ns_chk="${_ns_chk}/${_ns_part}"
    assert_safe_target_file "${_ns_chk}" "${_ns_label}"
  done
}

merge_delimited_block() {
  _target_file="$1"
  _block_file="$2"
  _header_file="$3"
  _start_marker="<!-- QA_11X_MCP_CONNECTOR_START -->"
  _end_marker="<!-- QA_11X_MCP_CONNECTOR_END -->"

  assert_safe_target_file "${_target_file}" "merge_delimited_block.target"

  if [ ! -f "${_target_file}" ] || [ ! -s "${_target_file}" ]; then
    mkdir -p "$(dirname "${_target_file}")"
    cat "${_header_file}" "${_block_file}" >"${_target_file}"
    return 0
  fi

  if grep -qF "${_start_marker}" "${_target_file}" && grep -qF "${_end_marker}" "${_target_file}"; then
    _merged_tmp="${TMP_DIR}/merged_block.md"
    awk -v start="${_start_marker}" -v end="${_end_marker}" -v bfile="${_block_file}" '
      BEGIN { in_blk = 0; replaced = 0 }
      index($0, start) > 0 {
        if (!replaced) {
          while ((getline bline < bfile) > 0) print bline
          close(bfile)
          replaced = 1
        }
        in_blk = 1
        next
      }
      in_blk {
        if (index($0, end) > 0) in_blk = 0
        next
      }
      { print }
    ' "${_target_file}" >"${_merged_tmp}"
    mv "${_merged_tmp}" "${_target_file}"
  else
    _sep_file="${TMP_DIR}/sep_block.md"
    printf '\n\n---\n\n' >"${_sep_file}"
    cat "${_sep_file}" "${_block_file}" >>"${_target_file}"
  fi
}

detect_connector_lang() {
  _probe_file="$1"
  if [ -n "${EXPLICIT_LANG}" ]; then
    printf '%s' "${EXPLICIT_LANG}"
    return 0
  fi
  if [ -f "${_probe_file}" ]; then
    if grep -qF "Conector Global Thin-Client QA 11X" "${_probe_file}" ||
      grep -qF "strictly in **Spanish**" "${_probe_file}" ||
      grep -qF "estrictamente en **Español**" "${_probe_file}"; then
      printf 'es'
      return 0
    fi
    if grep -qF "strictly in **English**" "${_probe_file}"; then
      printf 'en'
      return 0
    fi
  fi
  printf 'auto'
}

write_global_connector_block() {
  _out_blk="$1"
  _eff_lang="$2"
  case "${_eff_lang}" in
    es)
      cat >"${_out_blk}" <<'EOF'
<!-- QA_11X_MCP_CONNECTOR_START -->
## 🤖 Conector Global Thin-Client QA 11X (`@sinfallas/mcp-qa-11x`)

- **Idioma y Economía Cognitiva:** Razonar, responder, hacer commits y documentar estrictamente en **Español** (`AGENTS.md`/`.agents/**` en inglés conciso). Usar 3-Tier Disclosure, lecturas `40–80L` (sin `>150L` a ciegas), Zero Redundant Re-Read, lotes paralelos y resúmenes `<=20L`.
- **Crítica Técnica Objetiva (Sin Adulación):** Omitir elogios. Verificar propuestas no triviales/ambiguas contra AST/archivos/budgets; señalar fallos, duplicación o alternativas más simples (o no actuar), o aprobar directo si es sólido; no debatir órdenes rutinarias.
- **Rule Zero Supremo y Graphify AST-First:** Ejecutar TODOS los tests, linters, migraciones e installs en Docker efímero sin root (`run_ephemeral_qa`/`make`). Consultar `graphify-out/graph.json` y `GRAPH_REPORT.md` (`inspect_ast_blast_radius`; `./scripts/actualizar-grafos-graphify.sh`) ANTES de `grep`/`read_file`.
- **Skills Globales, `QA-TEST-SYNC-01` y `QA-GIT-GATE-01`:** Enrutar vía `qa-11x-architect` sin duplicación local (`reconcile_agents_governance`); co-evolucionar tests (`QA-TEST-SYNC-01`), detenerse en `git commit` local (NUNCA auto-`git push`) y reportar brechas (`propose_skill_evolution_pr`).
<!-- QA_11X_MCP_CONNECTOR_END -->
EOF
      ;;
    en)
      cat >"${_out_blk}" <<'EOF'
<!-- QA_11X_MCP_CONNECTOR_START -->
## 🤖 Global Thin-Client QA 11X Connector (`@sinfallas/mcp-qa-11x`)

- **Language & Token Economy:** Interact, write commits & docs strictly in **English**. Apply 3-Tier Disclosure, `40–80L` reads (no blind `>150L`), Zero Redundant Re-Read, parallel batching & `<=20L` summaries.
- **Objective Technical Critique (No Sycophancy):** Skip praise openers. Verify non-trivial/ambiguous proposals against live AST/files/budgets; cite flaws, duplication, or simpler options (incl. doing nothing), or approve directly when solid; never debate routine commands.
- **Rule Zero Supreme & Graphify AST-First:** Run ALL tests, linters, migrations & installs inside non-root ephemeral Docker (`run_ephemeral_qa`/`make`). Query `graphify-out/graph.json` & `GRAPH_REPORT.md` (`inspect_ast_blast_radius`; `./scripts/actualizar-grafos-graphify.sh`) BEFORE `grep`/`read_file`.
- **Global Skills, `QA-TEST-SYNC-01` & `QA-GIT-GATE-01`:** Route via `qa-11x-architect` & global skills without local duplication (`reconcile_agents_governance`); co-evolve affected tests (`QA-TEST-SYNC-01`), stop at local `git commit` (NEVER auto-`git push`) & log gaps (`propose_skill_evolution_pr`).
<!-- QA_11X_MCP_CONNECTOR_END -->
EOF
      ;;
    *)
      cat >"${_out_blk}" <<'EOF'
<!-- QA_11X_MCP_CONNECTOR_START -->
## 🤖 Global Thin-Client QA 11X Connector (`@sinfallas/mcp-qa-11x`)

- **Language & Token Economy:** Interact in user's prompt language; commits/human docs match README.md/CHANGELOG.md (AGENTS.md/.agents/** concise English). Apply 3-Tier Disclosure, `40–80L` reads (no blind `>150L`), Zero Redundant Re-Read, parallel batching & `<=20L` summaries.
- **Objective Technical Critique (No Sycophancy):** Skip praise openers. Verify non-trivial/ambiguous proposals against live AST/files/budgets; cite flaws, duplication, or simpler options (incl. doing nothing), or approve directly when solid; never debate routine commands.
- **Rule Zero Supreme & Graphify AST-First:** Run ALL tests, linters, migrations & installs inside non-root ephemeral Docker (`run_ephemeral_qa`/`make`). Query `graphify-out/graph.json` & `GRAPH_REPORT.md` (`inspect_ast_blast_radius`; `./scripts/actualizar-grafos-graphify.sh`) BEFORE `grep`/`read_file`.
- **Global Skills, `QA-TEST-SYNC-01` & `QA-GIT-GATE-01`:** Route via `qa-11x-architect` & global skills without local duplication (`reconcile_agents_governance`); co-evolve affected tests (`QA-TEST-SYNC-01`), stop at local `git commit` (NEVER auto-`git push`) & log gaps (`propose_skill_evolution_pr`).
<!-- QA_11X_MCP_CONNECTOR_END -->
EOF
      ;;
  esac
}

sync_single_global_connector() {
  _detect_rel="$1"
  _target_rel="$2"
  _dry_mode="$3"
  if [ ! -d "${HOME_DIR}/${_detect_rel}" ]; then
    return 0
  fi
  assert_no_symlink_segments "${HOME_REAL}" "${_target_rel}" "global.connector"
  _target_abs="${HOME_DIR}/${_target_rel}"
  assert_safe_target_file "${_target_abs}" "global.connector.file"
  if [ "${_dry_mode}" -eq 1 ]; then
    printf "  - Sincronizaría conector global: %s\n" "${_target_abs}"
    return 0
  fi
  _eff_lang="$(detect_connector_lang "${_target_abs}")"
  _blk_file="${TMP_DIR}/global_connector_${_eff_lang}.md"
  _hdr_file="${TMP_DIR}/global_connector_hdr.md"
  write_global_connector_block "${_blk_file}" "${_eff_lang}"
  cat >"${_hdr_file}" <<'EOF'
# SPDX-License-Identifier: MIT
<!-- QA-11X Standard Governance -->

# 🤖 Global AI Agent Directives — QA 11X Standard (`@sinfallas/mcp-qa-11x`)

EOF
  merge_delimited_block "${_target_abs}" "${_blk_file}" "${_hdr_file}"
  log_ok "Conector global sincronizado en: ${_target_abs}"
}

sync_global_agent_connectors() {
  _dry_mode="${1:-0}"
  case "${TARGET_SELECTION:-auto}" in
    auto | all)
      sync_single_global_connector ".gemini" ".gemini/GEMINI.md" "${_dry_mode}"
      sync_single_global_connector ".claude" ".claude/CLAUDE.md" "${_dry_mode}"
      sync_single_global_connector ".codex" ".codex/AGENTS.md" "${_dry_mode}"
      sync_single_global_connector ".codeium/windsurf" ".codeium/windsurf/memories/global_rules.md" "${_dry_mode}"
      ;;
    antigravity) sync_single_global_connector ".gemini" ".gemini/GEMINI.md" "${_dry_mode}" ;;
    claude) sync_single_global_connector ".claude" ".claude/CLAUDE.md" "${_dry_mode}" ;;
    codex) sync_single_global_connector ".codex" ".codex/AGENTS.md" "${_dry_mode}" ;;
    windsurf) sync_single_global_connector ".codeium/windsurf" ".codeium/windsurf/memories/global_rules.md" "${_dry_mode}" ;;
  esac
}

sync_project_agents_md() {
  _agents_md="./AGENTS.md"
  assert_no_symlink_segments "${PWD_REAL}" "AGENTS.md" "agents.md"
  assert_safe_target_file "${_agents_md}" "agents.md"
  _proj_name="$(basename "${PWD_REAL}")"
  _eff_lang="$(detect_connector_lang "${_agents_md}")"
  case "${_eff_lang}" in
    es) _lang_line="Interact, explain reasoning, and write commits/docs strictly in **Spanish** (keep AGENTS.md & .agents/** concise English)." ;;
    en) _lang_line="Interact, explain reasoning, and write commits/docs strictly in **English**." ;;
    *) _lang_line="Interact in user's prompt language; commits & human docs match README.md/CHANGELOG.md (keep AGENTS.md & .agents/** concise English)." ;;
  esac
  _raw_blk="${TMP_DIR}/project_agents_raw.md"
  _blk_file="${TMP_DIR}/project_agents_block.md"
  _raw_hdr="${TMP_DIR}/project_hdr_raw.md"
  _hdr_file="${TMP_DIR}/project_hdr.md"
  cat >"${_raw_blk}" <<'EOF'
<!-- QA_11X_MCP_CONNECTOR_START -->
## 🤖 QA 11X Thin-Repo Connector (`@sinfallas/mcp-qa-11x`)

Project `__PROJ_NAME__` enforces **Standard QA-11X** (stacks: `general`). Do NOT duplicate global skills/rules into local `.agents/skills/` or `.agents/rules/`.

- **Language Policy:** __LANG_LINE__
- **Routing (`qa-11x-architect` + MCP `qa-11x`):** Classify every task as `DOCS_ONLY` (`0` Docker QA / `0` AST rebuild), `MICRO_CHANGE` (`<=3` files, `<5` callers: 3-line plan + stack Docker QA), or `FULL_11X` (`/plan` + `session_flight_recorder` + full 11-step workflow from `qa-11x-architect`).
- **Hard Gates:** (1) **Rule Zero** — run all tests/linters/migrations in non-root ephemeral Docker (`run_ephemeral_qa` / `make`); (2) **AST-First & Objective Critique** — query `inspect_ast_blast_radius` (`graphify-out/graph.json`) before `grep`/edits, skip praise openers, and verify non-trivial premises/simpler options before coding (without debating routine commands); (3) **`QA-TEST-SYNC-01`** — update & re-run all affected unit (`>=95%`), integration, BATS, and Karate `.feature` suites; (4) **`QA-GIT-GATE-01`** — run `certify_11x_gate` and stop at local `git commit` (NEVER auto-`git push`).
<!-- QA_11X_MCP_CONNECTOR_END -->

EOF
  cat >"${_raw_hdr}" <<'EOF'
# SPDX-License-Identifier: MIT
<!-- QA-11X Standard Governance -->

# 🤖 AI Agent Directives & Technical Governance — __PROJ_NAME__

EOF
  awk -v p="${_proj_name}" -v l="${_lang_line}" '
    {
      ip = index($0, "__PROJ_NAME__");
      if (ip) $0 = substr($0, 1, ip - 1) p substr($0, ip + 13);
      il = index($0, "__LANG_LINE__");
      if (il) $0 = substr($0, 1, il - 1) l substr($0, il + 13);
      print
    }
  ' "${_raw_blk}" >"${_blk_file}"
  awk -v p="${_proj_name}" '
    {
      ip = index($0, "__PROJ_NAME__");
      if (ip) $0 = substr($0, 1, ip - 1) p substr($0, ip + 13);
      print
    }
  ' "${_raw_hdr}" >"${_hdr_file}"
  merge_delimited_block "${_agents_md}" "${_blk_file}" "${_hdr_file}"
  log_ok "Conector Thin-Repo sincronizado en: ${_agents_md}"
}

prune_retired_canonical_skill_files() {
  _dest_skills="$1"
  for _cskill in \
    qa-11x-architect \
    qa-11x-devsecops-hardener \
    qa-11x-systematic-debugging \
    qa-11x-screenplay-builder \
    qa-11x-llm-evaluator \
    qa-11x-vibe-rescue \
    qa-11x-docker-certifier \
    docker-trivy-keydb-hardening \
    graphify-ast-navigator \
    refactoring-ui \
    tactical-patterns-11x; do
    _cdir="${_dest_skills}/${_cskill}"
    [ -d "${_cdir}" ] && [ ! -L "${_cdir}" ] || continue
    find "${_cdir}" -type f | while IFS= read -r _existing_f; do
      [ -L "${_existing_f}" ] && continue
      _rel_skill=".agents/skills/${_existing_f#"${_dest_skills}/"}"
      if ! grep -Fq "${_rel_skill} " "${SKILL_INDEX}"; then
        rm -f "${_existing_f}"
      fi
    done
    find "${_cdir}" -depth -type d -empty -delete 2>/dev/null || true
  done
}

if [ "${DRY_RUN}" -eq 1 ]; then
  printf "🔍 [DRY-RUN] Plan install-skill (v%s):\n" "${BLUEPRINT_VERSION}"
  printf "  - Archivos de skills verificables: %s\n" "${TOTAL_FILES}"
  sync_global_agent_connectors 1
  if [ "${IN_HOME_DIR}" -eq 1 ] && { [ "${INCLUDE_SCRIPTS}" -eq 1 ] || [ "${INIT_AGENTS}" -eq 1 ]; }; then
    log_info "[Modo Global \$HOME] Omitiría escritura de archivos de proyecto en ${HOME_DIR}."
  else
    if [ "${INCLUDE_SCRIPTS}" -eq 1 ]; then
      DRY_SCRIPT_INDEX="${TMP_DIR}/dry_script_files.txt"
      extract_script_index "${DRY_SCRIPT_INDEX}"
      SCRIPT_TOTAL="$(wc -l <"${DRY_SCRIPT_INDEX}" | tr -d ' ')"
      printf "  - Scripts/archivos comunes planificados: %s\n" "${SCRIPT_TOTAL}"
    fi
    if [ "${INIT_AGENTS}" -eq 1 ]; then
      printf "  - Sincronizaría conector Thin-Repo en: %s/AGENTS.md\n" "${PWD_REAL}"
    fi
  fi
  printf "✅ [DRY-RUN] Simulación completada sin escribir archivos en disco.\n"
  exit 0
fi

# Descargar y validar criptográficamente cada archivo en TMP_DIR
VERIFIED_STAGING="${TMP_DIR}/staging"
mkdir -p "${VERIFIED_STAGING}"
VERIFIED_COUNT=0
WORKSPACE_SKILLS_DEST="$(pwd)/.agents/skills"
HAS_WORKSPACE_DEST=0
if printf '%s\n' "${DEST_DIRS}" | grep -Fqx -- "${WORKSPACE_SKILLS_DEST}"; then
  HAS_WORKSPACE_DEST=1
fi

while read -r rel_path expected_sha _; do
  [ -z "${rel_path}" ] && continue

  if [ "${HAS_WORKSPACE_DEST}" -eq 1 ]; then
    validate_contained_rel_path "${PWD_REAL}" "${rel_path}" "manifest.agent_governance_files.path"
  fi
  skill_rel_path="${rel_path#.agents/skills/}"
  validate_contained_rel_path "${VERIFIED_STAGING}" "${skill_rel_path}" "staging.skill_rel_path"
  staging_dest="${VERIFIED_STAGING}/${skill_rel_path}"
  staging_dir="$(dirname "${staging_dest}")"
  mkdir -p "${staging_dir}"

  if [ -n "${QA_BLUEPRINTS_LOCAL_PATH:-}" ] && [ -f "${QA_BLUEPRINTS_LOCAL_PATH}/${rel_path}" ]; then
    cp "${QA_BLUEPRINTS_LOCAL_PATH}/${rel_path}" "${staging_dest}"
  elif [ "${USING_LOCAL_MANIFEST}" -eq 1 ] && [ -f "./${rel_path}" ]; then
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
STAMP_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "2026-01-01T00:00:00Z")"
printf '%s\n' "${DEST_DIRS}" | while IFS= read -r dest; do
  [ -z "${dest}" ] && continue
  if [ "${dest}" = "${WORKSPACE_SKILLS_DEST}" ]; then
    assert_no_symlink_segments "${PWD_REAL}" ".agents/skills" "workspace.skills_dir"
  else
    dest_rel="${dest#"${HOME_DIR}/"}"
    assert_no_symlink_segments "${HOME_REAL}" "${dest_rel}" "global.skills_dir"
  fi
  assert_safe_target_file "${dest}" "skills_dest"
  assert_safe_target_file "${dest}/.qa-11x-version" "skills_version_stamp"
  mkdir -p "${dest}"
  exec 4<"${SKILL_INDEX}"
  while read -r rel_path _ <&4; do
    [ -z "${rel_path}" ] && continue
    skill_rel_path="${rel_path#.agents/skills/}"
    assert_no_symlink_segments "${dest}" "${skill_rel_path}" "dest.skill_rel_path"
  done
  exec 4<&-
  cp -R "${VERIFIED_STAGING}/"* "${dest}/"
  prune_retired_canonical_skill_files "${dest}"
  printf '{\n  "blueprint_version": "%s",\n  "mcp_version": "%s",\n  "updated_at_utc": "%s"\n}\n' "${BLUEPRINT_VERSION}" "${BLUEPRINT_VERSION}" "${STAMP_UTC}" >"${dest}/.qa-11x-version"
  log_ok "Skills instaladas en: ${dest}"
done

sync_global_agent_connectors 0

if [ "${IN_HOME_DIR}" -eq 1 ] && { [ "${INCLUDE_SCRIPTS}" -eq 1 ] || [ "${INIT_AGENTS}" -eq 1 ]; }; then
  log_info "[Modo Global \$HOME] Omitiendo escritura de archivos de proyecto (AGENTS.md, scripts/, .agents/, lefthook.yml) en el directorio personal (${HOME_DIR})."
  printf "✅ Instalación de Skills QA 11X Completada con Éxito (11 skills modulares instaladas y verificadas por SHA-256).\n"
  exit 0
fi

# Instalación opcional de scripts Thin-Repo (--include-scripts), excluyendo .env.example y publicar-mcp.sh
if [ "${INCLUDE_SCRIPTS}" -eq 1 ]; then
  SCRIPT_INDEX="${TMP_DIR}/script_files.txt"
  extract_script_index "${SCRIPT_INDEX}"

  while IFS='|' read -r s_path s_target s_strategy s_sha; do
    [ -z "${s_path}" ] && continue
    dest_rel="${s_target:-${s_path}}"
    validate_contained_rel_path "${PWD_REAL}" "${s_path}" "manifest.common_files.path"
    assert_no_symlink_segments "${PWD_REAL}" "${dest_rel}" "manifest.common_files.target_name"
    if [ -z "${s_strategy}" ]; then
      case "${s_path}" in
        .trivy.yaml | .env.example | instalar-hooks.sh | lefthook.yml) s_strategy="copy_if_missing" ;;
      esac
    fi

    if [ "${s_path}" != ".agents/ACTIVE_TASK.md.example" ] && [ "${s_strategy}" = "copy_if_missing" ] && [ -f "./${dest_rel}" ]; then
      continue
    fi

    s_tmp="${TMP_DIR}/script_$(basename "${s_path}")"
    if [ -n "${QA_BLUEPRINTS_LOCAL_PATH:-}" ] && [ -f "${QA_BLUEPRINTS_LOCAL_PATH}/${s_path}" ]; then
      cp "${QA_BLUEPRINTS_LOCAL_PATH}/${s_path}" "${s_tmp}"
    elif [ "${USING_LOCAL_MANIFEST}" -eq 1 ] && [ -f "./${s_path}" ]; then
      cp "./${s_path}" "${s_tmp}"
    else
      fetch_file "${RAW_BASE_URL}/${s_path}" "${s_tmp}"
    fi
    actual_s_sha="$(compute_sha256 "${s_tmp}")"
    if [ "${actual_s_sha}" != "${s_sha}" ]; then
      log_error "Violación SHA-256 en script: ${s_path}"
      exit 1
    fi

    if [ "${s_path}" = ".agents/ACTIVE_TASK.md.example" ]; then
      assert_no_symlink_segments "${PWD_REAL}" ".agents/ACTIVE_TASK.md.example" "active_task.example"
      mkdir -p "./.agents"
      cp "${s_tmp}" "./.agents/ACTIVE_TASK.md.example"
      chmod 0644 "./.agents/ACTIVE_TASK.md.example"
      if [ ! -f "./${dest_rel}" ]; then
        mkdir -p "$(dirname "./${dest_rel}")"
        cp "${s_tmp}" "./${dest_rel}"
        chmod 0644 "./${dest_rel}"
      fi
      continue
    fi

    mkdir -p "$(dirname "./${dest_rel}")"
    if [ -f "./${dest_rel}" ]; then
      case "${s_strategy}" in
        surgical_merge | copy_if_missing_or_update_qa)
          assert_safe_target_file "./${dest_rel}.11x-backup" "scripts.backup"
          assert_safe_target_file "./${dest_rel}.11x-incoming" "scripts.incoming"
          cp "./${dest_rel}" "./${dest_rel}.11x-backup"
          chmod 0600 "./${dest_rel}.11x-backup"
          cp "${s_tmp}" "./${dest_rel}.11x-incoming"
          chmod 0644 "./${dest_rel}.11x-incoming"
          log_warn "${dest_rel} ya existe (${s_strategy}): respaldo en ${dest_rel}.11x-backup y plantilla entrante en ${dest_rel}.11x-incoming."
          continue
          ;;
        append_missing_lines)
          assert_safe_target_file "./${dest_rel}.11x-backup" "scripts.backup"
          cp "./${dest_rel}" "./${dest_rel}.11x-backup"
          chmod 0600 "./${dest_rel}.11x-backup"
          exec 3<"${s_tmp}"
          while IFS= read -r m_line <&3 || [ -n "${m_line}" ]; do
            [ -z "${m_line}" ] && continue
            grep -Fqx -- "${m_line}" "./${dest_rel}" 2>/dev/null || printf '%s\n' "${m_line}" >>"./${dest_rel}"
          done
          exec 3<&-
          continue
          ;;
      esac
      case "${dest_rel}" in
        scripts/*)
          if [ "$(compute_sha256 "./${dest_rel}")" != "${actual_s_sha}" ]; then
            assert_safe_target_file "./${dest_rel}.11x-incoming" "scripts.incoming"
            cp "${s_tmp}" "./${dest_rel}.11x-incoming"
            chmod 0644 "./${dest_rel}.11x-incoming"
            log_warn "${dest_rel} tiene personalizaciones locales y se preservó; revisa ${dest_rel}.11x-incoming (usa .agents/limpieza.local.sh para extensiones)."
            continue
          fi
          ;;
      esac
    fi
    cp "${s_tmp}" "./${dest_rel}"
    case "${dest_rel}" in
      *.json | */_budgets.py | *.yml | *.yaml | *.md) chmod 0644 "./${dest_rel}" ;;
      *) chmod +x "./${dest_rel}" ;;
    esac
  done <"${SCRIPT_INDEX}"
  assert_no_symlink_segments "${PWD_REAL}" ".agents/.qa-11x-version" "workspace.version_stamp"
  assert_safe_target_file "./.agents/.qa-11x-version" "workspace.version_stamp"
  mkdir -p "./.agents"
  printf '{\n  "blueprint_version": "%s",\n  "mcp_version": "%s",\n  "updated_at_utc": "%s"\n}\n' "${BLUEPRINT_VERSION}" "${BLUEPRINT_VERSION}" "${STAMP_UTC}" >"./.agents/.qa-11x-version"
  log_ok "Scripts de automatización instalados en $(pwd) (excluyendo .env.example y publicar-mcp.sh)."
fi

if [ "${INIT_AGENTS}" -eq 1 ]; then
  sync_project_agents_md
fi

printf "✅ Instalación de Skills QA 11X Completada con Éxito (11 skills modulares instaladas y verificadas por SHA-256).\n"
