#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
# Propósito: Auditoría efímera de Infraestructura como Código (IaC) usando Trivy.
# Cumple estrictamente con la Regla Cero (ejecución en contenedor Docker efímero con montaje :ro).

LC_ALL=C
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# 1. Escaneo de misconfiguraciones IaC (Pass-Quiet / Fail-Verbose)
if ! IAC_OUT=$(docker run --rm \
  -v "${REPO_ROOT}:/app:ro" \
  -w /app \
  aquasec/trivy:latest config . \
  --quiet \
  --severity HIGH,CRITICAL \
  --exit-code 1 2>&1); then
  echo "❌ [Trivy IaC] Misconfiguraciones HIGH/CRITICAL detectadas:" >&2
  echo "${IAC_OUT}" >&2
  exit 1
fi

# 2. Escaneo de vulnerabilidades críticas (CVEs) en dependencias locales
if ! FS_OUT=$(docker run --rm \
  -v "${REPO_ROOT}:/app:ro" \
  -w /app \
  aquasec/trivy:latest fs . \
  --quiet \
  --severity CRITICAL \
  --exit-code 1 2>&1); then
  echo "❌ [Trivy FS] Vulnerabilidades CRITICAL detectadas:" >&2
  echo "${FS_OUT}" >&2
  exit 1
fi

echo "✔ [Trivy] IaC (HIGH/CRIT=0) y File System (CRIT=0) verificados sin hallazgos."
exit 0
