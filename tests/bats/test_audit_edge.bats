# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

setup() {
  load '/opt/bats-libs/bats-support/load.bash'
  load '/opt/bats-libs/bats-assert/load.bash'

  if [ -f "${BATS_TEST_DIRNAME}/../../scripts/audit-edge.sh.example" ]; then
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  elif [ -f "/repo/scripts/audit-edge.sh.example" ]; then
    REPO_ROOT="/repo"
  else
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  fi
  EDGE_SCRIPT="${REPO_ROOT}/scripts/audit-edge.sh.example"
  MOCK_CURL="${BATS_TEST_TMPDIR}/mock_curl.sh"
}

write_mock_curl() {
  cat >"${MOCK_CURL}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
hdr_out=""
body_out=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -D) hdr_out="$2"; shift 2 ;;
    -o) body_out="$2"; shift 2 ;;
    -X|-H|--data) shift 2 ;;
    http://*|https://*) url="$1"; shift ;;
    *) shift ;;
  esac
done

if [[ "${url}" == *"/purge_cache" ]]; then
  if [ "${MOCK_CF_FAIL:-0}" = "1" ]; then
    printf '{"success":false,"errors":[{"message":"denied"}]}\n'
  else
    printf '{"success":true,"result":{"id":"zone-123"}}\n'
  fi
  exit 0
fi

case "${url}" in
  */assets/__audit_missing_probe__.js)
    printf 'HTTP/2 %s\r\nContent-Type: %s\r\nX-Content-Type-Options: nosniff\r\n\r\n' \
      "${MOCK_PROBE_STATUS:-404}" "${MOCK_PROBE_CT:-text/plain}" >"${hdr_out}"
    ;;
  */assets/index-abc123.js)
    printf 'HTTP/2 %s\r\nContent-Type: %s\r\nX-Content-Type-Options: nosniff\r\n\r\n' \
      "${MOCK_ASSET_STATUS:-200}" "${MOCK_ASSET_CT:-application/javascript; charset=utf-8}" >"${hdr_out}"
    ;;
  */api/health)
    printf 'HTTP/2 200\r\nCache-Control: %s\r\nContent-Type: application/json\r\n\r\n' \
      "${MOCK_EXTRA_CC:-no-store}" >"${hdr_out}"
    ;;
  *)
    {
      printf 'HTTP/2 %s\r\n' "${MOCK_ROOT_STATUS:-200}"
      printf 'Cache-Control: %s\r\n' "${MOCK_ROOT_CC:-public, max-age=0, must-revalidate}"
      printf 'X-Content-Type-Options: %s\r\n' "${MOCK_NOSNIFF-nosniff}"
      printf 'X-Frame-Options: %s\r\n' "${MOCK_XFO:-DENY}"
      if [ "${MOCK_OMIT_HSTS:-0}" != "1" ]; then
        printf 'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload\r\n'
      fi
      printf 'Content-Type: text/html; charset=utf-8\r\n\r\n'
    } >"${hdr_out}"
    if [ -n "${body_out}" ] && [ "${body_out}" != "/dev/null" ]; then
      printf '%s\n' "${MOCK_HTML:-<!doctype html><html><body><script type=\"module\" src=\"/assets/index-abc123.js\"></script></body></html>}" >"${body_out}"
    fi
    ;;
esac
EOF
  chmod +x "${MOCK_CURL}"
}

@test "audit-edge.sh.example --help muestra uso y retorna 0" {
  run bash "${EDGE_SCRIPT}" --help
  assert_success
  assert_output --partial "EDGE_BASE_URL"
}

@test "audit-edge.sh.example falla sin EDGE_BASE_URL ni argumento" {
  run env -u EDGE_BASE_URL bash "${EDGE_SCRIPT}"
  assert_failure 1
  assert_output --partial "Debe indicar EDGE_BASE_URL"
}

@test "audit-edge.sh.example rechaza token en argv y argumentos desconocidos" {
  run bash "${EDGE_SCRIPT}" --api-token=secret https://edge.example
  assert_failure 1
  assert_output --partial "variable de entorno"

  run bash "${EDGE_SCRIPT}" --unknown-flag https://edge.example
  assert_failure 1
  assert_output --partial "Argumento no reconocido"
}

