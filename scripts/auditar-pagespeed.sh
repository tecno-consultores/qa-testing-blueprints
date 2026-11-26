#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

TARGET_SCRIPT=".agents/scripts/audit_pagespeed_insights.py"

if [ ! -f "${TARGET_SCRIPT}" ]; then
  echo "❌ [PSI-11X] No se encontró ${TARGET_SCRIPT} en ${REPO_ROOT}." >&2
  exit 1
fi

for psi_arg in "$@"; do
  case "${psi_arg}" in
    --api-key | --api-key=*)
      echo "❌ [PSI-11X] Pasa PAGESPEED_API_KEY por variable de entorno, nunca por CLI argv." >&2
      exit 1
      ;;
  esac
done

if [ -f "${QA11X_DOCKERENV_PATH:-/.dockerenv}" ] && ! command -v docker >/dev/null 2>&1; then
  exec python3 "${TARGET_SCRIPT}" "$@"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ [PSI-11X] Se requiere Docker para ejecutar auditar-pagespeed.sh bajo Regla Cero." >&2
  exit 1
fi

exec docker run --rm --restart=no \
  --security-opt=no-new-privileges:true \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e PYTHONDONTWRITEBYTECODE=1 \
  -e PAGESPEED_API_KEY \
  -e PSI_URL \
  -v "${REPO_ROOT}:/app" \
  -w /app \
  sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4 \
  python3 "${TARGET_SCRIPT}" "$@"
