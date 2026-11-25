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


_create_mini_install_repo() {
  local repo_dir="$1"
  mkdir -p "${repo_dir}/.agents/skills/qa-11x-architect"
  printf '# Mini Architect\n' >"${repo_dir}/.agents/skills/qa-11x-architect/SKILL.md"
  printf '# Active Task\n' >"${repo_dir}/.agents/ACTIVE_TASK.md.example"
  printf 'scan:\n  skip-dirs: []\n' >"${repo_dir}/.trivy.yaml"
  printf '#!/usr/bin/env bash\necho hooks\n' >"${repo_dir}/instalar-hooks.sh"
  printf 'SECRET=dummy\n' >"${repo_dir}/.env.example"
  local s_sha a_sha t_sha h_sha e_sha
  s_sha="$(sha256sum "${repo_dir}/.agents/skills/qa-11x-architect/SKILL.md" | awk '{print $1}')"
  a_sha="$(sha256sum "${repo_dir}/.agents/ACTIVE_TASK.md.example" | awk '{print $1}')"
  t_sha="$(sha256sum "${repo_dir}/.trivy.yaml" | awk '{print $1}')"
  h_sha="$(sha256sum "${repo_dir}/instalar-hooks.sh" | awk '{print $1}')"
  e_sha="$(sha256sum "${repo_dir}/.env.example" | awk '{print $1}')"
  cat >"${repo_dir}/manifest.json" <<JSON
{
  "blueprint_version": "3.2.0",
  "agent_governance_files": [
    {"path": ".agents/skills/qa-11x-architect/SKILL.md", "sha256": "${s_sha}", "size_bytes": 17},
    {"path": ".agents/ACTIVE_TASK.md.example", "target_name": ".agents/ACTIVE_TASK.md", "sha256": "${a_sha}", "size_bytes": 14}
  ],
  "common_files": [
    {"path": ".trivy.yaml", "sha256": "${t_sha}", "size_bytes": 21, "merge_strategy": "copy_if_missing"},
    {"path": "instalar-hooks.sh", "sha256": "${h_sha}", "size_bytes": 31},
    {"path": ".env.example", "sha256": "${e_sha}", "size_bytes": 13, "merge_strategy": "copy_if_missing"}
  ]
}
JSON
}

@test "install-skill.sh: --dry-run no escribe archivos y flags desconocidos fallan con exit 1" {
  local mini_repo="${BATS_TEST_TMPDIR}/dry_mini_repo"
  local dry_ws="${BATS_TEST_TMPDIR}/dry_ws"
  local fake_home="${BATS_TEST_TMPDIR}/dry_home"
  local empty_auto="${BATS_TEST_TMPDIR}/empty_auto_home"
  local pop_home="${BATS_TEST_TMPDIR}/pop_home"
  mkdir -p "${dry_ws}" "${fake_home}/.gemini" "${empty_auto}" \
    "${pop_home}/.gemini" "${pop_home}/.claude" "${pop_home}/.hermes" \
    "${pop_home}/.cursor" "${pop_home}/.codeium/windsurf" "${pop_home}/.codex"
  _create_mini_install_repo "${mini_repo}"

  cd "${dry_ws}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --dry-run --include-scripts --init-agents
  assert_success
  assert_output --partial "DRY-RUN"
  refute_output --partial "GEMINI.md"
  [ ! -e "${dry_ws}/.agents" ]
  [ ! -e "${dry_ws}/.trivy.yaml" ]
  [ ! -e "${dry_ws}/instalar-hooks.sh" ]
  [ ! -e "${dry_ws}/AGENTS.md" ]

  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target antigravity --dry-run
  assert_success
  assert_output --partial "GEMINI.md"

  cd "${fake_home}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --dry-run --include-scripts --init-agents
  assert_success
  assert_output --partial "Modo Global"

  cd "${empty_auto}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${empty_auto}" LC_ALL=C bash "${INSTALL_SCRIPT}" --dry-run
  assert_success
  assert_output --partial ".gemini/config/skills"

  cd "${dry_ws}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${pop_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target all --dry-run
  assert_success
  assert_output --partial ".codex/skills"

  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --flag-inventada
  assert_failure 1
  assert_output --partial "Opción CLI desconocida"
}

@test "install-skill.sh: guardia de HOME, --target all (windsurf/codex/antigravity/GEMINI.md) y copy_if_missing" {
  local mini_repo="${BATS_TEST_TMPDIR}/all_mini_repo"
  local fake_home="${BATS_TEST_TMPDIR}/guard_home"
  local fake_home_all="${BATS_TEST_TMPDIR}/all_home"
  local fake_ws="${BATS_TEST_TMPDIR}/all_ws"
  mkdir -p "${fake_home}/.gemini/antigravity" "${fake_home_all}" "${fake_ws}"
  _create_mini_install_repo "${mini_repo}"

  # En HOME, --target workspace debe abortar; --target antigravity omite --include-scripts y --init-agents
  cd "${fake_home}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace
  assert_failure 1

  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target antigravity --include-scripts --init-agents
  assert_success
  [ -f "${fake_home}/.gemini/config/skills/qa-11x-architect/SKILL.md" ]
  [ -f "${fake_home}/.gemini/antigravity/skills/qa-11x-architect/SKILL.md" ]
  [ -f "${fake_home}/.gemini/GEMINI.md" ]
  [ ! -e "${fake_home}/instalar-hooks.sh" ]
  [ ! -e "${fake_home}/AGENTS.md" ]

  # --target all en HOME limpio instala en gemini, windsurf y codex globales
  cd "${fake_home_all}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${fake_home_all}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target all
  assert_success
  [ -f "${fake_home_all}/.gemini/config/skills/qa-11x-architect/SKILL.md" ]
  [ -f "${fake_home_all}/.codeium/windsurf/skills/qa-11x-architect/SKILL.md" ]
  [ -f "${fake_home_all}/.codex/skills/qa-11x-architect/SKILL.md" ]
  [ -f "${fake_home_all}/.gemini/GEMINI.md" ]

  # Preservar .trivy.yaml preexistente (copy_if_missing), crear instalar-hooks.sh, ACTIVE_TASK.md, y fusionar AGENTS.md (append + update)
  printf '# custom-trivy-keep\n' >"${fake_ws}/.trivy.yaml"
  printf '# Custom Header\n' >"${fake_ws}/AGENTS.md"
  cd "${fake_ws}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts --init-agents
  assert_success
  [ -f "${fake_ws}/.agents/skills/qa-11x-architect/SKILL.md" ]
  [ -f "${fake_ws}/.agents/ACTIVE_TASK.md" ]
  [ -f "${fake_ws}/AGENTS.md" ]
  [ -f "${fake_ws}/instalar-hooks.sh" ]
  [ -x "${fake_ws}/instalar-hooks.sh" ]
  [ ! -e "${fake_ws}/.env.example" ]
  run cat "${fake_ws}/.trivy.yaml"
  assert_success
  assert_output --partial "custom-trivy-keep"

  # Segunda corrida con marcadores ya presentes cubre reemplazo idempotente del bloque
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --init-agents
  assert_success
  run grep -F "Custom Header" "${fake_ws}/AGENTS.md"
  assert_success
}

