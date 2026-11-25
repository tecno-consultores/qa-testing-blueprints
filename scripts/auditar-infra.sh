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
    -h | --help)
      echo "Uso: ./scripts/auditar-infra.sh [--force] [--static-only]"
      echo "  Audita IaC (Trivy config + fs) y guardas estáticas CI/Makefile en Docker efímero."
      exit 0
      ;;
    *)
      echo "❌ Error: Opción no reconocida: ${arg}" >&2
      exit 1
      ;;
  esac
done

audit_ci_and_submakefiles() {
  local found_err=0
  local rel=""
  local out=""
  local awk_wf_prog=""
  local awk_mk_prog=""

  read -r -d '' awk_wf_prog <<'AWK' || true
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
AWK

  read -r -d '' awk_mk_prog <<'AWK' || true
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
AWK

  if [ -d "${REPO_ROOT}/.github" ]; then
    while IFS= read -r -d '' wf_file; do
      rel="${wf_file#"${REPO_ROOT}/"}"
      if ! out="$(awk -v file="${rel}" "${awk_wf_prog}" "${wf_file}")"; then
        printf '%s\n' "${out}" >&2
        found_err=1
      fi
    done < <(find "${REPO_ROOT}/.github" -type f \( -path '*/workflows/*.yml' -o -path '*/workflows/*.yaml' -o -path '*/actions/*/action.yml' -o -path '*/actions/*/action.yaml' \) -print0 2>/dev/null)
  fi

  while IFS= read -r -d '' mk_file; do
    rel="${mk_file#"${REPO_ROOT}/"}"
    if ! out="$(awk -v file="${rel}" "${awk_mk_prog}" "${mk_file}")"; then
      printf '%s\n' "${out}" >&2
      found_err=1
    fi
  done < <(find "${REPO_ROOT}" -mindepth 2 -maxdepth 4 \
    \( -name node_modules -o -name .git -o -name dist -o -name .venv -o -name vendor -o -name target -o -name graphify-out -o -name tests -o -name test -o -name __tests__ \) -prune \
    -o -type f \( -name 'Makefile' -o -name 'Makefile.example' \) -print0 2>/dev/null)

  local awk_loop_compose=""
  local awk_loop_script=""
  local -a cmp_files=()
  local -a sh_files=()

  read -r -d '' awk_loop_compose <<'AWK' || true
{
  lines[NR] = $0
  if (NR <= 5 && index($0, "qa-docker-loop-ok") > 0) {
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
      index(line, "qa-docker-loop-ok") == 0 &&
      index(prev, "qa-docker-loop-ok") == 0 &&
      line ~ /^[[:space:]]*restart[[:space:]]*:[[:space:]]*["\047]?(always|unless-stopped|on-failure)["\047]?[[:space:]]*(#.*)?$/) {
      printf "❌ [QA-DOCKER-LOOP-01] %s:%d: Política restart ilimitada en manifiesto QA/test/deploy (use restart: \"no\").\n", file, i
      bad = 1
    }
    prev = line
  }
  exit bad
}
AWK

  read -r -d '' awk_loop_script <<'AWK' || true
{
  lines[NR] = $0
  if (NR <= 5 && index($0, "qa-docker-loop-ok") > 0) {
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
      index(line, "qa-docker-loop-ok") == 0 &&
      index(prev, "qa-docker-loop-ok") == 0 &&
      line ~ /docker[[:space:]-]+compose[[:space:]]+([^#]*[[:space:]])?up[[:space:]].*--wait([[:space:]]|$)/ &&
      line !~ /--wait-timeout/) {
      printf "❌ [QA-DOCKER-LOOP-01] %s:%d: docker compose up --wait sin --wait-timeout.\n", file, i
      bad = 1
    }
    prev = line
  }
  exit bad
}
AWK

  mapfile -d '' -t cmp_files < <(find "${REPO_ROOT}" -maxdepth 4 \
    \( -name node_modules -o -name .git -o -name dist -o -name .venv -o -name vendor -o -name target -o -name graphify-out -o -name tests -o -name test -o -name __tests__ \) -prune \
    -o -type f \( -name 'docker-compose.qa*.yml' -o -name 'docker-compose.test*.yml' -o -name 'docker-compose.deploy*.yml' -o -name 'compose.qa*.yml' -o -name 'compose.test*.yml' -o -name 'compose.deploy*.yml' \) -print0 2>/dev/null)
  for cmp_file in "${cmp_files[@]}"; do
    rel="${cmp_file#"${REPO_ROOT}/"}"
    if ! out="$(awk -v file="${rel}" "${awk_loop_compose}" "${cmp_file}")"; then
      printf '%s\n' "${out}" >&2
      found_err=1
    fi
  done

  mapfile -d '' -t sh_files < <(find "${REPO_ROOT}" -maxdepth 4 \
    \( -name node_modules -o -name .git -o -name dist -o -name .venv -o -name vendor -o -name target -o -name graphify-out -o -name tests -o -name test -o -name __tests__ \) -prune \
    -o -type f \( -name 'deploy*.sh' -o -name 'ci*.sh' -o -name 'probar-*.sh' -o -name 'release*.sh' \) -print0 2>/dev/null)
  for sh_file in "${sh_files[@]}"; do
    rel="${sh_file#"${REPO_ROOT}/"}"
    if ! out="$(awk -v file="${rel}" "${awk_loop_script}" "${sh_file}")"; then
      printf '%s\n' "${out}" >&2
      found_err=1
    fi
  done

  return "${found_err}"
}

audit_ci_and_submakefiles || exit 1
if [ "${STATIC_ONLY}" = true ]; then
  echo "✔ [IaC Static] Reglas QA-CI-ESCAPE-01, QA-MAKE-CURDIR-01 y QA-DOCKER-LOOP-01 verificadas sin hallazgos."
  exit 0
fi

# Calcular huella SHA-256 portable (Linux sha256sum o macOS shasum) de IaC, workflows, Makefiles y lockfiles
compute_iac_fingerprint() {
  local hasher="$1"
  if [ "${hasher}" = "sha256sum" ]; then
    find "${REPO_ROOT}" -maxdepth 4 \
      \( -name node_modules -o -name .git -o -name dist -o -name .venv -o -name vendor \) -prune \
      -o -type f \( -name 'docker-compose*.yml' -o -name 'Dockerfile*' -o -name '.trivy.yaml' -o -name '.trivyignore*' -o -name 'package.json' -o -name 'pnpm-lock.yaml' -o -name 'package-lock.json' -o -name 'pyproject.toml' -o -name 'uv.lock' -o -name 'composer.json' -o -name 'composer.lock' -o -name 'pom.xml' -o -name 'requirements*.txt' -o -name 'poetry.lock' -o -name 'Pipfile.lock' -o -name 'Cargo.lock' -o -name 'go.sum' -o -name 'Makefile' -o -name 'Makefile.example' -o -name '*.tf' -o -name '*.tfvars' -o -name '*.example' -o -path '*/.github/workflows/*.yml' -o -path '*/.github/workflows/*.yaml' -o -path '*/.github/actions/*/action.yml' -o -path '*/.github/actions/*/action.yaml' \) \
      -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | awk '{print $1}'
  else
    find "${REPO_ROOT}" -maxdepth 4 \
      \( -name node_modules -o -name .git -o -name dist -o -name .venv -o -name vendor \) -prune \
      -o -type f \( -name 'docker-compose*.yml' -o -name 'Dockerfile*' -o -name '.trivy.yaml' -o -name '.trivyignore*' -o -name 'package.json' -o -name 'pnpm-lock.yaml' -o -name 'package-lock.json' -o -name 'pyproject.toml' -o -name 'uv.lock' -o -name 'composer.json' -o -name 'composer.lock' -o -name 'pom.xml' -o -name 'requirements*.txt' -o -name 'poetry.lock' -o -name 'Pipfile.lock' -o -name 'Cargo.lock' -o -name 'go.sum' -o -name 'Makefile' -o -name 'Makefile.example' -o -name '*.tf' -o -name '*.tfvars' -o -name '*.example' -o -path '*/.github/workflows/*.yml' -o -path '*/.github/workflows/*.yaml' -o -path '*/.github/actions/*/action.yml' -o -path '*/.github/actions/*/action.yaml' \) \
      -print0 2>/dev/null | sort -z | xargs -0 shasum -a 256 2>/dev/null | shasum -a 256 | awk '{print $1}'
  fi
}

if command -v sha256sum >/dev/null 2>&1; then
  IAC_FINGERPRINT="$(compute_iac_fingerprint sha256sum)"
else
  IAC_FINGERPRINT="$(compute_iac_fingerprint shasum)"
fi

CACHE_DIR="${REPO_ROOT}/.agents/.cache/trivy"
CACHE_UTC_DAY="$(date -u +%Y%m%d 2>/dev/null || echo 'nodate')"
CACHE_MARKER="${CACHE_DIR}/marker_${IAC_FINGERPRINT}_${CACHE_UTC_DAY}"

if [ "${FORCE_SCAN}" = false ] && [ -n "${IAC_FINGERPRINT}" ] && [ -f "${CACHE_MARKER}" ]; then
  echo "✔ [Trivy] IaC (HIGH/CRIT=0) y File System (HIGH/CRIT=0) verificados sin hallazgos (caché SHA-256)."
  exit 0
fi

TRIVY_IMAGE="aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb"
TRIVY_CACHE_HOST_DIR="${QA11X_TRIVY_CACHE_DIR:-${XDG_CACHE_HOME:-${HOME:-/tmp}/.cache}/qa-11x-trivy}"
if ! mkdir -p "${TRIVY_CACHE_HOST_DIR}" 2>/dev/null || [ ! -w "${TRIVY_CACHE_HOST_DIR}" ]; then
  TRIVY_CACHE_HOST_DIR="${TMPDIR:-/tmp}/.qa11x_trivy_cache_$(id -u 2>/dev/null || echo 0)"
  mkdir -p "${TRIVY_CACHE_HOST_DIR}"
fi
TRIVY_DB_REPOS="public.ecr.aws/aquasecurity/trivy-db:2,ghcr.io/aquasecurity/trivy-db:2,mirror.gcr.io/aquasec/trivy-db:2"
TRIVY_SKIP_DIRS="node_modules,.git,dist,target,graphify-out,vendor,.venv"
TRIVY_CONFIG_ARGS=(--skip-dirs "${TRIVY_SKIP_DIRS}")
if [ -f "${REPO_ROOT}/.trivy.yaml" ]; then
  TRIVY_CONFIG_ARGS=(--config .trivy.yaml)
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ [IaC / Regla Cero] Se requiere Docker disponible en PATH para ejecutar Trivy en contenedor efímero (use --static-only para guardas estáticas)." >&2
  exit 1
fi

# 1. Escaneo de misconfiguraciones IaC (Pass-Quiet / Fail-Verbose)
if ! IAC_OUT=$(docker run --rm \
  --security-opt=no-new-privileges:true \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e TRIVY_CACHE_DIR=/tmp/trivy-cache \
  -v "${REPO_ROOT}:/app:ro" \
  -v "${TRIVY_CACHE_HOST_DIR}:/tmp/trivy-cache" \
  -w /app \
  "${TRIVY_IMAGE}" config . \
  --quiet \
  "${TRIVY_CONFIG_ARGS[@]}" \
  --severity HIGH,CRITICAL \
  --exit-code 1 2>&1); then
  echo "❌ [Trivy IaC] Misconfiguraciones HIGH/CRITICAL detectadas:" >&2
  echo "${IAC_OUT}" >&2
  exit 1
fi

# 2. Escaneo de vulnerabilidades HIGH/CRITICAL (CVEs) en lockfiles y dependencias locales
if ! FS_OUT=$(docker run --rm \
  --security-opt=no-new-privileges:true \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e TRIVY_CACHE_DIR=/tmp/trivy-cache \
  -v "${REPO_ROOT}:/app:ro" \
  -v "${TRIVY_CACHE_HOST_DIR}:/tmp/trivy-cache" \
  -w /app \
  "${TRIVY_IMAGE}" fs . \
  --quiet \
  --scanners vuln \
  "${TRIVY_CONFIG_ARGS[@]}" \
  --db-repository "${TRIVY_DB_REPOS}" \
  --timeout 10m \
  --severity HIGH,CRITICAL \
  --exit-code 1 2>&1); then
  echo "❌ [Trivy FS] Vulnerabilidades HIGH/CRITICAL detectadas:" >&2
  echo "${FS_OUT}" >&2
  exit 1
fi

if [ -n "${IAC_FINGERPRINT}" ]; then
  if mkdir -p "${CACHE_DIR}" 2>/dev/null; then
    chmod 700 "${REPO_ROOT}/.agents/.cache" "${CACHE_DIR}" 2>/dev/null || true
    rm -f "${CACHE_DIR}/marker_"* 2>/dev/null || true
    : >"${CACHE_MARKER}" 2>/dev/null || true
    chmod 600 "${CACHE_MARKER}" 2>/dev/null || true
  fi
fi

echo "✔ [Trivy] IaC (HIGH/CRIT=0) y File System (HIGH/CRIT=0) verificados sin hallazgos."
exit 0
