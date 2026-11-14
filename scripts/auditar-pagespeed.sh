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

if [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; then
  exec python3 "${TARGET_SCRIPT}" "$@"
fi

exec docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e PYTHONDONTWRITEBYTECODE=1 \
  -e PAGESPEED_API_KEY \
  -e PSI_URL \
  -v "${REPO_ROOT}:/app" \
  -w /app \
  sinfallas/base-python-uv:3.15 \
  python3 "${TARGET_SCRIPT}" "$@"
