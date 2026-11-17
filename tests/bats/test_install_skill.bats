#!/usr/bin/env bats
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

setup() {
  load '/opt/bats-libs/bats-support/load.bash'
  load '/opt/bats-libs/bats-assert/load.bash'
  load '/opt/bats-libs/bats-mock/load.bash'

  if [ -f "${BATS_TEST_DIRNAME}/../../scripts/install-skill.sh" ]; then
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  elif [ -f "/repo/scripts/install-skill.sh" ]; then
    REPO_ROOT="/repo"
  else
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  fi
  INSTALL_SCRIPT="${REPO_ROOT}/scripts/install-skill.sh"
}

@test "install-skill.sh: --help muestra ayuda y retorna 0" {
  run sh "${INSTALL_SCRIPT}" --help
  assert_success
  assert_output --partial "Instalador Universal de Skills QA 11X"
  assert_output --partial "--include-scripts"
}

@test "install-skill.sh: --target sin argumento o valor invalido falla con codigo 1" {
  run sh "${INSTALL_SCRIPT}" --target
  assert_failure 1
  assert_output --partial "requiere un argumento"

  run sh "${INSTALL_SCRIPT}" --target agente_inexistente
  assert_failure 1
  assert_output --partial "inválido"
}

@test "install-skill.sh: instalacion exitosa con --include-scripts excluye publicar-mcp.sh" {
  TEST_DIR="${BATS_TEST_TMPDIR}/workspace_test"
  mkdir -p "${TEST_DIR}"

  cd "${TEST_DIR}"
  export QA_BLUEPRINTS_LOCAL_PATH="${REPO_ROOT}"
  run sh "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_success
  assert_output --partial "Instalación de Skills QA 11X Completada con Éxito"

  [ -f "${TEST_DIR}/.agents/skills/qa-11x-architect/SKILL.md" ]
  [ -f "${TEST_DIR}/.agents/skills/qa-11x-architect/references/01-core-13-layers.md" ]
  [ -f "${TEST_DIR}/.agents/skills/refactoring-ui/SKILL.md" ]
  [ -f "${TEST_DIR}/.agents/skills/tactical-patterns-11x/SKILL.md" ]
  [ -f "${TEST_DIR}/.agents/schemas/session_checkpoint.schema.json" ]
  [ -f "${TEST_DIR}/.agents/scripts/certify_task_completion.sh" ]
  [ ! -f "${TEST_DIR}/scripts/publicar-mcp.sh" ]
}

@test "install-skill.sh (bash): valida permisos 0644 en _budgets.py/json y +x en scripts bajo kcov" {
  local mini_repo="${BATS_TEST_TMPDIR}/mini_repo"
  local test_dir="${BATS_TEST_TMPDIR}/workspace_bash_test"
  mkdir -p "${mini_repo}/.agents/skills/qa-11x-architect" "${mini_repo}/.agents/scripts" \
    "${mini_repo}/.agents/schemas" "${mini_repo}/scripts" "${test_dir}"

  printf '# Architect\n' >"${mini_repo}/.agents/skills/qa-11x-architect/SKILL.md"
  printf 'SKILL_MAX_BYTES = 20480\n' >"${mini_repo}/.agents/scripts/_budgets.py"
  printf '{"type":"object"}\n' >"${mini_repo}/.agents/schemas/session_checkpoint.schema.json"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${mini_repo}/.agents/scripts/certify_task_completion.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${mini_repo}/scripts/publicar-mcp.sh"

  python3 - "${mini_repo}" <<'PY'
import hashlib, json, sys
from pathlib import Path

root = Path(sys.argv[1])
rels = [
    ".agents/skills/qa-11x-architect/SKILL.md",
    ".agents/scripts/_budgets.py",
    ".agents/schemas/session_checkpoint.schema.json",
    ".agents/scripts/certify_task_completion.sh",
    "scripts/publicar-mcp.sh",
]
gov = []
for rel in rels:
    data = (root / rel).read_bytes()
    gov.append({
        "path": rel,
        "sha256": hashlib.sha256(data).hexdigest(),
        "size_bytes": len(data),
    })
(root / "manifest.json").write_text(
    json.dumps({"blueprint_version": "3.1.0", "agent_governance_files": gov, "common_files": []}, indent=2),
    encoding="utf-8",
)
PY

  cd "${test_dir}"
  export QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}"
  run bash "${INSTALL_SCRIPT}" --help
  assert_success
  assert_output --partial "--include-scripts"

  run bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_success
  assert_output --partial "Instalación de Skills QA 11X Completada con Éxito"
  [ -f "${test_dir}/.agents/scripts/_budgets.py" ]
  [ ! -x "${test_dir}/.agents/scripts/_budgets.py" ]
  [ ! -x "${test_dir}/.agents/schemas/session_checkpoint.schema.json" ]
  [ -x "${test_dir}/.agents/scripts/certify_task_completion.sh" ]
  [ ! -f "${test_dir}/scripts/publicar-mcp.sh" ]
}

