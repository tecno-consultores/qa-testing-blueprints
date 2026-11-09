#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Generación de SBOM / CBOM en formato CycloneDX JSON (ECMA-424)
# y cumplimiento con DISA ASD STIG V6R5 (APSC-DV-001430 / APSC-DV-003140).
# Ejecución 100% en contenedor efímero Trivy (Regla Cero).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_FILE="${1:-sbom.cyclonedx.json}"

docker run --rm \
  -v "${REPO_ROOT}:/workspace" \
  aquasec/trivy:latest fs \
  --quiet \
  --format cyclonedx \
  --output "/workspace/${OUTPUT_FILE}" \
  /workspace

docker run --rm -v "${REPO_ROOT}:/workspace" alpine chown "$(id -u):$(id -g)" "/workspace/${OUTPUT_FILE}" 2>/dev/null || true

echo "✔ [SBOM CycloneDX] Generado exitosamente en: ${OUTPUT_FILE}"
