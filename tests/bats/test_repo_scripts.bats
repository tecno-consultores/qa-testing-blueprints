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
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
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
  run grep -F "qa11x_trivy_cache:/tmp/trivy-cache" "${DOCKER_LOG}"
  assert_success
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
  run grep -F "QA11X_INSIDE_DOCKER=1" "${DOCKER_LOG}"
  assert_success
}

@test "certify_task_completion.sh: cubre QA_DIAGNOSTIC_JSON relativo, fallback HEAD~1..HEAD y verify_diff_coverage en Gate 10" {
  WORK="${BATS_TEST_TMPDIR}/certify_head_cov_ws"
  DIFF_COV_LOG="${BATS_TEST_TMPDIR}/diff_cov_args.log"
  mkdir -p "${WORK}/.agents/scripts" "${WORK}/.agents/.cache/coverage" "${WORK}/scripts" "${WORK}/tests/bats"
  cp "${REPO_ROOT}/.agents/scripts/certify_task_completion.sh" "${WORK}/.agents/scripts/certify_task_completion.sh"
  chmod +x "${WORK}/.agents/scripts/certify_task_completion.sh"

  cat >"${WORK}/scripts/verificar-secretos.sh" <<'EOF'
#!/usr/bin/env bash
echo "secreto rel diag" >&2
exit 1
EOF
  chmod +x "${WORK}/scripts/verificar-secretos.sh"

  # A. QA_DIAGNOSTIC_JSON relativo resuelve contra REPO_ROOT
  run env QA11X_DOCKERENV_PATH="/.dockerenv" QA_DIAGNOSTIC_JSON="./rel-diag/fail.json" LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh"
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

  run env QA11X_DOCKERENV_PATH="/.dockerenv" LC_ALL=C bash "${WORK}/.agents/scripts/certify_task_completion.sh" --strict
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
  run env QA11X_DOCKERENV_PATH="/.dockerenv" LC_ALL=C bash -c 'cd "$1" && bash "$2/scripts/verificar-secretos.sh"' _ "${clean_room}" "${REPO_ROOT}"
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
  mkdir -p "${w3_ws}/.agents/scripts" "${w3_ws}/scripts" "${w3_ws}/catalogs" "${w3_ws}/tests"
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