@test "install-skill.sh: M048/M059 claude/cursor/hermes aislan GEMINI.md, rechazo PWA manifest, surgical_merge y script tampered" {
  local mini_repo="${BATS_TEST_TMPDIR}/ext_mini_repo"
  local fake_home="${BATS_TEST_TMPDIR}/ext_home"
  local fake_ws="${BATS_TEST_TMPDIR}/ext_ws"
  local pwa_ws="${BATS_TEST_TMPDIR}/pwa_ws"
  local fake_bin="${BATS_TEST_TMPDIR}/ext_bin"
  mkdir -p "${mini_repo}/.agents/skills/qa-11x-architect" "${mini_repo}/scripts" \
    "${fake_home}/.gemini" "${fake_ws}" "${pwa_ws}" "${fake_bin}"

  printf '# Architect\n' >"${mini_repo}/.agents/skills/qa-11x-architect/SKILL.md"
  printf '#!/usr/bin/env bash\necho demo\n' >"${mini_repo}/scripts/demo.sh"
  printf '#!/usr/bin/env bash\necho hidden\n' >"${mini_repo}/scripts/probar-mcp-example.sh"
  printf 'new: true\n' >"${mini_repo}/lefthook.yml"
  printf 'custom-ignore-line\n' >"${mini_repo}/.gitignore"
  printf 'skip: fetch\n' >"${mini_repo}/.trivy.yaml"

  python3 - "${mini_repo}" <<'PY'
import hashlib, json, sys
from pathlib import Path

root = Path(sys.argv[1])
def entry(path: str, strategy: str = "") -> dict[str, object]:
    data = (root / path).read_bytes()
    out: dict[str, object] = {
        "path": path,
        "sha256": hashlib.sha256(data).hexdigest(),
        "size_bytes": len(data),
    }
    if strategy:
        out["merge_strategy"] = strategy
    return out

(root / "manifest.json").write_text(
    json.dumps(
        {
            "blueprint_version": "3.2.0",
            "agent_governance_files": [entry(".agents/skills/qa-11x-architect/SKILL.md")],
            "common_files": [
                entry("scripts/demo.sh"),
                entry("scripts/probar-mcp-example.sh"),
                entry("lefthook.yml", "surgical_merge"),
                entry(".gitignore", "append_missing_lines"),
                entry(".trivy.yaml", "copy_if_missing"),
            ],
        },
        indent=2,
    ),
    encoding="utf-8",
)
PY

  # 1. --target workspace, claude, cursor y hermes NO escriben ~/.gemini/GEMINI.md (M048)
  cd "${fake_ws}"
  for tgt in workspace claude cursor hermes; do
    run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target "${tgt}"
    assert_success
    [ ! -f "${fake_home}/.gemini/GEMINI.md" ]
  done
  [ -f "${fake_home}/.claude/skills/qa-11x-architect/SKILL.md" ]
  [ -f "${fake_home}/.cursor/skills/qa-11x-architect/SKILL.md" ]
  [ -f "${fake_home}/.hermes/skills/qa-11x-architect/SKILL.md" ]

  # 2. --include-scripts excluye probar-mcp-example.sh, respeta copy_if_missing antes de hash/descarga, surgical_merge y append_missing_lines
  printf 'user-trivy-custom\n' >"${fake_ws}/.trivy.yaml"
  printf 'user-lefthook-custom\n' >"${fake_ws}/lefthook.yml"
  printf 'existing-ignore\n' >"${fake_ws}/.gitignore"
  printf 'bad-hash-not-fetched\n' >"${mini_repo}/.trivy.yaml"

  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_success
  [ -x "${fake_ws}/scripts/demo.sh" ]
  [ ! -e "${fake_ws}/scripts/probar-mcp-example.sh" ]
  run cat "${fake_ws}/.trivy.yaml"
  assert_output "user-trivy-custom"
  run cat "${fake_ws}/lefthook.yml"
  assert_output "user-lefthook-custom"
  [ -f "${fake_ws}/lefthook.yml.11x-backup" ]
  [ -f "${fake_ws}/lefthook.yml.11x-incoming" ]
  [ "$(stat -c '%a' "${fake_ws}/lefthook.yml.11x-backup")" = "600" ]
  run grep -Fx "custom-ignore-line" "${fake_ws}/.gitignore"
  assert_success

  # 3. PWA ./manifest.json ajeno en CWD se ignora (intenta fetch remoto en vez de adoptarlo)
  printf '{"short_name":"MyPWA","icons":[]}\n' >"${pwa_ws}/manifest.json"
  for tool in bash cat cp mkdir rm mv mktemp wc tr awk dirname basename pwd date chmod printf grep sed touch find env id sha256sum head tail stat; do
    resolved="$(command -v "${tool}" || true)"
    [ -n "${resolved}" ] && ln -sf "${resolved}" "${fake_bin}/${tool}"
  done
  cat >"${fake_bin}/curl" <<'EOF'
#!/usr/bin/env bash
echo "mock-remote-fetch-attempted" >&2
exit 22
EOF
  chmod +x "${fake_bin}/curl"

  cd "${pwa_ws}"
  run env PATH="${fake_bin}" HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace
  assert_failure
  assert_output --partial "mock-remote-fetch-attempted"
  assert_output --partial "ajeno a QA-11X"

  # 4. Script adulterado dispara error criptográfico SHA-256
  printf '#!/usr/bin/env bash\necho tampered\n' >"${mini_repo}/scripts/demo.sh"
  cd "${fake_ws}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_failure 1
  assert_output --partial "Violación SHA-256 en script: scripts/demo.sh"

  # 5. PTY TTY colors (L33), --target auto fuera de HOME (L200), ./manifest.json local sin env (L210-592) y *.yml (L632)
  local local_ws="${BATS_TEST_TMPDIR}/local_self_manifest_ws"
  local auto_other_home="${BATS_TEST_TMPDIR}/auto_other_home"
  local auto_other_ws="${BATS_TEST_TMPDIR}/auto_other_ws"
  mkdir -p "${local_ws}/.agents/skills/qa-11x-architect" "${local_ws}/.agents/scripts" "${local_ws}/scripts" "${auto_other_home}" "${auto_other_ws}"
  printf '# arch\n' >"${local_ws}/.agents/skills/qa-11x-architect/SKILL.md"
  printf 'name: cfg\n' >"${local_ws}/.agents/cfg.yml"
  printf '#!/usr/bin/env bash\necho ok\n' >"${local_ws}/scripts/ok.sh"
  python3 - "${local_ws}" <<'PY'
import hashlib, json, sys
from pathlib import Path
root = Path(sys.argv[1])
def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()
skill_p = root / ".agents/skills/qa-11x-architect/SKILL.md"
yml_p = root / ".agents/cfg.yml"
ok_p = root / "scripts/ok.sh"
manifest = {
    "blueprint_version": "3.2.0",
    "repository": "tecno-consultores/qa-testing-blueprints",
    "agent_governance_files": [
        {"path": ".agents/skills/qa-11x-architect/SKILL.md", "target_name": ".agents/skills/qa-11x-architect/SKILL.md", "merge_strategy": "copy_or_overwrite", "sha256": sha(skill_p), "size_bytes": skill_p.stat().st_size},
        {"path": ".agents/cfg.yml", "target_name": ".agents/cfg.yml", "merge_strategy": "copy_or_overwrite", "sha256": sha(yml_p), "size_bytes": yml_p.stat().st_size},
    ],
    "common_files": [
        {"path": "scripts/ok.sh", "target_name": "scripts/ok.sh", "merge_strategy": "copy_or_overwrite", "sha256": sha(ok_p), "size_bytes": ok_p.stat().st_size},
    ],
}
(root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
PY
  cd "${local_ws}"
  run script -qec "HOME=${fake_home} LC_ALL=C bash ${INSTALL_SCRIPT} --help" /dev/null
  assert_success

  run env HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_success
  [ -f "${local_ws}/.agents/cfg.yml" ]
  [ -x "${local_ws}/scripts/ok.sh" ]

  cd "${auto_other_ws}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${local_ws}" HOME="${auto_other_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target auto
  assert_success
  [ ! -e "${auto_other_home}/.gemini/GEMINI.md" ]

  # 5. Fallback lefthook.yml sin merge_strategy explícita respeta copy_if_missing y GEMINI.md incluye Rule Zero y evolución proactiva
  mkdir -p "${auto_other_home}/.gemini"
  printf 'custom-user-lefthook: true\n' >"${auto_other_ws}/lefthook.yml"
  cat >"${local_ws}/lefthook.yml" <<'EOF'
pre-commit:
  commands:
    demo:
      run: echo demo
EOF
  python3 - "${local_ws}" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
lh_p = root / "lefthook.yml"
data = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
data["common_files"].append({"path": "lefthook.yml", "sha256": hashlib.sha256(lh_p.read_bytes()).hexdigest(), "size_bytes": lh_p.stat().st_size})
(root / "manifest.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
PY
  run env QA_BLUEPRINTS_LOCAL_PATH="${local_ws}" HOME="${auto_other_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target antigravity --include-scripts
  assert_success
  run cat "${auto_other_ws}/lefthook.yml"
  assert_output "custom-user-lefthook: true"
  [ ! -e "${auto_other_ws}/lefthook.yml.11x-backup" ]
  run grep -F "Rule Zero Supreme" "${auto_other_home}/.gemini/GEMINI.md"
  assert_success
  run grep -F "propose_skill_evolution_pr" "${auto_other_home}/.gemini/GEMINI.md"
  assert_success
}

@test "install-skill.sh: bloquea path traversal y symlinks en manifest.json" {
  local trav_ws="${BATS_TEST_TMPDIR}/trav_ws"
  local outside_dir="${BATS_TEST_TMPDIR}/outside_dir"
  local mock_bin="${BATS_TEST_TMPDIR}/mock_bin_isk"
  local fake_home="${BATS_TEST_TMPDIR}/trav_home"
  local payloads="${BATS_TEST_TMPDIR}/payloads"
  mkdir -p "${trav_ws}" "${outside_dir}" "${mock_bin}" "${fake_home}" "${payloads}"

  printf '#!/usr/bin/env bash\nid\n' >"${payloads}/evil.sh"
  printf '# skill\n' >"${payloads}/SKILL.md"
  local evil_sha skill_sha
  evil_sha="$(sha256sum "${payloads}/evil.sh" | awk '{print $1}')"
  skill_sha="$(sha256sum "${payloads}/SKILL.md" | awk '{print $1}')"

  python3 - "${payloads}" "${skill_sha}" "${evil_sha}" <<'PY'
import json, pathlib, sys
p, ssha, esha = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
(p / "manifest_script_trav.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [{"path": ".agents/skills/demo/SKILL.md", "sha256": ssha}],
    "common_files": [{"path": "scripts/evil.sh", "target_name": "../outside_dir/pwned.sh", "merge_strategy": "overwrite", "sha256": esha}],
    "stacks": {}
}), encoding="utf-8")
(p / "manifest_skill_trav.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [{"path": ".agents/skills/../../outside_dir/pwn.md", "sha256": ssha}],
    "common_files": [],
    "stacks": {}
}), encoding="utf-8")
(p / "manifest_sym.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [{"path": ".agents/skills/demo/SKILL.md", "sha256": ssha}],
    "common_files": [{"path": "scripts/evil.sh", "target_name": "sym_out/pwned.sh", "merge_strategy": "overwrite", "sha256": esha}],
    "stacks": {}
}), encoding="utf-8")
PY

  cat >"${mock_bin}/curl" <<EOF
