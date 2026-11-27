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
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  fi
  HERMETIC_DOCKERENV="${BATS_TEST_TMPDIR}/.dockerenv"
  touch "${HERMETIC_DOCKERENV}"
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
  WORK="${BATS_TEST_TMPDIR}/sec_work"
  mkdir -p "${WORK}/src"
  printf 'export const ok = "clean-value";\n' >"${WORK}/src/clean.ts"

  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" src/clean.ts' _ "${WORK}" "${REPO_ROOT}"
  assert_success

  SYNTH_KEY="AKIA""9A8B7C6D5E4F3G2H"
  printf 'export const leak = "%s";\n' "${SYNTH_KEY}" >"${WORK}/src/leak.ts"

  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" src/leak.ts' _ "${WORK}" "${REPO_ROOT}"
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
  mkdir -p "${WORK}/.agents/scripts" "${WORK}/scripts" "${WORK}/graphify-out"
  printf '{"nodes":[],"links":[]}\n' >"${WORK}/graphify-out/graph.json"
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
  mkdir -p "${WORK}/.agents/scripts" "${WORK}/scripts" "${WORK}/tests/bats" "${WORK}/graphify-out"
  printf '{"nodes":[],"links":[]}\n' >"${WORK}/graphify-out/graph.json"
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
  mkdir -p "${WORK}/.agents/scripts" "${WORK}/scripts" "${WORK}/mcp-server" "${WORK}/graphify-out" "${FAKE_BIN}"
  printf '{"nodes":[],"links":[]}\n' >"${WORK}/graphify-out/graph.json"
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
  run grep -F "run --rm --network none --restart=no --security-opt=no-new-privileges:true" "${DOCKER_LOG}"
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
  run grep -F "PYTHONDONTWRITEBYTECODE=1" "${DOCKER_LOG}"
  assert_success
  run grep -F "QA_DIAG_PATH=/qa-diag/fail.json" "${DOCKER_LOG}"
  assert_success
  run grep -F "/app/.agents/scripts/track_findings_state.py" "${DOCKER_LOG}"
  assert_success
  run grep -F -- "--stage" "${DOCKER_LOG}"
  assert_success
}

@test "certify_task_completion.sh (F3.2): exige tests/docs para SKILL.md, rules, schemas, manifest.json y llms.txt pero mantiene DOCS_ONLY para docs/*.md" {
  WORK="${BATS_TEST_TMPDIR}/certify_f32_gate10"
  mkdir -p "${WORK}/.agents/scripts" "${WORK}/.agents/schemas" "${WORK}/.agents/skills/demo" "${WORK}/.agents/rules" "${WORK}/scripts" "${WORK}/docs" "${WORK}/tests" "${WORK}/graphify-out"
  printf '{"nodes":[],"links":[]}\n' >"${WORK}/graphify-out/graph.json"
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

  # Placeholder en el comentario NO oculta un secreto hardcoded en la misma línea
  printf 'export REAL_TOKEN="SecretHardcoded987654321" # <tag> ${VAR} process.env os.environ ephemeral\n' >"${WORK}/mixed_line.ts" # qa-secret-fixture-ok
  run env LC_ALL=C bash "${REPO_ROOT}/scripts/verificar-secretos.sh" mixed_line.ts
  assert_failure
  assert_output --partial "mixed_line.ts"

  # Ruta absoluta fuera del workspace falla cerrado
  run env LC_ALL=C bash "${REPO_ROOT}/scripts/verificar-secretos.sh" "/etc/passwd"
  assert_failure
}

@test "generar-sbom-cyclonedx.sh (F8.18): genera SBOM, .sha256 y .hmac en Docker --network none sin pasar secreto en argv" {
  WORK="${BATS_TEST_TMPDIR}/sbom_ws"
  FAKE_BIN="${BATS_TEST_TMPDIR}/sbom_bin"
  DOCKER_LOG="${BATS_TEST_TMPDIR}/sbom_docker.log"
  local real_python
  real_python="$(command -v python3)"
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
is_py=0
prev=""
py_code=""
for arg in "\$@"; do
  if [ "\${prev}" = "-e" ] && [[ "\${arg}" == *=* ]]; then
    export "\${arg}"
  fi
  if [ "\${arg}" = "python3" ]; then
    is_py=1
  elif [ "\${prev}" = "-c" ] && [ "\${is_py}" = "1" ]; then
    py_code="\${arg}"
  fi
  prev="\${arg}"
done
if [ "\${is_py}" = "1" ] && [ -n "\${py_code}" ]; then
  exec "${real_python}" -c "\${py_code//\/workspace/${WORK}}"
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
  [ -f "${WORK}/sbom.cyclonedx.json.sha256" ]
  run grep -F "/qa-11x-trivy:/tmp/trivy-cache" "${DOCKER_LOG}"
  assert_success
  run grep -F "qa11x_trivy_cache:/tmp/trivy-cache" "${DOCKER_LOG}"
  assert_failure
  run grep -F -- "--format cyclonedx --output /workspace/sbom.cyclonedx.json /workspace" "${DOCKER_LOG}"
  assert_success
  run grep -F -- "--network none" "${DOCKER_LOG}"
  assert_success

  : >"${DOCKER_LOG}"
  run env QA11X_ATTESTATION_KEY="qa11x-sbom-key" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${WORK}/scripts/generar-sbom-cyclonedx.sh" "artifacts/custom.cyclonedx.json"
  assert_success
  assert_output --partial "artifacts/custom.cyclonedx.json"
  [ -f "${WORK}/artifacts/custom.cyclonedx.json" ]
  [ -f "${WORK}/artifacts/custom.cyclonedx.json.sha256" ]
  [ -f "${WORK}/artifacts/custom.cyclonedx.json.hmac" ]
  run grep -F "HMAC-SHA256(custom.cyclonedx.json)=" "${WORK}/artifacts/custom.cyclonedx.json.hmac"
  assert_success
  run grep -F -- "--output /workspace/artifacts/custom.cyclonedx.json" "${DOCKER_LOG}"
  assert_success
  run grep -F -- "-e QA11X_ATTESTATION_KEY" "${DOCKER_LOG}"
  assert_success
  run grep -F "qa11x-sbom-key" "${DOCKER_LOG}"
  assert_failure

  : >"${DOCKER_LOG}"
  touch "${BATS_TEST_TMPDIR}/sbom_ro_blocker"
  run env QA11X_TRIVY_CACHE_DIR="${BATS_TEST_TMPDIR}/sbom_ro_blocker/sub" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${WORK}/scripts/generar-sbom-cyclonedx.sh" "artifacts/fallback.cyclonedx.json"
  assert_success
  run grep -F ".qa11x_trivy_cache_" "${DOCKER_LOG}"
  assert_success

  run env MOCK_DOCKER_FAIL=1 PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${WORK}/scripts/generar-sbom-cyclonedx.sh" "artifacts/fail.json"
  assert_failure 1
  refute_output --partial "Generado exitosamente"

  # Con .trivy.yaml y sin utilidades crypto en host (delegado 100% al contenedor Python --network none)
  printf 'scan:\n  skip-dirs: []\n' >"${WORK}/.trivy.yaml"
  local no_sha_bin="${BATS_TEST_TMPDIR}/sbom_nosha_bin"
  mkdir -p "${no_sha_bin}"
  for tool in bash dirname basename mkdir cat rm chmod awk tr grep sed id env; do
    resolved="$(command -v "${tool}" || true)"
    [ -n "${resolved}" ] && ln -sf "${resolved}" "${no_sha_bin}/${tool}"
  done
  ln -sf "${FAKE_BIN}/docker" "${no_sha_bin}/docker"

  : >"${DOCKER_LOG}"
  run env QA11X_ATTESTATION_KEY="qa11x-isolated-key" PATH="${no_sha_bin}" LC_ALL=C bash "${WORK}/scripts/generar-sbom-cyclonedx.sh" "artifacts/trivy-cfg.cyclonedx.json"
  assert_success
  [ -f "${WORK}/artifacts/trivy-cfg.cyclonedx.json.sha256" ]
  [ -f "${WORK}/artifacts/trivy-cfg.cyclonedx.json.hmac" ]
  run grep -F -- "--config /workspace/.trivy.yaml" "${DOCKER_LOG}"
  assert_success
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
  run grep -F "lefthook.yml:/lefthook.yml:ro" "${WORK}/custom-hooks/pre-push"
  assert_success

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

_setup_probar_mcp_example_env() {
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
if [ "${TEST_TARBALL_MODE:-ok}" = "leak_map" ]; then
  printf '{"version":3}\n' >"${stage}/package/dist/index.js.map"
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
}

@test "probar-mcp-example.sh (F8.18): verify_tarball_cli valida paquete y rechaza LICENSE, src/ o .map" {
  _setup_probar_mcp_example_env
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

  run env QA11X_REPO_ROOT="${WORK}" TEST_TARBALL_MODE="leak_map" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --verify-tarball
  assert_failure
  assert_output --partial "Archivos .map filtrados"

  run env QA11X_REPO_ROOT="${WORK}" TEST_TARBALL_MODE="node_fail" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --verify-tarball
  assert_failure
}

@test "probar-mcp-example.sh (F8.18): ejecuta --in-place --offline y clean-room" {
  _setup_probar_mcp_example_env

  run env QA11X_REPO_ROOT="${WORK}" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --in-place --offline
  assert_success

  run env QA11X_REPO_ROOT="${WORK}" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --offline
  assert_success
  assert_output --partial "[Clean-Room E2E]"

  local rm_fail_bin="${BATS_TEST_TMPDIR}/ex_rm_fail_bin"
  local rm_fail_marker="${BATS_TEST_TMPDIR}/ex_rm_failed_once"
  local docker_clean_log="${BATS_TEST_TMPDIR}/ex_docker_clean.log"
  local real_rm
  real_rm="$(command -v rm)"
  mkdir -p "${rm_fail_bin}"
  cat >"${rm_fail_bin}/rm" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *"qa_mcp_cleanroom_"* ]] && [ ! -f "${rm_fail_marker}" ]; then
  : >"${rm_fail_marker}"
  exit 1
fi
exec "${real_rm}" "\$@"
EOF
  cat >"${rm_fail_bin}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${docker_clean_log}"
exec "${FAKE_BIN}/docker" "\$@"
EOF
  chmod +x "${rm_fail_bin}/rm" "${rm_fail_bin}/docker"

  run env QA11X_REPO_ROOT="${WORK}" HOME="${FAKE_HOME}" PATH="${rm_fail_bin}:${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --offline
  assert_success
  [ -f "${rm_fail_marker}" ]
  run grep -F -- "--rm --restart=no --network none --security-opt=no-new-privileges:true" "${docker_clean_log}"
  assert_success
  run grep -F -- "alpine:3.21@sha256:" "${docker_clean_log}"
  assert_success
}

@test "probar-mcp-example.sh: --offline falla cerrado sin fastapi/httpx o cache UV y acepta QA_UV_CACHE_DIR" {
  _setup_probar_mcp_example_env
  local py_stub_bin="${BATS_TEST_TMPDIR}/ex_py_stub_bin"
  local uv_cache_dir="${BATS_TEST_TMPDIR}/ex_uv_cache"
  local sandbox_uv_cache="${BATS_TEST_TMPDIR}/sandbox_uv_cache"
  local sandbox_qa_venv="${BATS_TEST_TMPDIR}/sandbox_qa_venv"
  local docker_args_log="${BATS_TEST_TMPDIR}/ex_docker_args.log"
  mkdir -p "${py_stub_bin}" "${uv_cache_dir}"
  touch "${uv_cache_dir}/fastapi.whl"

  cat >"${py_stub_bin}/python3" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "-c" ]; then
  exit 1
fi
exit 0
EOF
  cat >"${py_stub_bin}/uv" <<EOF
#!/usr/bin/env bash
if [ "\${1:-}" = "venv" ]; then
  mkdir -p "${sandbox_qa_venv}/bin"
  cat > "${sandbox_qa_venv}/bin/python" <<'PYEOF'
#!/usr/bin/env bash
exit 0
PYEOF
  chmod +x "${sandbox_qa_venv}/bin/python"
  exit 0
fi
if [ "\${1:-}" = "pip" ] && [ "\${2:-}" = "install" ]; then
  [ -f "${sandbox_uv_cache}/fastapi.whl" ] && exit 0
  exit 1
fi
exit 0
EOF
  for tool in ruff mypy; do
    printf '#!/usr/bin/env bash\nexit 0\n' >"${py_stub_bin}/${tool}"
  done
  chmod +x "${py_stub_bin}/python3" "${py_stub_bin}/uv" "${py_stub_bin}/ruff" "${py_stub_bin}/mypy"

  cat >"${FAKE_BIN}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${docker_args_log}"
if printf '%s\n' "\$*" | grep -q "mcp-server bash -c"; then
  cmd="\${@: -1}"
  (cd "${WORK}/mcp-server" && exec bash -c "\${cmd}")
  exit \$?
fi
if printf '%s\n' "\$*" | grep -q "sh -c"; then
  cmd="\${@: -1}"
  has_cache=0
  if printf '%s\n' "\$*" | grep -q "${uv_cache_dir}:/tmp/uv-cache"; then
    has_cache=1
  fi
  rm -rf "${sandbox_uv_cache}" "${sandbox_qa_venv}"
  mkdir -p "${sandbox_uv_cache}"
  [ "\${has_cache}" -eq 1 ] && touch "${sandbox_uv_cache}/fastapi.whl"
  PATH="${py_stub_bin}:\${PATH}" QA_VENV_DIR="${sandbox_qa_venv}" UV_CACHE_DIR="${sandbox_uv_cache}" QA_UV_OFFLINE="--offline" bash -c "\${cmd}"
  rc=\$?
  exit \$rc
