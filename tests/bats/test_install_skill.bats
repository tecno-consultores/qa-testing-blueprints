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
}