#!/usr/bin/env bash
out=""
url=""
prev=""
for a in "\$@"; do
  if [[ "\$prev" == "-o" ]]; then out="\$a"; fi
  if [[ "\$a" == http* ]]; then url="\$a"; fi
  prev="\$a"
done
case "\$url" in
  *manifest.json) cp "\${MOCK_MANIFEST}" "\$out" ;;
  *evil.sh) cp "${payloads}/evil.sh" "\$out" ;;
  *SKILL.md) cp "${payloads}/SKILL.md" "\$out" ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "${mock_bin}/curl"

  cd "${trav_ws}"
  run env MOCK_MANIFEST="${payloads}/manifest_script_trav.json" HOME="${fake_home}" PATH="${mock_bin}:/usr/bin:/bin" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_failure 1
  assert_output --partial "Path Traversal"
  [ ! -e "${outside_dir}/pwned.sh" ]

  run env MOCK_MANIFEST="${payloads}/manifest_skill_trav.json" HOME="${fake_home}" PATH="${mock_bin}:/usr/bin:/bin" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace
  assert_failure 1
  assert_output --partial "Path Traversal"
  [ ! -e "${outside_dir}/pwn.md" ]
}

@test "install-skill.sh: bloquea symlink escape vía realpath en common_files" {
  local sym_ws="${BATS_TEST_TMPDIR}/sym_real_ws"
  local outside_dir="${BATS_TEST_TMPDIR}/sym_real_out"
  local mock_bin="${BATS_TEST_TMPDIR}/sym_real_bin"
  local fake_home="${BATS_TEST_TMPDIR}/sym_real_home"
  local payloads="${BATS_TEST_TMPDIR}/sym_real_payloads"
  mkdir -p "${sym_ws}" "${outside_dir}" "${mock_bin}" "${fake_home}" "${payloads}"

  printf '#!/usr/bin/env bash\nid\n' >"${payloads}/evil.sh"
  printf '# skill\n' >"${payloads}/SKILL.md"
  local evil_sha skill_sha
  evil_sha="$(sha256sum "${payloads}/evil.sh" | awk '{print $1}')"
  skill_sha="$(sha256sum "${payloads}/SKILL.md" | awk '{print $1}')"
  ln -s "${outside_dir}" "${sym_ws}/sym_out"

  python3 - "${payloads}" "${skill_sha}" "${evil_sha}" <<'PY'
import json, pathlib, sys
p, ssha, esha = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
(p / "manifest_sym.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [{"path": ".agents/skills/demo/SKILL.md", "sha256": ssha}],
    "common_files": [{"path": "scripts/evil.sh", "target_name": "sym_out/pwned.sh", "merge_strategy": "overwrite", "sha256": esha}],
    "stacks": {}
}), encoding="utf-8")
PY

  cat >"${mock_bin}/curl" <<EOF