fi
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"

  run env QA11X_REPO_ROOT="${WORK}" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --in-place --offline
  assert_failure 1
  assert_output --partial "Modo --offline sin fastapi/httpx preinstalados ni cache UV (UV_CACHE_DIR)"

  : >"${docker_args_log}"
  run env QA11X_REPO_ROOT="${WORK}" QA_UV_CACHE_DIR="${uv_cache_dir}" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/probar-mcp-example.sh" --in-place --offline
  assert_success
  run grep -F -- "-v ${uv_cache_dir}:/tmp/uv-cache" "${docker_args_log}"
  assert_success
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
  touch -t 202601010000 "${WORK}/mcp-server/src/index.ts"
  touch -t 202601010001 "${WORK}/mcp-server/dist/index.js"
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

@test "verificar-secretos.sh: bloquea .env en subdirectorios, bloquea tests/ sin marcador y permite # qa-secret-fixture-ok" {
  WORK="${BATS_TEST_TMPDIR}/sec_subdir_ws"
  mkdir -p "${WORK}/apps/api" "${WORK}/tests"
  printf 'API_KEY=CHANGE_ME_OK_0001\n' >"${WORK}/apps/api/.env.example"
  printf 'OK=1\n' >"${WORK}/apps/api/.env"

  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" apps/api/.env.example' _ "${WORK}" "${REPO_ROOT}"
  assert_success

  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" apps/api/.env' _ "${WORK}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial "apps/api/.env"

  SYNTH_GKEY="AIza""SynthToken99887766"
  printf 'KEY = "%s"\n' "${SYNTH_GKEY}" >"${WORK}/tests/sample.unit.py"
  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" tests/sample.unit.py' _ "${WORK}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial "tests/sample.unit.py"

  printf 'KEY = "%s"  # qa-secret-fixture-ok\n' "${SYNTH_GKEY}" >"${WORK}/tests/sample.unit.py"
  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" tests/sample.unit.py' _ "${WORK}" "${REPO_ROOT}"
  assert_success

  printf 'token = generate_access_token(payload)\nconst SUBPATH_TOKEN = "__SUBPATH_PARAM__";\n' >"${WORK}/apps/api/calls.ts"
  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" apps/api/calls.ts' _ "${WORK}" "${REPO_ROOT}"
  assert_success

  printf 'const tok = makeSyntheticToken("%s");\n' "${SYNTH_GKEY}" >"${WORK}/apps/api/leak_in_call.ts"
  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" apps/api/leak_in_call.ts' _ "${WORK}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial "apps/api/leak_in_call.ts"
}

@test "generar-sbom-cyclonedx.sh: rechaza ruta absoluta fuera del repositorio con exit 1" {
  run env LC_ALL=C bash "${REPO_ROOT}/scripts/generar-sbom-cyclonedx.sh" "/tmp/evil-sbom.json"
  assert_failure 1
  assert_output --partial "ERROR: La ruta de salida debe ser relativa"
}

@test "certify_task_completion.sh: activa breaker rc=42 tras 3 fallos consecutivos de Gate 1" {
  WORK="${BATS_TEST_TMPDIR}/certify_breaker_42_ws"
  mkdir -p "${WORK}/.agents/scripts" "${WORK}/.agents/.cache" "${WORK}/scripts"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${WORK}/.agents/scripts/certify_task_completion.sh"
  cp "${REPO_ROOT}/.agents/scripts/track_findings_state.py" "${WORK}/.agents/scripts/track_findings_state.py"
  cp "${REPO_ROOT}/.agents/scripts/_budgets.py" "${WORK}/.agents/scripts/_budgets.py"
  cp "${REPO_ROOT}/.agents/scripts/_common.py" "${WORK}/.agents/scripts/_common.py"
  chmod +x "${WORK}/.agents/scripts/certify_task_completion.sh"

  cat >"${WORK}/scripts/verificar-secretos.sh" <<'EOF'
#!/usr/bin/env bash
echo "secreto bloqueante gate-01" >&2
exit 1
EOF
  chmod +x "${WORK}/scripts/verificar-secretos.sh"

  DIAG="${BATS_TEST_TMPDIR}/breaker42/diag.json"
  local mock_env="${BATS_TEST_TMPDIR}/breaker_dockerenv"
  : >"${mock_env}"
  run env QA11X_DOCKERENV_PATH="${mock_env}" QA_DIAGNOSTIC_JSON="${DIAG}" LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1

  run env QA11X_DOCKERENV_PATH="${mock_env}" QA_DIAGNOSTIC_JSON="${DIAG}" LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1

  run env QA11X_DOCKERENV_PATH="${mock_env}" QA_DIAGNOSTIC_JSON="${DIAG}" LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
  assert_failure 42
  assert_output --partial "[BREAKER-42]"
}

@test "probar-mcp-example.sh: exige guardia anti-root y falla con exit 1 si EUID=0 fuera de Docker" {
  run grep -F '[[ "${EUID}" -eq 0 ]] && [ ! -f /.dockerenv ]' "${REPO_ROOT}/scripts/probar-mcp-example.sh"
  assert_success

  local copy_script="${BATS_TEST_TMPDIR}/probar-root-guard.sh"
  sed 's/\[\[[[:space:]]*"\${EUID}"[[:space:]]*-eq[[:space:]]*0[[:space:]]*\]\]/[ "${QA_MOCK_EUID:-${EUID}}" -eq 0 ]/; s|/\.dockerenv|/__nonexistent_dockerenv__|g' \
    "${REPO_ROOT}/scripts/probar-mcp-example.sh" >"${copy_script}"
  chmod +x "${copy_script}"

  run env QA_MOCK_EUID=0 LC_ALL=C bash "${copy_script}" --help
  assert_failure 1
  assert_output --partial "No debe ejecutar este script como root en el host"
}

@test "publicar-mcp.sh: read_dotenv_value, bump_version_11x pre-check y MCP_EXTRA_VOLS en dry-run" {
  WORK="${BATS_TEST_TMPDIR}/pub_env_repo"
  FAKE_BIN="${BATS_TEST_TMPDIR}/pub_env_bin"
  DOCKER_LOG="${BATS_TEST_TMPDIR}/pub_env_docker.log"
  mkdir -p "${WORK}/mcp-server/src" "${WORK}/mcp-server/dist" "${WORK}/scripts" "${WORK}/.agents/scripts" \
    "${WORK}/mobile-appium" "${WORK}/vibe-rescue" "${WORK}/.github" "${FAKE_BIN}"

  printf '{\n  "name": "@sinfallas/mcp-qa-11x",\n  "version": "3.1.0"\n}\n' >"${WORK}/mcp-server/package.json"
  printf 'export const v = "3.1.0";\n' >"${WORK}/mcp-server/src/index.ts"
  touch -t 202601010000 "${WORK}/mcp-server/src/index.ts"
  printf 'console.log("fresh");\n' >"${WORK}/mcp-server/dist/index.js"
  touch -t 202601010001 "${WORK}/mcp-server/dist/index.js"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${WORK}/scripts/limpieza.sh"
  chmod +x "${WORK}/scripts/limpieza.sh"
  printf 'print("ok")\n' >"${WORK}/.agents/scripts/bump_version_11x.py"
  printf 'print("ok")\n' >"${WORK}/.agents/scripts/sync_governance.py"
  printf '{}\n' >"${WORK}/manifest.json"
  printf '# Changelog\n## [3.0.0]\n' >"${WORK}/CHANGELOG.md"

  cat >"${FAKE_BIN}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${DOCKER_LOG}"
if printf '%s\n' "\$*" | grep -q "npm view"; then
  if [ -n "\${QA_STUB_PUBLISHED_FILE:-}" ] && [ -f "\${QA_STUB_PUBLISHED_FILE}" ]; then
    printf '%s\n' "3.1.0"
    exit 0
  fi
  exit 1
fi
if printf '%s\n' "\$*" | grep -q "npm publish"; then
  if [ "\${QA_STUB_FAIL_PUBLISH:-0}" = "1" ]; then
    exit 1
  fi
  if [ -n "\${QA_STUB_PUBLISHED_FILE:-}" ]; then
    : >"\${QA_STUB_PUBLISHED_FILE}"
  fi
  exit 0
fi
if printf '%s\n' "\$*" | grep -q "npm pack --dry-run"; then
  printf 'package size: 10 kB\ntotal files: 5\n'
  exit 0
fi
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"

  cat >"${WORK}/.env" <<'EOF'
NPM_TOKEN="npm_realMock1234567890"
EOF
  chmod 644 "${WORK}/.env"

  run env QA11X_REPO_ROOT="${WORK}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --dry-run --skip-tests
  assert_failure 1
  assert_output --partial "no contiene entrada para la versión"
  printf '# Changelog\n## [3.1.0]\n' >"${WORK}/CHANGELOG.md"

  run env QA11X_REPO_ROOT="${WORK}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --dry-run --skip-tests
  assert_success
  assert_output --partial "SIMULACIÓN EXITOSA"
  [ "$(stat -c "%a" "${WORK}/.env")" = "600" ]

  : >"${DOCKER_LOG}"
  cat >"${WORK}/.env" <<'EOF'
NPM_TOKEN="npm_realMock1234567890"
NPM_REGISTRY='https://registry.npmjs.org/'
NPM_OTP=123456 # 2fa comment
EOF
  chmod 600 "${WORK}/.env"

  run env QA11X_REPO_ROOT="${WORK}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --dry-run --skip-tests
  assert_success
  assert_output --partial "SIMULACIÓN EXITOSA"

  run grep -F "bump_version_11x.py --check" "${DOCKER_LOG}"
  assert_success
  run grep -F "/mobile-appium:ro" "${DOCKER_LOG}"
  assert_success
  run grep -F "/vibe-rescue:ro" "${DOCKER_LOG}"
  assert_success
  run grep -F "/.github:ro" "${DOCKER_LOG}"
  assert_success

  printf '.env\n' >"${WORK}/.gitignore"
  git -C "${WORK}" init -q
  git -C "${WORK}" config user.email "qa@example.com"
  git -C "${WORK}" config user.name "QA Bot"
  git -C "${WORK}" add .
  git -C "${WORK}" commit -q -m "chore: baseline"
  printf 'dirty\n' >"${WORK}/dirty.tmp"
  run env QA11X_REPO_ROOT="${WORK}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --skip-tests --otp 654321
  assert_failure 1
  assert_output --partial "cambios sin confirmar"
  rm -f "${WORK}/dirty.tmp"

  : >"${DOCKER_LOG}"
  PUB_STAMP="${BATS_TEST_TMPDIR}/pub_done.flag"
  run env QA11X_REPO_ROOT="${WORK}" QA_STUB_PUBLISHED_FILE="${PUB_STAMP}" GITHUB_ACTIONS="true" ACTIONS_ID_TOKEN_REQUEST_URL="https://token.actions.githubusercontent.com" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --skip-tests --otp 654321
  assert_success
  assert_output --partial "PUBLICACIÓN EXITOSA"
  run grep -F " -e NPM_TOKEN -e NPM_OTP -e NPM_REGISTRY " "${DOCKER_LOG}"
  assert_success
  run grep -F " -e GITHUB_ACTIONS -e ACTIONS_ID_TOKEN_REQUEST_URL " "${DOCKER_LOG}"
  assert_success
  run grep -F "npm publish --access public" "${DOCKER_LOG}"
  assert_success
  run grep -F -- "--provenance" "${DOCKER_LOG}"
  assert_success

  run env QA11X_REPO_ROOT="${WORK}" QA_STUB_FAIL_PUBLISH=1 PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --skip-tests --otp 654321
  assert_failure 1
  assert_output --partial "No se completó la publicación"
}

@test "verificar-secretos.sh: cubre autodeteccion git (limpio ls-files, sucio/untracked) y archivos excluidos" {
  WORK="${BATS_TEST_TMPDIR}/sec_git_ws"
  FAKE_BIN="${BATS_TEST_TMPDIR}/sec_git_bin"
  DOCKER_LOG="${BATS_TEST_TMPDIR}/sec_git_docker.log"
  mkdir -p "${WORK}/src" "${FAKE_BIN}"
  printf 'export const clean = "ok";\n' >"${WORK}/src/clean.ts"
  git -C "${WORK}" init -q
  git -C "${WORK}" config user.email "qa@example.com"
  git -C "${WORK}" config user.name "QA Bot"
  git -C "${WORK}" add src/clean.ts
  git -C "${WORK}" commit -q -m "chore: init"

  # 1. Arbol limpio sin argumentos -> fallback git ls-files (L52)
  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh"' _ "${WORK}" "${REPO_ROOT}"
  assert_success
  assert_output --partial "0 secretos expuestos"

  # 2. Archivo untracked/modificado sin argumentos -> git diff/ls-files --others (L46-47)
  printf 'export const extra = "clean-extra";\n' >"${WORK}/src/extra.ts"
  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh"' _ "${WORK}" "${REPO_ROOT}"
  assert_success
  assert_output --partial "0 secretos expuestos"

  # 3. Solo archivos excluidos (png) -> L73 "0 archivos sujetos a escaneo de secretos."
  printf 'PNG' >"${WORK}/logo.png"
  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" logo.png' _ "${WORK}" "${REPO_ROOT}"
  assert_success
  assert_output --partial "0 archivos sujetos a escaneo de secretos"

  # 4. Re-encapsulamiento Rule Zero cuando /.dockerenv no existe
  cat >"${FAKE_BIN}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${DOCKER_LOG}"
exit 0
EOF
  chmod +x "${FAKE_BIN}/docker"
  run env QA11X_DOCKERENV_PATH="/nonexistent" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" src/clean.ts' _ "${WORK}" "${REPO_ROOT}"
  assert_success
  run grep -F "run --rm --network none" "${DOCKER_LOG}"
  assert_success
  run grep -F -- "--restart=no" "${DOCKER_LOG}"
  assert_success
  run grep -F "QA11X_INSIDE_DOCKER=1" "${DOCKER_LOG}"
  assert_success
}

