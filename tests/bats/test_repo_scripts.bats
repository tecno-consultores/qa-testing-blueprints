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
  run python3 "${REPO_ROOT}/.agents/scripts/bump_version_11x.py" --workspace "${REPO_ROOT}" --check
  assert_success
  assert_output --partial "OK [bump_version_11x]"

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

@test "certify_task_completion.sh (F1.4): reporta SKIPPED si falta verificar-secretos.sh y bloquea con --strict y QA11X_STRICT=1" {
  WORK="${BATS_TEST_TMPDIR}/certify_ws"
  mkdir -p "${WORK}/.agents/scripts" "${WORK}/scripts"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${WORK}/.agents/scripts/certify_task_completion.sh"
  chmod +x "${WORK}/.agents/scripts/certify_task_completion.sh"

  cat >"${WORK}/scripts/auditar-infra.sh" <<'EOF'
#!/usr/bin/env bash
echo "✔ [Trivy] stub OK"
EOF
  chmod +x "${WORK}/scripts/auditar-infra.sh"

  printf 'print("✔ [Manifest] stub OK")\n' >"${WORK}/scripts/generar-manifiesto.py"

  for stub_py in \
    verify_json_no_duplicate_keys.py \
    verify_zero_orphan_vue_components.py \
    verify_no_orphan_api_endpoints.py \
    verify_topological_health.py \
    verify_alembic_orm_parity.py \
    verify_roadmap_consistency.py; do
    printf 'print("✔ [%s] stub OK")\n' "${stub_py}" >"${WORK}/.agents/scripts/${stub_py}"
  done

  run env LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
  assert_success
  assert_output --partial "[1/10] ⚠️ SKIPPED:"
  assert_output --partial "[WARN] CERTIFY-STATE | 9/10 PASS, 1 SKIPPED, 0 FAIL"
  refute_output --partial "10/10 PASS"
  refute_output --partial "10/10 gates OK"

  run env LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh" --strict
  assert_failure 1
  assert_output --partial "[WARN] CERTIFY-STATE | 9/10 PASS, 1 SKIPPED, 0 FAIL"
  assert_output --partial "[STRICT] Certificación bloqueada: 1 gate(s) en estado SKIPPED"

  run env QA11X_STRICT=1 LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "[STRICT] Certificación bloqueada: 1 gate(s) en estado SKIPPED"

  cat >"${WORK}/scripts/verificar-secretos.sh" <<'EOF'
#!/usr/bin/env bash
echo "✔ [Secretos] stub OK"
EOF
  chmod +x "${WORK}/scripts/verificar-secretos.sh"

  run env LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh" --strict
  assert_success
  assert_output --partial "[PASS] CERTIFY-STATE | 10/10 PASS, 0 SKIPPED, 0 FAIL"
}

