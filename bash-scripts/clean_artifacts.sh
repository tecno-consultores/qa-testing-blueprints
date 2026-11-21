#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
set -euo pipefail

TARGET_DIR="."
DRY_RUN=0
PUSHGATEWAY_URL=""
ALLOW_INSECURE_LOCAL=0

show_help() {
  cat <<'EOF'
Uso: clean_artifacts.sh [--target DIR] [--dry-run] [--pushgateway-url URL] [--allow-insecure-local] [--help]
EOF
}

extract_http_host() {
  local raw_url="$1"
  local after_scheme="${raw_url#*://}"
  local rest="${after_scheme%%[/?#]*}"
  if [[ -z "$rest" || "$raw_url" == *[[:space:]\\?#]* || "$rest" == *@* ]]; then
    return 1
  fi

  local host=""
  if [[ "$rest" == \[* ]]; then
    if [[ "$rest" =~ ^\[([^][]+)\](:[0-9]+)?$ ]]; then
      host="[${BASH_REMATCH[1]}]"
    else
      return 1
    fi
  elif [[ "$rest" != *\[* && "$rest" != *\]* && "$rest" =~ ^([^:]+)(:[0-9]+)?$ ]]; then
    host="${BASH_REMATCH[1]}"
  else
    return 1
  fi

  printf '%s\n' "${host,,}"
}

push_metrics() {
  local url="$1"
  if [[ "$url" != *"://"* ]]; then
    printf 'Esquema de Pushgateway invalido (requiere https:// o http:// local): %s\n' "$url" >&2
    exit 1
  fi

  local scheme="${url%%://*}"
  scheme="${scheme,,}"
  local -a proto_flags=()
  case "$scheme" in
    https)
      proto_flags=(--proto '=https' --tlsv1.2)
      ;;
    http)
      proto_flags=(--proto '=http')
      ;;
    *)
      printf 'Esquema de Pushgateway invalido (requiere https:// o http:// local): %s\n' "$url" >&2
      exit 1
      ;;
  esac

  local host
  if ! host="$(extract_http_host "$url")"; then
    printf 'URL de Pushgateway invalida (autoridad malformada, userinfo @ o query/fragmento): %s\n' "$url" >&2
    exit 1
  fi

  if [ "$scheme" = "http" ]; then
    case "$host" in
      localhost | 127.0.0.1 | '[::1]' | pushgateway | bash_pushgateway)
        :
        ;;
      *)
        if [ "$ALLOW_INSECURE_LOCAL" -ne 1 ]; then
          printf 'Pushgateway HTTP bloqueado para host no local (usa HTTPS o --allow-insecure-local): %s\n' "$host" >&2
          exit 1
        fi
        ;;
    esac
  fi

  if ! command -v curl >/dev/null 2>&1; then
    printf 'curl es requerido para enviar metricas a Pushgateway: %s\n' "$url" >&2
    exit 1
  fi

  local after_scheme="${url#*://}"
  local authority="${after_scheme%%[/?#]*}"
  local path_suffix="${after_scheme#"$authority"}"
  local target_url="${scheme}://${authority,,}${path_suffix}"
  while [[ "$target_url" == */ ]]; do
    target_url="${target_url%/}"
  done

  if ! printf 'clean_artifacts_success_total 1\n' | curl -fsS "${proto_flags[@]}" --connect-timeout 2 --max-time 4 -X POST --data-binary @- "${target_url}/metrics/job/bash_scripts" >/dev/null; then
    printf 'Error al enviar metrica a Pushgateway: %s\n' "$url" >&2
    exit 1
  fi
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
    --allow-insecure-local)
      ALLOW_INSECURE_LOCAL=1
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

if [ -n "$PUSHGATEWAY_URL" ]; then
  push_metrics "$PUSHGATEWAY_URL"
fi

if command -v docker >/dev/null 2>&1 && [ -f "${TARGET_DIR}/docker-compose.qa.yml" ]; then
  docker compose --profile "*" -f "${TARGET_DIR}/docker-compose.qa.yml" down -v --remove-orphans
fi