@test "certify_task_completion.sh: cubre QA_DIAGNOSTIC_JSON relativo, fallback HEAD~1..HEAD y verify_diff_coverage en Gate 10" {
  WORK="${BATS_TEST_TMPDIR}/certify_head_cov_ws"
  DIFF_COV_LOG="${BATS_TEST_TMPDIR}/diff_cov_args.log"
  mkdir -p "${WORK}/.agents/scripts" "${WORK}/.agents/.cache/coverage" "${WORK}/scripts" "${WORK}/tests/bats" "${WORK}/graphify-out"
  printf '{"nodes":[],"links":[]}\n' >"${WORK}/graphify-out/graph.json"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${WORK}/.agents/scripts/certify_task_completion.sh"
  chmod +x "${WORK}/.agents/scripts/certify_task_completion.sh"

  cat >"${WORK}/scripts/verificar-secretos.sh" <<'EOF'
#!/usr/bin/env bash
echo "secreto rel diag" >&2
exit 1
EOF
  chmod +x "${WORK}/scripts/verificar-secretos.sh"

  # A. QA_DIAGNOSTIC_JSON relativo resuelve contra REPO_ROOT
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" QA_DIAGNOSTIC_JSON="./rel-diag/fail.json" LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  [ -f "${WORK}/rel-diag/fail.json" ]
  rm -rf "${WORK}/rel-diag"

  # B. Arbol git limpio con 2 commits (HEAD~1..HEAD) + verify_diff_coverage stub + reporte .xml
  cat >"${WORK}/scripts/verificar-secretos.sh" <<'EOF'
#!/usr/bin/env bash
echo "✔ [Secretos] stub OK"
EOF
  cat >"${WORK}/scripts/auditar-infra.sh" <<'EOF'
#!/usr/bin/env bash
echo "✔ [Trivy] stub OK"
EOF
  chmod +x "${WORK}/scripts/verificar-secretos.sh" "${WORK}/scripts/auditar-infra.sh"
  printf 'print("✔ [Manifest] stub OK")\n' >"${WORK}/scripts/generar-manifiesto.py"
  for stub_py in \
    verify_json_no_duplicate_keys.py \
    verify_zero_orphan_vue_components.py \
    verify_no_orphan_api_endpoints.py \
    verify_topological_health.py \
    verify_alembic_orm_parity.py \
    verify_roadmap_consistency.py \
    verify_docs_invariants.py; do
    printf 'print("✔ [%s] stub OK")\n' "${stub_py}" >"${WORK}/.agents/scripts/${stub_py}"
  done
  cat >"${WORK}/.agents/scripts/verify_diff_coverage.py" <<EOF
import sys
from pathlib import Path
Path("${DIFF_COV_LOG}").write_text(" ".join(sys.argv[1:]) + "\n", encoding="utf-8")
print("✔ [Diff Coverage] stub OK")
EOF

  printf '#!/usr/bin/env bash\necho base\n' >"${WORK}/scripts/app.sh"
  printf '@test "t" { true; }\n' >"${WORK}/tests/bats/app.bats"
  printf '# Demo\n' >"${WORK}/README.md"
  printf '<coverage/>\n' >"${WORK}/.agents/.cache/coverage/bash.xml"
  printf '.agents/.cache/\n' >"${WORK}/.gitignore"

  git -C "${WORK}" init -q
  git -C "${WORK}" config user.email "qa@example.com"
  git -C "${WORK}" config user.name "QA Bot"
  git -C "${WORK}" add .
  git -C "${WORK}" commit -q -m "chore: init"

  printf '#!/usr/bin/env bash\necho v2\n' >"${WORK}/scripts/app.sh"
  printf '@test "t" { true; }\n# v2\n' >"${WORK}/tests/bats/app.bats"
  printf '# Demo v2\n' >"${WORK}/README.md"
  git -C "${WORK}" add scripts/app.sh tests/bats/app.bats README.md
  git -C "${WORK}" commit -q -m "feat: v2"

  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh" --strict
  assert_success
  assert_output --partial "10/10 PASS"
  run cat "${DIFF_COV_LOG}"
  assert_success
  assert_output --partial "--base-ref HEAD~1"
  assert_output --partial "--reports-dir .agents/.cache/coverage"
}

@test "verificar-secretos.sh: cubre relativize_repo_targets y falta de Docker bajo Rule Zero" {
  mkdir -p "${BATS_TEST_TMPDIR}/sec_rel_ws/src" "${BATS_TEST_TMPDIR}/sec_rel_ws/locked_dir"
  WORK="$(cd "${BATS_TEST_TMPDIR}/sec_rel_ws" && pwd -P)"
  printf 'export const ok = "clean-value";\n' >"${WORK}/src/clean.ts"

  # 1. Ruta igual a WORK_ROOT (rel_arg=".") y subruta absoluta dentro del repo
  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" "$1" "$1/src/clean.ts"' _ "${WORK}" "${REPO_ROOT}"
  assert_success
  assert_output --partial "0 secretos expuestos"

  # 2. Directorio existente sin permiso de entrada falla al resolver ruta (si UID != 0)
  if [ "$(id -u)" -ne 0 ]; then
    chmod 000 "${WORK}/locked_dir"
    run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" "$1/locked_dir/file.txt"' _ "${WORK}" "${REPO_ROOT}"
    chmod 755 "${WORK}/locked_dir"
    [ "${status}" -eq 1 ]
    assert_output --partial "No se pudo resolver la ruta"
  fi

  # 3. Ruta absoluta con directorio padre inexistente (line 28) -> fuera del repositorio
  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" "/nonexistent_parent_11x/file.txt"' _ "${WORK}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial "Ruta fuera del repositorio"

  # 4. Path traversal relativo bloqueado (lines 41-42)
  run env LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" "../escape.txt"' _ "${WORK}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial "Path traversal bloqueado"

  # 5. Sin Docker fuera de contenedor falla cerrado (lines 56-57)
  local no_docker_bin="${BATS_TEST_TMPDIR}/sec_nodocker_bin"
  mkdir -p "${no_docker_bin}"
  for tool in bash dirname basename; do
    resolved="$(command -v "${tool}" || true)"
    [ -n "${resolved}" ] && ln -sf "${resolved}" "${no_docker_bin}/${tool}"
  done
  run env QA11X_DOCKERENV_PATH="/nonexistent" PATH="${no_docker_bin}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" src/clean.ts' _ "${WORK}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial "Se requiere Docker"
}


@test "CLI --help y rechazo de flags desconocidos en actualizar-grafos, auditar-infra y verificar-secretos + fallback sin git" {
  local no_docker_bin="${BATS_TEST_TMPDIR}/cli_nodocker_bin"
  local clean_room="${BATS_TEST_TMPDIR}/clean_room_nongit"
  mkdir -p "${no_docker_bin}" "${clean_room}/src"
  for tool in bash dirname basename find grep env; do
    resolved="$(command -v "${tool}" || true)"
    [ -n "${resolved}" ] && ln -sf "${resolved}" "${no_docker_bin}/${tool}"
  done

  # 1. --help sin depender de Docker ni de la existencia previa de flags inválidos
  for script_name in actualizar-grafos-graphify.sh auditar-infra.sh verificar-secretos.sh; do
    run env QA11X_DOCKERENV_PATH="/nonexistent" PATH="${no_docker_bin}" LC_ALL=C bash "${REPO_ROOT}/scripts/${script_name}" --help
    assert_success
    assert_output --partial "Uso:"

    run env QA11X_DOCKERENV_PATH="/nonexistent" PATH="${no_docker_bin}" LC_ALL=C bash "${REPO_ROOT}/scripts/${script_name}" --unknown-cli-flag
    assert_failure 1
  done

  # 2. verificar-secretos.sh sin .git usa find fallback y detecta secreto real en archivo clean-room
  local clean_dockerenv="${BATS_TEST_TMPDIR}/clean_dockerenv"
  : >"${clean_dockerenv}"
  printf 'export const clean = "safe";\n' >"${clean_room}/src/ok.ts"
  run env QA11X_DOCKERENV_PATH="${clean_dockerenv}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh"' _ "${clean_room}" "${REPO_ROOT}"
  assert_success
  assert_output --partial "0 secretos expuestos"

  local synth_aws="AKIA""1234567890ABCDEF"
  printf 'const awsKey = "%s";\n' "${synth_aws}" >"${clean_room}/src/leak.ts"
  run env QA11X_DOCKERENV_PATH="${clean_dockerenv}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh"' _ "${clean_room}" "${REPO_ROOT}"
  assert_failure 1
  rm -f "${clean_room}/src/leak.ts"

  printf 'SECRET=1\n' >"${clean_room}/.env"

  # 3. [18]/[19]/L014: expansion de directorio, ruta inexistente, flag desconocido, espacios PEP8 y comentario ignore
  mkdir -p "${clean_room}/nested"
  local pep8_secret="SuperReal""SecretValue_12345"
  printf 'password = "%s"\n' "${pep8_secret}" >"${clean_room}/nested/cfg.py"
  run env QA11X_DOCKERENV_PATH="${clean_dockerenv}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" nested' _ "${clean_room}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial "nested/cfg.py"

  # secret-scan-ignore en codigo ejecutable sin marcador de comentario ya NO suprime el escaneo
  printf 'const tok = "%s"; const note = "secret-scan-ignore";\n' "${synth_aws}" >"${clean_room}/nested/bypass.ts"
  run env QA11X_DOCKERENV_PATH="${clean_dockerenv}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" nested/bypass.ts' _ "${clean_room}" "${REPO_ROOT}"
  assert_failure 1

  # Con marcador de comentario legitimo si excluye la linea fixture
  printf 'const tok = "%s"; // secret-scan-ignore\n' "${synth_aws}" >"${clean_room}/nested/fixture.ts"
  run env QA11X_DOCKERENV_PATH="${clean_dockerenv}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" nested/fixture.ts' _ "${clean_room}" "${REPO_ROOT}"
  assert_success

  run env QA11X_DOCKERENV_PATH="${clean_dockerenv}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" missing_file.ts' _ "${clean_room}" "${REPO_ROOT}"
  assert_failure 1

  run env QA11X_DOCKERENV_PATH="${clean_dockerenv}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" --flag-desconocido' _ "${clean_room}" "${REPO_ROOT}"
  assert_failure 1

  # 4. commit-msg hook instalado por instalar-hooks.sh rechaza >100 chars y acepta <=100
  local hook_ws="${BATS_TEST_TMPDIR}/hook_msg_ws"
  mkdir -p "${hook_ws}/scripts"
  git -C "${hook_ws}" init -q
  run env QA11X_REPO_ROOT="${hook_ws}" LC_ALL=C bash "${REPO_ROOT}/instalar-hooks.sh"
  assert_success
  local msg_long="${BATS_TEST_TMPDIR}/msg_long.txt"
  local msg_ok="${BATS_TEST_TMPDIR}/msg_ok.txt"
  printf 'feat: %0110d\n' 1 >"${msg_long}"
  printf 'feat: short conventional header\n' >"${msg_ok}"
  run bash "${hook_ws}/.git/hooks/commit-msg" "${msg_long}"
  assert_failure 1
  run bash "${hook_ws}/.git/hooks/commit-msg" "${msg_ok}"
  assert_success
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh"' _ "${clean_room}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial "Archivo sensible .env bloqueado"
  rm -f "${clean_room}/.env"

  run env PATH="${no_docker_bin}" LC_ALL=C bash "${REPO_ROOT}/scripts/actualizar-grafos-graphify.sh" stack_uno stack_dos
  assert_failure 1
  assert_output --partial "Demasiados argumentos posicionales"

  local stub_dk_bin="${BATS_TEST_TMPDIR}/cli_stub_dk_bin"
  mkdir -p "${stub_dk_bin}"
  for tool in bash dirname basename; do
    resolved="$(command -v "${tool}" || true)"
    [ -n "${resolved}" ] && ln -sf "${resolved}" "${stub_dk_bin}/${tool}"
  done
  printf '#!/usr/bin/env bash\nexit 0\n' >"${stub_dk_bin}/docker"
  chmod +x "${stub_dk_bin}/docker"
  run env PATH="${stub_dk_bin}" LC_ALL=C bash "${REPO_ROOT}/scripts/actualizar-grafos-graphify.sh" --all stack_inexistente_11x
  assert_failure 1
  assert_output --partial "Directorio de stack inexistente"
}

