#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
set -euo pipefail

TARGET_DIR="."
DRY_RUN=0
PUSHGATEWAY_URL=""

show_help() {
  cat <<'EOF'
Uso: clean_artifacts.sh [--target DIR] [--dry-run] [--pushgateway-url URL] [--help]
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      shift
      TARGET_DIR="${1:?--target requiere directorio}"
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --pushgateway-url)
      shift
      PUSHGATEWAY_URL="${1:?--pushgateway-url requiere URL}"
      ;;
    --help | -h)
      show_help
      exit 0
      ;;
    *)
      printf 'Opcion no reconocida: %s\n' "$1" >&2
      exit 2
      ;;
  esac
  shift
done

if [ ! -d "$TARGET_DIR" ]; then
  printf 'Directorio inexistente: %s\n' "$TARGET_DIR" >&2
  exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
  printf '[DRY-RUN] Limpieza omitida en %s\n' "$TARGET_DIR"
  exit 0
fi

rm -rf "${TARGET_DIR:?}/coverage_report" "${TARGET_DIR:?}/.pytest_cache"

if [ -n "$PUSHGATEWAY_URL" ] && command -v curl >/dev/null 2>&1; then
  printf 'clean_artifacts_success_total 1\n' | curl -fsS --proto '=https' --tlsv1.2 --connect-timeout 2 --max-time 4 -X POST --data-binary @- "${PUSHGATEWAY_URL%/}/metrics/job/bash_scripts" >/dev/null 2>&1 || true
fi

if command -v docker >/dev/null 2>&1 && [ -f "${TARGET_DIR}/docker-compose.qa.yml" ]; then
  docker compose --profile "*" -f "${TARGET_DIR}/docker-compose.qa.yml" down -v --remove-orphans
fi
