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
