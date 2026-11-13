#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

DIAGNOSTIC_JSON_PATH="${QA_DIAGNOSTIC_JSON:-/tmp/qa-11x-last-failure.json}"
GATE_TMP_DIR="$(mktemp -d /tmp/qa11x-certify.XXXXXX)"
GATE_STEPS_LOG="${GATE_TMP_DIR}/steps.log"
: >"${GATE_STEPS_LOG}"

cleanup_certify_tmp() {
  rm -rf "${GATE_TMP_DIR}" 2>/dev/null || true
}
trap cleanup_certify_tmp EXIT

sanitize_shell_text() {
  local raw="$1"
  local esc
  esc=$(printf '\033')
  printf '%s' "${raw}" \
    | sed -E "s/${esc}\\[[0-9;]*[a-zA-Z]//g; s/(Bearer|Basic)[[:space:]]+[^[:space:]\"']+/\\1 [REDACTED]/g; s/(:\\/\\/[^\\/:@]+:)[^\\/@]+(@)/\\1[REDACTED]\\2/g; s/(token|access_token|api_key|apikey|secret|password|passwd)=[^[:space:]\"'&]+/\\1=[REDACTED]/g"
}

write_allure_failure_json() {
  local gate_num="$1"
  local gate_name="$2"
  local cmd_display="$3"
  local rc="$4"
  local remediation="$5"
  local gate_log="$6"

  if ! command -v python3 >/dev/null 2>&1; then
    return 0
  fi

  QA_DIAG_PATH="${DIAGNOSTIC_JSON_PATH}" \
  QA_GATE_NUM="${gate_num}" \
  QA_GATE_NAME="${gate_name}" \
  QA_CMD="${cmd_display}" \
  QA_RC="${rc}" \
  QA_REMEDIATION="${remediation}" \
  QA_LOG_FILE="${gate_log}" \
  QA_STEPS_FILE="${GATE_STEPS_LOG}" \
  python3 - <<'PYEOF' 2>/dev/null || true
import json
import os
import re
from pathlib import Path

ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
SECRET_RES = (
    (re.compile(r"\b(Bearer|Basic)\s+[^\s\"']+", re.I), r"\1 [REDACTED]"),
    (re.compile(r"(://[^/\s:@]+:)[^/\s@]+(@)"), r"\1[REDACTED]\2"),
    (re.compile(r"\b(token|access_token|api_key|apikey|secret|password|passwd)=[^\s\"'&]+", re.I), r"\1=[REDACTED]"),
    (re.compile(r"(--(?:token|api-key|apikey|secret|password|passwd))\s+[^\s\"']+", re.I), r"\1 [REDACTED]"),
    (re.compile(r"\b(?:ghp|gho|ghs|npm)_[A-Za-z0-9]{16,}\b"), "[REDACTED]"),
)

def scrub(text: str) -> str:
    cleaned = ANSI_RE.sub("", text)
    for pattern, repl in SECRET_RES:
        cleaned = pattern.sub(repl, cleaned)
    return cleaned

log_lines = []
log_path = Path(os.environ["QA_LOG_FILE"])
if log_path.is_file():
    raw_lines = scrub(log_path.read_text(encoding="utf-8", errors="replace")).splitlines()
    log_lines = [ln.rstrip() for ln in raw_lines if ln.strip()][-15:]

steps = []
steps_path = Path(os.environ["QA_STEPS_FILE"])
if steps_path.is_file():
    for raw in steps_path.read_text(encoding="utf-8", errors="replace").splitlines():
        parts = raw.split("|", 2)
        if len(parts) == 3:
            steps.append({
                "name": f"[{parts[0]}] {parts[1]}",
                "status": parts[2],
                "stage": "finished",
                "durationMs": 0,
            })

gate_num = os.environ["QA_GATE_NUM"]
gate_name = os.environ["QA_GATE_NAME"]
rc = int(os.environ["QA_RC"])
remediation = os.environ["QA_REMEDIATION"]
payload = {
    "name": f"gate-{gate_num}-{gate_name}",
    "gate": f"{gate_num}/10",
    "status": "failed",
    "exit_code": rc,
    "command": scrub(os.environ["QA_CMD"]),
    "remediation": remediation,
    "statusDetails": {
        "message": f"[GATE {gate_num}/10 FAILED] {gate_name} (exit_code={rc}): {remediation}",
        "trace": "\n".join(log_lines) if log_lines else "Sin salida diagnóstica capturada.",
    },
    "steps": steps,
    "attachments": [],
    "labels": [
        {"name": "agent", "value": os.environ.get("QA_AGENT_NAME", "qa-11x-certifier")},
        {"name": "agent_version", "value": os.environ.get("QA_AGENT_VERSION", "2.20.3")},
        {"name": "environment", "value": os.environ.get("QA_ENVIRONMENT", "docker-ephemeral")},
    ],
}

dest = Path(os.environ["QA_DIAG_PATH"])
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
PYEOF
}

