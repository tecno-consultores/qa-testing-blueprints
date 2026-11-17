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
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e TRIVY_CACHE_DIR=/tmp/trivy-cache \
  -v "${REPO_ROOT}:/workspace" \
  aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb fs \
  --quiet \
  --format cyclonedx \
  --output "/workspace/${OUTPUT_FILE}" \
  /workspace

echo "✔ [SBOM CycloneDX] Generado exitosamente en: ${OUTPUT_FILE}"
