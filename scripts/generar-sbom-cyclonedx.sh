#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Generación de SBOM / CBOM en formato CycloneDX JSON (ECMA-424)
# y cumplimiento con DISA ASD STIG V6R5 (APSC-DV-001430 / APSC-DV-003140).
# Ejecución 100% en contenedor efímero Trivy (Regla Cero).

set -euo pipefail

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  echo "Uso: ./scripts/generar-sbom-cyclonedx.sh [archivo_salida_relativo]"
  echo "  Por defecto genera sbom.cyclonedx.json en la raíz del repositorio."
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_FILE="${1:-sbom.cyclonedx.json}"

if [[ "${OUTPUT_FILE}" == /* ]] || [[ "${OUTPUT_FILE}" == *".."* ]] || [ -z "${OUTPUT_FILE}" ]; then
  echo "ERROR: La ruta de salida debe ser relativa dentro del repositorio (recibido: '${OUTPUT_FILE}')." >&2
  exit 1
fi

mkdir -p "$(dirname "${REPO_ROOT}/${OUTPUT_FILE}")"

TRIVY_IMAGE="aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb"
TRIVY_CACHE_VOLUME="qa11x_trivy_cache"
TRIVY_SKIP_DIRS="node_modules,.git,dist,target,graphify-out,vendor,.venv"
TRIVY_CONFIG_ARGS=(--skip-dirs "${TRIVY_SKIP_DIRS}")
if [ -f "${REPO_ROOT}/.trivy.yaml" ]; then
  TRIVY_CONFIG_ARGS=(--config /workspace/.trivy.yaml)
fi

docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e TRIVY_CACHE_DIR=/tmp/trivy-cache \
  -v "${TRIVY_CACHE_VOLUME}:/tmp/trivy-cache" \
  -v "${REPO_ROOT}:/workspace" \
  -w /workspace \
  "${TRIVY_IMAGE}" fs \
  --quiet \
  "${TRIVY_CONFIG_ARGS[@]}" \
  --format cyclonedx \
  --output "/workspace/${OUTPUT_FILE}" \
  /workspace

ABS_OUTPUT="${REPO_ROOT}/${OUTPUT_FILE}"
if [ -f "${ABS_OUTPUT}" ]; then
  OUT_DIR="$(dirname "${ABS_OUTPUT}")"
  OUT_BASE="$(basename "${ABS_OUTPUT}")"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "${OUT_DIR}" && sha256sum "${OUT_BASE}" >"${OUT_BASE}.sha256")
  elif command -v shasum >/dev/null 2>&1; then
    (cd "${OUT_DIR}" && shasum -a 256 "${OUT_BASE}" >"${OUT_BASE}.sha256")
  fi
  if [ -n "${QA11X_ATTESTATION_KEY:-}" ] && command -v openssl >/dev/null 2>&1; then
    (cd "${OUT_DIR}" && openssl dgst -sha256 -hmac "${QA11X_ATTESTATION_KEY}" "${OUT_BASE}" >"${OUT_BASE}.hmac")
    chmod 644 "${ABS_OUTPUT}.hmac"
  fi
fi

echo "✔ [SBOM CycloneDX] Generado exitosamente en: ${OUTPUT_FILE}"
