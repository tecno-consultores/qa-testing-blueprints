#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Inicializar la barrera de entrada Git (Lefthook o hooks POSIX puros) respetando Rule Zero (cero contaminación del host).

LC_ALL=C
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${QA11X_REPO_ROOT:-${SCRIPT_DIR}}"
cd "${REPO_ROOT}"

echo "🛡️ Configurando Barrera de Entrada Corporativa (Estándar QA 11X)..."

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Error: No se encontró un repositorio Git válido en $(pwd)." >&2
  exit 1
fi

if command -v lefthook >/dev/null 2>&1; then
  lefthook install
  echo "✅ ¡Barrera Lefthook activada! Todo 'git commit' y 'git push' ejecutará validaciones efímeras."
  exit 0
fi

HOOKS_DIR="$(git rev-parse --git-path hooks)"
mkdir -p "${HOOKS_DIR}"
BACKUP_TS="$(date +%Y%m%d%H%M%S)"

backup_hook_if_unmanaged() {
  local hook_path="$1"
  if { [ -e "${hook_path}" ] || [ -L "${hook_path}" ]; } &&
    ! grep -qF "# Managed by QA-11X instalar-hooks.sh" "${hook_path}" 2>/dev/null; then
    local backup_path="${hook_path}.bak.${BACKUP_TS}"
    mv "${hook_path}" "${backup_path}"
    echo "📦 Hook previo respaldado en: ${backup_path}"
  fi
}

backup_hook_if_unmanaged "${HOOKS_DIR}/pre-commit"
cat >"${HOOKS_DIR}/pre-commit" <<'EOF'
#!/usr/bin/env bash
# Managed by QA-11X instalar-hooks.sh
set -euo pipefail
STAGED_FILES=()
while IFS= read -r staged_file; do
	[ -n "${staged_file}" ] && STAGED_FILES+=("${staged_file}")
done < <(git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR)
if [ "${#STAGED_FILES[@]}" -gt 0 ] && [ -x "./scripts/verificar-secretos.sh" ]; then
	./scripts/verificar-secretos.sh "${STAGED_FILES[@]}"
fi
if [ -f "./.agents/scripts/sync_governance.py" ] && [ -f "./manifest.json" ]; then
	docker run --rm --network none --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4 \
		python3 .agents/scripts/sync_governance.py --check
fi
if [ -f "./.agents/scripts/verify_docs_invariants.py" ]; then
	docker run --rm --network none --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4 \
		python3 .agents/scripts/verify_docs_invariants.py
