#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Detección preventiva de credenciales y secretos hardcodeados en archivos staged o en el repositorio.

LC_ALL=C
set -euo pipefail

BASH_QA_IMAGE="${QA_BASH_IMAGE:-sinfallas/base-bash-qa@sha256:2d1f579e20ef384e85da839304dbae2d28231fcdc893c21cbe79861b44d675a7}"
QA_DOCKERENV_FILE="${QA11X_DOCKERENV_PATH:-/.dockerenv}"
WORK_ROOT="$(pwd -P)"

EXPLICIT_TARGETS=0
CLI_TARGETS=()
for arg in "$@"; do
  case "${arg}" in
    -h | --help)
      echo "Uso: ./scripts/verificar-secretos.sh [archivo_o_ruta ...]"
      echo "  Escanea archivos staged, dirty o del repositorio contra credenciales expuestas (Regla Cero)."
      exit 0
      ;;
    --)
      continue
      ;;
    -*)
      echo "❌ ERROR: Opción no reconocida en verificar-secretos.sh: ${arg}" >&2
      exit 1
      ;;
    *)
      EXPLICIT_TARGETS=1
      CLI_TARGETS+=("${arg}")
      ;;
  esac
done

relativize_repo_targets() {
  local arg="" dir_part="" base_part="" abs_dir="" abs_arg="" rel_arg=""
  REL_TARGETS=()
  for arg in "$@"; do
    [ -n "${arg}" ] || continue
    if [[ "${arg}" == /* ]]; then
      dir_part="$(dirname "${arg}")"
      base_part="$(basename "${arg}")"
      if [ -d "${dir_part}" ]; then
        abs_dir="$(cd "${dir_part}" 2>/dev/null && pwd -P)" || {
          echo "🚨 ERROR CRÍTICO: No se pudo resolver la ruta (${arg})." >&2
          exit 1
        }
        abs_arg="${abs_dir%/}/${base_part}"
      else
        abs_arg="${arg}"
      fi
      if [ "${abs_arg}" = "${WORK_ROOT}" ]; then
        rel_arg="."
      elif [[ "${abs_arg}" == "${WORK_ROOT}/"* ]]; then
        rel_arg="${abs_arg#"${WORK_ROOT}/"}"
      else
        echo "🚨 ERROR CRÍTICO: Ruta fuera del repositorio (${arg})." >&2
        exit 1
      fi
    else
      case "${arg}" in
        .. | ../* | */../* | */..)
          echo "🚨 ERROR CRÍTICO: Path traversal bloqueado (${arg})." >&2
          exit 1
          ;;
      esac
      rel_arg="${arg#./}"
    fi
    REL_TARGETS+=("${rel_arg}")
  done
}

REL_TARGETS=()
if [ "${#CLI_TARGETS[@]}" -gt 0 ]; then
  relativize_repo_targets "${CLI_TARGETS[@]}"
fi

if [ ! -f "${QA_DOCKERENV_FILE}" ] && [ "${QA11X_INSIDE_DOCKER:-0}" != "1" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ [Secretos] Se requiere Docker para ejecutar verificar-secretos.sh bajo Regla Cero." >&2
    exit 1
  fi
  SCRIPT_ABS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  exec docker run --rm --network none --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e QA11X_INSIDE_DOCKER=1 -e QA11X_EXPLICIT_TARGETS="${EXPLICIT_TARGETS}" -v "${WORK_ROOT}:/repo:ro" -v "${SCRIPT_ABS}:/qa-bin/verificar-secretos.sh:ro" -w /repo "${BASH_QA_IMAGE}" bash /qa-bin/verificar-secretos.sh "${REL_TARGETS[@]+"${REL_TARGETS[@]}"}"
fi

if [ "${QA11X_EXPLICIT_TARGETS:-0}" -eq 1 ]; then
  EXPLICIT_TARGETS=1
fi

TARGET_FILES=("${REL_TARGETS[@]+"${REL_TARGETS[@]}"}")

# Bloquear de inmediato si .env o variantes sensibles (.env.*) fueron añadidos al índice de Git o pasados como objetivo
if command -v git >/dev/null 2>&1; then
  TRACKED_ENV="$(git -c safe.directory='*' ls-files 2>/dev/null | grep -E '(^|/)\.env(\..+)?$' | grep -Ev '\.(example|sample|template)$' || true)"
  if [ -n "${TRACKED_ENV}" ]; then
    echo "🚨 ERROR CRÍTICO: Archivo sensible trackeado en Git (${TRACKED_ENV}). Ejecute 'git rm --cached'." >&2
    exit 1
  fi
fi

for target in "${TARGET_FILES[@]}"; do
  [ -n "${target}" ] || continue
  if [[ "${target}" =~ (^|/)\.env(\.[^/]+)?$ ]] && [[ ! "${target}" =~ \.(example|sample|template)$ ]]; then
    echo "🚨 ERROR CRÍTICO: Archivo sensible .env bloqueado (${target})." >&2
    exit 1
  fi
done

if [ "${#TARGET_FILES[@]}" -eq 0 ]; then
  if command -v git >/dev/null 2>&1 && git -c safe.directory='*' rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git_dirty="$({
      git -c safe.directory='*' diff --name-only HEAD 2>/dev/null || true
      git -c safe.directory='*' ls-files --others --exclude-standard 2>/dev/null || true
    } | sort -u)"
    while IFS= read -r line; do
      [ -n "${line}" ] && TARGET_FILES+=("${line}")
    done <<<"${git_dirty}"
    if [ "${#TARGET_FILES[@]}" -eq 0 ]; then
      git_tracked="$(git -c safe.directory='*' ls-files 2>/dev/null || true)"
      while IFS= read -r line; do
        [ -n "${line}" ] && TARGET_FILES+=("${line}")
      done <<<"${git_tracked}"
    fi
  else
    non_git_files="$(find . \( -name .git -o -name node_modules -o -name dist -o -name .venv -o -name vendor -o -name target -o -name graphify-out -o -name .pytest_cache -o -name __pycache__ -o -name coverage -o -name .mypy_cache -o -name .ruff_cache \) -prune -o -type f -print 2>/dev/null | sort || true)"
    while IFS= read -r line; do
      line="${line#./}"
      [ -n "${line}" ] && TARGET_FILES+=("${line}")
    done <<<"${non_git_files}"
    for target in "${TARGET_FILES[@]}"; do
      [ -n "${target}" ] || continue
      if [[ "${target}" =~ (^|/)\.env(\.[^/]+)?$ ]] && [[ ! "${target}" =~ \.(example|sample|template)$ ]]; then
        echo "🚨 ERROR CRÍTICO: Archivo sensible .env bloqueado (${target})." >&2
        exit 1
      fi
    done
  fi
