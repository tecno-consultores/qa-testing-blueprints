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
STATIC_ONLY=false

for arg in "$@"; do
  case "${arg}" in
    --force)
      FORCE_SCAN=true
      ;;
    --static-only)
      STATIC_ONLY=true
      ;;
  esac
done

audit_ci_and_submakefiles() {
  local found_err=0
  local rel=""
  local out=""

  if [ -d "${REPO_ROOT}/.github" ]; then
    while IFS= read -r -d '' wf_file; do
      rel="${wf_file#"${REPO_ROOT}/"}"
      if ! out="$(awk -v file="${rel}" '
        {
          lines[NR] = $0
          if (NR <= 5 && index($0, "qa-ci-escape-ok") > 0) {
            skip_file = 1
          }
        }
        END {
          if (skip_file) exit 0
          bad = 0
          prev = ""
          for (i = 1; i <= NR; i++) {
            line = lines[i]
            trimmed = line
            sub(/^[[:space:]]+/, "", trimmed)
            if (trimmed != "" && substr(trimmed, 1, 1) != "#" &&
              index(line, "qa-ci-escape-ok") == 0 &&
              index(prev, "qa-ci-escape-ok") == 0 &&
              line ~ /\$\$[({][A-Za-z_]/) {
              printf "❌ [QA-CI-ESCAPE-01] %s:%d: Escape de doble dólar estilo Makefile/Compose en GitHub Actions (use $(...) o ${...}).\n", file, i
              bad = 1
            }
            prev = line
          }
          exit bad
        }
      ' "${wf_file}")"; then
        printf '%s\n' "${out}" >&2
        found_err=1
      fi
    done < <(find "${REPO_ROOT}/.github" -type f \( -path '*/workflows/*.yml' -o -path '*/workflows/*.yaml' -o -path '*/actions/*/action.yml' -o -path '*/actions/*/action.yaml' \) -print0 2>/dev/null)
  fi

  while IFS= read -r -d '' mk_file; do
    rel="${mk_file#"${REPO_ROOT}/"}"
    if ! out="$(awk -v file="${rel}" '
      {
        lines[NR] = $0
        if (NR <= 5 && index($0, "qa-make-curdir-ok") > 0) {
          skip_file = 1
        }
      }
      END {
        if (skip_file) exit 0
        bad = 0
        prev = ""
        for (i = 1; i <= NR; i++) {
          line = lines[i]
          trimmed = line
          sub(/^[[:space:]]+/, "", trimmed)
          check = line
          gsub(/\$\$/, "__QA_DBL__", check)
          if (trimmed != "" && substr(trimmed, 1, 1) != "#" &&
            index(line, "qa-make-curdir-ok") == 0 &&
            index(prev, "qa-make-curdir-ok") == 0 &&
            (check ~ /\$\(PWD\)/ || check ~ /\$\{PWD\}/)) {
            printf "❌ [QA-MAKE-CURDIR-01] %s:%d: Sub-Makefile usa $(PWD)/${PWD} en lugar de $(CURDIR).\n", file, i
            bad = 1
          }
          prev = line
        }
        exit bad
      }
    ' "${mk_file}")"; then
      printf '%s\n' "${out}" >&2
      found_err=1
    fi
  done < <(find "${REPO_ROOT}" -mindepth 2 -maxdepth 4 \
    \( -name node_modules -o -name .git -o -name dist -o -name .venv -o -name vendor -o -name target -o -name graphify-out -o -name tests -o -name test -o -name __tests__ \) -prune \
    -o -type f \( -name 'Makefile' -o -name 'Makefile.example' \) -print0 2>/dev/null)

  return "${found_err}"
}

audit_ci_and_submakefiles || exit 1
if [ "${STATIC_ONLY}" = true ]; then
  echo "✔ [IaC Static] Reglas QA-CI-ESCAPE-01 y QA-MAKE-CURDIR-01 verificadas sin hallazgos."
  exit 0
fi

# Calcular huella SHA-256 de archivos IaC, workflows, Makefiles y lockfiles de dependencias
IAC_FINGERPRINT=$(find "${REPO_ROOT}" -maxdepth 4 \
  \( -name node_modules -o -name .git -o -name dist -o -name .venv -o -name vendor \) -prune \
  -o -type f \( -name 'docker-compose*.yml' -o -name 'Dockerfile*' -o -name '.trivy.yaml' -o -name 'pnpm-lock.yaml' -o -name 'package-lock.json' -o -name 'uv.lock' -o -name 'composer.lock' -o -name 'Makefile' -o -name 'Makefile.example' -o -path '*/.github/workflows/*.yml' -o -path '*/.github/workflows/*.yaml' -o -path '*/.github/actions/*/action.yml' -o -path '*/.github/actions/*/action.yaml' \) \
  -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | awk '{print $1}')

CACHE_MARKER="/tmp/.qa11x_trivy_cache_${IAC_FINGERPRINT}"

if [ "${FORCE_SCAN}" = false ] && [ -n "${IAC_FINGERPRINT}" ] && [ -f "${CACHE_MARKER}" ]; then
  echo "✔ [Trivy] IaC (HIGH/CRIT=0) y File System (CRIT=0) verificados sin hallazgos (caché SHA-256)."
  exit 0
fi

TRIVY_CACHE_VOLUME="qa11x_trivy_cache"
TRIVY_DB_REPOS="public.ecr.aws/aquasecurity/trivy-db:2,ghcr.io/aquasecurity/trivy-db:2,mirror.gcr.io/aquasec/trivy-db:2"
TRIVY_SKIP_DIRS="node_modules,.git,dist,target,graphify-out,vendor,.venv"

# 1. Escaneo de misconfiguraciones IaC (Pass-Quiet / Fail-Verbose)
if ! IAC_OUT=$(docker run --rm \
  -v "${REPO_ROOT}:/app:ro" \
  -v "${TRIVY_CACHE_VOLUME}:/root/.cache/trivy" \
  -w /app \
  aquasec/trivy:latest config . \
  --quiet \
  --skip-dirs "${TRIVY_SKIP_DIRS}" \
  --severity HIGH,CRITICAL \
  --exit-code 1 2>&1); then
  echo "❌ [Trivy IaC] Misconfiguraciones HIGH/CRITICAL detectadas:" >&2
  echo "${IAC_OUT}" >&2
  exit 1
fi

# 2. Escaneo de vulnerabilidades críticas (CVEs) en lockfiles y dependencias locales
if ! FS_OUT=$(docker run --rm \
  -v "${REPO_ROOT}:/app:ro" \
  -v "${TRIVY_CACHE_VOLUME}:/root/.cache/trivy" \
  -w /app \
  aquasec/trivy:latest fs . \
  --quiet \
  --scanners vuln \
  --skip-dirs "${TRIVY_SKIP_DIRS}" \
  --db-repository "${TRIVY_DB_REPOS}" \
  --timeout 10m \
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
