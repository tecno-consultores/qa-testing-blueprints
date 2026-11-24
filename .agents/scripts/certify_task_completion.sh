#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

PY_DOCKER_IMAGE="${QA_PYTHON_IMAGE:-sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4}"
QA_DOCKERENV_FILE="${QA11X_DOCKERENV_PATH:-/.dockerenv}"

STRICT_MODE=false
if [ "${QA11X_STRICT:-0}" = "1" ] || [ "${QA11X_STRICT:-}" = "true" ]; then
  STRICT_MODE=true
fi
for arg in "$@"; do
  case "${arg}" in
    --strict)
      STRICT_MODE=true
      ;;
    -h | --help)
      printf 'Uso: %s [--strict]\n' "$0"
      exit 0
      ;;
    *)
      printf 'Opción no reconocida: %s\n' "${arg}" >&2
      exit 1
      ;;
  esac
done

DEFAULT_DIAG_JSON="${QA_DIAGNOSTIC_JSON_PATH:-${REPO_ROOT}/.agents/.cache/qa-11x-last-failure.json}"
DIAGNOSTIC_JSON_PATH="${QA_DIAGNOSTIC_JSON:-${DEFAULT_DIAG_JSON}}"
if [[ "${DIAGNOSTIC_JSON_PATH}" != /* ]]; then
  DIAGNOSTIC_JSON_PATH="${REPO_ROOT}/${DIAGNOSTIC_JSON_PATH#./}"
fi
GATE_TMP_DIR="$(mktemp -d /tmp/qa11x-certify.XXXXXX)"
GATE_STEPS_LOG="${GATE_TMP_DIR}/steps.log"
: >"${GATE_STEPS_LOG}"
CERTIFY_COMPLETED_OK=0
LAST_SUMMARY_LINE=""
PASS_COUNT=0
SKIPPED_COUNT=0
FAIL_COUNT=0
PY_SESSION_CID=""
PY_SESSION_TRIED=0

ensure_py_session() {
  if [ -n "${PY_SESSION_CID}" ] || [ "${PY_SESSION_TRIED}" -eq 1 ]; then
    return 0
  fi
  PY_SESSION_TRIED=1
  local cid
  cid="$(docker run --rm --network none --security-opt=no-new-privileges:true -d \
    -u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 \
    -v "${REPO_ROOT}:/app" -w /app "${PY_DOCKER_IMAGE}" sleep 600 2>/dev/null | head -n 1 || true)"
  if [[ "${cid}" =~ ^[0-9a-f]{12,64}$ ]]; then
    PY_SESSION_CID="${cid}"
  fi
}

run_py_rule_zero() {
  local use_stdin=false
  local -a extra_docker_args=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --stdin)
        use_stdin=true
        shift
        ;;
      --docker-arg)
        extra_docker_args+=("$2")
        shift 2
        ;;
      --)
        shift
        break
        ;;
      *)
        break
        ;;
    esac
  done

  if [ -f "${QA_DOCKERENV_FILE}" ]; then
    python3 "$@"
    return $?
  fi

  if ! command -v docker >/dev/null 2>&1; then
    printf '❌ [Rule Zero] Docker no está disponible para ejecutar Python en contenedor efímero.\n' >&2
    return 1
  fi

  local -a container_args=()
  local arg
  for arg in "$@"; do
    case "${arg}" in
      "${REPO_ROOT}")
        container_args+=("/app")
        ;;
      "${REPO_ROOT}/"*)
        container_args+=("/app/${arg#"${REPO_ROOT}/"}")
        ;;
      *)
        container_args+=("${arg}")
        ;;
    esac
  done

  if [ "${#extra_docker_args[@]}" -eq 0 ]; then
    ensure_py_session
    if [ -n "${PY_SESSION_CID}" ]; then
      local -a exec_cmd=(docker exec)
      if [ "${use_stdin}" = "true" ]; then
        exec_cmd+=(-i)
      fi
      exec_cmd+=("${PY_SESSION_CID}" python3)
      if [ "${#container_args[@]}" -gt 0 ]; then
        exec_cmd+=("${container_args[@]}")
      fi
      "${exec_cmd[@]}"
      return $?
    fi
  fi

  local -a docker_cmd=(
    docker run --rm --network none --security-opt=no-new-privileges:true
  )
  if [ "${use_stdin}" = "true" ]; then
    docker_cmd+=(-i)
  fi
  docker_cmd+=(-u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -v "${REPO_ROOT}:/app" -w /app)
  if [ "${#extra_docker_args[@]}" -gt 0 ]; then
    docker_cmd+=("${extra_docker_args[@]}")
  fi
  docker_cmd+=("${PY_DOCKER_IMAGE}" python3)
  if [ "${#container_args[@]}" -gt 0 ]; then
    docker_cmd+=("${container_args[@]}")
  fi
  "${docker_cmd[@]}"
}

cleanup_certify_tmp() {
  local final_rc=$?
  local ctl_script="${SCRIPT_DIR}/checkpoint_ctl.py"
  local summary="${LAST_SUMMARY_LINE:-[CERTIFY] rc=${final_rc}}"
  if [ "${final_rc}" -eq 0 ] && [ "${CERTIFY_COMPLETED_OK:-0}" -eq 1 ]; then
    local state_tag="PASS"
    if [ "${SKIPPED_COUNT:-0}" -gt 0 ]; then
      state_tag="WARN"
    fi
    summary="[${state_tag}] CERTIFY-STATE | ${PASS_COUNT:-0}/10 PASS, ${SKIPPED_COUNT:-0} SKIPPED, ${FAIL_COUNT:-0} FAIL"
  fi
  if [ -f "${ctl_script}" ] && [ -w "${REPO_ROOT}" ]; then
    run_py_rule_zero "${ctl_script}" record-cmd --workspace "${REPO_ROOT}" \
      --cmd "certify_task_completion" --rc "${final_rc}" \
      --summary "${summary}" >/dev/null 2>&1 || true
  fi
  if [ -n "${PY_SESSION_CID:-}" ]; then
    docker rm -f "${PY_SESSION_CID}" >/dev/null 2>&1 || true
    PY_SESSION_CID=""
  fi
  rm -rf "${GATE_TMP_DIR}" 2>/dev/null || true
  exit "${final_rc}"
}
trap cleanup_certify_tmp EXIT

sanitize_shell_text() {
  local raw="$1"
  printf '%s' "${raw}" |
    sed -E "s/\\x1b\\[[0-9;]*[a-zA-Z]//g; s/([Bb][Ee][Aa][Rr][Ee][Rr]|[Bb][Aa][Ss][Ii][Cc])[[:space:]]+[^[:space:]\"']+/\\1 [REDACTED]/g; s/(:\\/\\/[^\\/:@]+:)[^\\/@]+(@)/\\1[REDACTED]\\2/g; s/([Tt][Oo][Kk][Ee][Nn]|[Aa][Cc][Cc][Ee][Ss][Ss]_[Tt][Oo][Kk][Ee][Nn]|[Aa][Pp][Ii]_[Kk][Ee][Yy]|[Aa][Pp][Ii][Kk][Ee][Yy]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]|[Pp][Aa][Ss][Ss][Ww][Dd])=[^[:space:]\"'&]+/\\1=[REDACTED]/g; s/(--([Tt][Oo][Kk][Ee][Nn]|[Aa][Pp][Ii]-[Kk][Ee][Yy]|[Aa][Pp][Ii][Kk][Ee][Yy]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]|[Pp][Aa][Ss][Ss][Ww][Dd]))([[:space:]]+|=)[^[:space:]\"']+/\\1\\2[REDACTED]/g; s/(ghp|gho|ghs|github_pat|npm)_[A-Za-z0-9_]{12,}/[REDACTED]/g; s/sk-[A-Za-z0-9_-]{16,}/[REDACTED]/g; s/AIza[A-Za-z0-9_-]{16,}/[REDACTED]/g; s/AKIA[0-9A-Z]{16}/[REDACTED]/g; s/xox[baprs]-[A-Za-z0-9-]{10,}/[REDACTED]/g"
}

json_escape_line() {
  printf '%s' "$1" | tr -d '\r\t\n' | sed -e 's/\\/\\\\/g; s/"/\\"/g'
}

run_certify_findings_tracker() {
  local stage_id="$1"
  local payload="$2"
  local tracker_script="${SCRIPT_DIR}/track_findings_state.py"

  if [ ! -f "${tracker_script}" ] || [ ! -w "${REPO_ROOT}" ]; then
    return 0
  fi
  if [ ! -f "${QA_DOCKERENV_FILE}" ] && ! command -v docker >/dev/null 2>&1; then
    return 0
  fi
  printf '%s' "${payload}" | run_py_rule_zero --stdin -- "${tracker_script}" \
    --state-file "${REPO_ROOT}/.agents/.cache/certify_state.json" \
    --findings-input - \
    --workspace "${REPO_ROOT}" \
    --stage "${stage_id}" \
    --max-streak 3
  return $?
}

diag_has_symlink_segment() {
  local target="$1"
  if [[ "${target}" =~ (^|/)\.\.(/|$) ]]; then
    return 0
  fi
  local anchor="/"
  if [[ "${target}" == "${REPO_ROOT}/"* ]]; then
    anchor="${REPO_ROOT}"
  elif [[ "${target}" == /tmp/* ]]; then
    anchor="/tmp"
  fi
  local rel="${target#"${anchor%/}/"}"
  local cursor="${anchor%/}"
  local part=""
  local -a parts=()
  IFS='/' read -r -a parts <<<"${rel}"
  for part in "${parts[@]}"; do
    [ -n "${part}" ] && [ "${part}" != "." ] || continue
    cursor="${cursor}/${part}"
    if [ -L "${cursor}" ]; then
      return 0
    fi
  done
  return 1
}

write_allure_failure_json() {
  local gate_num="$1"
  local gate_name="$2"
  local cmd_display="$3"
  local rc="$4"
  local remediation="$5"
  local gate_log="$6"
  local diag_dir=""

  if diag_has_symlink_segment "${DIAGNOSTIC_JSON_PATH}"; then
    printf '⚠️ [QA_DIAGNOSTIC_JSON] Ruta symlink rechazada por seguridad: %s\n' "${DIAGNOSTIC_JSON_PATH}" >&2
    return 0
  fi

  diag_dir="$(dirname "${DIAGNOSTIC_JSON_PATH}")"
  mkdir -p "${diag_dir}" 2>/dev/null || true
  if [ "$(basename "${diag_dir}")" = ".cache" ]; then
    chmod 700 "${diag_dir}" 2>/dev/null || true
  fi

  local -a diag_docker_args=(
    --docker-arg -v --docker-arg "${GATE_TMP_DIR}:/qa-tmp:ro"
  )
  local container_diag_path=""
  if [[ "${DIAGNOSTIC_JSON_PATH}" == "${REPO_ROOT}/"* ]]; then
    container_diag_path="/app/${DIAGNOSTIC_JSON_PATH#"${REPO_ROOT}/"}"
  else
    diag_docker_args+=(--docker-arg -v --docker-arg "${diag_dir}:/qa-diag")
    container_diag_path="/qa-diag/$(basename "${DIAGNOSTIC_JSON_PATH}")"
  fi

  QA_DIAG_PATH="${DIAGNOSTIC_JSON_PATH}" \
    QA_GATE_NUM="${gate_num}" \
    QA_GATE_NAME="${gate_name}" \
    QA_CMD="${cmd_display}" \
    QA_RC="${rc}" \
    QA_REMEDIATION="${remediation}" \
    QA_LOG_FILE="${gate_log}" \
    QA_STEPS_FILE="${GATE_STEPS_LOG}" \
    run_py_rule_zero \
    --stdin \
    "${diag_docker_args[@]}" \
    --docker-arg -e --docker-arg "QA_DIAG_PATH=${container_diag_path}" \
    --docker-arg -e --docker-arg "QA_LOG_FILE=/qa-tmp/$(basename "${gate_log}")" \
    --docker-arg -e --docker-arg "QA_STEPS_FILE=/qa-tmp/$(basename "${GATE_STEPS_LOG}")" \
    --docker-arg -e --docker-arg QA_GATE_NUM \
    --docker-arg -e --docker-arg QA_GATE_NAME \
    --docker-arg -e --docker-arg QA_CMD \
    --docker-arg -e --docker-arg QA_RC \
    --docker-arg -e --docker-arg QA_REMEDIATION \
    --docker-arg -e --docker-arg QA_AGENT_NAME \
    --docker-arg -e --docker-arg QA_AGENT_VERSION \
    --docker-arg -e --docker-arg QA_ENVIRONMENT \
    -- - <<'PYEOF' 2>/dev/null || true
import json
import os
import re
import tempfile
import uuid
from pathlib import Path

ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
SECRET_RES = (
    (re.compile(r"\b(Bearer|Basic)\s+[^\s\"']+", re.I), r"\1 [REDACTED]"),
    (re.compile(r"(://[^/\s:@]+:)[^/\s@]+(@)"), r"\1[REDACTED]\2"),
    (re.compile(r"\b(token|access_token|api_key|apikey|secret|password|passwd)=[^\s\"'&]+", re.I), r"\1=[REDACTED]"),
    (re.compile(r"(--(?:token|api-key|apikey|secret|password|passwd))(?:\s+|=)[^\s\"']+", re.I), r"\1=[REDACTED]"),
    (re.compile(r"\b(?:ghp|gho|ghs|github_pat|npm)_[A-Za-z0-9_]{12,}\b"), "[REDACTED]"),
    (re.compile(r"\b(?:glpat|xox[baprs])-[A-Za-z0-9_-]{12,}\b"), "[REDACTED]"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"), "[REDACTED]"),
    (re.compile(r"\bAIza[A-Za-z0-9_-]{16,}\b"), "[REDACTED]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED]"),
    (re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"), "[REDACTED]"),
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
        {"name": "agent_version", "value": os.environ.get("QA_AGENT_VERSION", "3.5.0")},
        {"name": "environment", "value": os.environ.get("QA_ENVIRONMENT", "docker-ephemeral")},
    ],
}

def _find_safe_anchor(target_abs: Path) -> Path:
    candidates: list[Path] = []
    for base in (Path("/app"), Path.cwd(), Path.home(), Path(tempfile.gettempdir())):
        candidates.extend((Path(os.path.abspath(base)), base.resolve()))
    matching = [c for c in candidates if target_abs.is_relative_to(c)]
    if matching:
        return max(matching, key=lambda c: len(c.parts))
    return Path(target_abs.anchor)

def _assert_no_symlink_segments(target: Path, raw_str: str = "") -> Path:
    if ".." in target.parts or ".." in raw_str.split("/"):
        raise ValueError(f"Symlink no permitido en QA_DIAG_PATH: {target}")
    raw_abs = target if target.is_absolute() else Path.cwd() / target
    if target.is_symlink() or raw_abs.is_symlink():
        raise ValueError(f"Symlink no permitido en QA_DIAG_PATH: {target}")
    anchor = _find_safe_anchor(raw_abs)
    cursor = anchor
    for part in raw_abs.relative_to(anchor).parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise ValueError(f"Symlink no permitido en QA_DIAG_PATH: {target}")
    return anchor

raw_diag = os.environ["QA_DIAG_PATH"]
dest = Path(raw_diag)
anchor = _assert_no_symlink_segments(dest, raw_diag)
dest.parent.mkdir(parents=True, exist_ok=True)
raw_abs = dest if dest.is_absolute() else Path.cwd() / dest
expected_parent = anchor.resolve().joinpath(*raw_abs.parent.relative_to(anchor).parts)
if dest.parent.resolve() != expected_parent:
    raise ValueError(f"Symlink no permitido en QA_DIAG_PATH: {dest}")
_assert_no_symlink_segments(dest, raw_diag)
tmp_path = dest.parent / f".{dest.name}.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp"
flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
fd = os.open(tmp_path, flags, 0o600)
try:
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    os.chmod(tmp_path, 0o600)
    os.replace(tmp_path, dest)
except OSError:
    tmp_path.unlink(missing_ok=True)
    raise
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
  local stage_id
  local finding_payload
  local tracker_out
  local tracker_rc

  stage_id="gate-${gate_num}"
  gate_log="${GATE_TMP_DIR}/gate_${gate_num}.log"
  rc=0
  "$@" >"${gate_log}" 2>&1 || rc=$?

  if [ "${rc}" -eq 0 ]; then
    local last_non_empty
    last_non_empty="$(grep -v '^[[:space:]]*$' "${gate_log}" 2>/dev/null | tail -n 1 || true)"
    if printf '%s\n' "${last_non_empty}" | grep -qE '^(⚠️[[:space:]]*)?\[?SKIPPED\b'; then
      rc=20
    fi
  fi

  if [ "${rc}" -eq 20 ]; then
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    printf '%s/10|%s|skipped\n' "${gate_num}" "${gate_name}" >>"${GATE_STEPS_LOG}"
    summary_line="$(grep -v '^[[:space:]]*$' "${gate_log}" 2>/dev/null | tail -n 1 || true)"
    summary_line="$(printf '%s' "${summary_line}" | sed -E 's/^⚠️?[[:space:]]*\[?SKIPPED\]?[[:space:]]*:?[[:space:]]*//')"
    if [ -z "${summary_line}" ]; then
      summary_line="${gate_name}"
    fi
    printf '[%s/10] ⚠️ SKIPPED: %s\n' "${gate_num}" "${summary_line}"
    return 0
  fi

  if [ "${rc}" -eq 0 ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf '%s/10|%s|passed\n' "${gate_num}" "${gate_name}" >>"${GATE_STEPS_LOG}"
    summary_line="$(grep -v '^[[:space:]]*$' "${gate_log}" 2>/dev/null | tail -n 1 || true)"
    if [ -z "${summary_line}" ]; then
      summary_line="✔ [${gate_name}] OK"
    fi
    run_certify_findings_tracker "${stage_id}" "{\"stage\":\"${stage_id}\",\"findings\":[]}" >/dev/null 2>&1 || true
    printf '[%s/10] %s\n' "${gate_num}" "${summary_line}"
    return 0
  fi

  FAIL_COUNT=$((FAIL_COUNT + 1))
  diag_line="$(sanitize_shell_text "$(grep -v '^[[:space:]]*$' "${gate_log}" 2>/dev/null | head -n 1 || true)")"
  if [ -z "${diag_line}" ]; then
    diag_line="Gate ${gate_num} (${gate_name}) failed with exit ${rc}"
  fi
  finding_payload="$(printf '{"stage":"%s","findings":[{"layer":"certify-gate-%s","stack":"certify","file":"gate-%s","rule":"%s","message":"%s"}]}' "${stage_id}" "${gate_num}" "${gate_num}" "$(json_escape_line "${gate_name}")" "$(json_escape_line "${diag_line}")")"
  tracker_out=""
  tracker_rc=0
  tracker_out="$(run_certify_findings_tracker "${stage_id}" "${finding_payload}" 2>&1)" || tracker_rc=$?
  if [ "${tracker_rc}" -eq 42 ]; then
    printf '\n%s\n' "${tracker_out}" >>"${gate_log}"
    rc=42
  fi

  LAST_SUMMARY_LINE="[Gate ${gate_num}/10] ${gate_name} failed (rc=${rc})"
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
    printf '⚠️ [SKIPPED] Script verificar-secretos.sh no encontrado.\n'
    return 20
  fi
}

audit_ci_and_submakefiles_fallback() {
  local found_err=0
  local out=""
  local rel=""
  local awk_wf_prog=""
  local awk_mk_prog=""

  read -r -d '' awk_wf_prog <<'AWK' || true
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
AWK

  read -r -d '' awk_mk_prog <<'AWK' || true
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
AWK

  if [ -d "${REPO_ROOT}/.github" ]; then
    while IFS= read -r -d '' wf_file; do
      rel="${wf_file#"${REPO_ROOT}/"}"
      if ! out="$(awk -v file="${rel}" "${awk_wf_prog}" "${wf_file}")"; then
        printf '%s\n' "${out}" >&2
        found_err=1
      fi
    done < <(find "${REPO_ROOT}/.github" -type f \( -path '*/workflows/*.yml' -o -path '*/workflows/*.yaml' -o -path '*/actions/*/action.yml' -o -path '*/actions/*/action.yaml' \) -print0 2>/dev/null)
  fi

  while IFS= read -r -d '' mk_file; do
    rel="${mk_file#"${REPO_ROOT}/"}"
    if ! out="$(awk -v file="${rel}" "${awk_mk_prog}" "${mk_file}")"; then
      printf '%s\n' "${out}" >&2
      found_err=1
    fi
  done < <(find "${REPO_ROOT}" -mindepth 2 -maxdepth 4 \
    \( -name node_modules -o -name .git -o -name dist -o -name .venv -o -name venv -o -name .tox -o -name .nox -o -name mutants -o -name vendor -o -name target -o -name graphify-out -o -name tests -o -name test -o -name __tests__ \) -prune \
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
    printf '⚠️ [SKIPPED] Script auditar-infra.sh no encontrado (Trivy omitido).\n'
    return 20
  fi
}

gate_08_manifest() {
  local verified_manifest=0
  if [ -f "${SCRIPT_DIR}/sync_governance.py" ] && [ -f "${REPO_ROOT}/manifest.json" ]; then
    run_py_rule_zero "${SCRIPT_DIR}/sync_governance.py" --check || return $?
    verified_manifest=1
  elif [ -f "${REPO_ROOT}/scripts/generar-manifiesto.py" ]; then
    run_py_rule_zero "${REPO_ROOT}/scripts/generar-manifiesto.py" --check || return $?
    verified_manifest=1
  fi
  if [ -f "${SCRIPT_DIR}/bump_version_11x.py" ] && [ -f "${REPO_ROOT}/mcp-server/package.json" ]; then
    run_py_rule_zero "${SCRIPT_DIR}/bump_version_11x.py" --workspace "${REPO_ROOT}" --check || return $?
  fi
  if [ "${verified_manifest}" -eq 0 ]; then
    printf '⚠️ [SKIPPED] sync_governance.py/manifest.json y generar-manifiesto.py no encontrados.\n'
    return 20
  fi
}

run_validator_gate() {
  local script_path="$1"
  if [ ! -f "${script_path}" ]; then
    printf '⚠️ [SKIPPED] Script %s no encontrado (omitido).\n' "$(basename "${script_path}")"
    return 20
  fi
  if grep -q -- '--exit-skipped-code' "${script_path}" 2>/dev/null; then
    run_py_rule_zero "${script_path}" --exit-skipped-code 20
  else
    run_py_rule_zero "${script_path}"
  fi
}

gate_10_doc_and_test_sync() {
  local all_changed
  local raw_code_candidates
  local code_changes
  local exec_src_changes
  local test_sync_changes
  local doc_changes
  local code_count
  local test_changes
  local test_count
  local karate_changes
  local karate_status
  local doc_count
  local gate10_failed
  local has_cov_reports

  local used_head_fallback=0
  local git_diff_out=""
  local git_untracked_out=""
  git_diff_out="$(git -c core.quotePath=false diff --name-only HEAD 2>/dev/null || true)"
  git_untracked_out="$(git -c core.quotePath=false ls-files --others --exclude-standard 2>/dev/null || true)"
  all_changed="$(printf '%s\n%s\n' "${git_diff_out}" "${git_untracked_out}" | sed '/^$/d' | sort -u)"
  if [ -z "${all_changed}" ] && git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    all_changed=$(git -c core.quotePath=false diff --name-only HEAD~1..HEAD 2>/dev/null | sort -u || true)
    [ -n "${all_changed}" ] && used_head_fallback=1
  fi

  local is_upstream_repo=0
  if [ -f "${REPO_ROOT}/scripts/generar-manifiesto.py" ] && [ -f "${REPO_ROOT}/manifest.json" ]; then
    is_upstream_repo=1
  fi

  local non_gov_changes=""
  if [ "${is_upstream_repo}" -eq 0 ] && [ -n "${all_changed}" ]; then
    non_gov_changes=$(printf '%s\n' "${all_changed}" | grep -vE '^(\.agents/|AGENTS\.md$|\.gitignore$|CLAUDE\.md$|GEMINI\.md$|\.windsurfrules$|\.clinerules$|\.cursor/rules/qa-11x\.mdc$|\.github/copilot-instructions\.md$|\.junie/guidelines\.md$)' || true)
    if [ -z "${non_gov_changes}" ]; then
      if [ -f "${SCRIPT_DIR}/verify_docs_invariants.py" ]; then
        run_py_rule_zero "${SCRIPT_DIR}/verify_docs_invariants.py" || return $?
      fi
      printf '✔ [Governance Maintenance Fast-Path] Solo mantenimiento de gobernanza QA-11X en proyecto consumidor; sin cambios en código de aplicación.\n'
      return 0
    fi
  fi

  local test_file_re='(\.(unit|spec|test|e2e)\.(py|ts|tsx|js|jsx)|(^|/)test_[^/]+\.py|[^/]+_test\.py|[^/]+Test\.php|\.feature(\.example)?|\.bats)$'
  raw_code_candidates=$(printf '%s\n' "${all_changed}" | grep -E '^((fastapi|vue3|node-backend|python|react-frontend|bash-scripts|php|mcp-server|mobile-appium|ai-evals|vibe-rescue|catalogs|architecture|backend|frontend|scripts|src)/|\.agents/(scripts|schemas|skills|rules)/|((.*/)?Makefile(\.example)?)$|\.github/(workflows|actions)/|(manifest\.json|llms\.txt|\.trivy\.yaml|lefthook\.yml|instalar-hooks\.sh)$)' | grep -vE '(^|/)graphify-out/' || true)
  code_changes=$(printf '%s\n' "${raw_code_candidates}" | grep -vE "${test_file_re}" | awk '/^$/ {next} /^\.agents\/(skills|rules)\// {print; next} /\.md$/ {next} {print}' || true)
  exec_src_changes=$(printf '%s\n' "${code_changes}" | grep -E '^((fastapi|vue3|node-backend|python|react-frontend|php|mcp-server|mobile-appium|backend|frontend)/src/|src/|bash-scripts/|vibe-rescue/|ai-evals/|scripts/|\.agents/scripts/|instalar-hooks\.sh$)' || true)
  test_sync_changes=$(printf '%s\n' "${code_changes}" | grep -E '^(\.agents/(schemas|skills|rules)/|(catalogs|architecture)/|(manifest\.json|llms\.txt)$)' || true)
  doc_changes=$(printf '%s\n' "${all_changed}" | grep -E '(\.md$|^docs/)' | grep -vE '^\.agents/(skills|rules)/' || true)

  if [ -f "${SCRIPT_DIR}/verify_docs_invariants.py" ]; then
    run_py_rule_zero "${SCRIPT_DIR}/verify_docs_invariants.py" || return $?
  fi

  if [ -n "${code_changes}" ]; then
    code_count=$(printf '%s\n' "${code_changes}" | grep -c . || true)
    test_changes=$(printf '%s\n' "${all_changed}" | grep -E "${test_file_re}" || true)
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
    if { [ -n "${exec_src_changes}" ] || [ -n "${test_sync_changes}" ]; } && [ "${test_count}" -eq 0 ]; then
      gate10_failed=1
    fi
    if [ "${doc_count}" -eq 0 ]; then
      gate10_failed=1
    fi

    if [ "${gate10_failed}" -eq 0 ]; then
      if [ -n "${exec_src_changes}" ]; then
        has_cov_reports=""
        if [ -d ".agents/.cache/coverage" ]; then
          has_cov_reports=$(find ".agents/.cache/coverage" -maxdepth 1 -type f \( -name '*.xml' -o -name '*.info' \) 2>/dev/null | head -n 1 || true)
        fi
        if [ ! -f "${SCRIPT_DIR}/verify_diff_coverage.py" ] || [ -z "${has_cov_reports}" ]; then
          printf '⚠️ [SKIPPED] verify_diff_coverage omitido (sin reportes de cobertura en .agents/.cache/coverage).\n'
          return 20
        fi
        local -a diff_cov_args=(--workspace "${REPO_ROOT}" --reports-dir .agents/.cache/coverage)
        if [ "${used_head_fallback}" -eq 1 ]; then
          diff_cov_args+=(--base-ref HEAD~1)
        fi
        run_py_rule_zero "${SCRIPT_DIR}/verify_diff_coverage.py" "${diff_cov_args[@]}" || return $?
      fi
      printf '✔ [Doc & Test Sync] %s archivo(s) de código/config | %s prueba(s) (%s) | %s doc(s) sincronizados.\n' \
        "${code_count}" "${test_count}" "${karate_status}" "${doc_count}"
      return 0
    fi

    printf '❌ [Doc & Test Sync] Incumplimiento detectado en %s archivo(s) modificados:\n' "${code_count}"
    while IFS= read -r line; do
      [ -n "${line}" ] && printf '  - %s\n' "${line}"
    done <<<"${code_changes}"
    if { [ -n "${exec_src_changes}" ] || [ -n "${test_sync_changes}" ]; } && [ "${test_count}" -eq 0 ]; then
      printf '  ❌ ERROR: Se modificó código fuente o gobernanza/esquemas/catálogos críticos pero NO se detectan pruebas unitarias, E2E, BATS o BDD nuevas o modificadas (QA-TEST-SYNC-01).\n'
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
  run_validator_gate "${SCRIPT_DIR}/verify_json_no_duplicate_keys.py"

run_gate 4 "Zero Orphan UI Components" \
  "Crea o actualiza el test unitario correspondiente para cada componente o vista UI detectada." \
  "python3 .agents/scripts/verify_zero_orphan_vue_components.py" \
  run_validator_gate "${SCRIPT_DIR}/verify_zero_orphan_vue_components.py"

run_gate 5 "No Orphan API Endpoints" \
  "Sincroniza el cliente frontend o router backend para eliminar rutas huérfanas." \
  "python3 .agents/scripts/verify_no_orphan_api_endpoints.py" \
  run_validator_gate "${SCRIPT_DIR}/verify_no_orphan_api_endpoints.py"

run_gate 6 "AST Topological Health" \
  "Corrige el acoplamiento inverso de capas y regenera el grafo con ./scripts/actualizar-grafos-graphify.sh." \
  "python3 .agents/scripts/verify_topological_health.py" \
  run_validator_gate "${SCRIPT_DIR}/verify_topological_health.py"

run_gate 7 "ORM & Migration Parity" \
  "Genera la migración de base de datos pendiente (revision <= 32 chars) y re-ejecuta verify_alembic_orm_parity.py." \
  "python3 .agents/scripts/verify_alembic_orm_parity.py" \
  run_validator_gate "${SCRIPT_DIR}/verify_alembic_orm_parity.py"

run_gate 8 "Manifest SHA-256 Sync" \
  "Sincroniza manifest.json ejecutando make sync-governance (o python3 .agents/scripts/sync_governance.py)." \
  "python3 .agents/scripts/sync_governance.py --check" \
  gate_08_manifest

run_gate 9 "Roadmap & ActiveTask Sync" \
  "Alinea los porcentajes en ROADMAP.md y verifica que .agents/ACTIVE_TASK.md tenga <= 40 líneas sin pendientes al cerrar." \
  "python3 .agents/scripts/verify_roadmap_consistency.py" \
  run_validator_gate "${SCRIPT_DIR}/verify_roadmap_consistency.py"

run_gate 10 "Doc & Test Sync" \
  "Añade pruebas unitarias/BDD junto al código modificado y actualiza CHANGELOG.md o docs/ correspondientes." \
  "python3 .agents/scripts/verify_docs_invariants.py && git diff/status sync" \
  gate_10_doc_and_test_sync

state_tag="PASS"
if [ "${SKIPPED_COUNT}" -gt 0 ]; then
  state_tag="WARN"
fi
printf '[%s] CERTIFY-STATE | %s/10 PASS, %s SKIPPED, %s FAIL\n' \
  "${state_tag}" "${PASS_COUNT}" "${SKIPPED_COUNT}" "${FAIL_COUNT}"

if [ "${STRICT_MODE}" = "true" ] && [ "${SKIPPED_COUNT}" -gt 0 ]; then
  LAST_SUMMARY_LINE="[FAIL] CERTIFY-STATE | ${PASS_COUNT}/10 PASS, ${SKIPPED_COUNT} SKIPPED, ${FAIL_COUNT} FAIL (strict)"
  printf '❌ [STRICT] Certificación bloqueada: %s gate(s) en estado SKIPPED.\n' "${SKIPPED_COUNT}" >&2
  exit 1
fi

pass_tracker_out=""
pass_tracker_rc=0
pass_tracker_out="$(run_certify_findings_tracker "certify" '{"stage":"certify","findings":[]}' 2>/dev/null)" || pass_tracker_rc=$?
if [ "${pass_tracker_rc}" -eq 0 ] && [ -n "${pass_tracker_out}" ]; then
  printf '%s\n' "${pass_tracker_out}"
fi

CERTIFY_COMPLETED_OK=1
if [ "${SKIPPED_COUNT}" -gt 0 ]; then
  printf '⚠️ CERTIFICACIÓN COMPLETADA CON OMISIONES: %s/10 PASS, %s SKIPPED (usa --strict para bloquear).\n' \
    "${PASS_COUNT}" "${SKIPPED_COUNT}"
else
  printf '✅ CERTIFICACIÓN EXITOSA: El proyecto cumple con el estándar 11X\n'
fi