#!/usr/bin/env bash
out=""
url=""
prev=""
for a in "\$@"; do
  if [[ "\$prev" == "-o" ]]; then out="\$a"; fi
  if [[ "\$a" == http* ]]; then url="\$a"; fi
  prev="\$a"
done
case "\$url" in
  *manifest.json) cp "${payloads}/manifest_sym.json" "\$out" ;;
  *evil.sh) cp "${payloads}/evil.sh" "\$out" ;;
  *SKILL.md) cp "${payloads}/SKILL.md" "\$out" ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "${mock_bin}/curl"

  cd "${sym_ws}"
  run env HOME="${fake_home}" PATH="${mock_bin}:/usr/bin:/bin" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_failure 1
  assert_output --partial "Escape de directorio"
  [ ! -e "${outside_dir}/pwned.sh" ]
}

@test "install-skill.sh: rechaza SHA mismatch remoto y manifiesto sin skills" {
  local sha_ws="${BATS_TEST_TMPDIR}/sha_ws"
  local mock_bin="${BATS_TEST_TMPDIR}/mock_bin_sha"
  local fake_home="${BATS_TEST_TMPDIR}/sha_home"
  local payloads="${BATS_TEST_TMPDIR}/sha_payloads"
  mkdir -p "${sha_ws}" "${mock_bin}" "${fake_home}" "${payloads}"
  printf '# skill\n' >"${payloads}/SKILL.md"

  python3 - "${payloads}" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1])
(p / "manifest_bad_sha.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [{"path": ".agents/skills/demo/SKILL.md", "sha256": "0" * 64}],
    "common_files": [],
    "stacks": {}
}), encoding="utf-8")
(p / "manifest_empty.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [],
    "common_files": [],
    "stacks": {}
}), encoding="utf-8")
PY

  cat >"${mock_bin}/curl" <<EOF
#!/usr/bin/env bash
out=""
url=""
prev=""
for a in "\$@"; do
  if [[ "\$prev" == "-o" ]]; then out="\$a"; fi
  if [[ "\$a" == http* ]]; then url="\$a"; fi
  prev="\$a"
done
case "\$url" in
  *manifest.json) cp "\${MOCK_MANIFEST}" "\$out" ;;
  *SKILL.md) cp "${payloads}/SKILL.md" "\$out" ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "${mock_bin}/curl"

  cd "${sha_ws}"
  run env MOCK_MANIFEST="${payloads}/manifest_bad_sha.json" HOME="${fake_home}" PATH="${mock_bin}:/usr/bin:/bin" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace
  assert_failure 1
  assert_output --partial "VIOLACIÓN DE INTEGRIDAD"

  run env MOCK_MANIFEST="${payloads}/manifest_empty.json" HOME="${fake_home}" PATH="${mock_bin}:/usr/bin:/bin" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace
  assert_failure 1
}

@test "install-skill.sh: cubre flags --target y fallback wget en windsurf/codex" {
  local cli_ws="${BATS_TEST_TMPDIR}/cli_ws"
  local fake_home="${BATS_TEST_TMPDIR}/cli_home"
  local payloads="${BATS_TEST_TMPDIR}/cli_payloads"
  local wget_only_bin="${BATS_TEST_TMPDIR}/wget_only_bin"
  mkdir -p "${cli_ws}" "${fake_home}" "${payloads}" "${wget_only_bin}"

  printf '# skill\n' >"${payloads}/SKILL.md"
  local skill_sha
  skill_sha="$(sha256sum "${payloads}/SKILL.md" | awk '{print $1}')"

  python3 - "${payloads}" "${skill_sha}" <<'PY'
import json, pathlib, sys
p, ssha = pathlib.Path(sys.argv[1]), sys.argv[2]
(p / "manifest_ok.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [{"path": ".agents/skills/demo/SKILL.md", "sha256": ssha}],
    "common_files": [],
    "stacks": {}
}), encoding="utf-8")
PY
  cat >"${wget_only_bin}/wget" <<EOF
