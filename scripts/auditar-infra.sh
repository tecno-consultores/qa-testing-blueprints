#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
# Propósito: Auditoría efímera de Infraestructura como Código (IaC) usando Trivy.
# Cumple estrictamente con la Regla Cero (ejecución en contenedor Docker efímero con montaje :ro).

LC_ALL=C
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "🛡️ Iniciando Auditoría de Seguridad de Infraestructura (Trivy IaC)..."

# 1. Escaneo de misconfiguraciones IaC mapeando en modo solo lectura (:ro)
docker run --rm \
  -v "${REPO_ROOT}:/app:ro" \
  -w /app \
  aquasec/trivy:latest config . \
  --severity HIGH,CRITICAL \
  --exit-code 1

# 2. Escaneo de vulnerabilidades críticas (CVEs) en dependencias locales
echo "✅ IaC validado. Escaneando vulnerabilidades (CVEs) en el File System..."

docker run --rm \
  -v "${REPO_ROOT}:/app:ro" \
  -w /app \
  aquasec/trivy:latest fs . \
  --severity CRITICAL \
  --exit-code 1

echo "✅ Auditoría de Infraestructura superada. Entorno seguro."
exit 0