fi

if [ "${#TARGET_FILES[@]}" -eq 0 ]; then
  echo "✔ [Secretos] 0 archivos para escanear."
  exit 0
fi

FILTERED_FILES=()
for file in "${TARGET_FILES[@]}"; do
  [ -n "$file" ] || continue
  if [ -d "$file" ]; then
    expanded_dir_files="$(find "$file" \( -name .git -o -name node_modules -o -name dist -o -name .venv -o -name vendor -o -name target -o -name graphify-out -o -name .pytest_cache -o -name __pycache__ -o -name coverage -o -name .mypy_cache -o -name .ruff_cache \) -prune -o -type f -print 2>/dev/null | sort || true)"
    while IFS= read -r expanded; do
      expanded="${expanded#./}"
      [ -n "$expanded" ] || continue
      if [[ "$expanded" =~ (^|/)\.env(\.[^/]+)?$ ]] && [[ ! "$expanded" =~ \.(example|sample|template)$ ]]; then
        echo "🚨 ERROR CRÍTICO: Archivo sensible .env bloqueado (${expanded})." >&2
        exit 1
      fi
      if [[ ! "$expanded" =~ \.(png|jpg|jpeg|gif|ico|pdf|lock|svg|pyc)$ ]]; then
        FILTERED_FILES+=("$expanded")
      fi
    done <<<"${expanded_dir_files}"
  elif [ -f "$file" ]; then
    if [[ ! "$file" =~ \.(png|jpg|jpeg|gif|ico|pdf|lock|svg|pyc)$ ]]; then
      FILTERED_FILES+=("$file")
    fi
  elif [ "${EXPLICIT_TARGETS}" -eq 1 ]; then
    echo "❌ ERROR: Ruta o archivo objetivo inexistente: $file" >&2
    exit 1
  fi