@test "Wave 3 M023/M024/M044/M045: certify catalogs+test-only+redaction, auditar-infra fingerprint y probar-mcp CWD" {
  # 1. M024 + M023: catalogs/ obliga QA-TEST-SYNC-01, test-only no bloquea docs y redacción case-insensitive en stderr
  local w3_ws="${BATS_TEST_TMPDIR}/w3_certify_ws"
  mkdir -p "${w3_ws}/.agents/scripts" "${w3_ws}/scripts" "${w3_ws}/catalogs" "${w3_ws}/tests" "${w3_ws}/graphify-out"
  printf '{"nodes":[],"links":[]}\n' >"${w3_ws}/graphify-out/graph.json"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${w3_ws}/.agents/scripts/certify_task_completion.sh"
  chmod +x "${w3_ws}/.agents/scripts/certify_task_completion.sh"
  printf 'print("✔ [Manifest] stub OK")\n' >"${w3_ws}/scripts/generar-manifiesto.py"
  for stub_py in \
    verify_json_no_duplicate_keys.py \
    verify_zero_orphan_vue_components.py \
    verify_no_orphan_api_endpoints.py \
    verify_topological_health.py \
    verify_alembic_orm_parity.py \
    verify_roadmap_consistency.py; do
    printf 'print("✔ [%s] stub OK")\n' "${stub_py}" >"${w3_ws}/.agents/scripts/${stub_py}"
  done
  printf '#!/usr/bin/env bash\necho "✔ ok"\n' >"${w3_ws}/scripts/auditar-infra.sh"
  cat >"${w3_ws}/scripts/verificar-secretos.sh" <<EOF
#!/usr/bin/env bash
echo "API_KEY=plainSecret""TokenValue12345" >&2
exit 1
EOF
  chmod +x "${w3_ws}/scripts/auditar-infra.sh" "${w3_ws}/scripts/verificar-secretos.sh"

  local diag_red="${BATS_TEST_TMPDIR}/w3_diag/red.json"
  local mock_env="${BATS_TEST_TMPDIR}/w3_dockerenv"
  : >"${mock_env}"
  run env QA11X_DOCKERENV_PATH="${mock_env}" QA_DIAGNOSTIC_JSON="${diag_red}" LC_ALL=C bash "${w3_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  refute_output --partial "plainSecretTokenValue12345"

  # Repositorio git válido para evaluar reglas M024 de Gate 10
  printf '#!/usr/bin/env bash\necho "✔ clean"\n' >"${w3_ws}/scripts/verificar-secretos.sh"
  chmod +x "${w3_ws}/scripts/verificar-secretos.sh"
  printf '{"ok":true}\n' >"${w3_ws}/catalogs/pack.json"
  printf '# Init\n' >"${w3_ws}/CHANGELOG.md"
  printf 'def test_ok(): pass\n' >"${w3_ws}/tests/test_sample.py"
  git -C "${w3_ws}" init -q
  git -C "${w3_ws}" config user.email "qa@example.com"
  git -C "${w3_ws}" config user.name "QA Bot"
  git -C "${w3_ws}" add .
  git -C "${w3_ws}" commit -q -m "chore: init"

  # Modificar catalogs/ sin tocar tests ni docs falla Gate 10 (M024)
  printf '{"ok":false}\n' >"${w3_ws}/catalogs/pack.json"
  run env QA11X_DOCKERENV_PATH="${mock_env}" LC_ALL=C bash "${w3_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  git -C "${w3_ws}" checkout -- catalogs/pack.json

  # Solo editar test file sin editar docs NO falla por docs faltantes (M024)
  printf 'def test_ok(): assert 1 == 1\n' >"${w3_ws}/tests/test_sample.py"
  run env QA11X_DOCKERENV_PATH="${mock_env}" LC_ALL=C bash "${w3_ws}/.agents/scripts/certify_task_completion.sh"
  assert_success

  # 2. M044 + [21]: auditar-infra usa UID no-root + no-new-privileges e invalida cache con package.json
  local trivy_log="${BATS_TEST_TMPDIR}/trivy_w3.log"
  local trivy_bin="${BATS_TEST_TMPDIR}/trivy_bin"
  mkdir -p "${trivy_bin}" "${w3_ws}/mcp-server"
  for tool in bash awk cat chmod cp cut dirname find grep head id mkdir pwd rm sed sha256sum sort tail tr wc xargs; do
    resolved="$(command -v "${tool}" || true)"
    [ -n "${resolved}" ] && ln -sf "${resolved}" "${trivy_bin}/${tool}"
  done
  cat >"${trivy_bin}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${trivy_log}"
exit 0
EOF
  chmod +x "${trivy_bin}/docker"
  cp "${REPO_ROOT}/scripts/auditar-infra.sh" "${w3_ws}/scripts/auditar-infra.sh"
  chmod +x "${w3_ws}/scripts/auditar-infra.sh"
  printf '{"name":"demo"}\n' >"${w3_ws}/mcp-server/package.json"

  : >"${trivy_log}"
  run env PATH="${trivy_bin}" LC_ALL=C bash "${w3_ws}/scripts/auditar-infra.sh"
  assert_success
  run grep -F -- "-u $(id -u):$(id -g)" "${trivy_log}"
  assert_success
  run grep -F -- "--security-opt=no-new-privileges:true" "${trivy_log}"
  assert_success

  # Cambiar package.json invalida caché SHA-256 sin usar --force (M044)
  : >"${trivy_log}"
  printf '{"name":"demo","version":"2"}\n' >"${w3_ws}/mcp-server/package.json"
  run env PATH="${trivy_bin}" LC_ALL=C bash "${w3_ws}/scripts/auditar-infra.sh"
  assert_success
  [ "$(wc -l <"${trivy_log}")" -ge 2 ]

  # 3. Wave 3 Bash diff coverage: verificar-secretos (--, nested clean, nested .env), publicar-mcp (pack map) y probar-mcp (--verify-tarball root & docker)
  local cov_ws="${BATS_TEST_TMPDIR}/w3_cov_ws"
  mkdir -p "${cov_ws}/nested_ok" "${cov_ws}/nested_env"
  printf 'export const ok = 1;\n' >"${cov_ws}/nested_ok/app.ts"
  printf 'SECRET=1\n' >"${cov_ws}/nested_env/.env"
  run env QA11X_EXPLICIT_TARGETS=1 LC_ALL=C bash -c 'cd "$1" && "$2/scripts/verificar-secretos.sh" -- nested_ok' _ "${cov_ws}" "${REPO_ROOT}"
  assert_success
  run env LC_ALL=C bash -c 'cd "$1" && "$2/scripts/verificar-secretos.sh" nested_env' _ "${cov_ws}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial ".env bloqueado"

  # probar-mcp-example --verify-tarball desde WORK raíz y fuera de Docker
  _setup_probar_mcp_example_env
  cd "${WORK}"
  run env QA11X_REPO_ROOT="${WORK}" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C "${REPO_ROOT}/scripts/probar-mcp-example.sh" --verify-tarball
  assert_success
  run env QA11X_DOCKERENV_PATH="/nonexistent" QA11X_REPO_ROOT="${WORK}" HOME="${FAKE_HOME}" PATH="${FAKE_BIN}:/usr/bin:/bin" LC_ALL=C "${REPO_ROOT}/scripts/probar-mcp-example.sh" --verify-tarball
  assert_success

  # publicar-mcp.sh npm pack --dry-run exponiendo *.map en Docker stub (L260-261)
  local pub_cov_ws="${BATS_TEST_TMPDIR}/pub_cov_ws"
  local pub_cov_bin="${BATS_TEST_TMPDIR}/pub_cov_bin"
  mkdir -p "${pub_cov_ws}/mcp-server/src" "${pub_cov_ws}/mcp-server/dist" "${pub_cov_ws}/mcp-server/node_modules/.bin" "${pub_cov_ws}/scripts" "${pub_cov_bin}"
  printf '{"name":"@sinfallas/mcp-qa-11x","version":"3.1.0"}\n' >"${pub_cov_ws}/mcp-server/package.json"
  printf 'export const x = 1;\n' >"${pub_cov_ws}/mcp-server/src/index.ts"
  touch -t 202601010000 "${pub_cov_ws}/mcp-server/src/index.ts"
  printf 'export const x = 1;\n' >"${pub_cov_ws}/mcp-server/dist/index.js"
  touch -t 202601010001 "${pub_cov_ws}/mcp-server/dist/index.js"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${pub_cov_ws}/scripts/limpieza.sh"
  chmod +x "${pub_cov_ws}/scripts/limpieza.sh"
  cat >"${pub_cov_bin}/docker" <<'EOF'
#!/usr/bin/env bash
if printf '%s\n' "$*" | grep -q "npm pack --dry-run"; then
  printf 'npm notice dist/index.js.map\n'
  exit 0
fi
exit 0
EOF
  chmod +x "${pub_cov_bin}/docker"
  run env QA11X_REPO_ROOT="${pub_cov_ws}" PATH="${pub_cov_bin}:/usr/bin:/bin" LC_ALL=C "${REPO_ROOT}/scripts/publicar-mcp.sh" --dry-run --skip-tests
  assert_failure 1
  assert_output --partial "expuestos en npm pack"
}

@test "verificar-secretos.sh y generar-sbom-cyclonedx.sh: bloquean UTF-8/.env en Git, arg vacío y escape symlink" {
  # 1. verificar-secretos.sh: rutas UTF-8 no-ASCII (café/.env y café_secret.py) sin core.quotePath=false
  local utf8_ws="${BATS_TEST_TMPDIR}/utf8_sec_ws"
  local stub_bin="${BATS_TEST_TMPDIR}/utf8_sec_bin"
  mkdir -p "${utf8_ws}/scripts" "${utf8_ws}/café" "${stub_bin}"
  cp "${REPO_ROOT}/scripts/verificar-secretos.sh" "${utf8_ws}/scripts/verificar-secretos.sh"
  chmod +x "${utf8_ws}/scripts/verificar-secretos.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${stub_bin}/docker"
  chmod +x "${stub_bin}/docker"

  (
    cd "${utf8_ws}"
    git init -q
    git config user.email "qa@example.com"
    git config user.name "QA"
    printf 'ok=1\n' >README.md
    git add README.md
    git commit -qm init
    printf 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n' >"café/.env" # qa-secret-fixture-ok
    git add "café/.env"
  )
  run env PATH="${stub_bin}:/usr/bin:/bin" LC_ALL=C bash -c 'cd "$1" && bash scripts/verificar-secretos.sh' _ "${utf8_ws}"
  assert_failure 1
  assert_output --partial "Archivo sensible trackeado en Git"

  (
    cd "${utf8_ws}"
    git rm -qf --cached "café/.env"
    rm -f "café/.env"
    printf 'AWS_ACCESS_KEY_ID = "AKIA1234567890ABCDEF"\n' >"café_secret.py" # qa-secret-fixture-ok
    git add "café_secret.py"
  )
  run env PATH="${stub_bin}:/usr/bin:/bin" LC_ALL=C bash -c 'cd "$1" && bash scripts/verificar-secretos.sh' _ "${utf8_ws}"
  assert_failure 1
  assert_output --partial "café_secret.py"

  # 2. generar-sbom-cyclonedx.sh: argumento vacío explícito "" y symlink escape fuera del repo
  local sbom_ws="${BATS_TEST_TMPDIR}/sbom_sec_ws"
  local sbom_out_ext="${BATS_TEST_TMPDIR}/sbom_outside"
  mkdir -p "${sbom_ws}/scripts" "${sbom_out_ext}"
  cp "${REPO_ROOT}/scripts/generar-sbom-cyclonedx.sh" "${sbom_ws}/scripts/generar-sbom-cyclonedx.sh"
  chmod +x "${sbom_ws}/scripts/generar-sbom-cyclonedx.sh"
  ln -s "${sbom_out_ext}" "${sbom_ws}/escape_dir"

  run env PATH="${stub_bin}:/usr/bin:/bin" LC_ALL=C bash "${sbom_ws}/scripts/generar-sbom-cyclonedx.sh" ""
  assert_failure 1
  assert_output --partial "ruta de salida debe ser relativa"

  run env PATH="${stub_bin}:/usr/bin:/bin" LC_ALL=C bash "${sbom_ws}/scripts/generar-sbom-cyclonedx.sh" "escape_dir/pwned.json"
  assert_failure 1
  assert_output --partial "escapa del repositorio"
  [ ! -e "${sbom_out_ext}/pwned.json" ]
}