#!/usr/bin/env bash
out="\$2"
url="\$3"
case "\$url" in
  *manifest.json) cp "${payloads}/manifest_ok.json" "\$out" ;;
  *SKILL.md) cp "${payloads}/SKILL.md" "\$out" ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "${wget_only_bin}/wget"
  for cmd in awk basename bash cat chmod cp date dirname env grep head jq mkdir mktemp mv printf realpath rm sh sha256sum tr wc; do
    if command -v "${cmd}" >/dev/null 2>&1; then
      ln -sf "$(command -v "${cmd}")" "${wget_only_bin}/${cmd}"
    fi
  done

  cd "${cli_ws}"
  run env HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target
  assert_failure 1
  run env HOME="${fake_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target bogus_env
  assert_failure 1

  run env HOME="${fake_home}" PATH="${wget_only_bin}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target=windsurf
  assert_success
  [ -f "${fake_home}/.codeium/windsurf/skills/demo/SKILL.md" ]

  run env HOME="${fake_home}" PATH="${wget_only_bin}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target=codex
  assert_success
  [ -f "${fake_home}/.codex/skills/demo/SKILL.md" ]
}

@test "install-skill.sh: cubre fallback python3 para symlink/control-chars y ausencia de cliente HTTP" {
  local fb_ws="${BATS_TEST_TMPDIR}/isk_fb_ws"
  local outside_dir="${BATS_TEST_TMPDIR}/isk_fb_out"
  local fb_home="${BATS_TEST_TMPDIR}/isk_fb_home"
  local fb_bin="${BATS_TEST_TMPDIR}/isk_fb_bin"
  local payloads="${BATS_TEST_TMPDIR}/isk_fb_payloads"
  mkdir -p "${fb_ws}" "${outside_dir}" "${fb_home}" "${fb_bin}" "${payloads}"

  printf '#!/usr/bin/env bash\nid\n' >"${payloads}/evil.sh"
  printf '# skill\n' >"${payloads}/SKILL.md"
  local evil_sha skill_sha
  evil_sha="$(sha256sum "${payloads}/evil.sh" | awk '{print $1}')"
  skill_sha="$(sha256sum "${payloads}/SKILL.md" | awk '{print $1}')"
  ln -s "${outside_dir}" "${fb_ws}/sym_out"

  python3 - "${payloads}" "${skill_sha}" "${evil_sha}" <<'PY'
import json, pathlib, sys
p, ssha, esha = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
(p / "manifest_ctrl.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [{"path": ".agents/skills/demo/SKILL.md", "sha256": ssha}],
    "common_files": [{"path": "scripts/evil.sh", "target_name": "scripts/\u0007evil.sh", "merge_strategy": "overwrite", "sha256": esha}],
    "stacks": {}
}), encoding="utf-8")
(p / "manifest_sym.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [{"path": ".agents/skills/demo/SKILL.md", "sha256": ssha}],
    "common_files": [{"path": "scripts/evil.sh", "target_name": "sym_out/pwn.sh", "merge_strategy": "overwrite", "sha256": esha}],
    "stacks": {}
}), encoding="utf-8")
PY

  for cmd in awk basename bash cat chmod cp date dirname env grep head jq mkdir mktemp mv printf rm sh sha256sum tr wc; do
    if command -v "${cmd}" >/dev/null 2>&1; then
      ln -sf "$(command -v "${cmd}")" "${fb_bin}/${cmd}"
    fi
  done

  # 1. Sin curl/wget/python3 falla en fetch_file
  cd "${fb_ws}"
  run env HOME="${fb_home}" PATH="${fb_bin}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace
  assert_failure 1
  assert_output --partial "No se encontró ni curl, ni wget, ni python3"

  # 2. Con python3 (sin realpath), bloquea caracteres de control y symlink escape
  ln -sf "$(command -v python3)" "${fb_bin}/python3"
  cat >"${fb_bin}/curl" <<EOF
#!/usr/bin/env bash
out=""
url=""
prev=""
for a in "\$@"; do
  if [[ "\$prev" == "-o" ]]; then out="\$a"; fi
  if [[ "\$a" == http* ]]; then url="\$a"; fi
  prev="\$a"
done
case "\$url" in
  *manifest.json) cp "\${MOCK_MANIFEST}" "\$out" ;;
  *evil.sh) cp "${payloads}/evil.sh" "\$out" ;;
  *SKILL.md) cp "${payloads}/SKILL.md" "\$out" ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "${fb_bin}/curl"

  run env MOCK_MANIFEST="${payloads}/manifest_ctrl.json" HOME="${fb_home}" PATH="${fb_bin}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_failure 1
  assert_output --partial "Caracteres de control"
}

@test "install-skill.sh: bloquea symlink escape vía fallback python3 sin realpath" {
  local fb_ws="${BATS_TEST_TMPDIR}/isk_py_ws"
  local outside_dir="${BATS_TEST_TMPDIR}/isk_py_out"
  local fb_home="${BATS_TEST_TMPDIR}/isk_py_home"
  local fb_bin="${BATS_TEST_TMPDIR}/isk_py_bin"
  local payloads="${BATS_TEST_TMPDIR}/isk_py_payloads"
  mkdir -p "${fb_ws}" "${outside_dir}" "${fb_home}" "${fb_bin}" "${payloads}"

  printf '#!/usr/bin/env bash\nid\n' >"${payloads}/evil.sh"
  printf '# skill\n' >"${payloads}/SKILL.md"
  local evil_sha skill_sha
  evil_sha="$(sha256sum "${payloads}/evil.sh" | awk '{print $1}')"
  skill_sha="$(sha256sum "${payloads}/SKILL.md" | awk '{print $1}')"
  ln -s "${outside_dir}" "${fb_ws}/sym_out"

  python3 - "${payloads}" "${skill_sha}" "${evil_sha}" <<'PY'
import json, pathlib, sys
p, ssha, esha = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
(p / "manifest_sym.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [{"path": ".agents/skills/demo/SKILL.md", "sha256": ssha}],
    "common_files": [{"path": "scripts/evil.sh", "target_name": "sym_out/pwn.sh", "merge_strategy": "overwrite", "sha256": esha}],
    "stacks": {}
}), encoding="utf-8")
PY

  for cmd in awk basename bash cat chmod cp date dirname env grep head jq mkdir mktemp mv printf rm sh sha256sum tr wc python3; do
    if command -v "${cmd}" >/dev/null 2>&1; then
      ln -sf "$(command -v "${cmd}")" "${fb_bin}/${cmd}"
    fi
  done
  cat >"${fb_bin}/curl" <<EOF
#!/usr/bin/env bash
out=""
url=""
prev=""
for a in "\$@"; do
  if [[ "\$prev" == "-o" ]]; then out="\$a"; fi
  if [[ "\$a" == http* ]]; then url="\$a"; fi
  prev="\$a"