done

if [ "${#TARGET_FILES[@]}" -gt 0 ] && [ "${#FILTERED_FILES[@]}" -eq 0 ]; then
  echo "✔ [Secretos] 0 archivos sujetos a escaneo de secretos."
  exit 0
fi

is_test_file() {
  local path="$1"
  [[ "$path" =~ (^|/)(tests?|__tests__)/ ]] ||
    [[ "$path" =~ (^|/)test_[^/]+\.py$ ]] ||
    [[ "$path" =~ \.(unit|spec|test)\.(py|ts|tsx|js|jsx)$ ]] ||
    [[ "$path" =~ \.bats$ ]] ||
    [[ "$path" =~ \.feature$ ]]
}

SECRET_REGEX='-----BEGIN (RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|((npm|ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|glpat-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|sk-proj-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{12,}|xox[baprs]-[0-9A-Za-z-]{10,})|(password|passwd|secret|api_key|token)["'\'']?[[:space:]]*[=:][[:space:]]*["'\'']?[A-Za-z0-9_/+.-]{16,}["'\'']?'
SAFE_URL_REGEX='https?://(127\.0\.0\.1|0\.0\.0\.0|\[::1\]|([A-Za-z0-9-]+\.)?example\.(com|org|net))[^[:space:]"'\'']*'
PLACEHOLDER_REGEX='(TU_TOKEN|tu_clave_aqui|tu_token_aqui|CHANGE[_-]?ME|EXAMPLE_ONLY|example_placeholder|YOUR_TOKEN_EXAMPLE|TU_TOKEN_EXAMPLE|sk-proj-placeholder|placeholder|dummy|00000000|test-load-token|mock|fake|ephemeral|xxxxxx|__[A-Z0-9_]{3,}__|<[^>]+>|https?://(127\.0\.0\.1|0\.0\.0\.0|\[::1\]|([a-z0-9-]+\.)?example\.(com|org|net))|env\.|process\.env|os\.environ|\$\{)'

MATCHED_FILES=()
for f in "${FILTERED_FILES[@]}"; do
  CANDIDATE_LINES=$(sed -E -e "s#${SAFE_URL_REGEX}#__QA_SAFE_URL__#g" -e 's#([=:][[:space:]]*)[A-Za-z_][A-Za-z0-9_.]*\(#\1__QA_CALL__(#g' -- "$f" 2>/dev/null | grep -niE -e "${SECRET_REGEX}" || true)
  if [ -n "${CANDIDATE_LINES}" ]; then
    CANDIDATE_LINES=$(printf '%s\n' "${CANDIDATE_LINES}" | grep -vE '(#|//|/\*|<!--)[[:space:]]*secret-scan-ignore\b' || true)
  fi
  if [ -n "${CANDIDATE_LINES}" ] && is_test_file "$f"; then
    CANDIDATE_LINES=$(printf '%s\n' "${CANDIDATE_LINES}" | grep -vF 'qa-secret-fixture-ok' || true)
  fi
  HITS=""
  if [ -n "${CANDIDATE_LINES}" ]; then
    HITS=$(printf '%s\n' "${CANDIDATE_LINES}" | grep -oiE -e "${SECRET_REGEX}" | grep -viE -e "${PLACEHOLDER_REGEX}" || true)
  fi
  if [ -n "${HITS}" ]; then
    MATCHED_FILES+=("$f")
  fi
done

if [ "${#MATCHED_FILES[@]}" -gt 0 ]; then
  echo "🚨 ERROR: Posible secreto o clave privada hardcodeada detectada en:" >&2
  for mfile in "${MATCHED_FILES[@]}"; do
    echo "  - ${mfile}" >&2
  done
  exit 1
fi

echo "✔ [Secretos] 0 secretos expuestos (${#FILTERED_FILES[@]} archivos escaneados)."
exit 0
