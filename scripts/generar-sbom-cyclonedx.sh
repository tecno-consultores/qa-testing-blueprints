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
if [ $# -gt 1 ]; then
  echo "ERROR: Demasiados argumentos (uso: ./scripts/generar-sbom-cyclonedx.sh [archivo_salida_relativo])." >&2
  exit 1
fi
if [ $# -eq 1 ]; then
  case "$1" in
    -*)
      echo "ERROR: Opción no reconocida en generar-sbom-cyclonedx.sh: $1" >&2
      exit 1
      ;;
  esac
  OUTPUT_FILE="$1"
else
  OUTPUT_FILE="sbom.cyclonedx.json"
fi

if [[ "${OUTPUT_FILE}" == /* ]] || [[ "${OUTPUT_FILE}" == *".."* ]] || [ -z "${OUTPUT_FILE}" ]; then
  echo "ERROR: La ruta de salida debe ser relativa dentro del repositorio (recibido: '${OUTPUT_FILE}')." >&2
  exit 1
fi

REPO_ROOT_REAL="$(cd "${REPO_ROOT}" && pwd -P)"
if command -v realpath >/dev/null 2>&1 && realpath -m "${REPO_ROOT_REAL}" >/dev/null 2>&1; then
  ABS_OUTPUT_REAL="$(realpath -m "${REPO_ROOT_REAL}/${OUTPUT_FILE}")"
  if [ "${ABS_OUTPUT_REAL#"${REPO_ROOT_REAL}/"}" = "${ABS_OUTPUT_REAL}" ]; then
    echo "ERROR: La ruta de salida escapa del repositorio vía enlace simbólico (recibido: '${OUTPUT_FILE}')." >&2 && exit 1
  fi
  mkdir -p "$(dirname "${ABS_OUTPUT_REAL}")"
else
  _chk_path="${REPO_ROOT_REAL}"
  IFS='/' read -r -a _parts <<<"${OUTPUT_FILE}"
  for _part in "${_parts[@]}"; do
    [ -n "${_part}" ] || continue
    _chk_path="${_chk_path}/${_part}"
    if [ -L "${_chk_path}" ]; then
      echo "ERROR: La ruta de salida escapa del repositorio vía enlace simbólico (recibido: '${OUTPUT_FILE}')." >&2 && exit 1
    fi
  done
  mkdir -p "$(dirname "${REPO_ROOT_REAL}/${OUTPUT_FILE}")"
fi

TRIVY_IMAGE="aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb"
TRIVY_CACHE_HOST_DIR="${QA11X_TRIVY_CACHE_DIR:-${XDG_CACHE_HOME:-${HOME:-/tmp}/.cache}/qa-11x-trivy}"
if ! mkdir -p "${TRIVY_CACHE_HOST_DIR}" 2>/dev/null || [ ! -w "${TRIVY_CACHE_HOST_DIR}" ]; then
  TRIVY_CACHE_HOST_DIR="${TMPDIR:-/tmp}/.qa11x_trivy_cache_$(id -u 2>/dev/null || echo 0)"
  mkdir -p "${TRIVY_CACHE_HOST_DIR}"
fi
TRIVY_SKIP_DIRS="node_modules,.git,dist,target,graphify-out,vendor,.venv"
TRIVY_CONFIG_ARGS=(--skip-dirs "${TRIVY_SKIP_DIRS}")
if [ -f "${REPO_ROOT}/.trivy.yaml" ]; then
  TRIVY_CONFIG_ARGS=(--config /workspace/.trivy.yaml)
fi

docker run --rm \
  --security-opt=no-new-privileges:true \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e TRIVY_CACHE_DIR=/tmp/trivy-cache \
  -v "${TRIVY_CACHE_HOST_DIR}:/tmp/trivy-cache" \
  -v "${REPO_ROOT}:/workspace" \
  -w /workspace \
  "${TRIVY_IMAGE}" fs \
  --quiet \
  "${TRIVY_CONFIG_ARGS[@]}" \
  --format cyclonedx \
  --output "/workspace/${OUTPUT_FILE}" \
  /workspace

ABS_OUTPUT="${REPO_ROOT}/${OUTPUT_FILE}"
PY_IMAGE_NAME="${QA_PYTHON_IMAGE:-sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4}"
if [ -f "${ABS_OUTPUT}" ]; then
  DOCKER_ENV_ARGS=()
  if [ -n "${QA11X_ATTESTATION_KEY:-}" ]; then
    export QA11X_ATTESTATION_KEY
    DOCKER_ENV_ARGS+=(-e QA11X_ATTESTATION_KEY)
  fi
  docker run --rm --network none \
    --security-opt=no-new-privileges:true \
    -u "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -e PYTHONDONTWRITEBYTECODE=1 \
    -e SBOM_OUTPUT_FILE="${OUTPUT_FILE}" \
    ${DOCKER_ENV_ARGS[@]+"${DOCKER_ENV_ARGS[@]}"} \
    -v "${REPO_ROOT}:/workspace" \
    -w /workspace \
    "${PY_IMAGE_NAME}" \
    python3 -c '
import hashlib, hmac, os
from pathlib import Path

target = Path("/workspace") / os.environ["SBOM_OUTPUT_FILE"]
data = target.read_bytes()
digest = hashlib.sha256(data).hexdigest()
sha_path = target.with_name(f"{target.name}.sha256")
sha_path.write_text(f"{digest}  {target.name}\n", encoding="utf-8")
if os.environ.get("QA11X_ATTESTATION_KEY"):
    sig = hmac.new(
        os.environ["QA11X_ATTESTATION_KEY"].encode("utf-8"),
        data,
        hashlib.sha256,
    ).hexdigest()
    hmac_path = target.with_name(f"{target.name}.hmac")
    hmac_path.write_text(f"HMAC-SHA256({target.name})= {sig}\n", encoding="utf-8")
    os.chmod(hmac_path, 0o644)
'
fi

echo "✔ [SBOM CycloneDX] Generado exitosamente en: ${OUTPUT_FILE}"
