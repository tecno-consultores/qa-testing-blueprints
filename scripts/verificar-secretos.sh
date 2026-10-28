#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
# Propósito: Detección preventiva de credenciales y secretos hardcodeados en archivos staged o en el repositorio.

LC_ALL=C
set -euo pipefail

TARGET_FILES=("$@")

if [ "${#TARGET_FILES[@]}" -eq 0 ]; then
  # Si no se pasan argumentos, escanea archivos rastreados en git
  mapfile -t TARGET_FILES < <(git diff --name-only HEAD 2>/dev/null || git ls-files)
fi

if [ "${#TARGET_FILES[@]}" -eq 0 ]; then
  echo "✔ Cero archivos para escanear."
  exit 0
fi

FILTERED_FILES=()
for file in "${TARGET_FILES[@]}"; do
  if [ -f "$file" ] && [[ ! "$file" =~ \.(png|jpg|jpeg|gif|ico|pdf|lock|svg|pyc)$ ]]; then
    FILTERED_FILES+=("$file")
  fi
done

if [ "${#FILTERED_FILES[@]}" -eq 0 ]; then
  echo "✔ Cero archivos de texto modificados para escanear."
  exit 0
fi

# Busca patrones comunes de contraseñas, llaves privadas y tokens hardcodeados
if grep -qiE "(password|secret|api_key|token)[=:] *[\"'][a-zA-Z0-9]{12,}[\"']" "${FILTERED_FILES[@]}"; then
  echo "🚨 ERROR: Posible secreto hardcodeado detectado en los archivos analizados." >&2
  exit 1
fi

echo "✔ Cero secretos detectados."
exit 0