@test "certify_task_completion.sh (F1.4 gates 2/4/8/10): detecta SKIPPED en auditar-infra/manifiesto/validador/diff-cov y bloquea en --strict" {
  WORK="${BATS_TEST_TMPDIR}/certify_multi_skip"
  mkdir -p "${WORK}/.agents/scripts" "${WORK}/scripts" "${WORK}/tests/bats"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${WORK}/.agents/scripts/certify_task_completion.sh"
  chmod +x "${WORK}/.agents/scripts/certify_task_completion.sh"

  cat >"${WORK}/scripts/verificar-secretos.sh" <<'EOF'
#!/usr/bin/env bash
echo "✔ [Secretos] stub OK"
EOF
  chmod +x "${WORK}/scripts/verificar-secretos.sh"

  for stub_py in \
    verify_json_no_duplicate_keys.py \
    verify_no_orphan_api_endpoints.py \
    verify_topological_health.py \
    verify_alembic_orm_parity.py \
    verify_roadmap_consistency.py; do
    printf 'print("✔ [%s] stub OK")\n' "${stub_py}" >"${WORK}/.agents/scripts/${stub_py}"
  done
  printf 'print("⚠️ SKIPPED [UI Orphans] sin directorio frontend")\n' >"${WORK}/.agents/scripts/verify_zero_orphan_vue_components.py"

  printf '#!/usr/bin/env bash\necho base\n' >"${WORK}/scripts/app.sh"
  printf '@test "t" { true; }\n' >"${WORK}/tests/bats/app.bats"
  printf '# Demo\n' >"${WORK}/README.md"
  git -C "${WORK}" init -q
  git -C "${WORK}" config user.email "qa@example.com"
  git -C "${WORK}" config user.name "QA Bot"
  git -C "${WORK}" add .
  git -C "${WORK}" commit -q -m "chore: init"
  printf '#!/usr/bin/env bash\necho changed\n' >"${WORK}/scripts/app.sh"
  printf '@test "t" { true; }\n# updated\n' >"${WORK}/tests/bats/app.bats"
  printf '# Demo updated\n' >"${WORK}/README.md"

  run env LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
  assert_success
  assert_output --partial "[2/10] ⚠️ SKIPPED:"
  assert_output --partial "[4/10] ⚠️ SKIPPED:"
  assert_output --partial "[8/10] ⚠️ SKIPPED:"
  assert_output --partial "[10/10] ⚠️ SKIPPED:"
  assert_output --partial "[WARN] CERTIFY-STATE | 6/10 PASS, 4 SKIPPED, 0 FAIL"

  run env LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh" --strict
  assert_failure 1
  assert_output --partial "[STRICT] Certificación bloqueada: 4 gate(s) en estado SKIPPED"
}

@test "certify_task_completion.sh (F2.8 Rule Zero): usa docker --network none y nunca invoca python3 del host" {
  WORK="${BATS_TEST_TMPDIR}/certify_rule_zero"
  FAKE_BIN="${BATS_TEST_TMPDIR}/fake_bin"
  DOCKER_LOG="${BATS_TEST_TMPDIR}/docker_calls.log"
  FAKE_PY_MARKER="${BATS_TEST_TMPDIR}/host_python_called.flag"
  mkdir -p "${WORK}/.agents/scripts" "${WORK}/scripts" "${WORK}/mcp-server" "${FAKE_BIN}"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${WORK}/.agents/scripts/certify_task_completion.sh"
  chmod +x "${WORK}/.agents/scripts/certify_task_completion.sh"

  cat >"${FAKE_BIN}/python3" <<EOF
#!/usr/bin/env bash
touch "${FAKE_PY_MARKER}"
echo "HOST_PYTHON_CALLED"
exit 99
EOF
  chmod +x "${FAKE_BIN}/python3"

  cat >"${FAKE_BIN}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${DOCKER_LOG}"
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"

  cat >"${WORK}/scripts/verificar-secretos.sh" <<'EOF'
#!/usr/bin/env bash
echo "✔ [Secretos] stub OK"
EOF
  cat >"${WORK}/scripts/auditar-infra.sh" <<'EOF'
#!/usr/bin/env bash
echo "✔ [Trivy] stub OK"
EOF
  chmod +x "${WORK}/scripts/verificar-secretos.sh" "${WORK}/scripts/auditar-infra.sh"

  printf 'print("ok")\n' >"${WORK}/scripts/generar-manifiesto.py"
  printf '{}\n' >"${WORK}/manifest.json"
  printf '{"version":"3.0.0"}\n' >"${WORK}/mcp-server/package.json"
  for stub_py in \
    checkpoint_ctl.py \
    track_findings_state.py \
    verify_json_no_duplicate_keys.py \
    verify_zero_orphan_vue_components.py \
    verify_no_orphan_api_endpoints.py \
    verify_topological_health.py \
    verify_alembic_orm_parity.py \
    sync_governance.py \
    bump_version_11x.py \
    verify_roadmap_consistency.py \
    verify_docs_invariants.py; do
    printf 'print("ok")\n' >"${WORK}/.agents/scripts/${stub_py}"
  done

  run env QA11X_DOCKERENV_PATH="/nonexistent" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
  assert_success
  refute_output --partial "HOST_PYTHON_CALLED"
  [ ! -e "${FAKE_PY_MARKER}" ]
  run grep -F "run --rm --network none" "${DOCKER_LOG}"
  assert_success
  run grep -F "/app/.agents/scripts/verify_roadmap_consistency.py" "${DOCKER_LOG}"
  assert_success
  run grep -F "/app/.agents/scripts/checkpoint_ctl.py" "${DOCKER_LOG}"
  assert_success

  : >"${DOCKER_LOG}"
  cat >"${WORK}/scripts/verificar-secretos.sh" <<'EOF'
#!/usr/bin/env bash
echo "secreto simulado" >&2
exit 1
EOF
  chmod +x "${WORK}/scripts/verificar-secretos.sh"
  run env QA11X_DOCKERENV_PATH="/nonexistent" QA_DIAGNOSTIC_JSON="${BATS_TEST_TMPDIR}/diag/fail.json" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  refute_output --partial "HOST_PYTHON_CALLED"
  [ ! -e "${FAKE_PY_MARKER}" ]
  run grep -F "QA_DIAG_PATH=/qa-diag/fail.json" "${DOCKER_LOG}"
  assert_success
  run grep -F "/app/.agents/scripts/track_findings_state.py" "${DOCKER_LOG}"
  assert_success
}