@test "auditar-infra.sh y certify_task_completion.sh: cubren guardas QA-CI-ESCAPE-01, QA-MAKE-CURDIR-01, missing docker, Trivy failures y fallback" {
  local infra_ws="${BATS_TEST_TMPDIR}/infra_cov_ws"
  local infra_bin="${BATS_TEST_TMPDIR}/infra_cov_bin"
  mkdir -p "${infra_ws}/scripts" "${infra_ws}/.agents/scripts" "${infra_ws}/.github/workflows" "${infra_ws}/.github/actions/demo" "${infra_ws}/fastapi" "${infra_bin}"
  cp "${REPO_ROOT}/scripts/auditar-infra.sh" "${infra_ws}/scripts/auditar-infra.sh"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${infra_ws}/.agents/scripts/certify_task_completion.sh"
  chmod +x "${infra_ws}/scripts/auditar-infra.sh" "${infra_ws}/.agents/scripts/certify_task_completion.sh"

  # Copiar herramientas mínimas sin docker para verificar pre-chequeo Regla Cero
  for cmd in awk basename bash cat chmod cp date dirname env find git grep head id mkdir mktemp mv printf realpath rm sh sort xargs sha256sum; do
    if command -v "${cmd}" >/dev/null 2>&1; then
      ln -sf "$(command -v "${cmd}")" "${infra_bin}/${cmd}"
    fi
  done

  printf 'permissions:\n  contents: read\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "$(VAR)"\n' >"${infra_ws}/.github/workflows/ci.yml"
  printf 'qa-unit:\n\t@echo "$(CURDIR)"\n' >"${infra_ws}/fastapi/Makefile"

  run env PATH="${infra_bin}" LC_ALL=C bash "${infra_ws}/scripts/auditar-infra.sh" --help
  assert_success
  run env PATH="${infra_bin}" LC_ALL=C bash "${infra_ws}/scripts/auditar-infra.sh" --bogus
  assert_failure 1
  run env PATH="${infra_bin}" LC_ALL=C bash "${infra_ws}/scripts/auditar-infra.sh" --static-only
  assert_success
  assert_output --partial "QA-CI-ESCAPE-01"

  # Sin docker en PATH debe emitir error claro de Regla Cero (no falso reporte Trivy)
  run env PATH="${infra_bin}" LC_ALL=C bash "${infra_ws}/scripts/auditar-infra.sh"
  assert_failure 1
  assert_output --partial "Se requiere Docker disponible en PATH"

  # Violación QA-CI-ESCAPE-01 y QA-MAKE-CURDIR-01 en auditar-infra.sh y en certify fallback
  printf 'jobs:\n  t:\n    steps:\n      - run: echo "$$(BAD_ESC)"\n' >"${infra_ws}/.github/workflows/bad.yml"
  printf 'qa-unit:\n\t@echo "$(PWD)"\n' >"${infra_ws}/fastapi/Makefile.example"
  run env PATH="${infra_bin}" LC_ALL=C bash "${infra_ws}/scripts/auditar-infra.sh" --static-only
  assert_failure 1
  assert_output --partial "QA-CI-ESCAPE-01"
  assert_output --partial "QA-MAKE-CURDIR-01"

  # Fallback de certify_task_completion.sh cuando scripts/auditar-infra.sh no está
  local fb_ws="${BATS_TEST_TMPDIR}/cert_fb_ws"
  mkdir -p "${fb_ws}/.agents/scripts" "${fb_ws}/.github/workflows" "${fb_ws}/fastapi"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${fb_ws}/.agents/scripts/certify_task_completion.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${fb_ws}/verificar-secretos.sh"
  chmod +x "${fb_ws}/.agents/scripts/certify_task_completion.sh" "${fb_ws}/verificar-secretos.sh"
  printf 'jobs:\n  t:\n    steps:\n      - run: echo "$$(BAD_ESC)"\n' >"${fb_ws}/.github/workflows/bad.yml"
  printf 'qa-unit:\n\t@echo "${PWD}"\n' >"${fb_ws}/fastapi/Makefile"
  (
    cd "${fb_ws}" && git init -q && git config user.email a@b.c && git config user.name a && git add . && git commit -qm init
  )
  run env PATH="${infra_bin}:/usr/bin:/bin" LC_ALL=C bash "${fb_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "QA-CI-ESCAPE-01"
  assert_output --partial "QA-MAKE-CURDIR-01"

  # Fallback limpio (exit 20 -> SKIPPED) + raíz auditar-infra.sh fallback + --help / opción inválida
  printf 'jobs:\n  t:\n    steps:\n      - run: echo "$(OK)"\n' >"${fb_ws}/.github/workflows/bad.yml"
  printf 'qa-unit:\n\t@echo "$(CURDIR)"\n' >"${fb_ws}/fastapi/Makefile"
  run env PATH="${infra_bin}:/usr/bin:/bin" LC_ALL=C bash "${fb_ws}/.agents/scripts/certify_task_completion.sh" --help
  assert_success
  run env PATH="${infra_bin}:/usr/bin:/bin" LC_ALL=C bash "${fb_ws}/.agents/scripts/certify_task_completion.sh" --unknown-flag
  assert_failure 1
  run env PATH="${infra_bin}:/usr/bin:/bin" LC_ALL=C bash "${fb_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "SKIPPED: Script auditar-infra.sh no encontrado"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${fb_ws}/auditar-infra.sh"
  chmod +x "${fb_ws}/auditar-infra.sh"
  run env PATH="${infra_bin}:/usr/bin:/bin" LC_ALL=C bash "${fb_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "[2/10] ✔ [Trivy IaC & FS] OK"

  # Trivy config fail & Trivy fs fail en auditar-infra.sh con docker stub
  rm -f "${infra_ws}/.github/workflows/bad.yml" "${infra_ws}/fastapi/Makefile.example"
  cat >"${infra_bin}/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *" config "* ]] && [[ "${FAIL_STEP:-}" == "config" ]]; then
  echo "HIGH: fake iac misconfig"
  exit 1
fi
if [[ "$*" == *" fs "* ]] && [[ "${FAIL_STEP:-}" == "fs" ]]; then
  echo "CRITICAL: fake cve"
  exit 1
fi
exit 0
EOF
  chmod +x "${infra_bin}/docker"
  run env FAIL_STEP=config PATH="${infra_bin}" LC_ALL=C bash "${infra_ws}/scripts/auditar-infra.sh" --force
  assert_failure 1
  assert_output --partial "Trivy IaC"
  run env FAIL_STEP=fs PATH="${infra_bin}" LC_ALL=C bash "${infra_ws}/scripts/auditar-infra.sh" --force
  assert_failure 1
  assert_output --partial "Trivy FS"
}

@test "instalar-hooks.sh: falla fuera de git y activa lefthook cuando existe en PATH" {
  local nogit_ws="${BATS_TEST_TMPDIR}/nogit_hooks"
  local lh_bin="${BATS_TEST_TMPDIR}/lh_bin"
  mkdir -p "${nogit_ws}" "${lh_bin}"
  run env QA11X_REPO_ROOT="${nogit_ws}" LC_ALL=C bash "${REPO_ROOT}/instalar-hooks.sh"
  assert_failure 1
  assert_output --partial "No se encontró un repositorio Git válido"

  local git_lh_ws="${BATS_TEST_TMPDIR}/git_lh_ws"
  mkdir -p "${git_lh_ws}"
  (cd "${git_lh_ws}" && git init -q)
  printf '#!/usr/bin/env bash\necho "lefthook installed"\nexit 0\n' >"${lh_bin}/lefthook"
  chmod +x "${lh_bin}/lefthook"
  run env QA11X_REPO_ROOT="${git_lh_ws}" PATH="${lh_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/instalar-hooks.sh"
  assert_success
  assert_output --partial "Barrera Lefthook activada"
}

_setup_pub_cli_ws() {
  local pub_ws="${BATS_TEST_TMPDIR}/pub_cli_ws"
  mkdir -p "${pub_ws}/scripts"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${pub_ws}/scripts/limpieza.sh"
  chmod +x "${pub_ws}/scripts/limpieza.sh"
  printf '%s\n' "${pub_ws}"
}

@test "publicar-mcp.sh: --help muestra ayuda completa y sale 0" {
  local pub_ws
  pub_ws="$(_setup_pub_cli_ws)"
  run env QA11X_REPO_ROOT="${pub_ws}" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --help
  assert_success
  assert_output --partial "NPM_TOKEN"
}

@test "publicar-mcp.sh: --otp sin argumento falla con codigo 1" {
  local pub_ws
  pub_ws="$(_setup_pub_cli_ws)"
  run env QA11X_REPO_ROOT="${pub_ws}" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --otp
  assert_failure 1
  assert_output --partial "requiere un código"
}

@test "publicar-mcp.sh: --otp= vacio falla con codigo 1" {
  local pub_ws
  pub_ws="$(_setup_pub_cli_ws)"
  run env QA11X_REPO_ROOT="${pub_ws}" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --otp=
  assert_failure 1
  assert_output --partial "requiere un código"
}

@test "publicar-mcp.sh: flag desconocida falla con codigo 1" {
  local pub_ws
  pub_ws="$(_setup_pub_cli_ws)"
  run env QA11X_REPO_ROOT="${pub_ws}" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --bad-flag
  assert_failure 1
  assert_output --partial "Opción no reconocida"
}

@test "publicar-mcp.sh: package.json ausente falla con codigo 1" {
  local pub_ws
  pub_ws="$(_setup_pub_cli_ws)"
  run env QA11X_REPO_ROOT="${pub_ws}" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --otp 123456 --dry-run
  assert_failure 1
  assert_output --partial "No se encontró mcp-server/package.json"
}

@test "publicar-mcp.sh: cubre NPM_TOKEN ausente, REMOTE_EXISTS y bucle CDN" {
  local pub_ws="${BATS_TEST_TMPDIR}/pub_extra_ws"
  local pub_bin="${BATS_TEST_TMPDIR}/pub_extra_bin"
  mkdir -p "${pub_ws}/scripts" "${pub_ws}/mcp-server/src" "${pub_ws}/mcp-server/dist" "${pub_ws}/mcp-server/node_modules/.bin" "${pub_bin}"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${pub_ws}/scripts/limpieza.sh"
  chmod +x "${pub_ws}/scripts/limpieza.sh"
  printf '{"name":"@sinfallas/mcp-qa-11x","version":"3.2.0"}\n' >"${pub_ws}/mcp-server/package.json"
  printf 'pre-commit:\n  parallel: false\n' >"${pub_ws}/lefthook.yml"
  printf 'export const x = 1;\n' >"${pub_ws}/mcp-server/src/index.ts"
  touch -t 202601010000 "${pub_ws}/mcp-server/src/index.ts"
  printf 'export const x = 1;\n' >"${pub_ws}/mcp-server/dist/index.js"
  touch -t 202601010001 "${pub_ws}/mcp-server/dist/index.js"

  # Sin NPM_TOKEN en modo vivo falla con instrucciones
  run env -u NPM_TOKEN QA11X_REPO_ROOT="${pub_ws}" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh"
  assert_failure 1
  assert_output --partial "NPM_TOKEN no configurada"

  # Stub docker + no-op sleep para cubrir REMOTE_EXISTS (dry-run y live) y bucle CDN
  printf '#!/usr/bin/env bash\nexit 0\n' >"${pub_bin}/sleep"
  cat >"${pub_bin}/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"npm view"* ]]; then
  if [[ "${MOCK_REMOTE:-none}" == "exists" ]]; then
    echo "3.2.0"
    exit 0
  fi
  if [[ "${MOCK_REMOTE:-none}" == "cdn_delay" ]]; then
    c_file="${CDN_COUNT_FILE:-/tmp/cdn_cnt}"
    n=0
    [ -f "$c_file" ] && n=$(cat "$c_file")
    n=$((n + 1))
    echo "$n" >"$c_file"
    if [ "$n" -eq 1 ]; then
      exit 1
    fi
    echo ""
    exit 0
  fi
  exit 1
fi
exit 0
EOF
  chmod +x "${pub_bin}/sleep" "${pub_bin}/docker"

  run env MOCK_REMOTE=exists QA11X_REPO_ROOT="${pub_ws}" PATH="${pub_bin}:/usr/bin:/bin" LC_ALL=C "${REPO_ROOT}/scripts/publicar-mcp.sh" --dry-run --skip-tests
  assert_success
  assert_output --partial "esperado en simulación"

  run env NPM_TOKEN="npm_realMock1234567890" MOCK_REMOTE=exists QA11X_REPO_ROOT="${pub_ws}" PATH="${pub_bin}:/usr/bin:/bin" LC_ALL=C "${REPO_ROOT}/scripts/publicar-mcp.sh" --skip-tests # qa-secret-fixture-ok
  assert_failure 1
  assert_output --partial "ya está publicada en npmjs.org"

  local cdn_cnt="${BATS_TEST_TMPDIR}/cdn_cnt"
  rm -f "${cdn_cnt}"
  run env NPM_TOKEN="npm_realMock1234567890" MOCK_REMOTE=cdn_delay CDN_COUNT_FILE="${cdn_cnt}" QA11X_REPO_ROOT="${pub_ws}" PATH="${pub_bin}:/usr/bin:/bin" LC_ALL=C "${REPO_ROOT}/scripts/publicar-mcp.sh" --skip-tests --otp=654321 # qa-secret-fixture-ok
  assert_success
  assert_output --partial "aún está procesando la propagación"
}

@test "generar-sbom-cyclonedx.sh: cubre fallback de symlink sin realpath en PATH" {
  local sb_ws="${BATS_TEST_TMPDIR}/sb_noreal_ws"
  local sb_out="${BATS_TEST_TMPDIR}/sb_noreal_out"
  local sb_bin="${BATS_TEST_TMPDIR}/sb_noreal_bin"
  mkdir -p "${sb_ws}/scripts" "${sb_out}" "${sb_bin}"
  cp "${REPO_ROOT}/scripts/generar-sbom-cyclonedx.sh" "${sb_ws}/scripts/generar-sbom-cyclonedx.sh"
  chmod +x "${sb_ws}/scripts/generar-sbom-cyclonedx.sh"
  ln -s "${sb_out}" "${sb_ws}/sym_escape"
  for tool in bash sh dirname basename pwd mkdir ln cat rm date env id chmod tr sha256sum sed awk; do
    resolved="$(command -v "${tool}" || true)"
    [ -n "${resolved}" ] && ln -sf "${resolved}" "${sb_bin}/${tool}"
  done

  run env PATH="${sb_bin}" LC_ALL=C bash "${sb_ws}/scripts/generar-sbom-cyclonedx.sh" "sym_escape/out.json"
  assert_failure 1
  assert_output --partial "escapa del repositorio vía enlace simbólico"
}