emit_fail_verbose_report() {
  local gate_num="$1"
  local gate_name="$2"
  local cmd_display="$3"
  local rc="$4"
  local remediation="$5"
  local gate_log="$6"
  local sanitized_cmd
  local excerpt

  sanitized_cmd="$(sanitize_shell_text "${cmd_display}")"
  excerpt="$(sanitize_shell_text "$(grep -v '^[[:space:]]*$' "${gate_log}" 2>/dev/null | tail -n 15 || true)")"

  {
    printf '❌ [GATE %s/10 FAILED] %s\n' "${gate_num}" "${gate_name}"
    printf '  command: %s\n' "${sanitized_cmd}"
    printf '  exit_code: %s\n' "${rc}"
    printf '  root_cause:\n'
    if [ -n "${excerpt}" ]; then
      while IFS= read -r line; do
        printf '    %s\n' "${line}"
      done <<<"${excerpt}"
    else
      printf '    (sin salida diagnóstica capturada)\n'
    fi
    printf '  remediation: %s\n' "${remediation}"
    printf '  diagnostic_json: %s\n' "${DIAGNOSTIC_JSON_PATH}"
  } >&2
}

run_gate() {
  local gate_num="$1"
  local gate_name="$2"
  local remediation="$3"
  local cmd_display="$4"
  shift 4

  local gate_log
  local rc
  local summary_line

  gate_log="${GATE_TMP_DIR}/gate_${gate_num}.log"
  rc=0
  "$@" >"${gate_log}" 2>&1 || rc=$?

  if [ "${rc}" -eq 0 ]; then
    printf '%s/10|%s|passed\n' "${gate_num}" "${gate_name}" >>"${GATE_STEPS_LOG}"
    summary_line="$(grep -v '^[[:space:]]*$' "${gate_log}" 2>/dev/null | tail -n 1 || true)"
    if [ -z "${summary_line}" ]; then
      summary_line="✔ [${gate_name}] OK"
    fi
    printf '[%s/10] %s\n' "${gate_num}" "${summary_line}"
    return 0
  fi

  printf '%s/10|%s|failed\n' "${gate_num}" "${gate_name}" >>"${GATE_STEPS_LOG}"
  write_allure_failure_json "${gate_num}" "${gate_name}" "${cmd_display}" "${rc}" "${remediation}" "${gate_log}"
  emit_fail_verbose_report "${gate_num}" "${gate_name}" "${cmd_display}" "${rc}" "${remediation}" "${gate_log}"
  exit "${rc}"
}

gate_01_secrets() {
  if [ -f "${REPO_ROOT}/scripts/verificar-secretos.sh" ]; then
    bash "${REPO_ROOT}/scripts/verificar-secretos.sh" || return $?
  elif [ -f "${REPO_ROOT}/verificar-secretos.sh" ]; then
    bash "${REPO_ROOT}/verificar-secretos.sh" || return $?
  else
    printf 'ℹ️ Script verificar-secretos.sh no encontrado (omitido).\n'
  fi
}

gate_02_trivy() {
  if [ -f "${REPO_ROOT}/scripts/auditar-infra.sh" ]; then
    bash "${REPO_ROOT}/scripts/auditar-infra.sh" || return $?
  elif [ -f "${REPO_ROOT}/auditar-infra.sh" ]; then
    bash "${REPO_ROOT}/auditar-infra.sh" || return $?
  else
    printf 'ℹ️ Script auditar-infra.sh no encontrado (omitido).\n'
  fi
}