fi
PY_STAGED=()
SH_STAGED=()
MCP_TS_STAGED=()
for sfile in "${STAGED_FILES[@]+"${STAGED_FILES[@]}"}"; do
	[ -f "${sfile}" ] || continue
	case "${sfile}" in
		.venv/* | venv/* | .tox/* | .nox/* | mutants/* | node_modules/* | vendor/* | .bats-battery/* | graphify-out/*)
			continue
			;;
		fastapi/*.py)
			[ -f "fastapi/pyproject.toml" ] || PY_STAGED+=("${sfile}")
			;;
		python/*.py)
			[ -f "python/pyproject.toml" ] || PY_STAGED+=("${sfile}")
			;;
		mcp-server/src/*.ts | mcp-server/tests/*.ts)
			MCP_TS_STAGED+=("${sfile#mcp-server/}")
			;;
		node-backend/* | vue3/* | react-frontend/* | php/* | mcp-server/* | mobile-appium/*)
			case "${sfile}" in
				*.sh) SH_STAGED+=("${sfile}") ;;
			esac
			;;
		*.py)
			PY_STAGED+=("${sfile}")
			;;
		*.sh)
			SH_STAGED+=("${sfile}")
			;;
	esac
done
if [ "${#MCP_TS_STAGED[@]}" -gt 0 ] && [ -f "./mcp-server/package.json" ]; then
	MCP_PRECOMMIT_VOLS=()
	if [ -d "./mobile-appium" ]; then
		MCP_PRECOMMIT_VOLS+=(-v "$(pwd)/mobile-appium:/mobile-appium:ro")
	fi
	docker run --rm --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -e pnpm_config_manage_package_manager_versions=false -v "$(pwd)/mcp-server:/app" ${MCP_PRECOMMIT_VOLS[@]+"${MCP_PRECOMMIT_VOLS[@]}"} -w /app sinfallas/base-node-ionic:26@sha256:275f3d8bbfef87f4e836e4f77d92c0d199821154079b050eaef53ce33ae6de60 \
		bash -c 'pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && npx eslint --max-warnings 0 "$@" && pnpm --silent run typecheck' _ "${MCP_TS_STAGED[@]}"
fi
if [ "${#SH_STAGED[@]}" -gt 0 ] && { [ -f "./docker-compose.qa.yml" ] || [ -f "./lefthook.yml" ] || [ -f "./manifest.json" ]; }; then
	docker run --rm --network none --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e _USER=qa -v "$(pwd):/repo:ro" -w /repo sinfallas/base-bash-qa@sha256:2d1f579e20ef384e85da839304dbae2d28231fcdc893c21cbe79861b44d675a7 \
		bash -c 'shellcheck -x "$@" && shfmt -i 2 -ci -d "$@"' _ "${SH_STAGED[@]}"
fi
if [ "${#PY_STAGED[@]}" -gt 0 ]; then
	QA_PY_SVC=""
	QA_PY_DEPS=()
	if [ -f "./docker-compose.qa.yml" ] && [ -f "./pyproject.toml" ]; then
		for cand in qa-backend qa-python api; do
			if grep -Eq "^[[:space:]]{2,4}${cand}:([[:space:]]*(#.*)?)?$" "./docker-compose.qa.yml"; then
				QA_PY_SVC="${cand}"
				if [ "${cand}" = "api" ]; then
					QA_PY_DEPS=(--no-deps)
				fi
				break
			fi
		done
	fi
	if [ -n "${QA_PY_SVC}" ]; then
		QA_UID="$(id -u)" QA_GID="$(id -g)" docker compose -f docker-compose.qa.yml run --rm -T ${QA_PY_DEPS[@]+"${QA_PY_DEPS[@]}"} --entrypoint bash -u "$(id -u):$(id -g)" -e HOME=/tmp -e UV_CACHE_DIR=/tmp/uv-cache -e UV_PROJECT_ENVIRONMENT=/tmp/qa-venv -e RUFF_CACHE_DIR=/tmp/ruff-cache -e PYTHONDONTWRITEBYTECODE=1 "${QA_PY_SVC}" \
			-c 'if ! mkdir -p "${UV_CACHE_DIR:-/tmp/uv-cache}" 2>/dev/null || [ ! -w "${UV_CACHE_DIR:-/tmp/uv-cache}" ]; then export UV_CACHE_DIR=/tmp/qa-uv-cache; fi; if [ -f uv.lock ]; then uv sync --frozen --all-extras -q && uv run --frozen --no-sync ruff check "$@" && uv run --frozen --no-sync ruff format --check "$@" && uv run --frozen --no-sync mypy --strict --cache-dir=/tmp/mypy "$@"; elif [ -w . ]; then uv sync --all-extras -q && uv run --no-sync ruff check "$@" && uv run --no-sync ruff format --check "$@" && uv run --no-sync mypy --strict --cache-dir=/tmp/mypy "$@"; else PATH="/tmp/qa-venv/bin:${PATH}" ruff check "$@" && PATH="/tmp/qa-venv/bin:${PATH}" ruff format --check "$@" && PATH="/tmp/qa-venv/bin:${PATH}" mypy --strict --cache-dir=/tmp/mypy "$@"; fi' _ "${PY_STAGED[@]}"
	elif [ -f "./pytest.ini" ] || [ -f "./pyproject.toml" ]; then
		docker run --rm --network none --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e RUFF_CACHE_DIR=/tmp/ruff-cache -e PYTHONDONTWRITEBYTECODE=1 -e MYPYPATH=/app/.agents/scripts:/app/ai-evals:/app/vibe-rescue -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4 \
			bash -c 'ruff check --select E,F,W,I,UP,B,C901,FLY --config "lint.mccabe.max-complexity=5" "$@" && mypy --strict --cache-dir=/tmp/mypy "$@"' _ "${PY_STAGED[@]}"
	fi
fi
EOF

backup_hook_if_unmanaged "${HOOKS_DIR}/commit-msg"
cat >"${HOOKS_DIR}/commit-msg" <<'EOF'
#!/usr/bin/env bash
# Managed by QA-11X instalar-hooks.sh
set -euo pipefail
MSG_FILE="${1:-}"
if [ -n "${MSG_FILE}" ] && [ -f "${MSG_FILE}" ]; then
	FIRST_LINE=$(head -n 1 "${MSG_FILE}")
	if [ "${#FIRST_LINE}" -gt 100 ] || {
		! printf '%s\n' "${FIRST_LINE}" | grep -Eq '^(Merge |Revert ")' &&
		! printf '%s\n' "${FIRST_LINE}" | grep -Eq '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|security)(\([a-z0-9._/-]+\))?!?: .{1,100}$'
	}; then
		echo "❌ [Conventional Commits] Formato requerido (<= 100 chars): ^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|security)(\([a-z0-9._/-]+\))?!?: .{1,100}$" >&2
		exit 1
	fi
fi
EOF

backup_hook_if_unmanaged "${HOOKS_DIR}/pre-push"
cat >"${HOOKS_DIR}/pre-push" <<'EOF'
#!/usr/bin/env bash
# Managed by QA-11X instalar-hooks.sh
set -euo pipefail
if [ -x "./scripts/auditar-infra.sh" ]; then
	./scripts/auditar-infra.sh
fi
MCP_CHANGED=false
if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
	MCP_CHANGED=true
elif git -c core.quotePath=false diff --name-only origin/main...HEAD | grep -Eq '^(mcp-server/|manifest\.json$|mobile-appium/|vibe-rescue/|\.github/)'; then
	MCP_CHANGED=true
fi
if [ "${MCP_CHANGED}" = true ] && [ -f "./mcp-server/package.json" ]; then
	mkdir -p .agents/.cache/coverage && chmod 0700 .agents/.cache
	MCP_EXTRA_VOLS=()
	for dir in mobile-appium vibe-rescue .github architecture .agents fastapi python node-backend vue3 react-frontend php bash-scripts ai-evals; do
		if [ -d "./${dir}" ]; then
			MCP_EXTRA_VOLS+=(-v "$(pwd)/${dir}:/${dir}:ro")
		fi
	done
	docker run --rm --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store -e pnpm_config_manage_package_manager_versions=false \
		-v "$(pwd)/mcp-server:/app" -v "$(pwd)/.agents/.cache/coverage:/cov-out" ${MCP_EXTRA_VOLS[@]+"${MCP_EXTRA_VOLS[@]}"} -w /app sinfallas/base-node-ionic:26@sha256:275f3d8bbfef87f4e836e4f77d92c0d199821154079b050eaef53ce33ae6de60 \
		bash -c "pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && pnpm --silent run lint && pnpm --silent run typecheck && pnpm --silent run test:unit && if [ -f coverage/lcov.info ]; then sed -E 's|^SF:/app/|SF:mcp-server/|; s|^SF:(src/)|SF:mcp-server/\1|' coverage/lcov.info > /cov-out/mcp-server.info; fi && rm -rf coverage .eslintcache"
	if [ -x "./scripts/probar-mcp-example.sh" ]; then
		./scripts/probar-mcp-example.sh --in-place
	fi
fi
if [ -f "./ai-evals/rag/test_rag_faithfulness.py" ]; then
	if [ -f "./Makefile" ] && command -v make >/dev/null 2>&1; then
		make test-ai-offline
	else
		mkdir -p .agents/.cache/coverage && chmod 0700 .agents/.cache
		docker run --rm --network none --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 \
			-e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e RUFF_CACHE_DIR=/tmp/ruff-cache -e DEEPEVAL_TELEMETRY_OPT_OUT=YES \
			-v "$(pwd):/app:ro" -v "$(pwd)/.agents/.cache/coverage:/app/.agents/.cache/coverage" -w /app \
			sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4 \
			bash -c "ruff check --select E,F,W,I,UP,B,C901 --config 'lint.mccabe.max-complexity=5' ai-evals tests/evals && MYPYPATH=ai-evals mypy --strict --cache-dir=/tmp/mypy ai-evals/golden_from_traces.py ai-evals/_llm_judge.py ai-evals/rag/test_rag_faithfulness.py ai-evals/voice-realtime/test_voice_websocket_latency.py ai-evals/multimodal-ocr/test_pdf_table_fidelity.py ai-evals/tests/test_golden_from_traces.py tests/evals/test_skill_adherence.py && PYTHONPATH=ai-evals pytest --cov=ai-evals --cov=tests/evals --cov-fail-under=95 --cov-report=xml:/app/.agents/.cache/coverage/ai-evals.xml ai-evals/rag/test_rag_faithfulness.py ai-evals/voice-realtime/test_voice_websocket_latency.py ai-evals/multimodal-ocr/test_pdf_table_fidelity.py ai-evals/tests/test_golden_from_traces.py tests/evals/test_skill_adherence.py -q"
	fi
fi
if [ -f "./scripts/generar-manifiesto.py" ]; then
	docker run --rm --network none --security-opt=no-new-privileges:true -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e RUFF_CACHE_DIR=/tmp/ruff-cache \
		-e PYTHONDONTWRITEBYTECODE=1 -e PYTHONPATH=/app/.agents/scripts \
		-u "$(id -u):$(id -g)" -e HOME=/tmp -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4 \
		bash -c "python3 .agents/scripts/sync_governance.py --check && python3 .agents/scripts/bump_version_11x.py --workspace . --check && python3 .agents/scripts/verify_docs_invariants.py && python3 .agents/scripts/verify_roadmap_consistency.py && python3 .agents/scripts/verify_topological_health.py && python3 .agents/scripts/verify_json_no_duplicate_keys.py"
	# Ejecuta tests/*.unit.py y tests/meta_qa/test_governance_scripts.py (más test_antipattern_linter.py) vía make
	if [ -f "./Makefile" ] && command -v make >/dev/null 2>&1; then
		make test-py && make test-meta-qa
	else
		mkdir -p .agents/.cache/coverage && chmod 0700 .agents/.cache
		docker run --rm --network none --security-opt=no-new-privileges:true -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e RUFF_CACHE_DIR=/tmp/ruff-cache -e PYTHONDONTWRITEBYTECODE=1 \
			-e PYTHONPATH=/app/.agents/scripts:/app/vibe-rescue:/app -e HOME=/tmp -u "$(id -u):$(id -g)" -v "$(pwd):/app:ro" -v "$(pwd)/.agents/.cache/coverage:/app/.agents/.cache/coverage" -w /app \
			sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4 \
			bash -c "ruff check --select E,F,W,I,UP,B,C901,FLY --config 'lint.mccabe.max-complexity=5' .agents/scripts scripts tests vibe-rescue && MYPYPATH=/app/.agents/scripts:ai-evals:vibe-rescue mypy --strict --cache-dir=/tmp/mypy .agents/scripts/*.py scripts/*.py tests/*.unit.py tests/meta_qa/*.py tests/evals/*.py vibe-rescue/*.py vibe-rescue/tests/*.py && pytest --cov=.agents/scripts --cov=scripts --cov=vibe-rescue --cov-fail-under=95 --cov-branch --cov-report=xml:/app/.agents/.cache/coverage/python.xml tests/*.unit.py tests/meta_qa/test_*.py vibe-rescue/tests/*.unit.py -q"
	fi
fi
if [ -d "./mcp-server/test" ]; then
	docker run --rm --network none --security-opt=no-new-privileges:true -v "$(pwd)/mcp-server/test:/app/src/test/java/examples/test:ro" -v "$(pwd):/repo:ro" sinfallas/karatelabs:1.5.1@sha256:a9a52ca9c5491ab39b64f0b4fdc3dea879c2213c9bc995be58d6cd4b9a80cc89 mvn -B -q clean test
fi
if [ -d "./bash-scripts/test" ]; then
	if [ -f "./Makefile" ] && [ -d "./tests/bats" ] && command -v make >/dev/null 2>&1; then
		make shellcheck && make shfmt && make test-bats
	else
		mkdir -p .agents/.cache/coverage && chmod 0700 .agents/.cache
		KCOV_RUNNER_PY=$(cat <<'PYEOF'
import os, pathlib, re, shutil, stat, subprocess, sys
shutil.rmtree("/tmp/kcov-bash", ignore_errors=True)
env_sh = pathlib.Path("/tmp/kcov-env.sh")
env_sh.write_text(
    'if [[ "${KCOV_BASH_XTRACEFD:-}" =~ ^[0-9]+$ ]] && [ -p "/proc/${BASHPID}/fd/${KCOV_BASH_XTRACEFD}" ]; then\n'
    "  PS4='kcov@${BASH_SOURCE}@${LINENO}@'\n"
    '  BASH_XTRACEFD="${KCOV_BASH_XTRACEFD}"\n'
    "  set -x\n"
    "fi\n",
    encoding="utf-8",
)
rb = pathlib.Path("/tmp/run-bats.sh")
rb.write_text(
    "#!/usr/bin/env bash\n"
    "export -n BASH_XTRACEFD 2>/dev/null || unset BASH_XTRACEFD\n"
    "export BASH_ENV=/tmp/kcov-env.sh\n"
    'exec bats "$@"\n',
    encoding="utf-8",
)
rb.chmod(rb.stat().st_mode | stat.S_IXUSR)
suites = ["tests/bats/", "bash-scripts/test/"] if pathlib.Path("/repo/tests/bats").is_dir() else ["bash-scripts/test/"]
p = subprocess.run(
    [
        "kcov",
        "--bash-dont-parse-binary-dir",
        "--include-path=/repo,/tmp",
        "--exclude-pattern=/repo/tests,/repo/bash-scripts/test,/tmp/kcov-bash,/tmp/kcov-env.sh,/tmp/run-bats.sh,.bats.src,/tmp/bats-mock",
        "/tmp/kcov-bash",
        "/tmp/run-bats.sh",
        *suites,
    ],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)
sys.stdout.write(p.stdout)
if p.returncode != 0:
    if "\nnot ok " not in ("\n" + p.stdout):
        sys.stderr.write("\n".join(p.stderr.splitlines()[-40:]) + "\n")
    sys.exit(p.returncode)
norm_script = pathlib.Path("/repo/.agents/scripts/normalize_kcov_cobertura.py")
if norm_script.is_file():
    subprocess.run(["/usr/bin/python3", str(norm_script), "--repo", "/repo", "--kcov-dir", "/tmp/kcov-bash", "--output", "/cov-out/bash.xml"], check=True)
else:
    xmls = sorted(x for x in pathlib.Path("/tmp/kcov-bash").rglob("cobertura.xml") if not x.parent.is_symlink())
    mxmls = [x for x in xmls if x.parent.name == "kcov-merged"]
    src = (mxmls[0] if mxmls else xmls[0]) if xmls else None
    if src is None:
        sys.exit(1)
    raw = src.read_text(encoding="utf-8")
    san = raw if "<!ENTITY" in raw.upper() else re.sub(r"<!DOCTYPE\s+coverage\s+[^\s[\]<>][^[\]<>]*>\r?\n?", "", raw, flags=re.I)
    out_p = pathlib.Path("/cov-out/bash.xml")
    out_p.write_text(san, encoding="utf-8")
    os.chmod(out_p, 0o600)
PYEOF
)
		export KCOV_RUNNER_PY
		docker run --rm --network none --cap-drop=ALL --security-opt=no-new-privileges:true -u "$(id -u):$(id -g)" -e HOME=/tmp -e _USER=qa -e KCOV_RUNNER_PY -v "$(pwd):/repo:ro" -v "$(pwd)/.agents/.cache/coverage:/cov-out" -w /repo sinfallas/base-bash-qa@sha256:2d1f579e20ef384e85da839304dbae2d28231fcdc893c21cbe79861b44d675a7 \
			bash -c 'shopt -s nullglob; raw=(scripts/*.sh .agents/scripts/*.sh instalar-hooks.sh */limpieza.sh mcp-server/example/verify-v2.sh bash-scripts/*.sh); if [ "${#raw[@]}" -gt 0 ]; then mapfile -t lint_files < <(printf "%s\n" "${raw[@]}" | sort -u); shellcheck -x "${lint_files[@]}" && shfmt -i 2 -ci -d "${lint_files[@]}"; fi && /usr/bin/python3 -c "${KCOV_RUNNER_PY}"'
	fi
fi
if [ -x "./.agents/scripts/validate_calm_architecture.sh" ]; then
	./.agents/scripts/validate_calm_architecture.sh
fi
if [ -x "./.agents/scripts/certify_task_completion.sh" ]; then
	./.agents/scripts/certify_task_completion.sh
fi
EOF

chmod +x "${HOOKS_DIR}/pre-commit" "${HOOKS_DIR}/commit-msg" "${HOOKS_DIR}/pre-push"
echo "✅ ¡Barrera Git POSIX activada sin contaminar el host (Rule Zero)!"
exit 0
