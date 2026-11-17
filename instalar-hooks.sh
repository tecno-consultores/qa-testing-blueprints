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
done < <(git diff --cached --name-only --diff-filter=ACMR)
if [ "${#STAGED_FILES[@]}" -gt 0 ] && [ -x "./scripts/verificar-secretos.sh" ]; then
	./scripts/verificar-secretos.sh "${STAGED_FILES[@]}"
fi
if [ -f "./.agents/scripts/sync_governance.py" ] && [ -f "./manifest.json" ]; then
	docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4 \
		bash -c "python3 .agents/scripts/sync_governance.py --check && python3 .agents/scripts/verify_docs_invariants.py"
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
	if ! printf '%s\n' "${FIRST_LINE}" | grep -Eq '^(Merge |Revert ")' &&
		! printf '%s\n' "${FIRST_LINE}" | grep -Eq '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|security)(\([a-z0-9._/-]+\))?!?: .{1,100}$'; then
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
elif git diff --name-only origin/main...HEAD | grep -Eq '^(mcp-server/|manifest\.json$)'; then
	MCP_CHANGED=true
fi
if [ "${MCP_CHANGED}" = true ] && [ -f "./mcp-server/package.json" ]; then
	MCP_EXTRA_VOLS=()
	for dir in mobile-appium vibe-rescue .github; do
		if [ -d "./${dir}" ]; then
			MCP_EXTRA_VOLS+=(-v "$(pwd)/${dir}:/${dir}:ro")
		fi
	done
	docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store \
		-v "$(pwd)/mcp-server:/app" ${MCP_EXTRA_VOLS[@]+"${MCP_EXTRA_VOLS[@]}"} -w /app sinfallas/base-node-ionic:26@sha256:275f3d8bbfef87f4e836e4f77d92c0d199821154079b050eaef53ce33ae6de60 \
		bash -c "pnpm install --frozen-lockfile --prefer-offline --trust-lockfile --silent && pnpm --silent run lint && pnpm --silent run typecheck && pnpm --silent run test:unit && rm -rf coverage .eslintcache"
	if [ -x "./scripts/probar-mcp-example.sh" ]; then
		./scripts/probar-mcp-example.sh --in-place
	fi
fi
if [ -f "./scripts/generar-manifiesto.py" ]; then
	docker run --rm --network none -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e RUFF_CACHE_DIR=/tmp/ruff-cache \
		-e PYTHONDONTWRITEBYTECODE=1 -e PYTHONPATH=/app/.agents/scripts \
		-u "$(id -u):$(id -g)" -e HOME=/tmp -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4 \
		bash -c "python3 scripts/generar-manifiesto.py --check && python3 .agents/scripts/sync_governance.py --check && python3 .agents/scripts/bump_version_11x.py --workspace . --check && python3 .agents/scripts/verify_docs_invariants.py && python3 .agents/scripts/verify_roadmap_consistency.py && python3 .agents/scripts/verify_topological_health.py && python3 .agents/scripts/verify_json_no_duplicate_keys.py"
	# Ejecuta tests/*.unit.py y tests/meta_qa/test_governance_scripts.py (más test_antipattern_linter.py) vía make
	if command -v make >/dev/null 2>&1; then
		make test-py && make test-meta-qa
	else
		docker run --rm --network none -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e RUFF_CACHE_DIR=/tmp/ruff-cache -e PYTHONDONTWRITEBYTECODE=1 \
			-e PYTHONPATH=/app/.agents/scripts:/app -e HOME=/tmp -u "$(id -u):$(id -g)" -v "$(pwd):/app:ro" -w /app \
			sinfallas/base-python-uv:3.15@sha256:b5323179c6278cef2775d870fdfb4628f19ec2567430de8774889867961018c4 \
			bash -c "ruff check --select E,F,W,I,UP,B,C901,FLY --config 'lint.mccabe.max-complexity=5' .agents/scripts scripts vibe-rescue/audit_vibe_prototype.py tests/meta_qa/test_antipattern_linter.py && ruff check tests/meta_qa && MYPYPATH=/app/.agents/scripts mypy --strict --cache-dir=/tmp/mypy .agents/scripts/*.py scripts/*.py vibe-rescue/audit_vibe_prototype.py tests/meta_qa/test_antipattern_linter.py && pytest --cov=.agents/scripts --cov=scripts --cov-fail-under=95 --cov-branch tests/*.unit.py tests/meta_qa/test_*.py -q"
	fi
fi
if [ -d "./mcp-server/test" ]; then
	docker run --rm --network none --security-opt=no-new-privileges:true -v "$(pwd)/mcp-server/test:/app/src/test/java/examples/test:ro" -v "$(pwd):/repo:ro" sinfallas/karatelabs:1.5.1 mvn -B -q clean test
fi
if [ -d "./bash-scripts/test" ]; then
	docker run --rm --network none -u "$(id -u):$(id -g)" -e HOME=/tmp -e _USER=qa -v "$(pwd):/repo:ro" -w /repo/bash-scripts sinfallas/base-bash-qa@sha256:2d1f579e20ef384e85da839304dbae2d28231fcdc893c21cbe79861b44d675a7 \
		bash -c 'shopt -s nullglob; mapfile -t lint_files < <(printf "%s\n" ../scripts/*.sh ../.agents/scripts/*.sh ../instalar-hooks.sh ../*/limpieza.sh ../mcp-server/example/verify-v2.sh ./*.sh | sort -u); shellcheck -x "${lint_files[@]}" && shfmt -i 2 -ci -d "${lint_files[@]}" && bats test/*.bats ../tests/bats/*.bats'
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