gate_08_manifest() {
  if [ -f "${REPO_ROOT}/scripts/generar-manifiesto.py" ]; then
    python3 "${REPO_ROOT}/scripts/generar-manifiesto.py" --check || return $?
  else
    printf 'ℹ️ scripts/generar-manifiesto.py no encontrado (omitido).\n'
  fi
}

gate_10_doc_and_test_sync() {
  local all_changed
  local code_changes
  local exec_src_changes
  local doc_changes
  local code_count
  local test_changes
  local test_count
  local karate_changes
  local karate_status
  local doc_count
  local gate10_failed

  all_changed=$({
    git diff --name-only HEAD 2>/dev/null || true
    git ls-files --others --exclude-standard 2>/dev/null || true
  } | sort -u)
  if [ -z "${all_changed}" ] && [ "${GITHUB_ACTIONS:-false}" = "true" ]; then
    if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
      all_changed=$(git diff --name-only HEAD~1..HEAD 2>/dev/null | sort -u || true)
    fi
  fi

  code_changes=$(printf '%s\n' "${all_changed}" | grep -E '^((fastapi|vue3|node-backend|python|react-frontend|bash-scripts|php|mcp-server|backend|frontend|scripts)/|\.agents/scripts/|Makefile$|lefthook\.yml$|commitlint\.config\.js$)' | grep -vE '(\.md$|(^|/)graphify-out/)' || true)
  exec_src_changes=$(printf '%s\n' "${code_changes}" | grep -E '^((fastapi|vue3|node-backend|python|react-frontend|php|mcp-server|backend|frontend)/src/|src/|bash-scripts/|scripts/|\.agents/scripts/)' | grep -vE '(\.unit\.(py|ts|tsx)|\.e2e\.ts|test_.*\.py|.*\.test\.(ts|js)|\.feature|\.bats)' || true)
  doc_changes=$(printf '%s\n' "${all_changed}" | grep -E '(\.md$|^docs/)' || true)

  if [ -f ".agents/scripts/verify_docs_invariants.py" ]; then
    if command -v python3 >/dev/null 2>&1; then
      python3 .agents/scripts/verify_docs_invariants.py || return $?
    else
      docker run --rm -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 .agents/scripts/verify_docs_invariants.py || return $?
    fi
  fi

  if [ -n "${code_changes}" ]; then
    code_count=$(printf '%s\n' "${code_changes}" | grep -c . || true)
    test_changes=$(printf '%s\n' "${all_changed}" | grep -E '(\.unit\.(py|ts|tsx)|\.e2e\.ts|test_.*\.py|.*\.test\.(ts|js)|\.feature|\.bats)' || true)
    if [ -n "${test_changes}" ]; then
      test_count=$(printf '%s\n' "${test_changes}" | grep -c . || true)
    else
      test_count=0
    fi
    karate_changes=$(printf '%s\n' "${all_changed}" | grep -E '\.feature(\.example)?$' || true)
    karate_status=$([ -n "${karate_changes}" ] && printf 'Karate BDD actualizado' || printf 'sin cambios .feature')
    if [ -n "${doc_changes}" ]; then
      doc_count=$(printf '%s\n' "${doc_changes}" | grep -c . || true)
    else
      doc_count=0
    fi

    gate10_failed=0
    if [ -n "${exec_src_changes}" ] && [ "${test_count}" -eq 0 ]; then
      gate10_failed=1
    fi
    if [ "${doc_count}" -eq 0 ]; then
      gate10_failed=1
    fi

    if [ "${gate10_failed}" -eq 0 ]; then
      printf '✔ [Doc & Test Sync] %s archivo(s) de código/config | %s prueba(s) (%s) | %s doc(s) sincronizados.\n' \
        "${code_count}" "${test_count}" "${karate_status}" "${doc_count}"
      return 0
    fi

    printf '❌ [Doc & Test Sync] Incumplimiento detectado en %s archivo(s) modificados:\n' "${code_count}"
    while IFS= read -r line; do
      [ -n "${line}" ] && printf '  - %s\n' "${line}"
    done <<<"${code_changes}"
    if [ -n "${exec_src_changes}" ] && [ "${test_count}" -eq 0 ]; then
      printf '  ❌ ERROR: Se modificó código fuente ejecutable pero NO se detectan pruebas unitarias, E2E o BDD nuevas o modificadas.\n'
    fi
    if [ "${doc_count}" -eq 0 ]; then
      printf '  ❌ ERROR: Se modificó código o configuración pero NO se han actualizado docs/, CHANGELOG.md, TESTING.md o README.md.\n'
    fi
    return 1
  elif [ -n "${doc_changes}" ]; then
    doc_count=$(printf '%s\n' "${doc_changes}" | grep -c . || true)
    printf '✔ [Doc Fast-Path] Solo cambios de documentación (%s archivo(s) .md); 0 cambios de código (se omite re-ejecución de suites y grafo AST).\n' "${doc_count}"
  else
    printf '✔ [Doc & Test Sync] Árbol de código limpio (0 cambios pendientes).\n'
  fi
}

