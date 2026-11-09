#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Detección preventiva de credenciales y secretos hardcodeados en archivos staged o en el repositorio.

LC_ALL=C
set -euo pipefail

TARGET_FILES=("$@")

if [ "${#TARGET_FILES[@]}" -eq 0 ]; then
  mapfile -t TARGET_FILES < <(git diff --name-only HEAD 2>/dev/null || git ls-files)
fi

if [ "${#TARGET_FILES[@]}" -eq 0 ]; then
  echo "✔ [Secretos] 0 archivos para escanear."
  exit 0
fi

FILTERED_FILES=()
for file in "${TARGET_FILES[@]}"; do
  if [ -f "$file" ] && [[ ! "$file" =~ \.(png|jpg|jpeg|gif|ico|pdf|lock|svg|pyc)$ ]]; then
    FILTERED_FILES+=("$file")
  fi
done

if [ "${#FILTERED_FILES[@]}" -eq 0 ]; then
  echo "✔ [Secretos] 0 archivos de texto modificados."
  exit 0
fi

# Busca patrones comunes de contraseñas, llaves privadas y tokens hardcodeados
MATCHED_FILES=$(grep -liE "(password|secret|api_key|token)[=:] *[\"'][a-zA-Z0-9]{12,}[\"']" "${FILTERED_FILES[@]}" || true)
if [ -n "${MATCHED_FILES}" ]; then
  echo "🚨 ERROR: Posible secreto hardcodeado detectado en:" >&2
  while IFS= read -r mfile; do
    [ -n "${mfile}" ] && echo "  - ${mfile}" >&2
  done <<<"${MATCHED_FILES}"
  exit 1
fi

echo "✔ [Secretos] 0 secretos expuestos (${#FILTERED_FILES[@]} archivos escaneados)."
exit 0
