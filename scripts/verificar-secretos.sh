#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Detección preventiva de credenciales y secretos hardcodeados en archivos staged o en el repositorio.

LC_ALL=C
set -euo pipefail

TARGET_FILES=("$@")

# Bloquear de inmediato si .env fue añadido accidentalmente al índice de Git
if command -v git &>/dev/null && git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "🚨 ERROR CRÍTICO: El archivo '.env' está trackeado en Git. Ejecute 'git rm --cached .env'." >&2
  exit 1
fi

if [ "${#TARGET_FILES[@]}" -eq 0 ]; then
  mapfile -t TARGET_FILES < <({
    git diff --name-only HEAD 2>/dev/null || true
    git ls-files --others --exclude-standard 2>/dev/null || true
  } | sort -u)
  if [ "${#TARGET_FILES[@]}" -eq 0 ]; then
    mapfile -t TARGET_FILES < <(git ls-files 2>/dev/null || true)
  fi
fi

if [ "${#TARGET_FILES[@]}" -eq 0 ]; then
  echo "✔ [Secretos] 0 archivos para escanear."
  exit 0
fi

FILTERED_FILES=()
for file in "${TARGET_FILES[@]}"; do
  [ -n "$file" ] || continue
  if [ -f "$file" ] && [[ ! "$file" =~ \.(png|jpg|jpeg|gif|ico|pdf|lock|svg|pyc|example)$ ]] &&
    [[ ! "$file" =~ (^|/)(tests?|__tests__)/ ]] &&
    [[ ! "$file" =~ \.(unit|spec|test)\.(py|ts|tsx|js|jsx)$ ]] &&
    [[ ! "$file" =~ \.bats$ ]] &&
    [[ "$file" != "scripts/verificar-secretos.sh" ]] &&
    [[ "$file" != "mcp-server/src/tools/security-auditor.ts" ]]; then
    FILTERED_FILES+=("$file")
  fi
done

if [ "${#TARGET_FILES[@]}" -gt 0 ] && [ "${#FILTERED_FILES[@]}" -eq 0 ]; then
  echo "✔ [Secretos] 0 archivos productivos sujetos a escaneo de secretos."
  exit 0
fi

SECRET_REGEX='-----BEGIN (RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|((npm|ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|glpat-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})|(password|passwd|secret|api_key|token)[=:] *["'\'']?[A-Za-z0-9_/-]{16,}["'\'']?'
PLACEHOLDER_REGEX='(TU_TOKEN|placeholder|example|dummy|test-load-token|mock|fake|changeme|xxxxxx|123456|env\.|process\.env|os\.environ|\$\{)'

MATCHED_FILES=()
for f in "${FILTERED_FILES[@]}"; do
  HITS=$(grep -niE "${SECRET_REGEX}" "$f" 2>/dev/null | grep -viE "${PLACEHOLDER_REGEX}" || true)
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
