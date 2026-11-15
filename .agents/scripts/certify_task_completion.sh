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
  printf '%s' "${raw}" |
    sed -E "s/${esc}\\[[0-9;]*[a-zA-Z]//g; s/(Bearer|Basic)[[:space:]]+[^[:space:]\"']+/\\1 [REDACTED]/g; s/(:\\/\\/[^\\/:@]+:)[^\\/@]+(@)/\\1[REDACTED]\\2/g; s/(token|access_token|api_key|apikey|secret|password|passwd)=[^[:space:]\"'&]+/\\1=[REDACTED]/g"
}

json_escape_line() {
  printf '%s' "$1" | tr -d '\r\t\n' | sed -e 's/\\/\\\\/g; s/"/\\"/g'
}

run_certify_findings_tracker() {
  local payload="$1"
  local tracker_script="${SCRIPT_DIR}/track_findings_state.py"

  if [ ! -f "${tracker_script}" ] || [ ! -w "${REPO_ROOT}" ]; then
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "${payload}" | python3 "${tracker_script}" \
      --state-file "${REPO_ROOT}/.agents/.cache/certify_state.json" \
      --findings-input - \
      --workspace "${REPO_ROOT}" \
      --max-streak 3
    return $?
  fi
  if command -v docker >/dev/null 2>&1; then
    printf '%s' "${payload}" | docker run -i --rm --network none \
      -u "$(id -u):$(id -g)" -e HOME=/tmp \
      -v "${REPO_ROOT}:/app" -w /app \
      sinfallas/base-python-uv:3.15 \
      python3 .agents/scripts/track_findings_state.py \
      --state-file /app/.agents/.cache/certify_state.json \
      --findings-input - \
      --workspace /app \
      --max-streak 3
    return $?
  fi
  return 0
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
        {"name": "agent_version", "value": os.environ.get("QA_AGENT_VERSION", "3.0.0")},
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
  local diag_line
  local finding_payload
  local tracker_out
  local tracker_rc

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

  diag_line="$(sanitize_shell_text "$(grep -v '^[[:space:]]*$' "${gate_log}" 2>/dev/null | head -n 1 || true)")"
  if [ -z "${diag_line}" ]; then
    diag_line="Gate ${gate_num} (${gate_name}) failed with exit ${rc}"
  fi
  finding_payload="$(printf '[{"layer":"certify-gate-%s","stack":"certify","file":"gate-%s","rule":"%s","message":"%s"}]' \
    "${gate_num}" "${gate_num}" "$(json_escape_line "${gate_name}")" "$(json_escape_line "${diag_line}")")"
  tracker_out=""
  tracker_rc=0
  tracker_out="$(run_certify_findings_tracker "${finding_payload}" 2>&1)" || tracker_rc=$?
  if [ "${tracker_rc}" -eq 42 ]; then
    printf '\n%s\n' "${tracker_out}" >>"${gate_log}"
    rc=42
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

audit_ci_and_submakefiles_fallback() {
  local found_err=0
  local out=""
  local rel=""

  if [ -d "${REPO_ROOT}/.github" ]; then
    while IFS= read -r -d '' wf_file; do
      rel="${wf_file#"${REPO_ROOT}/"}"
      if ! out="$(awk -v file="${rel}" '
        { lines[NR] = $0; if (NR <= 5 && index($0, "qa-ci-escape-ok") > 0) skip = 1 }
        END {
          if (skip) exit 0
          bad = 0; prev = ""
          for (i = 1; i <= NR; i++) {
            line = lines[i]; tr = line; sub(/^[[:space:]]+/, "", tr)
            if (tr != "" && substr(tr, 1, 1) != "#" && index(line, "qa-ci-escape-ok") == 0 && index(prev, "qa-ci-escape-ok") == 0 && line ~ /\$\$[({][A-Za-z_]/) {
              printf "❌ [QA-CI-ESCAPE-01] %s:%d: Escape $$(...) / $${...} en GitHub Actions.\n", file, i
              bad = 1
            }
            prev = line
          }
          exit bad
        }
      ' "${wf_file}")"; then
        printf '%s\n' "${out}" >&2
        found_err=1
      fi
    done < <(find "${REPO_ROOT}/.github" -type f \( -path '*/workflows/*.yml' -o -path '*/workflows/*.yaml' -o -path '*/actions/*/action.yml' -o -path '*/actions/*/action.yaml' \) -print0 2>/dev/null)
  fi

  while IFS= read -r -d '' mk_file; do
    rel="${mk_file#"${REPO_ROOT}/"}"
    if ! out="$(awk -v file="${rel}" '
      { lines[NR] = $0; if (NR <= 5 && index($0, "qa-make-curdir-ok") > 0) skip = 1 }
      END {
        if (skip) exit 0
        bad = 0; prev = ""
        for (i = 1; i <= NR; i++) {
          line = lines[i]; tr = line; sub(/^[[:space:]]+/, "", tr)
          chk = line; gsub(/\$\$/, "__QA_DBL__", chk)
          if (tr != "" && substr(tr, 1, 1) != "#" && index(line, "qa-make-curdir-ok") == 0 && index(prev, "qa-make-curdir-ok") == 0 && (chk ~ /\$\(PWD\)/ || chk ~ /\$\{PWD\}/)) {
            printf "❌ [QA-MAKE-CURDIR-01] %s:%d: Sub-Makefile usa $(PWD)/${PWD} en lugar de $(CURDIR).\n", file, i
            bad = 1
          }
          prev = line
        }
        exit bad
      }
    ' "${mk_file}")"; then
      printf '%s\n' "${out}" >&2
      found_err=1
    fi
  done < <(find "${REPO_ROOT}" -mindepth 2 -maxdepth 4 \
    \( -name node_modules -o -name .git -o -name dist -o -name .venv -o -name vendor -o -name target -o -name graphify-out -o -name tests -o -name test -o -name __tests__ \) -prune \
    -o -type f \( -name 'Makefile' -o -name 'Makefile.example' \) -print0 2>/dev/null)

  return "${found_err}"
}

gate_02_trivy() {
  if [ -f "${REPO_ROOT}/scripts/auditar-infra.sh" ]; then
    bash "${REPO_ROOT}/scripts/auditar-infra.sh" || return $?
  elif [ -f "${REPO_ROOT}/auditar-infra.sh" ]; then
    bash "${REPO_ROOT}/auditar-infra.sh" || return $?
  else
    audit_ci_and_submakefiles_fallback || return $?
    printf 'ℹ️ Script auditar-infra.sh no encontrado (solo validación estática CI/Makefile ejecutada; Trivy omitido).\n'
  fi
}

gate_08_manifest() {
  if [ -f "${REPO_ROOT}/scripts/generar-manifiesto.py" ]; then
    python3 "${REPO_ROOT}/scripts/generar-manifiesto.py" --check || return $?
  else
    printf 'ℹ️ scripts/generar-manifiesto.py no encontrado (omitido).\n'
  fi
  if [ -f "${SCRIPT_DIR}/sync_governance.py" ] && [ -f "${REPO_ROOT}/manifest.json" ]; then
    python3 "${SCRIPT_DIR}/sync_governance.py" --check || return $?
  fi
  if [ -f "${SCRIPT_DIR}/bump_version_11x.py" ] && [ -f "${REPO_ROOT}/mcp-server/package.json" ]; then
    python3 "${SCRIPT_DIR}/bump_version_11x.py" --workspace "${REPO_ROOT}" --check || return $?
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
  local has_cov_reports

  all_changed=$({
    git diff --name-only HEAD 2>/dev/null || true
    git ls-files --others --exclude-standard 2>/dev/null || true
  } | sort -u)
  if [ -z "${all_changed}" ] && [ "${GITHUB_ACTIONS:-false}" = "true" ]; then
    if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
      all_changed=$(git diff --name-only HEAD~1..HEAD 2>/dev/null | sort -u || true)
    fi
  fi

  code_changes=$(printf '%s\n' "${all_changed}" | grep -E '^((fastapi|vue3|node-backend|python|react-frontend|bash-scripts|php|mcp-server|mobile-appium|ai-evals|vibe-rescue|catalogs|architecture|backend|frontend|scripts)/|\.agents/scripts/|((.*/)?Makefile(\.example)?)$|\.github/(workflows|actions)/|(lefthook\.yml|commitlint\.config\.js|instalar-hooks\.sh)$)' | grep -vE '(\.md$|(^|/)graphify-out/)' || true)
  exec_src_changes=$(printf '%s\n' "${code_changes}" | grep -E '^((fastapi|vue3|node-backend|python|react-frontend|php|mcp-server|mobile-appium|backend|frontend)/src/|src/|bash-scripts/|vibe-rescue/|ai-evals/|scripts/|\.agents/scripts/|instalar-hooks\.sh$)' | grep -vE '(\.unit\.(py|ts|tsx)|\.e2e\.ts|test_.*\.py|.*\.test\.(ts|js)|\.feature|\.bats)' || true)
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
      if [ -n "${exec_src_changes}" ] && [ -f ".agents/scripts/verify_diff_coverage.py" ] && [ -d ".agents/.cache/coverage" ]; then
        has_cov_reports=$(find ".agents/.cache/coverage" -maxdepth 1 -type f \( -name '*.xml' -o -name '*.info' \) 2>/dev/null | head -n 1 || true)
        if [ -n "${has_cov_reports}" ]; then
          if command -v python3 >/dev/null 2>&1; then
            python3 .agents/scripts/verify_diff_coverage.py --workspace . --reports-dir .agents/.cache/coverage || return $?
          else
            docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 python3 .agents/scripts/verify_diff_coverage.py --workspace /app --reports-dir .agents/.cache/coverage || return $?
          fi
        fi
      fi
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

pass_tracker_out=""
pass_tracker_rc=0
pass_tracker_out="$(run_certify_findings_tracker '{"stage":"certify","findings":[]}' 2>/dev/null)" || pass_tracker_rc=$?
if [ "${pass_tracker_rc}" -eq 0 ] && [ -n "${pass_tracker_out}" ]; then
  printf '%s\n' "${pass_tracker_out}"
fi

printf '✅ CERTIFICACIÓN EXITOSA: El proyecto cumple con el estándar 11X\n'