@test "install-skill.sh (bash): cubre fallback run_manifest_py sin jq (python3, docker stub y fallo sin runtimes)" {
  local mini_repo="${BATS_TEST_TMPDIR}/mini_repo_py"
  local test_dir_py="${BATS_TEST_TMPDIR}/ws_py"
  local test_dir_dk="${BATS_TEST_TMPDIR}/ws_dk"
  local test_dir_none="${BATS_TEST_TMPDIR}/ws_none"
  local bin_py="${BATS_TEST_TMPDIR}/bin_py"
  local bin_dk="${BATS_TEST_TMPDIR}/bin_dk"
  local bin_none="${BATS_TEST_TMPDIR}/bin_none"
  local real_py
  real_py="$(command -v python3)"

  mkdir -p "${mini_repo}/.agents/skills/qa-11x-architect" "${mini_repo}/.agents/scripts" \
    "${mini_repo}/.agents/schemas" "${mini_repo}/scripts" \
    "${test_dir_py}" "${test_dir_dk}" "${test_dir_none}" "${bin_py}" "${bin_dk}" "${bin_none}"

  printf '# Architect\n' >"${mini_repo}/.agents/skills/qa-11x-architect/SKILL.md"
  printf 'SKILL_MAX_BYTES = 20480\n' >"${mini_repo}/.agents/scripts/_budgets.py"
  printf '{"type":"object"}\n' >"${mini_repo}/.agents/schemas/session_checkpoint.schema.json"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${mini_repo}/.agents/scripts/certify_task_completion.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${mini_repo}/scripts/limpieza.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${mini_repo}/scripts/publicar-mcp.sh"

  "${real_py}" - "${mini_repo}" <<'PY'
import hashlib, json, sys
from pathlib import Path

root = Path(sys.argv[1])
rels = [
    ".agents/skills/qa-11x-architect/SKILL.md",
    ".agents/scripts/_budgets.py",
    ".agents/schemas/session_checkpoint.schema.json",
    ".agents/scripts/certify_task_completion.sh",
    "scripts/limpieza.sh",
    "scripts/publicar-mcp.sh",
]
gov = []
for rel in rels:
    data = (root / rel).read_bytes()
    gov.append({
        "path": rel,
        "sha256": hashlib.sha256(data).hexdigest(),
        "size_bytes": len(data),
    })
(root / "manifest.json").write_text(
    json.dumps({"blueprint_version": "3.2.0", "agent_governance_files": gov, "common_files": []}, indent=2),
    encoding="utf-8",
)
PY

  for tool in sh bash cat cp mkdir rm mv mktemp wc tr awk dirname basename pwd date chmod printf grep sed touch find env id sha256sum head tail; do
    resolved="$(command -v "${tool}" || true)"
    if [ -n "${resolved}" ]; then
      ln -sf "${resolved}" "${bin_none}/${tool}"
      ln -sf "${resolved}" "${bin_py}/${tool}"
      ln -sf "${resolved}" "${bin_dk}/${tool}"
    fi
  done
  ln -sf "${real_py}" "${bin_py}/python3"

  cat >"${bin_dk}/docker" <<EOF
#!/usr/bin/env bash
host_tmp=""
prev=""
py_code=""
while [ \$# -gt 0 ]; do
  if [ "\${prev}" = "-v" ]; then
    host_tmp="\${1%%:*}"
  elif [ "\${prev}" = "-c" ]; then
    py_code="\$1"
  fi
  prev="\$1"
  shift
done
exec "${real_py}" -c "\${py_code}" "\${host_tmp}/manifest.json"
EOF
  chmod +x "${bin_dk}/docker"

  export QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}"

  cd "${test_dir_py}"
  run env PATH="${bin_py}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace
  assert_success
  [ -f "${test_dir_py}/.agents/skills/qa-11x-architect/SKILL.md" ]

  # Ejercita rama else de --include-scripts (lineas 334-365) sin jq usando solo python3
  run env PATH="${bin_py}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_success
  [ -f "${test_dir_py}/.agents/scripts/_budgets.py" ]
  [ ! -x "${test_dir_py}/.agents/scripts/_budgets.py" ]
  [ ! -x "${test_dir_py}/.agents/schemas/session_checkpoint.schema.json" ]
  [ -x "${test_dir_py}/.agents/scripts/certify_task_completion.sh" ]
  [ -x "${test_dir_py}/scripts/limpieza.sh" ]
  [ ! -f "${test_dir_py}/scripts/publicar-mcp.sh" ]

  cd "${test_dir_dk}"
  run env PATH="${bin_dk}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace
  assert_success
  [ -f "${test_dir_dk}/.agents/skills/qa-11x-architect/SKILL.md" ]

  cd "${test_dir_none}"
  run env PATH="${bin_none}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace
  assert_failure 1
  assert_output --partial "Se requiere 'jq', 'python3' o 'docker'"
}