@test "certify_task_completion.sh (F3.2): exige tests/docs para SKILL.md, rules, schemas, manifest.json y llms.txt pero mantiene DOCS_ONLY para docs/*.md" {
  WORK="${BATS_TEST_TMPDIR}/certify_f32_gate10"
  mkdir -p "${WORK}/.agents/scripts" "${WORK}/.agents/schemas" "${WORK}/.agents/skills/demo" "${WORK}/.agents/rules" "${WORK}/scripts" "${WORK}/docs" "${WORK}/tests"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${WORK}/.agents/scripts/certify_task_completion.sh"
  chmod +x "${WORK}/.agents/scripts/certify_task_completion.sh"

  for sh_stub in verificar-secretos.sh auditar-infra.sh; do
    printf '#!/usr/bin/env bash\necho "✔ [%s] stub OK"\n' "${sh_stub}" >"${WORK}/scripts/${sh_stub}"
    chmod +x "${WORK}/scripts/${sh_stub}"
  done
  printf 'print("ok")\n' >"${WORK}/scripts/generar-manifiesto.py"
  for stub_py in \
    verify_json_no_duplicate_keys.py \
    verify_zero_orphan_vue_components.py \
    verify_no_orphan_api_endpoints.py \
    verify_topological_health.py \
    verify_alembic_orm_parity.py \
    verify_roadmap_consistency.py; do
    printf 'print("✔ [%s] stub OK")\n' "${stub_py}" >"${WORK}/.agents/scripts/${stub_py}"
  done

  printf '# Repo\n' >"${WORK}/README.md"
  printf '# Changelog\n' >"${WORK}/CHANGELOG.md"
  printf '# Guide\n' >"${WORK}/docs/guide.md"
  printf '{"schema_version":"1.0"}\n' >"${WORK}/manifest.json"
  printf 'llms v1\n' >"${WORK}/llms.txt"
  printf '{"type":"object"}\n' >"${WORK}/.agents/schemas/s.schema.json"
  printf '# Demo Skill\n' >"${WORK}/.agents/skills/demo/SKILL.md"
  printf '# Rule 1\n' >"${WORK}/.agents/rules/r1.md"
  printf 'def test_ok(): assert True\n' >"${WORK}/tests/test_demo.py"

  git -C "${WORK}" init -q
  git -C "${WORK}" config user.email "qa@example.com"
  git -C "${WORK}" config user.name "QA Bot"
  git -C "${WORK}" add .
  git -C "${WORK}" commit -q -m "chore: init"

  # 1. docs/*.md + README.md -> fast-path DOCS_ONLY
  printf '# Guide updated\n' >"${WORK}/docs/guide.md"
  printf '# Repo updated\n' >"${WORK}/README.md"
  run env LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh" --strict
  assert_success
  assert_output --partial "[Doc Fast-Path]"
  git -C "${WORK}" checkout -- docs/guide.md README.md

  # 2. SKILL.md sin prueba ni doc humano -> bloquea Gate 10
  printf '# Demo Skill updated\n' >"${WORK}/.agents/skills/demo/SKILL.md"
  run env LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "[Doc & Test Sync] Incumplimiento"
  assert_output --partial "QA-TEST-SYNC-01"
  assert_output --partial "CHANGELOG.md"

  # 3. SKILL.md + CHANGELOG.md sin prueba -> sigue bloqueando por falta de prueba
  printf '# Changelog updated\n' >"${WORK}/CHANGELOG.md"
  run env LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "QA-TEST-SYNC-01"

  # 4. SKILL.md + CHANGELOG.md + test -> certifica 10/10 PASS sin SKIPPED falso de diff-cov
  printf 'def test_ok(): assert 1 == 1\n' >"${WORK}/tests/test_demo.py"
  run env LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh" --strict
  assert_success
  assert_output --partial "[Doc & Test Sync]"
  assert_output --partial "10/10 PASS"
  git -C "${WORK}" checkout -- .agents/skills/demo/SKILL.md CHANGELOG.md tests/test_demo.py

  # 5. manifest.json + llms.txt + .agents/schemas + .agents/rules exigen tests + docs
  printf '{"schema_version":"1.1"}\n' >"${WORK}/manifest.json"
  printf 'llms v2\n' >"${WORK}/llms.txt"
  printf '{"type":"object","title":"S"}\n' >"${WORK}/.agents/schemas/s.schema.json"
  printf '# Rule 1 updated\n' >"${WORK}/.agents/rules/r1.md"
  printf '# Changelog v2\n' >"${WORK}/CHANGELOG.md"
  run env LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "QA-TEST-SYNC-01"

  printf 'def test_ok(): assert 2 == 2\n' >"${WORK}/tests/test_demo.py"
  run env LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh" --strict
  assert_success
  assert_output --partial "[Doc & Test Sync]"
  assert_output --partial "10/10 PASS"
}