@test "audit-edge.sh.example (Nominal HTTPS + Purge + Extra Paths): pasa todas las compuertas" {
  write_mock_curl
  run env \
    CURL_BIN="${MOCK_CURL}" \
    CLOUDFLARE_ZONE_ID="zone-demo-11x" \
    CLOUDFLARE_API_TOKEN="fake-cf-token-11x" \
    EDGE_NO_CACHE_PATHS="/api/health" \
    bash "${EDGE_SCRIPT}" --purge-cloudflare-cache https://edge.example
  assert_success
  assert_output --partial "Caché de zona Cloudflare purgada correctamente"
  assert_output --partial "Auditoría de borde superada"
}

@test "audit-edge.sh.example (Degradado Cache-Control positivo en GET /): bloquea con exit 1" {
  write_mock_curl
  run env CURL_BIN="${MOCK_CURL}" MOCK_ROOT_CC="public, max-age=16070400" \
    bash "${EDGE_SCRIPT}" https://edge.example
  assert_failure 1
  assert_output --partial "max-age positivo"
}

@test "audit-edge.sh.example (Degradado Colisión MIME text/html en bundle JS): bloquea con exit 1" {
  write_mock_curl
  run env CURL_BIN="${MOCK_CURL}" MOCK_ASSET_CT="text/html; charset=utf-8" \
    bash "${EDGE_SCRIPT}" https://edge.example
  assert_failure 1
  assert_output --partial "Colisión MIME"
}

@test "audit-edge.sh.example (Degradado Sonda 404 devuelve 200 por catch-all SPA): bloquea con exit 1" {
  write_mock_curl
  run env CURL_BIN="${MOCK_CURL}" MOCK_PROBE_STATUS="200" \
    bash "${EDGE_SCRIPT}" https://edge.example
  assert_failure 1
  assert_output --partial "esperado 404"
}

@test "audit-edge.sh.example (Degradado Cabeceras OSHP/HSTS/Bundle/Purge): detecta cada brecha" {
  write_mock_curl
  run env CURL_BIN="${MOCK_CURL}" MOCK_ROOT_STATUS="502" bash "${EDGE_SCRIPT}" https://edge.example
  assert_failure 1
  assert_output --partial "esperado 200"

  run env CURL_BIN="${MOCK_CURL}" MOCK_NOSNIFF="" bash "${EDGE_SCRIPT}" https://edge.example
  assert_failure 1
  assert_output --partial "X-Content-Type-Options"

  run env CURL_BIN="${MOCK_CURL}" MOCK_XFO="SAMEORIGIN" bash "${EDGE_SCRIPT}" https://edge.example
  assert_failure 1
  assert_output --partial "X-Frame-Options"

  run env CURL_BIN="${MOCK_CURL}" MOCK_OMIT_HSTS="1" bash "${EDGE_SCRIPT}" https://edge.example
  assert_failure 1
  assert_output --partial "Strict-Transport-Security"

  run env CURL_BIN="${MOCK_CURL}" MOCK_ASSET_STATUS="404" bash "${EDGE_SCRIPT}" https://edge.example
  assert_failure 1
  assert_output --partial "Bundle vivo"

  run env CURL_BIN="${MOCK_CURL}" MOCK_CF_FAIL="1" \
    CLOUDFLARE_ZONE_ID="zone-demo" CLOUDFLARE_API_TOKEN="fake-token" \
    bash "${EDGE_SCRIPT}" --purge-cloudflare-cache https://edge.example
  assert_failure 1
  assert_output --partial "Purga de caché Cloudflare falló"

  run env -u CLOUDFLARE_ZONE_ID -u CLOUDFLARE_API_TOKEN CURL_BIN="${MOCK_CURL}" \
    bash "${EDGE_SCRIPT}" --purge-cloudflare-cache https://edge.example
  assert_failure 1
  assert_output --partial "requiere CLOUDFLARE_ZONE_ID"
}
