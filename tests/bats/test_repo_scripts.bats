#!/usr/bin/env bats
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

setup() {
  load '/opt/bats-libs/bats-support/load.bash'
  load '/opt/bats-libs/bats-assert/load.bash'

  if [ -f "${BATS_TEST_DIRNAME}/../../scripts/verificar-secretos.sh" ]; then
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  elif [ -f "/repo/scripts/verificar-secretos.sh" ]; then
    REPO_ROOT="/repo"
  else
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"
  fi
}

@test "bump_version_11x.py: verifica paridad limpia (--check 0) y detecta desfase (--check 1)" {
  if ! command -v python3 >/dev/null 2>&1; then
    skip "python3 no disponible en contenedor base-bash-qa"
  fi
  WORK="${BATS_TEST_TMPDIR}/bump_ws"
  mkdir -p "${WORK}/mcp-server" "${WORK}/catalogs"
  cat >"${WORK}/mcp-server/package.json" <<'EOF'
{
  "version": "3.0.0"
}
EOF
  cat >"${WORK}/manifest.json" <<'EOF'
{
  "blueprint_version": "3.0.0"
}
EOF

  run python3 -c "import sys; sys.exit(0)"
  assert_success

  python3 - "${REPO_ROOT}/.agents/scripts/bump_version_11x.py" "${WORK}" <<'PY'
import importlib.util, re, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("bv", Path(sys.argv[1]))
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)
ws = Path(sys.argv[2])
mod.VERSION_RULES = (mod.VersionRule("manifest.json", (re.compile(r'^(\s*"blueprint_version"\s*:\s*")([^"]+)(")', re.MULTILINE),)),)
mod.EDITION_RULES = ()
assert mod.main(["--workspace", str(ws), "--check"]) == 0
(ws / "manifest.json").write_text('{"blueprint_version": "2.21.0"}\n', encoding="utf-8")
assert mod.main(["--workspace", str(ws), "--check"]) == 1
PY
}

@test "verificar-secretos.sh: aprueba codigo limpio y bloquea secreto inyectado" {
  WORK="$(mktemp -d /tmp/qa-sec-bats.XXXXXX)"
  mkdir -p "${WORK}/src"
  printf 'export const ok = "clean-value";\n' >"${WORK}/src/clean.ts"

  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" src/clean.ts' _ "${WORK}" "${REPO_ROOT}"
  if [ "${status}" -ne 0 ]; then
    rm -rf "${WORK}"
    false
  fi

  SYNTH_KEY="AKIA""9A8B7C6D5E4F3G2H"
  printf 'export const leak = "%s";\n' "${SYNTH_KEY}" >"${WORK}/src/leak.ts"

  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" src/leak.ts' _ "${WORK}" "${REPO_ROOT}"
  rm -rf "${WORK}"
  assert_failure
}

@test "publicar-mcp.sh: --help retorna 0 y --otp sin valor falla con codigo 1" {
  run env LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --help
  assert_success
  assert_output --partial "Publicador"
  assert_output --partial "--dry-run"

  run env LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --otp
  assert_failure 1
}