@test "verificar-secretos.sh (F8.17): escanea archivos .example, aprueba placeholders explicitos y bloquea secreto real" {
  WORK="${BATS_TEST_TMPDIR}/sec_example_ws"
  mkdir -p "${WORK}"

  cat >"${WORK}/safe.env.example" <<'EOF'
DB_PASS=CHANGE_ME_BEFORE_DEPLOY_999
API_KEY=EXAMPLE_ONLY_KEY_VALUE
OPENAI_API_KEY=sk-proj-placeholder-value-here
DEMO_KEY=example_placeholder_12345
TOKEN=<your_api_token_here>
CLAVE=tu_clave_aqui_1234567890
ZERO_KEY=00000000000000000000
LOCAL_TOKEN=http://127.0.0.1:8080/api_key=real_looks_12345678
EXT_TOKEN=https://api.example.com/token=local_sample_12345
EOF

  cd "${WORK}"
  run env LC_ALL=C bash "${REPO_ROOT}/scripts/verificar-secretos.sh" safe.env.example
  assert_success

  SYNTH_AKIA="AKIA""9A8B7C6D5E4F3G2H"
  PEM_HDR="-----BEGIN RSA ""PRIVATE KEY-----"
  cat >"${WORK}/sample.env.example" <<EOF
AWS_ACCESS_KEY_ID=${SYNTH_AKIA}
${PEM_HDR}
EOF

  run env LC_ALL=C bash "${REPO_ROOT}/scripts/verificar-secretos.sh" sample.env.example
  assert_failure
  assert_output --partial "sample.env.example"
}