done
case "\$url" in
  *manifest.json) cp "${payloads}/manifest_sym.json" "\$out" ;;
  *evil.sh) cp "${payloads}/evil.sh" "\$out" ;;
  *SKILL.md) cp "${payloads}/SKILL.md" "\$out" ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "${fb_bin}/curl"

  cd "${fb_ws}"
  run env HOME="${fb_home}" PATH="${fb_bin}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_failure 1
  assert_output --partial "Escape de directorio"
  [ ! -e "${outside_dir}/pwn.sh" ]
}

_setup_posix_install_env() {
  local tag="$1"
  local ws="${BATS_TEST_TMPDIR}/isk_posix_${tag}_ws"
  local outside_dir="${BATS_TEST_TMPDIR}/isk_posix_${tag}_out"
  local home_dir="${BATS_TEST_TMPDIR}/isk_posix_${tag}_home"
  local bin_dir="${BATS_TEST_TMPDIR}/isk_posix_${tag}_bin"
  local payloads="${BATS_TEST_TMPDIR}/isk_posix_${tag}_payloads"
  mkdir -p "${ws}" "${outside_dir}" "${home_dir}" "${bin_dir}" "${payloads}"

  printf '#!/usr/bin/env bash\nid\n' >"${payloads}/evil.sh"
  printf '# skill\n' >"${payloads}/SKILL.md"
  local evil_sha skill_sha
  evil_sha="$(sha256sum "${payloads}/evil.sh" | awk '{print $1}')"
  skill_sha="$(sha256sum "${payloads}/SKILL.md" | awk '{print $1}')"

  python3 - "${payloads}" "${skill_sha}" "${evil_sha}" <<'PY'
import json, pathlib, sys
p, ssha, esha = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
(p / "manifest_sym.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [{"path": ".agents/skills/demo/SKILL.md", "sha256": ssha}],
    "common_files": [{"path": "scripts/evil.sh", "target_name": "scripts/evil.sh", "merge_strategy": "overwrite", "sha256": esha}],
    "stacks": {}
}), encoding="utf-8")
(p / "manifest_dot.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [{"path": ".agents/skills/demo/SKILL.md", "sha256": ssha}],
    "common_files": [{"path": "scripts/evil.sh", "target_name": ".", "merge_strategy": "overwrite", "sha256": esha}],
    "stacks": {}
}), encoding="utf-8")
(p / "manifest_ok.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [{"path": ".agents/skills/demo/SKILL.md", "sha256": ssha}],
    "common_files": [{"path": "scripts/evil.sh", "target_name": "./scripts/ok.sh", "merge_strategy": "overwrite", "sha256": esha}],
    "stacks": {}
}), encoding="utf-8")
PY

  for cmd in bash sh mkdir cp chmod dirname basename mktemp cat mv awk grep sed tr wc date sha256sum printf rm jq pwd; do
    if command -v "${cmd}" >/dev/null 2>&1; then
      ln -sf "$(command -v "${cmd}")" "${bin_dir}/${cmd}"
    fi
  done
  cat >"${bin_dir}/curl" <<EOF
#!/usr/bin/env bash
out=""
url=""
prev=""
for a in "\$@"; do
  if [[ "\$prev" == "-o" ]]; then out="\$a"; fi
  if [[ "\$a" == http* ]]; then url="\$a"; fi
  prev="\$a"
done
case "\$url" in
  *manifest.json) cp "\${MOCK_MANIFEST}" "\$out" ;;
  *evil.sh) cp "${payloads}/evil.sh" "\$out" ;;
  *SKILL.md) cp "${payloads}/SKILL.md" "\$out" ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "${bin_dir}/curl"
  printf '%s|%s|%s|%s|%s\n' "${ws}" "${outside_dir}" "${home_dir}" "${bin_dir}" "${payloads}"
}

@test "install-skill.sh (sh): bloquea symlink escape vía fallback POSIX [ -L ] sin realpath ni python3" {
  local meta ws outside_dir home_dir bin_dir payloads
  meta="$(_setup_posix_install_env sym_sh)"
  IFS='|' read -r ws outside_dir home_dir bin_dir payloads <<<"${meta}"
  ln -s "${outside_dir}" "${ws}/scripts"

  cd "${ws}"
  run env MOCK_MANIFEST="${payloads}/manifest_sym.json" HOME="${home_dir}" PATH="${bin_dir}" LC_ALL=C sh "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_failure 1
  assert_output --partial "Escape de directorio"
  [ ! -e "${outside_dir}/evil.sh" ]
}

@test "install-skill.sh (bash): bloquea symlink escape vía fallback POSIX [ -L ] sin realpath ni python3" {
  local meta ws outside_dir home_dir bin_dir payloads
  meta="$(_setup_posix_install_env sym_bash)"
  IFS='|' read -r ws outside_dir home_dir bin_dir payloads <<<"${meta}"
  ln -s "${outside_dir}" "${ws}/scripts"

  cd "${ws}"
  run env MOCK_MANIFEST="${payloads}/manifest_sym.json" HOME="${home_dir}" PATH="${bin_dir}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_failure 1
  assert_output --partial "Escape de directorio"
  [ ! -e "${outside_dir}/evil.sh" ]
}

@test "install-skill.sh (bash): bloquea target '.' vía fallback POSIX sin realpath ni python3" {
  local meta ws outside_dir home_dir bin_dir payloads
  meta="$(_setup_posix_install_env dot_bash)"
  IFS='|' read -r ws outside_dir home_dir bin_dir payloads <<<"${meta}"

  cd "${ws}"
  run env MOCK_MANIFEST="${payloads}/manifest_dot.json" HOME="${home_dir}" PATH="${bin_dir}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_failure 1
  assert_output --partial "Escape de directorio"
}

@test "install-skill.sh (bash): permite './scripts/ok.sh' vía fallback POSIX sin realpath ni python3" {
  local meta ws outside_dir home_dir bin_dir payloads
  meta="$(_setup_posix_install_env ok_bash)"
  IFS='|' read -r ws outside_dir home_dir bin_dir payloads <<<"${meta}"

  cd "${ws}"
  run env MOCK_MANIFEST="${payloads}/manifest_ok.json" HOME="${home_dir}" PATH="${bin_dir}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_success
  [ -x "${ws}/scripts/ok.sh" ]
}