@test "certify_task_completion.sh y instalar-hooks.sh: soportan rutas UTF-8 no-ASCII (core.quotePath=false)" {
  local utf_ws="${BATS_TEST_TMPDIR}/cert_utf8_ws"
  local utf_bin="${BATS_TEST_TMPDIR}/cert_utf8_bin"
  mkdir -p "${utf_ws}/.agents/scripts" "${utf_ws}/scripts" "${utf_ws}/graphify-out" "${utf_bin}"
  printf '{"nodes":[],"links":[]}\n' >"${utf_ws}/graphify-out/graph.json"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${utf_ws}/.agents/scripts/certify_task_completion.sh"
  cp "${REPO_ROOT}/scripts/verificar-secretos.sh" "${utf_ws}/scripts/verificar-secretos.sh"
  cp "${REPO_ROOT}/instalar-hooks.sh" "${utf_ws}/instalar-hooks.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${utf_ws}/scripts/auditar-infra.sh"
  chmod +x "${utf_ws}/.agents/scripts/certify_task_completion.sh" "${utf_ws}/scripts/verificar-secretos.sh" "${utf_ws}/instalar-hooks.sh" "${utf_ws}/scripts/auditar-infra.sh"

  for stub_py in \
    verify_json_no_duplicate_keys.py \
    verify_zero_orphan_vue_components.py \
    verify_no_orphan_api_endpoints.py \
    verify_topological_health.py \
    verify_alembic_orm_parity.py \
    verify_roadmap_consistency.py; do
    printf 'print("✔ [%s] stub OK")\n' "${stub_py}" >"${utf_ws}/.agents/scripts/${stub_py}"
  done
  printf 'print("✔ [generar-manifiesto] stub OK")\n' >"${utf_ws}/scripts/generar-manifiesto.py"

  printf '#!/usr/bin/env bash\nexit 0\n' >"${utf_bin}/docker"
  chmod +x "${utf_bin}/docker"

  (
    cd "${utf_ws}"
    git init -q
    git config user.email "qa@example.com"
    git config user.name "QA"
    printf '#!/usr/bin/env bash\necho ok\n' >"scripts/café.sh"
    git add .
    git commit -qm init
    printf '#!/usr/bin/env bash\necho changed\n' >"scripts/café.sh"
  )

  run env QA11X_STRICT=0 PATH="${utf_bin}:/usr/bin:/bin" LC_ALL=C.UTF-8 bash "${utf_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "QA-TEST-SYNC-01"
  assert_output --partial "scripts/café.sh"

  (
    cd "${utf_ws}"
    git checkout -- "scripts/café.sh"
    printf 'x = 1\n' >"café.py"
    git add "café.py"
  )
  run env PATH="${utf_bin}:/usr/bin:/bin" LC_ALL=C.UTF-8 bash "${utf_ws}/instalar-hooks.sh"
  assert_success
  assert_output --partial "Barrera Git POSIX activada"
  grep -q '/cov-out/mcp-server.info' "${utf_ws}/.git/hooks/pre-push"
  grep -q '/cov-out/bash.xml' "${utf_ws}/.git/hooks/pre-push"

  run env PATH="${utf_bin}:/usr/bin:/bin" LC_ALL=C.UTF-8 bash -c 'cd "$1" && ./.git/hooks/pre-commit' _ "${utf_ws}"
  assert_success
}

@test "verificar-secretos.sh: bloquea .env sin trackear en modo git sin argumentos" {
  local git_env_ws="${BATS_TEST_TMPDIR}/git_env_ws"
  mkdir -p "${git_env_ws}"
  git -C "${git_env_ws}" init -q
  git -C "${git_env_ws}" config user.email "qa@example.com"
  git -C "${git_env_ws}" config user.name "QA"
  printf '# Repo clean\n' >"${git_env_ws}/README.md"
  git -C "${git_env_ws}" add README.md
  git -C "${git_env_ws}" commit -qm "chore: init"

  # 1. .env.example sin trackear está permitido en descubrimiento automático git
  printf 'DEBUG=true\nADMIN_USER=root\n' >"${git_env_ws}/.env.example"
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh"' _ "${git_env_ws}" "${REPO_ROOT}"
  assert_success
  assert_output --partial "0 secretos expuestos"

  # 2. .env sin trackear (sin patrones de secreto largo) debe bloquearse con 0 argumentos
  printf 'DEBUG=true\nADMIN_USER=root\n' >"${git_env_ws}/.env"
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh"' _ "${git_env_ws}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial "Archivo sensible .env bloqueado"

  # 3. Paridad con argumento explícito .env
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh" .env' _ "${git_env_ws}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial "Archivo sensible .env bloqueado"

  # 4. .env trackeado en índice Git también falla inmediatamente
  git -C "${git_env_ws}" add -f .env
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh"' _ "${git_env_ws}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial "Archivo sensible trackeado en Git"
}

