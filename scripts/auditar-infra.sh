#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Auditoría efímera de Infraestructura como Código (IaC) usando Trivy.
# Cumple estrictamente con la Regla Cero (ejecución en contenedor Docker efímero con montaje :ro)
# e incluye caché criptográfica SHA-256 para evitar re-escaneos redundantes cuando IaC/lockfiles no cambian.

LC_ALL=C
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FORCE_SCAN=false

if [ "${1:-}" = "--force" ]; then
  FORCE_SCAN=true
fi

# Calcular huella SHA-256 de archivos IaC y lockfiles de dependencias
IAC_FINGERPRINT=$(find "${REPO_ROOT}" -maxdepth 3 \
  \( -name node_modules -o -name .git -o -name dist -o -name .venv -o -name vendor \) -prune \
  -o -type f \( -name 'docker-compose*.yml' -o -name 'Dockerfile*' -o -name '.trivy.yaml' -o -name 'pnpm-lock.yaml' -o -name 'package-lock.json' -o -name 'uv.lock' -o -name 'composer.lock' \) \
  -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | awk '{print $1}')

CACHE_MARKER="/tmp/.qa11x_trivy_cache_${IAC_FINGERPRINT}"

if [ "${FORCE_SCAN}" = false ] && [ -n "${IAC_FINGERPRINT}" ] && [ -f "${CACHE_MARKER}" ]; then
  echo "✔ [Trivy] IaC (HIGH/CRIT=0) y File System (CRIT=0) verificados sin hallazgos (caché SHA-256)."
  exit 0
fi

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

if [ -n "${IAC_FINGERPRINT}" ]; then
  rm -f /tmp/.qa11x_trivy_cache_* 2>/dev/null || true
  touch "${CACHE_MARKER}" 2>/dev/null || true
fi

echo "✔ [Trivy] IaC (HIGH/CRIT=0) y File System (CRIT=0) verificados sin hallazgos."
exit 0