@test "generar-sbom-cyclonedx.sh (F8.18): genera SBOM por defecto y ruta custom con docker stub, rechaza path traversal y propaga fallos" {
  WORK="${BATS_TEST_TMPDIR}/sbom_ws"
  FAKE_BIN="${BATS_TEST_TMPDIR}/sbom_bin"
  DOCKER_LOG="${BATS_TEST_TMPDIR}/sbom_docker.log"
  mkdir -p "${WORK}/scripts" "${FAKE_BIN}"
  cp "${REPO_ROOT}/scripts/generar-sbom-cyclonedx.sh" "${WORK}/scripts/generar-sbom-cyclonedx.sh"
  chmod +x "${WORK}/scripts/generar-sbom-cyclonedx.sh"

  cat >"${FAKE_BIN}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${DOCKER_LOG}"
if [ "\${MOCK_DOCKER_FAIL:-0}" = "1" ]; then
  echo "trivy simulated failure" >&2
  exit 1
fi
for arg in "\$@"; do
  case "\${arg}" in
    /workspace/*)
      rel="\${arg#/workspace/}"
      mkdir -p "\$(dirname "${WORK}/\${rel}")"
      printf '{"bomFormat":"CycloneDX","specVersion":"1.5"}\n' >"${WORK}/\${rel}"
      ;;
  esac
done
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"

  run env PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${WORK}/scripts/generar-sbom-cyclonedx.sh" --help
  assert_success
  assert_output --partial "Uso:"

  run env PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${WORK}/scripts/generar-sbom-cyclonedx.sh" "../escape.json"
  assert_failure 1

  run env PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${WORK}/scripts/generar-sbom-cyclonedx.sh"
  assert_success
  assert_output --partial "sbom.cyclonedx.json"
  [ -f "${WORK}/sbom.cyclonedx.json" ]
  run grep -F -- "--format cyclonedx --output /workspace/sbom.cyclonedx.json /workspace" "${DOCKER_LOG}"
  assert_success

  : >"${DOCKER_LOG}"
  run env PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${WORK}/scripts/generar-sbom-cyclonedx.sh" "artifacts/custom.cyclonedx.json"
  assert_success
  assert_output --partial "artifacts/custom.cyclonedx.json"
  [ -f "${WORK}/artifacts/custom.cyclonedx.json" ]
  run grep -F -- "--output /workspace/artifacts/custom.cyclonedx.json" "${DOCKER_LOG}"
  assert_success

  run env MOCK_DOCKER_FAIL=1 PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${WORK}/scripts/generar-sbom-cyclonedx.sh" "artifacts/fail.json"
  assert_failure 1
  refute_output --partial "Generado exitosamente"
}

@test "probar-mcp-example.sh (F8.18): expone --help con --offline y rechaza opciones invalidas" {
  run env LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --help
  assert_success
  assert_output --partial "--in-place"
  assert_output --partial "--offline"

  run env LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --unknown-flag
  assert_failure 1
  assert_output --partial "Opción no reconocida"
}

@test "instalar-hooks.sh (F8.14): respeta core.hooksPath via git rev-parse --git-path hooks, respalda .bak* y maneja espacios con while IFS= read -r" {
  WORK="${BATS_TEST_TMPDIR}/hooks_ws"
  FAKE_BIN="${BATS_TEST_TMPDIR}/hooks_bin"
  mkdir -p "${WORK}/custom-hooks" "${WORK}/scripts" "${FAKE_BIN}"
  for tool in bash git cat chmod mkdir mv cp rm date dirname basename pwd id env printf grep head sort tr sed touch; do
    resolved="$(command -v "${tool}" || true)"
    [ -n "${resolved}" ] && ln -sf "${resolved}" "${FAKE_BIN}/${tool}"
  done

  git -C "${WORK}" init -q
  git -C "${WORK}" config user.email "qa@example.com"
  git -C "${WORK}" config user.name "QA Bot"
  git -C "${WORK}" config core.hooksPath "custom-hooks"

  printf '#!/usr/bin/env bash\necho "legacy pre-commit"\n' >"${WORK}/custom-hooks/pre-commit"
  chmod +x "${WORK}/custom-hooks/pre-commit"

  run env QA11X_REPO_ROOT="${WORK}" PATH="${FAKE_BIN}" LC_ALL=C bash "${REPO_ROOT}/instalar-hooks.sh"
  assert_success

  # Verificar respaldo .bak* del hook preexistente
  backup_files=("${WORK}/custom-hooks/pre-commit.bak"*)
  [ -e "${backup_files[0]}" ]
  run grep -F "legacy pre-commit" "${backup_files[0]}"
  assert_success

  # Verificar hooks instalados en core.hooksPath y NO en .git/hooks
  [ -x "${WORK}/custom-hooks/pre-commit" ]
  [ -x "${WORK}/custom-hooks/commit-msg" ]
  [ -x "${WORK}/custom-hooks/pre-push" ]
  [ ! -f "${WORK}/.git/hooks/pre-commit" ]

  # Verificar manejo seguro de nombres con espacios vía while IFS= read -r
  run grep -F "while IFS= read -r" "${WORK}/custom-hooks/pre-commit"
  assert_success

  ARGS_LOG="${BATS_TEST_TMPDIR}/staged_args.log"
  cat >"${WORK}/scripts/verificar-secretos.sh" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do
  printf '[%s]\n' "\${a}" >>"${ARGS_LOG}"
done
EOF
  chmod +x "${WORK}/scripts/verificar-secretos.sh"

  printf 'clean content\n' >"${WORK}/file with spaces.txt"
  git -C "${WORK}" add "file with spaces.txt"
  cd "${WORK}"
  run env PATH="${FAKE_BIN}" LC_ALL=C bash custom-hooks/pre-commit
  assert_success
  run grep -Fx "[file with spaces.txt]" "${ARGS_LOG}"
  assert_success
}

@test "probar-mcp-example.sh (F8.18): ejecuta --in-place --offline, clean-room y verify_tarball_cli (valido y rechazos)" {
  WORK="${BATS_TEST_TMPDIR}/ex_repo"
  FAKE_BIN="${BATS_TEST_TMPDIR}/ex_bin"
  FAKE_HOME="${BATS_TEST_TMPDIR}/ex_home"
  mkdir -p "${WORK}/mcp-server/example" "${WORK}/mcp-server/src" "${WORK}/mcp-server/dist" "${WORK}/mcp-server/node_modules/.bin" "${FAKE_BIN}" "${FAKE_HOME}"

  printf '{\n  "name": "@sinfallas/mcp-qa-11x",\n  "version": "3.1.0"\n}\n' >"${WORK}/mcp-server/package.json"
  printf 'services:\n  mcp-server:\n    image: stub\n' >"${WORK}/mcp-server/docker-compose.qa.yml"
  printf 'export const v = "3.1.0";\n' >"${WORK}/mcp-server/src/index.ts"
  printf 'console.log("dist");\n' >"${WORK}/mcp-server/dist/index.js"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${WORK}/mcp-server/example/verify-v2.sh"
  chmod +x "${WORK}/mcp-server/example/verify-v2.sh"

  cat >"${FAKE_BIN}/pnpm" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  cat >"${FAKE_BIN}/npm" <<'EOF'
#!/usr/bin/env bash
dest=""
for arg in "$@"; do
  case "${arg}" in
    --pack-destination=*) dest="${arg#*=}" ;;
  esac
done
while [ $# -gt 0 ]; do
  if [ "$1" = "--pack-destination" ] && [ -n "${2:-}" ]; then
    dest="$2"
    shift 2
  else
    shift
  fi
done
stage="$(mktemp -d)"
mkdir -p "${stage}/package/dist"
printf '{"name":"@sinfallas/mcp-qa-11x","version":"3.1.0"}\n' >"${stage}/package/package.json"
[ "${TEST_TARBALL_MODE:-ok}" != "missing_entry" ] && printf 'MIT\n' >"${stage}/package/LICENSE"
printf '# EN\n' >"${stage}/package/README.md"
printf '# ES\n' >"${stage}/package/README.es.md"
printf '# CL\n' >"${stage}/package/CHANGELOG.md"
printf '# CLE\n' >"${stage}/package/CHANGELOG.es.md"
printf 'console.log("ok");\n' >"${stage}/package/dist/index.js"
if [ "${TEST_TARBALL_MODE:-ok}" = "leak_src" ]; then
  mkdir -p "${stage}/package/src"
  printf '// leak\n' >"${stage}/package/src/leak.ts"
fi
tar -czf "${dest}/sinfallas-mcp-qa-11x-3.1.0.tgz" -C "${stage}" package
rm -rf "${stage}"
printf 'sinfallas-mcp-qa-11x-3.1.0.tgz\n'
EOF
  cat >"${FAKE_BIN}/node" <<'EOF'
#!/usr/bin/env bash
[ "${TEST_TARBALL_MODE:-ok}" = "node_fail" ] && exit 1
proj=""
while [ $# -gt 0 ]; do
  if [ "$1" = "--project-path" ] && [ -n "${2:-}" ]; then
    proj="$2"
    shift 2
  else
    shift
  fi
done
if [ -n "${proj}" ]; then
  mkdir -p "${proj}"
  printf '<!-- QA_11X_MCP_CONNECTOR_START -->\n' >"${proj}/AGENTS.md"
fi
exit 0
EOF
  cat >"${FAKE_BIN}/docker" <<EOF
#!/usr/bin/env bash
if printf '%s\n' "\$*" | grep -q "mcp-server bash -c"; then
  cmd="\${@: -1}"
  (cd "${WORK}/mcp-server" && exec bash -c "\${cmd}")
  exit \$?
fi
exit 0
EOF
  chmod +x "${FAKE_BIN}/pnpm" "${FAKE_BIN}/npm" "${FAKE_BIN}/node" "${FAKE_BIN}/docker"

  run env QA11X_REPO_ROOT="${WORK}" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --in-place --offline
  assert_success

  run env QA11X_REPO_ROOT="${WORK}" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --offline
  assert_success
  assert_output --partial "[Clean-Room E2E]"

  cd "${WORK}/mcp-server"
  run env QA11X_REPO_ROOT="${WORK}" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --verify-tarball
  assert_success
  assert_output --partial "Empaquetado real"

  run env QA11X_REPO_ROOT="${WORK}" TEST_TARBALL_MODE="missing_entry" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --verify-tarball
  assert_failure
  assert_output --partial "Falta package/LICENSE"

  run env QA11X_REPO_ROOT="${WORK}" TEST_TARBALL_MODE="leak_src" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --verify-tarball
  assert_failure
  assert_output --partial "Fuentes src/ filtradas"

  run env QA11X_REPO_ROOT="${WORK}" TEST_TARBALL_MODE="node_fail" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --verify-tarball
  assert_failure
}

@test "publicar-mcp.sh (F8.20): valida ensure_fresh_dist_before_pack recompilando si falta dist y bloqueando si persiste obsoleto" {
  WORK="${BATS_TEST_TMPDIR}/pub_repo"
  FAKE_BIN="${BATS_TEST_TMPDIR}/pub_bin"
  BUILD_COUNT_FILE="${BATS_TEST_TMPDIR}/pub_build_count"
  PUB_FLAG="${BATS_TEST_TMPDIR}/pub_done.flag"
  mkdir -p "${WORK}/mcp-server/src" "${WORK}/scripts" "${WORK}/mcp-server/node_modules/.bin" "${FAKE_BIN}"

  printf '{\n  "name": "@sinfallas/mcp-qa-11x",\n  "version": "3.1.0"\n}\n' >"${WORK}/mcp-server/package.json"
  printf 'export const v = "3.1.0";\n' >"${WORK}/mcp-server/src/index.ts"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${WORK}/scripts/limpieza.sh"
  chmod +x "${WORK}/scripts/limpieza.sh"
  printf '0\n' >"${BUILD_COUNT_FILE}"

  cat >"${FAKE_BIN}/docker" <<EOF
#!/usr/bin/env bash
if printf '%s\n' "\$*" | grep -q "npm view"; then
  if [ -f "${PUB_FLAG}" ]; then
    printf '3.1.0\n'
    exit 0
  fi
  exit 1
fi
if printf '%s\n' "\$*" | grep -q "npm publish"; then
  touch "${PUB_FLAG}"
  printf '+ @sinfallas/mcp-qa-11x@3.1.0\n'
  exit 0
fi
if printf '%s\n' "\$*" | grep -q "npm pack --dry-run"; then
  printf 'package size: 10 kB\ntotal files: 5\n'
  exit 0
fi
if printf '%s\n' "\$*" | grep -q "run build"; then
  cnt=\$(cat "${BUILD_COUNT_FILE}")
  cnt=\$((cnt + 1))
  printf '%s\n' "\${cnt}" >"${BUILD_COUNT_FILE}"
  if [ "\${MOCK_STILL_STALE:-0}" != "1" ] && [ "\${cnt}" -ge 2 ]; then
    mkdir -p "${WORK}/mcp-server/dist"
    printf 'console.log("fresh");\n' >"${WORK}/mcp-server/dist/index.js"
  fi
fi
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"

  run env QA11X_REPO_ROOT="${WORK}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --dry-run
  assert_success
  assert_output --partial "[Pre-Pack] dist/index.js ausente o desactualizado"
  assert_output --partial "SIMULACIÓN EXITOSA"

  # Segunda corrida con dist ya fresco -> valida rama live sin publish real (docker stub)
  sleep 1
  touch "${WORK}/mcp-server/dist/index.js"
  run env QA11X_REPO_ROOT="${WORK}" NPM_TOKEN="npm_realMock1234567890" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --skip-tests
  assert_success
  assert_output --partial "PUBLICACIÓN EXITOSA"
}

@test "publicar-mcp.sh (F8.20): bloquea fail-closed si dist/index.js persiste ausente u obsoleto" {
  WORK="${BATS_TEST_TMPDIR}/pub_fail_repo"
  FAKE_BIN="${BATS_TEST_TMPDIR}/pub_fail_bin"
  mkdir -p "${WORK}/mcp-server/src" "${WORK}/scripts" "${FAKE_BIN}"

  printf '{\n  "name": "@sinfallas/mcp-qa-11x",\n  "version": "3.1.0"\n}\n' >"${WORK}/mcp-server/package.json"
  printf 'export const v = "3.1.0";\n' >"${WORK}/mcp-server/src/index.ts"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${WORK}/scripts/limpieza.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${FAKE_BIN}/docker"
  chmod +x "${WORK}/scripts/limpieza.sh" "${FAKE_BIN}/docker"

  export QA11X_REPO_ROOT="${WORK}"
  export MOCK_STILL_STALE=1
  export LC_ALL=C
  PATH="${FAKE_BIN}:${PATH}" run bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --dry-run --skip-tests
  assert_failure 1
  assert_output --partial "ERROR [Pre-Pack]"
}

@test "ejemplo_mock.bats y base-bash-qa: aislan _USER ante UIDs sin entrada en /etc/passwd (CI UID 1001)" {
  FAKE_ID_BIN="${BATS_TEST_TMPDIR}/no_passwd_id_bin"
  mkdir -p "${FAKE_ID_BIN}"
  REAL_ID="$(command -v id)"

  cat >"${FAKE_ID_BIN}/id" <<EOF
#!/usr/bin/env bash
if [ "\${1:-}" = "-un" ]; then
  echo "id: cannot find name for user ID 1001" >&2
  exit 1
fi
exec "${REAL_ID}" "\$@"
EOF
  chmod +x "${FAKE_ID_BIN}/id"

  run env -u _USER -u USER PATH="${FAKE_ID_BIN}:${PATH}" bats "${REPO_ROOT}/bash-scripts/test/ejemplo_mock.bats"
  assert_success
  refute_output --partial "cannot find name for user ID"

  run grep -F -- "-e _USER=qa" "${REPO_ROOT}/Makefile"
  assert_success
  run grep -F -- "-e _USER=qa" "${REPO_ROOT}/lefthook.yml"
  assert_success
  run grep -F -- "-e _USER=qa" "${REPO_ROOT}/instalar-hooks.sh"
  assert_success
  run grep -F -- "_USER: qa" "${REPO_ROOT}/bash-scripts/docker-compose.qa.yml"
  assert_success
}