@test "certify_task_completion.sh: rechaza symlinks en QA_DIAGNOSTIC_JSON sin sobrescribir archivos externos" {
  local diag_ws="${BATS_TEST_TMPDIR}/diag_sym_ws"
  local outside_dir="${BATS_TEST_TMPDIR}/diag_outside"
  mkdir -p "${diag_ws}/.agents/scripts" "${diag_ws}/scripts" "${outside_dir}"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${diag_ws}/.agents/scripts/certify_task_completion.sh"
  cp "${REPO_ROOT}/scripts/verificar-secretos.sh" "${diag_ws}/scripts/verificar-secretos.sh"
  chmod +x "${diag_ws}/.agents/scripts/certify_task_completion.sh" "${diag_ws}/scripts/verificar-secretos.sh"

  git -C "${diag_ws}" init -q
  git -C "${diag_ws}" config user.email "qa@example.com"
  git -C "${diag_ws}" config user.name "QA"
  printf '# clean\n' >"${diag_ws}/README.md"
  git -C "${diag_ws}" add .
  git -C "${diag_ws}" commit -qm "chore: init"
  printf 'DEBUG=true\n' >"${diag_ws}/.env"

  local victim_file="${outside_dir}/victim.txt"
  printf 'KEEP_SAFE_ORIGINAL\n' >"${victim_file}"
  chmod 0644 "${victim_file}"
  ln -s "${victim_file}" "${diag_ws}/sym_diag.json"
  ln -s "${outside_dir}" "${diag_ws}/.agents/sym_dir"

  # 1. Symlink directo en QA_DIAGNOSTIC_JSON no sobrescribe victim.txt
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" QA_DIAGNOSTIC_JSON="${diag_ws}/sym_diag.json" LC_ALL=C bash "${diag_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "Ruta symlink rechazada por seguridad"
  [ "$(cat "${victim_file}")" = "KEEP_SAFE_ORIGINAL" ]

  # 2. Ancestro symlink en QA_DIAGNOSTIC_JSON no crea subdirectorios ni escribe fuera
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" QA_DIAGNOSTIC_JSON="${diag_ws}/.agents/sym_dir/sub/diag.json" LC_ALL=C bash "${diag_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "Ruta symlink rechazada por seguridad"
  [ ! -e "${outside_dir}/sub" ]

  # 3. Ruta legítima bajo /tmp escribe JSON diagnóstico válido (cubre rama /tmp/*)
  local legit_diag="${BATS_TEST_TMPDIR}/diag_legit/failure.json"
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" QA_DIAGNOSTIC_JSON="${legit_diag}" LC_ALL=C bash "${diag_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  [ -f "${legit_diag}" ]

  # 4. Helper Python embebido también rechaza symlinks directos y ancestrales de forma independiente
  local py_helper="${BATS_TEST_TMPDIR}/certify_diag_helper.py"
  awk '/^PYEOF$/{flag=0} flag{print} /<<'\''PYEOF'\''/{flag=1}' "${diag_ws}/.agents/scripts/certify_task_completion.sh" >"${py_helper}"
  local py_log="${BATS_TEST_TMPDIR}/py_diag_log.txt"
  local py_steps="${BATS_TEST_TMPDIR}/py_diag_steps.txt"
  printf 'Gate 1 failed\n' >"${py_log}"
  printf '1/10|Secret Audit|failed\n' >"${py_steps}"

  run env QA_LOG_FILE="${py_log}" QA_STEPS_FILE="${py_steps}" QA_GATE_NUM="1" QA_GATE_NAME="Secret Audit" QA_CMD="bash scripts/verificar-secretos.sh" QA_RC="1" QA_REMEDIATION="fix" QA_DIAG_PATH="${diag_ws}/sym_diag.json" python3 "${py_helper}"
  assert_failure 1
  assert_output --partial "Symlink no permitido en QA_DIAG_PATH"
  [ "$(cat "${victim_file}")" = "KEEP_SAFE_ORIGINAL" ]

  run env QA_LOG_FILE="${py_log}" QA_STEPS_FILE="${py_steps}" QA_GATE_NUM="1" QA_GATE_NAME="Secret Audit" QA_CMD="bash scripts/verificar-secretos.sh" QA_RC="1" QA_REMEDIATION="fix" QA_DIAG_PATH="${diag_ws}/.agents/sym_dir/sub/diag.json" python3 "${py_helper}"
  assert_failure 1
  assert_output --partial "Symlink no permitido en QA_DIAG_PATH"
  [ ! -e "${outside_dir}/sub" ]
}

@test "certify_task_completion.sh: bloquea traversal '..' con symlinks en QA_DIAGNOSTIC_JSON y helper Python" {
  local trav_ws="${BATS_TEST_TMPDIR}/diag_trav_ws"
  local outside_dir="${BATS_TEST_TMPDIR}/diag_trav_outside"
  mkdir -p "${trav_ws}/.agents/scripts" "${trav_ws}/scripts" "${outside_dir}/nested"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${trav_ws}/.agents/scripts/certify_task_completion.sh"
  cp "${REPO_ROOT}/scripts/verificar-secretos.sh" "${trav_ws}/scripts/verificar-secretos.sh"
  chmod +x "${trav_ws}/.agents/scripts/certify_task_completion.sh" "${trav_ws}/scripts/verificar-secretos.sh"

  git -C "${trav_ws}" init -q
  git -C "${trav_ws}" config user.email "qa@example.com"
  git -C "${trav_ws}" config user.name "QA"
  printf '# clean\n' >"${trav_ws}/README.md"
  git -C "${trav_ws}" add .
  git -C "${trav_ws}" commit -qm "chore: init"
  printf 'DEBUG=true\n' >"${trav_ws}/.env"

  local pwn_file="${outside_dir}/pwn.json"
  printf 'ORIG_VICTIM\n' >"${pwn_file}"
  chmod 0644 "${pwn_file}"
  ln -s "${outside_dir}/nested" "${trav_ws}/nest_sym"
  ln -s "${outside_dir}" "${trav_ws}/anc_sym"

  # 1. nonexistent/../nest_sym/../pwn.json rechazado antes de mkdir y sin sobrescribir pwn.json
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" QA_DIAGNOSTIC_JSON="${trav_ws}/nonexistent/../nest_sym/../pwn.json" LC_ALL=C bash "${trav_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "Ruta symlink rechazada por seguridad"
  [ ! -e "${trav_ws}/nonexistent" ]
  [ "$(cat "${pwn_file}")" = "ORIG_VICTIM" ]

  # 2. nonexistent/../anc_sym/pwn.json rechazado antes de mkdir y montaje Docker
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" QA_DIAGNOSTIC_JSON="${trav_ws}/nonexistent/../anc_sym/pwn.json" LC_ALL=C bash "${trav_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "Ruta symlink rechazada por seguridad"
  [ ! -e "${trav_ws}/nonexistent" ]
  [ "$(cat "${pwn_file}")" = "ORIG_VICTIM" ]

  # 3. Segmento '.' seguido de symlink también es rechazado por diag_has_symlink_segment
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" QA_DIAGNOSTIC_JSON="${trav_ws}/./anc_sym/pwn.json" LC_ALL=C bash "${trav_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "Ruta symlink rechazada por seguridad"
  [ "$(cat "${pwn_file}")" = "ORIG_VICTIM" ]

  # 4. Helper Python embebido rechaza nest_sym/../py_escape.json sin normalizar '..'
  local py_helper="${BATS_TEST_TMPDIR}/certify_trav_helper.py"
  awk '/^PYEOF$/{flag=0} flag{print} /<<'\''PYEOF'\''/{flag=1}' "${trav_ws}/.agents/scripts/certify_task_completion.sh" >"${py_helper}"
  local py_log="${BATS_TEST_TMPDIR}/py_trav_log.txt"
  local py_steps="${BATS_TEST_TMPDIR}/py_trav_steps.txt"
  printf 'Gate 1 failed\n' >"${py_log}"
  printf '1/10|Secret Audit|failed\n' >"${py_steps}"

  run env QA_LOG_FILE="${py_log}" QA_STEPS_FILE="${py_steps}" QA_GATE_NUM="1" QA_GATE_NAME="Secret Audit" QA_CMD="bash scripts/verificar-secretos.sh" QA_RC="1" QA_REMEDIATION="fix" QA_DIAG_PATH="${trav_ws}/nest_sym/../py_escape.json" python3 "${py_helper}"
  assert_failure 1
  assert_output --partial "Symlink no permitido en QA_DIAG_PATH"
  [ ! -e "${outside_dir}/py_escape.json" ]
}

@test "verificar-secretos.sh: escanea archivos staged en repo Git sin HEAD con untracked presentes" {
  local unborn_ws="${BATS_TEST_TMPDIR}/unborn_head_ws"
  mkdir -p "${unborn_ws}"
  git -C "${unborn_ws}" init -q
  git -C "${unborn_ws}" config user.email "qa@example.com"
  git -C "${unborn_ws}" config user.name "QA"

  local synth_aws="AKIA""1234567890ABCDEF"
  printf 'KEY = "%s"\n' "${synth_aws}" >"${unborn_ws}/staged_secret.py"
  git -C "${unborn_ws}" add staged_secret.py
  printf 'hello\n' >"${unborn_ws}/README.md"

  # 1. Repo sin HEAD con secreto staged y archivo untracked limpio: bloqueado con 0 args
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh"' _ "${unborn_ws}" "${REPO_ROOT}"
  assert_failure 1
  assert_output --partial "staged_secret.py"

  # 2. Reemplazar secreto staged por contenido limpio: escanea ambos archivos y aprueba
  printf 'KEY = "clean_value"\n' >"${unborn_ws}/staged_secret.py"
  git -C "${unborn_ws}" add staged_secret.py
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh"' _ "${unborn_ws}" "${REPO_ROOT}"
  assert_success
  assert_output --partial "0 secretos expuestos (2 archivos escaneados)"

  # 3. Commit inicial y borrado staged (git rm): excluye archivos borrados sin fallar
  git -C "${unborn_ws}" add README.md
  git -C "${unborn_ws}" commit -qm "chore: init"
  git -C "${unborn_ws}" rm -q staged_secret.py
  printf 'notes\n' >"${unborn_ws}/notes.txt"
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh"' _ "${unborn_ws}" "${REPO_ROOT}"
  assert_success
  assert_output --partial "0 secretos expuestos (1 archivos escaneados)"
}

@test "bash-scripts/Makefile.example: kcov rootless cubre source, rutas relativas, espacios en BATS_TARGETS y reutilizacion FD excluyendo common_files y <!DOCTYPE" {
  local ws="${BATS_TEST_TMPDIR}/rootless_kcov_ws"
  local ktmp="${BATS_TEST_TMPDIR}/ktmp"
  local kout="${BATS_TEST_TMPDIR}/kout"
  mkdir -p "${ws}/scripts" "${ws}/tests/my suite" "${ktmp}"

  for vendored in limpieza.sh instalar-hooks.sh scripts/auditar-pagespeed.sh scripts/install-skill.sh scripts/verificar-secretos.sh scripts/auditar-infra.sh scripts/actualizar-grafos-graphify.sh scripts/generar-sbom-cyclonedx.sh; do
    cat >"${ws}/${vendored}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "vendored-never-executed-1"
echo "vendored-never-executed-2"
EOF
    chmod +x "${ws}/${vendored}"
  done

  cat >"${ws}/scripts/lib.sh" <<'EOF'
#!/usr/bin/env bash
helper_msg() {
  printf 'lib:%s\n' "$1"
}
EOF
  cat >"${ws}/scripts/runner.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib.sh"
helper_msg "${1:-default}"
printf 'clean-err\n' >&2
EOF
  chmod +x "${ws}/scripts/lib.sh" "${ws}/scripts/runner.sh"

  cat >"${ws}/tests/my suite/test_flow.bats" <<'EOF'
#!/usr/bin/env bats
bats_require_minimum_version 1.5.0
setup() {
  export _USER="${_USER:-qa}"
  load '/opt/bats-libs/bats-support/load.bash'
  load '/opt/bats-libs/bats-assert/load.bash'
}
@test "source directo y ruta relativa sin contaminar stdout/stderr" {
  source ./scripts/lib.sh
  run helper_msg "plain"
  assert_success
  assert_output "lib:plain"

  run --separate-stderr helper_msg "src"
  assert_success
  assert_output "lib:src"
  [ -z "${stderr}" ]

  run --separate-stderr ./scripts/runner.sh "rel"
  assert_success
  assert_output "lib:rel"
  [ "${stderr}" = "clean-err" ]
}
@test "subproceso python3 close_fds y reutilizacion de FD regular no filtran BASH_XTRACEFD ni PS4" {
  run python3 -c '
import os, subprocess, sys, tempfile
r = subprocess.run(["bash", "./scripts/runner.sh", "py"], capture_output=True, text=True)
kfd = int(os.environ.get("KCOV_BASH_XTRACEFD", "256"))
tmpf = tempfile.NamedTemporaryFile("w+", delete=False)
tmpf.write("{\"clean\":true}")
tmpf.flush()
os.dup2(tmpf.fileno(), kfd)
os.set_inheritable(kfd, True)
r2 = subprocess.run(["bash", "./scripts/runner.sh", "fdreuse"], close_fds=False, capture_output=True, text=True)
tmpf.close()
content = open(tmpf.name, encoding="utf-8").read()
os.unlink(tmpf.name)
sys.stdout.write(f"{r.stdout.strip()}|{r.stderr.strip()}|{r2.stdout.strip()}|{content}")
'
  assert_success
  assert_output 'lib:py|clean-err|lib:fdreuse|{"clean":true}'
}
EOF

  local recipe_file="${BATS_TEST_TMPDIR}/qa_unit_recipe.sh"
  python3 -c '
import pathlib, shlex, sys
for ln in pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    if ln.startswith("\t@docker compose") and "kcov" in ln:
        sys.stdout.write(shlex.split(ln.lstrip("\t@").replace("$$", "$"))[-1])
' "${REPO_ROOT}/bash-scripts/Makefile.example" >"${recipe_file}"

  run bash -c 'cd "$1" && QA_BATS_TARGETS="tests/my suite" QA_KCOV_TMP="$2" QA_KCOV_OUT="$3" bash "$4"' _ "${ws}" "${ktmp}" "${kout}" "${recipe_file}"
  assert_success
  assert_output --partial "Cobertura kcov: 100.00% (umbral >= 95.0%)"
  [ -f "${ws}/.agents/.cache/coverage/bash.xml" ]
  run grep -i "<!DOCTYPE" "${ws}/.agents/.cache/coverage/bash.xml"
  assert_failure 1
}

@test "certify_task_completion.sh: Consumer Governance Maintenance Fast-Path permite cambios solo en gobernanza QA-11X" {
  local cons_ws="${BATS_TEST_TMPDIR}/cons_fastpath_ws"
  local cons_bin="${BATS_TEST_TMPDIR}/cons_fastpath_bin"
  mkdir -p "${cons_ws}/.agents/scripts" "${cons_ws}/scripts" "${cons_ws}/app" "${cons_bin}"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${cons_ws}/.agents/scripts/certify_task_completion.sh"
  chmod +x "${cons_ws}/.agents/scripts/certify_task_completion.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${cons_ws}/scripts/verificar-secretos.sh"
  chmod +x "${cons_ws}/scripts/verificar-secretos.sh"
  printf 'x = 1\n' >"${cons_ws}/app/main.py"
  printf '# Agents\n' >"${cons_ws}/AGENTS.md"
  printf '**Estado:** `COMPLETED`\n' >"${cons_ws}/.agents/ACTIVE_TASK.md"

  cat >"${cons_bin}/docker" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "${cons_bin}/docker"

  git -C "${cons_ws}" init -q
  git -C "${cons_ws}" config user.email "qa@example.com"
  git -C "${cons_ws}" config user.name "QA"
  git -C "${cons_ws}" add .
  git -C "${cons_ws}" commit -qm "init"

  printf '<!-- QA_11X_MCP_CONNECTOR_START -->\n# Slim\n<!-- QA_11X_MCP_CONNECTOR_END -->\n' >"${cons_ws}/AGENTS.md"
  cat >"${cons_ws}/.agents/scripts/verify_docs_invariants.py" <<'PY'
import sys
sys.exit(0)
PY

  cd "${cons_ws}"
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" PATH="${cons_bin}:/usr/bin:/bin" LC_ALL=C bash "${cons_ws}/.agents/scripts/certify_task_completion.sh"
  assert_success
  assert_output --partial "Governance Maintenance Fast-Path"
}

@test "generar-sbom-cyclonedx.sh y publicar-mcp.sh: rechazan flags inválidas y preservan NPM_REGISTRY exportado" {
  run bash "${REPO_ROOT}/scripts/generar-sbom-cyclonedx.sh" --output out.json
  assert_failure 1
  assert_output --partial "Demasiados argumentos"

  run bash "${REPO_ROOT}/scripts/generar-sbom-cyclonedx.sh" --unknown-flag
  assert_failure 1
  assert_output --partial "Opción no reconocida"

  run env NPM_REGISTRY="https://registry.corp.example/" bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --help
  assert_success
  assert_output --partial "publicar-mcp.sh"
}

@test "certify_task_completion.sh: reutiliza sesión Python efímera (docker run -d + docker exec + docker rm -f)" {
  local sess_ws="${BATS_TEST_TMPDIR}/py_sess_ws"
  local sess_bin="${BATS_TEST_TMPDIR}/py_sess_bin"
  local docker_log="${BATS_TEST_TMPDIR}/py_sess_docker.log"
  mkdir -p "${sess_ws}/.agents/scripts" "${sess_ws}/scripts" "${sess_bin}"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${sess_ws}/.agents/scripts/"
  chmod +x "${sess_ws}/.agents/scripts/certify_task_completion.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${sess_ws}/scripts/verificar-secretos.sh"
  chmod +x "${sess_ws}/scripts/verificar-secretos.sh"
  printf '# Agents\n' >"${sess_ws}/AGENTS.md"
  printf '**Estado:** `COMPLETED`\n' >"${sess_ws}/.agents/ACTIVE_TASK.md"
  printf 'import sys; sys.exit(0)\n' >"${sess_ws}/.agents/scripts/verify_json_no_duplicate_keys.py"
  printf 'import sys; sys.exit(0)\n' >"${sess_ws}/.agents/scripts/track_findings_state.py"

  cat >"${sess_bin}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${docker_log}"
if [ "\${1:-}" = "run" ] && [[ " \$* " == *" -d "* ]]; then
  printf 'deadbeef1234\n'
  exit 0
fi
if [ "\${1:-}" = "exec" ]; then
  exit 0
fi
if [ "\${1:-}" = "rm" ]; then
  exit 0
fi
exit 0
EOF
  chmod +x "${sess_bin}/docker"

  git -C "${sess_ws}" init -q
  git -C "${sess_ws}" config user.email "qa@example.com"
  git -C "${sess_ws}" config user.name "QA"
  git -C "${sess_ws}" add .
  git -C "${sess_ws}" commit -qm "init"

  cd "${sess_ws}"
  run env QA11X_DOCKERENV_PATH="${BATS_TEST_TMPDIR}/nonexistent_dockerenv" PATH="${sess_bin}:/usr/bin:/bin" LC_ALL=C bash "${sess_ws}/.agents/scripts/certify_task_completion.sh"
  assert_success
  run grep -F "run --rm --network none --security-opt=no-new-privileges:true -d --restart=no" "${docker_log}"
  assert_success
  run bash -c 'grep -c " -d " "$1"' _ "${docker_log}"
  assert_success
  assert_output "1"
  run grep -F "exec deadbeef1234 python3" "${docker_log}"
  assert_success
  run grep -F "exec -i deadbeef1234 python3" "${docker_log}"
  assert_success
  run grep -F "rm -f deadbeef1234" "${docker_log}"
  assert_success
}

@test "certify_task_completion.sh (Gate 6 v3.9.0): auto-construye graphify-out/graph.json bajo Rule Zero y bloquea si falla o falta Docker" {
  local ast_ws="${BATS_TEST_TMPDIR}/ast_autobuild_ws"
  local ast_bin="${BATS_TEST_TMPDIR}/ast_autobuild_bin"
  local nodk_bin="${BATS_TEST_TMPDIR}/ast_nodk_bin"
  mkdir -p "${ast_ws}/.agents/scripts" "${ast_ws}/scripts" "${ast_ws}/src" "${ast_bin}" "${nodk_bin}"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${ast_ws}/.agents/scripts/"
  chmod +x "${ast_ws}/.agents/scripts/certify_task_completion.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${ast_ws}/scripts/verificar-secretos.sh"
  chmod +x "${ast_ws}/scripts/verificar-secretos.sh"
  printf 'print("✔ [AST] stub OK")\n' >"${ast_ws}/.agents/scripts/verify_topological_health.py"
  printf 'export const v = 1;\n' >"${ast_ws}/src/app.ts"

  for tool in bash sh awk cat chmod cp dirname find git grep head id mkdir mktemp mv python3 readlink realpath rm sed sort stat tail touch tr wc env date; do
    resolved="$(command -v "${tool}" || true)"
    [ -n "${resolved}" ] && ln -sf "${resolved}" "${nodk_bin}/${tool}"
  done

  # 1. Sin docker en PATH y con código fuente -> falla duro [RULE-ZERO][AST-GRAPH]
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" PATH="${nodk_bin}" LC_ALL=C bash "${ast_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "[RULE-ZERO][AST-GRAPH]"

  # 2. Con scripts/actualizar-grafos-graphify.sh que falla -> bloquea
  printf '#!/usr/bin/env bash\nexit 0\n' >"${ast_bin}/docker"
  chmod +x "${ast_bin}/docker"
  printf '#!/usr/bin/env bash\nexit 1\n' >"${ast_ws}/scripts/actualizar-grafos-graphify.sh"
  chmod +x "${ast_ws}/scripts/actualizar-grafos-graphify.sh"
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" PATH="${ast_bin}:/usr/bin:/bin" LC_ALL=C bash "${ast_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "actualizar-grafos-graphify.sh"

  # 3. Con scripts/actualizar-grafos-graphify.sh que sale 0 sin crear graph.json -> bloquea
  printf '#!/usr/bin/env bash\nexit 0\n' >"${ast_ws}/scripts/actualizar-grafos-graphify.sh"
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" PATH="${ast_bin}:/usr/bin:/bin" LC_ALL=C bash "${ast_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "sin generar graphify-out/graph.json"

  # 4. Con scripts/actualizar-grafos-graphify.sh generando graphify-out/graph.json -> pasa Gate 6
  cat >"${ast_ws}/scripts/actualizar-grafos-graphify.sh" <<EOF
#!/usr/bin/env bash
mkdir -p "${ast_ws}/graphify-out"
printf '{"nodes":[],"links":[]}\n' >"${ast_ws}/graphify-out/graph.json"
EOF
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" PATH="${ast_bin}:/usr/bin:/bin" LC_ALL=C bash "${ast_ws}/.agents/scripts/certify_task_completion.sh"
  assert_success
  [ -f "${ast_ws}/graphify-out/graph.json" ]

  # 5. Fallback directo a docker run sin actualizar-grafos-graphify.sh (fallo y éxito)
  rm -rf "${ast_ws}/graphify-out" "${ast_ws}/scripts/actualizar-grafos-graphify.sh"
  printf '#!/usr/bin/env bash\nexit 1\n' >"${ast_bin}/docker"
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" PATH="${ast_bin}:/usr/bin:/bin" LC_ALL=C bash "${ast_ws}/.agents/scripts/certify_task_completion.sh"
  assert_failure 1
  assert_output --partial "en contenedor Docker"

  cat >"${ast_bin}/docker" <<EOF
#!/usr/bin/env bash
mkdir -p "${ast_ws}/graphify-out"
printf '{"nodes":[],"links":[]}\n' >"${ast_ws}/graphify-out/graph.json"
exit 0
EOF
  chmod +x "${ast_bin}/docker"
  run env QA11X_DOCKERENV_PATH="${HERMETIC_DOCKERENV}" PATH="${ast_bin}:/usr/bin:/bin" LC_ALL=C bash "${ast_ws}/.agents/scripts/certify_task_completion.sh"
  assert_success
  [ -f "${ast_ws}/graphify-out/graph.json" ]
}

@test "publicar-mcp.sh (--registry / --registry-only): valida paridad server.json, flujo dry-run, live OIDC/github y errores" {
  local reg_ws="${BATS_TEST_TMPDIR}/mcp_reg_ws"
  local reg_bin="${BATS_TEST_TMPDIR}/mcp_reg_bin"
  mkdir -p "${reg_ws}/mcp-server/src" "${reg_ws}/mcp-server/dist" "${reg_ws}/scripts" "${reg_bin}"
  printf 'export const v = 1;\n' >"${reg_ws}/mcp-server/src/index.ts"
  sleep 1
  printf 'export const v = 1;\n' >"${reg_ws}/mcp-server/dist/index.js"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${reg_ws}/scripts/limpieza.sh"
  chmod +x "${reg_ws}/scripts/limpieza.sh"
  printf '{"name":"@sinfallas/mcp-qa-11x","version":"3.9.0"}\n' >"${reg_ws}/mcp-server/package.json"

  cat >"${reg_bin}/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"mcpName"* ]]; then
  printf '%s\n' "${MOCK_REMOTE_MCP_NAME:-}"
  exit 0
fi
if [[ "$*" == *"npm view"* ]]; then
  if [ "${MOCK_NPM_PUBLISHED:-0}" = "1" ] || { [ -n "${MOCK_NPM_STAMP:-}" ] && [ -f "${MOCK_NPM_STAMP}" ]; }; then
    echo "3.9.0"
    exit 0
  fi
  exit 1
fi
if [[ "$*" == *"npm publish"* ]]; then
  [ -n "${MOCK_NPM_STAMP:-}" ] && touch "${MOCK_NPM_STAMP}"
  exit 0
fi
if [[ "$*" == *"mcp-publisher"* ]]; then
  [ "${MOCK_PUBLISHER_FAIL:-0}" = "1" ] && exit 1
  exit 0
fi
if [[ "$*" == *"/v0.1/servers"* ]]; then
  if [ "${MOCK_INDEXED:-0}" = "1" ]; then
    echo '{"servers":[{"name":"io.github.tecno-consultores/mcp-qa-11x"}]}'
  else
    echo '{"servers":[]}'
  fi
  exit 0
fi
exit 0
EOF
  chmod +x "${reg_bin}/docker"

  # 1. Sin server.json -> falla
  run env QA11X_REPO_ROOT="${reg_ws}" PATH="${reg_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --registry-only --dry-run
  assert_failure 1
  assert_output --partial "No se encontró server.json"

  # 2. server.json sin mcpName en package.json -> falla
  printf '{"name":"io.github.tecno-consultores/mcp-qa-11x","version":"3.8.0"}\n' >"${reg_ws}/server.json"
  run env QA11X_REPO_ROOT="${reg_ws}" PATH="${reg_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --registry-only --dry-run
  assert_failure 1
  assert_output --partial "package.json#mcpName"

  # 3. server.json con versión distinta a package.json -> falla
  printf '{"name":"@sinfallas/mcp-qa-11x","version":"3.9.0","mcpName":"io.github.tecno-consultores/mcp-qa-11x"}\n' >"${reg_ws}/mcp-server/package.json"
  run env QA11X_REPO_ROOT="${reg_ws}" PATH="${reg_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --registry-only --dry-run
  assert_failure 1
  assert_output --partial "server.json#version"

  # 4. --registry-only --dry-run cuando npm aún no expone mcpName -> aviso y éxito (cubre x86_64, arm64 y arch inválida)
  printf '{"name":"io.github.tecno-consultores/mcp-qa-11x","version":"3.9.0"}\n' >"${reg_ws}/server.json"
  run env QA11X_REPO_ROOT="${reg_ws}" MCP_PUBLISHER_ARCH="arm64" PATH="${reg_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --registry-only --dry-run
  assert_success
  assert_output --partial "Aviso [MCP Registry]"
  assert_output --partial "Simulación completada"

  run env QA11X_REPO_ROOT="${reg_ws}" MCP_PUBLISHER_ARCH="riscv64" PATH="${reg_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --registry-only --dry-run
  assert_failure 1
  assert_output --partial "Arquitectura no soportada"

  run env QA11X_REPO_ROOT="${reg_ws}" MCP_PUBLISHER_ARCH="x86_64" PATH="${reg_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --registry-only --dry-run
  assert_success
  assert_output --partial "Simulación completada"

  # 5. --registry-only en vivo sin mcpName remoto en npm -> bloquea fail-closed
  run env QA11X_REPO_ROOT="${reg_ws}" PATH="${reg_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --registry-only
  assert_failure 1
  assert_output --partial "no expone mcpName="

  # 6. --registry-only en vivo cuando mcp-publisher falla -> error claro
  run env QA11X_REPO_ROOT="${reg_ws}" MOCK_REMOTE_MCP_NAME="io.github.tecno-consultores/mcp-qa-11x" MOCK_PUBLISHER_FAIL=1 PATH="${reg_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --registry-only
  assert_failure 1
  assert_output --partial "Falló la validación o publicación con mcp-publisher"

  # 7. --registry-only en vivo con OIDC e indexación inmediata -> éxito
  run env QA11X_REPO_ROOT="${reg_ws}" MOCK_REMOTE_MCP_NAME="io.github.tecno-consultores/mcp-qa-11x" MOCK_INDEXED=1 GITHUB_ACTIONS="true" ACTIONS_ID_TOKEN_REQUEST_URL="https://token.actions.example" PATH="${reg_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --registry-only
  assert_success
  assert_output --partial "auth: github-oidc"
  assert_output --partial "visible en"

  # 8. --registry-only en vivo con github auth e indexación asíncrona -> aviso y éxito
  run env QA11X_REPO_ROOT="${reg_ws}" MOCK_REMOTE_MCP_NAME="io.github.tecno-consultores/mcp-qa-11x" MOCK_INDEXED=0 PATH="${reg_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --registry-only
  assert_success
  assert_output --partial "auth: github"
  assert_output --partial "puede tardar unos segundos"

  # 9. --registry --dry-run --skip-tests -> valida empaquetado npm + server.json
  run env QA11X_REPO_ROOT="${reg_ws}" MOCK_REMOTE_MCP_NAME="io.github.tecno-consultores/mcp-qa-11x" PATH="${reg_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --registry --dry-run --skip-tests
  assert_success
  assert_output --partial "SIMULACIÓN EXITOSA"

  # 10. --registry --skip-tests en vivo -> publica npmjs + MCP Registry
  run env QA11X_REPO_ROOT="${reg_ws}" NPM_TOKEN="npm_realMock1234567890" MOCK_NPM_STAMP="${BATS_TEST_TMPDIR}/npm_pub.stamp" MOCK_REMOTE_MCP_NAME="io.github.tecno-consultores/mcp-qa-11x" MOCK_INDEXED=1 PATH="${reg_bin}:/usr/bin:/bin" LC_ALL=C bash "${REPO_ROOT}/scripts/publicar-mcp.sh" --registry --skip-tests # qa-secret-fixture-ok
  assert_success
  assert_output --partial "PUBLICACIÓN EXITOSA"
}

@test "certify_task_completion.sh (Hito 33): tiers starter/enterprise, QA11X_TIER, CALM en Gate 6 y GITHUB_BASE_REF en Gate 10" {
  local work="${BATS_TEST_TMPDIR}/tier_cert_ws"
  local bin_dir="${BATS_TEST_TMPDIR}/tier_cert_bin"
  mkdir -p "${work}/.agents/scripts" "${work}/scripts" "${work}/app" "${bin_dir}"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${work}/.agents/scripts/certify_task_completion.sh"
  chmod +x "${work}/.agents/scripts/certify_task_completion.sh"

  for tool in bash git grep sed awk sort head tail tr cut wc find mkdir rm cp mv chmod cat printf dirname basename mktemp env id date stat uname readlink realpath python3; do
    resolved="$(command -v "${tool}" || true)"
    [ -n "${resolved}" ] && ln -sf "${resolved}" "${bin_dir}/${tool}"
  done

  cat >"${work}/scripts/verificar-secretos.sh" <<'EOF'
#!/usr/bin/env bash
echo "✔ [Secretos] stub OK"
EOF
  cat >"${work}/scripts/auditar-infra.sh" <<'EOF'
#!/usr/bin/env bash
echo "✔ [Trivy] stub OK"
EOF
  cat >"${work}/.agents/scripts/validate_calm_architecture.sh" <<'EOF'
#!/usr/bin/env bash
echo "✅ [CALM] stub OK"
EOF
  chmod +x "${work}/scripts/verificar-secretos.sh" "${work}/scripts/auditar-infra.sh" "${work}/.agents/scripts/validate_calm_architecture.sh"

  for stub_py in \
    verify_json_no_duplicate_keys.py \
    verify_zero_orphan_vue_components.py \
    verify_no_orphan_api_endpoints.py \
    verify_topological_health.py \
    verify_alembic_orm_parity.py \
    verify_roadmap_consistency.py \
    verify_docs_invariants.py; do
    printf 'print("✔ [%s] stub OK")\n' "${stub_py}" >"${work}/.agents/scripts/${stub_py}"
  done

  # 1. Starter via .qa-11x.json -> omite Gate 2, Gate 6 AST, gates standard y Gate 10 diff/docs
  printf '{"schemaVersion":3,"tier":"starter","tierConfirmedByUser":true}\n' >"${work}/.qa-11x.json"
  printf 'x = 1\n' >"${work}/app/service.py"
  git -C "${work}" init -q -b main
  git -C "${work}" config user.name "QA Bot"
  git -C "${work}" config user.email "qa@example.com"
  git -C "${work}" add .
  git -C "${work}" commit -q -m "chore: init"

  run env QA_IN_CONTAINER=1 PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/certify_task_completion.sh"
  assert_success
  assert_output --partial "Tier: starter"
  assert_output --partial "Trivy IaC omitido en tier starter"
  assert_output --partial "Grafo AST omitido en tier starter"
  assert_output --partial "Doc & Test Sync / cobertura diferencial omitido en tier starter"

  # 2. Enterprise via QA11X_TIER + GITHUB_BASE_REF branch diff (app/service.py + test + docs) + CALM en Gate 6
  mkdir -p "${work}/graphify-out" "${work}/tests"
  printf '{"nodes":[],"links":[]}\n' >"${work}/graphify-out/graph.json"
  git -C "${work}" checkout -q -b feat/hito33
  printf 'x = 2\n' >"${work}/app/service.py"
  printf 'def test_ok(): assert True\n' >"${work}/tests/test_service.py"
  printf '# Notes\n' >"${work}/CHANGELOG.md"
  git -C "${work}" add .
  git -C "${work}" commit -q -m "feat: update service"

  run env QA_IN_CONTAINER=1 QA11X_TIER=enterprise GITHUB_BASE_REF=main PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/certify_task_completion.sh"
  assert_success
  assert_output --partial "Tier: enterprise"
  assert_output --partial "✅ [CALM] stub OK"

  # 3. También cubre origin/${GITHUB_BASE_REF} + CALM existente auditado incluso en tier standard
  git -C "${work}" update-ref refs/remotes/origin/main refs/heads/main
  mkdir -p "${work}/architecture"
  printf '{"nodes":[]}\n' >"${work}/architecture/demo.calm.json"
  printf '{"schemaVersion":3,"tier":"standard","tierConfirmedByUser":true}\n' >"${work}/.qa-11x.json"
  git -C "${work}" add architecture/demo.calm.json .qa-11x.json
  git -C "${work}" commit -q -m "chore: add calm"
  run env QA_IN_CONTAINER=1 QA11X_TIER=standard GITHUB_BASE_REF=main PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/certify_task_completion.sh"
  assert_success
  assert_output --partial "Tier: standard"
  assert_output --partial "✅ [CALM] stub OK"
}