@test "install-skill.sh (bash): bloquea symlinks en .qa-11x-version, AGENTS.md, GEMINI.md, global skills y .11x-backup; preserva --target claude con ws/.agents symlink" {
  local mini_repo="${BATS_TEST_TMPDIR}/sym6_repo"
  _create_mini_install_repo "${mini_repo}"

  # 1A: dangling .agents/skills/.qa-11x-version
  local ws_a="${BATS_TEST_TMPDIR}/sym6_ws_a"
  local out_a="${BATS_TEST_TMPDIR}/sym6_out_a"
  local home_a="${BATS_TEST_TMPDIR}/sym6_home_a"
  mkdir -p "${ws_a}/.agents/skills" "${out_a}"
  ln -s "${out_a}/pwned_ver" "${ws_a}/.agents/skills/.qa-11x-version"
  cd "${ws_a}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${home_a}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace
  assert_failure 1
  assert_output --partial "Symlink rechazado"
  [ ! -e "${out_a}/pwned_ver" ]

  # 1B: dangling ./.agents/.qa-11x-version en --include-scripts
  local ws_b="${BATS_TEST_TMPDIR}/sym6_ws_b"
  local out_b="${BATS_TEST_TMPDIR}/sym6_out_b"
  local home_b="${BATS_TEST_TMPDIR}/sym6_home_b"
  mkdir -p "${ws_b}/.agents" "${out_b}"
  ln -s "${out_b}/pwned_script_ver" "${ws_b}/.agents/.qa-11x-version"
  cd "${ws_b}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${home_b}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_failure 1
  assert_output --partial "VIOLACIÓN DE SEGURIDAD"
  [ ! -e "${out_b}/pwned_script_ver" ]

  # 1C: dangling ./AGENTS.md en --init-agents
  local ws_c="${BATS_TEST_TMPDIR}/sym6_ws_c"
  local out_c="${BATS_TEST_TMPDIR}/sym6_out_c"
  local home_c="${BATS_TEST_TMPDIR}/sym6_home_c"
  mkdir -p "${ws_c}" "${out_c}"
  ln -s "${out_c}/pwned_agents" "${ws_c}/AGENTS.md"
  cd "${ws_c}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${home_c}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --init-agents
  assert_failure 1
  assert_output --partial "Escape de directorio"
  [ ! -e "${out_c}/pwned_agents" ]

  # 1D: dangling $HOME/.gemini/GEMINI.md en --target antigravity
  local ws_d="${BATS_TEST_TMPDIR}/sym6_ws_d"
  local out_d="${BATS_TEST_TMPDIR}/sym6_out_d"
  local home_d="${BATS_TEST_TMPDIR}/sym6_home_d"
  mkdir -p "${ws_d}" "${home_d}/.gemini" "${out_d}"
  ln -s "${out_d}/pwned_gemini" "${home_d}/.gemini/GEMINI.md"
  cd "${ws_d}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${home_d}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target antigravity
  assert_failure 1
  assert_output --partial "Escape de directorio"
  [ ! -e "${out_d}/pwned_gemini" ]

  # 1E: symlinked $HOME/.claude/skills -> outside
  local ws_e="${BATS_TEST_TMPDIR}/sym6_ws_e"
  local out_e="${BATS_TEST_TMPDIR}/sym6_out_e/claude_skills"
  local home_e="${BATS_TEST_TMPDIR}/sym6_home_e"
  mkdir -p "${ws_e}" "${home_e}/.claude" "${out_e}"
  ln -s "${out_e}" "${home_e}/.claude/skills"
  cd "${ws_e}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${home_e}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target claude
  assert_failure 1
  assert_output --partial "Escape de directorio"
  [ -z "$(ls -A "${out_e}")" ]

  # 1F: --target claude exitoso cuando ws/.agents es un symlink externo
  local ws_f="${BATS_TEST_TMPDIR}/sym6_ws_f"
  local out_f="${BATS_TEST_TMPDIR}/sym6_out_f/ws_agents"
  local home_f="${BATS_TEST_TMPDIR}/sym6_home_f"
  mkdir -p "${ws_f}" "${home_f}/.claude" "${out_f}"
  ln -s "${out_f}" "${ws_f}/.agents"
  cd "${ws_f}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${home_f}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target claude
  assert_success
  [ -f "${home_f}/.claude/skills/qa-11x-architect/SKILL.md" ]
  [ -f "${home_f}/.claude/skills/.qa-11x-version" ]
  [ -z "$(ls -A "${out_f}")" ]

  # 1G: symlink interno en dest (dest/qa-11x-architect -> dest/other) y .11x-backup symlink
  local ws_g="${BATS_TEST_TMPDIR}/sym6_ws_g"
  local out_g="${BATS_TEST_TMPDIR}/sym6_out_g"
  local home_g="${BATS_TEST_TMPDIR}/sym6_home_g"
  mkdir -p "${ws_g}/.agents/skills/other" "${out_g}"
  ln -s "${ws_g}/.agents/skills/other" "${ws_g}/.agents/skills/qa-11x-architect"
  cd "${ws_g}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${mini_repo}" HOME="${home_g}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace
  assert_failure 1
  assert_output --partial "Symlink rechazado"
  [ ! -e "${ws_g}/.agents/skills/other/SKILL.md" ]

  # 1H: .11x-backup symlink en surgical_merge
  local ws_h="${BATS_TEST_TMPDIR}/sym6_ws_h"
  local out_h="${BATS_TEST_TMPDIR}/sym6_out_h"
  local repo_h="${BATS_TEST_TMPDIR}/sym6_repo_h"
  mkdir -p "${ws_h}" "${out_h}" "${repo_h}/.agents/skills/qa-11x-architect"
  printf '# Mini\n' >"${repo_h}/.agents/skills/qa-11x-architect/SKILL.md"
  printf 'new: true\n' >"${repo_h}/lefthook.yml"
  python3 - "${repo_h}" <<'PY'
import hashlib, json, sys
from pathlib import Path
root = Path(sys.argv[1])
def entry(p, s=""):
    d = (root / p).read_bytes()
    out = {"path": p, "sha256": hashlib.sha256(d).hexdigest(), "size_bytes": len(d)}
    if s:
        out["merge_strategy"] = s
    return out
(root / "manifest.json").write_text(json.dumps({
    "blueprint_version": "3.2.0",
    "agent_governance_files": [entry(".agents/skills/qa-11x-architect/SKILL.md")],
    "common_files": [entry("lefthook.yml", "surgical_merge")],
}), encoding="utf-8")
PY
  printf 'user-keep\n' >"${ws_h}/lefthook.yml"
  printf 'SECRET\n' >"${out_h}/victim_bak"
  ln -s "${out_h}/victim_bak" "${ws_h}/lefthook.yml.11x-backup"
  cd "${ws_h}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${repo_h}" HOME="${home_g}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_failure 1
  assert_output --partial "Symlink rechazado"
  [ "$(cat "${out_h}/victim_bak")" = "SECRET" ]
}

