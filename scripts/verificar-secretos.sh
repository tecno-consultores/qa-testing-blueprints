#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Detección preventiva de credenciales y secretos hardcodeados en archivos staged o en el repositorio.

LC_ALL=C
set -euo pipefail

BASH_QA_IMAGE="${QA_BASH_IMAGE:-sinfallas/base-bash-qa@sha256:2d1f579e20ef384e85da839304dbae2d28231fcdc893c21cbe79861b44d675a7}"
QA_DOCKERENV_FILE="${QA11X_DOCKERENV_PATH:-/.dockerenv}"
if [ ! -f "${QA_DOCKERENV_FILE}" ] && [ "${QA11X_INSIDE_DOCKER:-0}" != "1" ] && command -v docker >/dev/null 2>&1; then
  SCRIPT_ABS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  exec docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -e QA11X_INSIDE_DOCKER=1 -v "$(pwd):/repo:ro" -v "${SCRIPT_ABS}:/qa-bin/verificar-secretos.sh:ro" -w /repo "${BASH_QA_IMAGE}" bash /qa-bin/verificar-secretos.sh "$@"
fi

TARGET_FILES=("$@")

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
fi

if [ "${#TARGET_FILES[@]}" -eq 0 ]; then
  echo "✔ [Secretos] 0 archivos para escanear."
  exit 0
fi

FILTERED_FILES=()
for file in "${TARGET_FILES[@]}"; do
  [ -n "$file" ] || continue
  if [ -f "$file" ] && [[ ! "$file" =~ \.(png|jpg|jpeg|gif|ico|pdf|lock|svg|pyc)$ ]] &&
    [[ "$file" != "scripts/verificar-secretos.sh" ]] &&
    [[ "$file" != "mcp-server/src/tools/security-auditor.ts" ]] &&
    [[ "$file" != "vibe-rescue/audit_vibe_prototype.py" ]]; then
    FILTERED_FILES+=("$file")
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

SECRET_REGEX='-----BEGIN (RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|((npm|ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|glpat-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|sk-proj-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{12,}|xox[baprs]-[0-9A-Za-z-]{10,})|(password|passwd|secret|api_key|token)[=:] *["'\'']?[A-Za-z0-9_/-]{16,}["'\'']?'
PLACEHOLDER_REGEX='(TU_TOKEN|tu_clave_aqui|tu_token_aqui|CHANGE[_-]?ME|EXAMPLE_ONLY|example_placeholder|YOUR_TOKEN_EXAMPLE|TU_TOKEN_EXAMPLE|sk-proj-placeholder|placeholder|dummy|00000000|test-load-token|mock|fake|ephemeral|xxxxxx|<[^>]+>|https?://(127\.0\.0\.1|0\.0\.0\.0|\[::1\]|([a-z0-9-]+\.)?example\.(com|org|net))|env\.|process\.env|os\.environ|\$\{)'

MATCHED_FILES=()
for f in "${FILTERED_FILES[@]}"; do
  HITS=$(grep -niE -e "${SECRET_REGEX}" -- "$f" 2>/dev/null | grep -viE -e "${PLACEHOLDER_REGEX}" || true)
  if [ -n "${HITS}" ] && is_test_file "$f"; then
    HITS=$(printf '%s\n' "${HITS}" | grep -vF 'qa-secret-fixture-ok' || true)
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