printf '🛡️ [QA 11X Gate] Ejecutando 10 validaciones de certificación...\n'

run_gate 1 "Secret Audit" \
  "Elimina el secreto o credencial expuesta y verifica con ./scripts/verificar-secretos.sh." \
  "bash scripts/verificar-secretos.sh" \
  gate_01_secrets

run_gate 2 "Trivy IaC & FS" \
  "Corrige las vulnerabilidades HIGH/CRITICAL reportadas por ./scripts/auditar-infra.sh --force." \
  "bash scripts/auditar-infra.sh" \
  gate_02_trivy

run_gate 3 "JSON Integrity" \
  "Elimina las claves duplicadas en los JSON afectados y valida con verify_json_no_duplicate_keys.py." \
  "python3 .agents/scripts/verify_json_no_duplicate_keys.py" \
  python3 "${SCRIPT_DIR}/verify_json_no_duplicate_keys.py"

run_gate 4 "Zero Orphan UI Components" \
  "Crea o actualiza el test unitario correspondiente para cada componente o vista UI detectada." \
  "python3 .agents/scripts/verify_zero_orphan_vue_components.py" \
  python3 "${SCRIPT_DIR}/verify_zero_orphan_vue_components.py"

run_gate 5 "No Orphan API Endpoints" \
  "Sincroniza el cliente frontend o router backend para eliminar rutas huérfanas." \
  "python3 .agents/scripts/verify_no_orphan_api_endpoints.py" \
  python3 "${SCRIPT_DIR}/verify_no_orphan_api_endpoints.py"

run_gate 6 "AST Topological Health" \
  "Corrige el acoplamiento inverso de capas y regenera el grafo con ./scripts/actualizar-grafos-graphify.sh." \
  "python3 .agents/scripts/verify_topological_health.py" \
  python3 "${SCRIPT_DIR}/verify_topological_health.py"

run_gate 7 "ORM & Migration Parity" \
  "Genera la migración de base de datos pendiente (revision <= 32 chars) y re-ejecuta verify_alembic_orm_parity.py." \
  "python3 .agents/scripts/verify_alembic_orm_parity.py" \
  python3 "${SCRIPT_DIR}/verify_alembic_orm_parity.py"

run_gate 8 "Manifest SHA-256 Sync" \
  "Sincroniza manifest.json ejecutando make sync-governance (o python3 .agents/scripts/sync_governance.py)." \
  "python3 scripts/generar-manifiesto.py --check" \
  gate_08_manifest

run_gate 9 "Roadmap & ActiveTask Sync" \
  "Alinea los porcentajes en ROADMAP.md y verifica que .agents/ACTIVE_TASK.md tenga <= 40 líneas sin pendientes al cerrar." \
  "python3 .agents/scripts/verify_roadmap_consistency.py" \
  python3 "${SCRIPT_DIR}/verify_roadmap_consistency.py"

run_gate 10 "Doc & Test Sync" \
  "Añade pruebas unitarias/BDD junto al código modificado y actualiza CHANGELOG.md o docs/ correspondientes." \
  "python3 .agents/scripts/verify_docs_invariants.py && git diff/status sync" \
  gate_10_doc_and_test_sync

printf '✅ CERTIFICACIÓN EXITOSA: El proyecto cumple con el estándar 11X\n'