@test "install-skill.sh: deduplica múltiples bloques QA_11X_MCP_CONNECTOR_START en AGENTS.md y rechaza --lang inválido" {
  local dup_repo="${BATS_TEST_TMPDIR}/dup_mini_repo"
  local dup_ws="${BATS_TEST_TMPDIR}/dup_ws"
  local dup_home="${BATS_TEST_TMPDIR}/dup_home"
  mkdir -p "${dup_repo}/.agents/skills/qa-11x-architect" "${dup_ws}" "${dup_home}"
  printf '# Arch\n' >"${dup_repo}/.agents/skills/qa-11x-architect/SKILL.md"
  python3 - "${dup_repo}" <<'PY'
import hashlib, json, sys
from pathlib import Path
root = Path(sys.argv[1])
d = (root / ".agents/skills/qa-11x-architect/SKILL.md").read_bytes()
(root / "manifest.json").write_text(json.dumps({
    "blueprint_version": "3.2.1",
    "agent_governance_files": [{
        "path": ".agents/skills/qa-11x-architect/SKILL.md",
        "sha256": hashlib.sha256(d).hexdigest(),
        "size_bytes": len(d),
    }],
}), encoding="utf-8")
PY

  cat >"${dup_ws}/AGENTS.md" <<'EOF'
# Custom Header

<!-- QA_11X_MCP_CONNECTOR_START -->
first
<!-- QA_11X_MCP_CONNECTOR_END -->

<!-- QA_11X_MCP_CONNECTOR_START -->
second duplicate
<!-- QA_11X_MCP_CONNECTOR_END -->

# Footer Rule
EOF

  cd "${dup_ws}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${dup_repo}" HOME="${dup_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --init-agents --lang en
  assert_success
  [ "$(grep -c 'QA_11X_MCP_CONNECTOR_START' "${dup_ws}/AGENTS.md")" -eq 1 ]
  run grep -F "Footer Rule" "${dup_ws}/AGENTS.md"
  assert_success
  run grep -F "strictly in **English**" "${dup_ws}/AGENTS.md"
  assert_success

  run env QA_BLUEPRINTS_LOCAL_PATH="${dup_repo}" HOME="${dup_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --lang fr
  assert_failure 1
  assert_output --partial "Modo de idioma inválido"

  run env QA_BLUEPRINTS_LOCAL_PATH="${dup_repo}" HOME="${dup_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --lang
  assert_failure 1
  assert_output --partial "requiere un argumento"
}

@test "install-skill.sh: paridad D8 (--lang=, conectores EN/ES $HOME, poda archivos retirados y protección scripts/*)" {
  local p_repo="${BATS_TEST_TMPDIR}/d8_repo"
  local p_ws="${BATS_TEST_TMPDIR}/d8_ws"
  local p_home="${BATS_TEST_TMPDIR}/d8_home"
  mkdir -p "${p_repo}/.agents/skills/qa-11x-architect" "${p_repo}/scripts" "${p_ws}" "${p_home}/.gemini/antigravity/skills/qa-11x-architect" "${p_home}/.claude"
  printf '# Architect\n' >"${p_repo}/.agents/skills/qa-11x-architect/SKILL.md"
  printf '#!/usr/bin/env bash\necho "upstream clean"\n' >"${p_repo}/scripts/limpieza.sh"
  python3 - "${p_repo}" <<'PY'
import hashlib, json, sys
from pathlib import Path
root = Path(sys.argv[1])
def ent(p):
    d = (root / p).read_bytes()
    return {"path": p, "sha256": hashlib.sha256(d).hexdigest(), "size_bytes": len(d)}
(root / "manifest.json").write_text(json.dumps({
    "blueprint_version": "3.2.1",
    "agent_governance_files": [ent(".agents/skills/qa-11x-architect/SKILL.md")],
    "common_files": [ent("scripts/limpieza.sh")],
}), encoding="utf-8")
PY

  printf '# obsolete retired file\n' >"${p_home}/.gemini/antigravity/skills/qa-11x-architect/retired-obsolete.md"
  printf '<!-- QA_11X_MCP_CONNECTOR_START -->\nstrictly in **English**\n<!-- QA_11X_MCP_CONNECTOR_END -->\n' >"${p_home}/.gemini/GEMINI.md"
  printf '<!-- QA_11X_MCP_CONNECTOR_START -->\nstrictly in **Spanish**\n<!-- QA_11X_MCP_CONNECTOR_END -->\n' >"${p_home}/.claude/CLAUDE.md"

  cd "${p_ws}"
  run env QA_BLUEPRINTS_LOCAL_PATH="${p_repo}" HOME="${p_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target auto
  assert_success
  [ ! -e "${p_home}/.gemini/antigravity/skills/qa-11x-architect/retired-obsolete.md" ]
  run grep -F "strictly in **English**" "${p_home}/.gemini/GEMINI.md"
  assert_success
  run grep -F "serialized 1 container at a time" "${p_home}/.gemini/GEMINI.md"
  assert_success
  run grep -F "Conector Global Thin-Client QA 11X" "${p_home}/.claude/CLAUDE.md"
  assert_success
  run grep -F "en serie 1 contenedor a la vez" "${p_home}/.claude/CLAUDE.md"
  assert_success

  run env QA_BLUEPRINTS_LOCAL_PATH="${p_repo}" HOME="${p_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --init-agents --lang=es
  assert_success
  run grep -F "strictly in **Spanish**" "${p_ws}/AGENTS.md"
  assert_success
  run grep -F "serialized 1 container at a time" "${p_ws}/AGENTS.md"
  assert_success

  run env QA_BLUEPRINTS_LOCAL_PATH="${p_repo}" HOME="${p_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts --lang=auto
  assert_success
  printf '#!/usr/bin/env bash\necho "custom user edit"\n' >"${p_ws}/scripts/limpieza.sh"
  run env QA_BLUEPRINTS_LOCAL_PATH="${p_repo}" HOME="${p_home}" LC_ALL=C bash "${INSTALL_SCRIPT}" --target workspace --include-scripts
  assert_success
  run grep -F "custom user edit" "${p_ws}/scripts/limpieza.sh"
  assert_success
  [ -f "${p_ws}/scripts/limpieza.sh.11x-incoming" ]
}
