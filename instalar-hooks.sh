#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
# Propósito: Inicializar la barrera de entrada Git (Lefthook o hooks POSIX puros) respetando Rule Zero (cero contaminación del host).

LC_ALL=C
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "🛡️ Configurando Barrera de Entrada Corporativa (Estándar QA 11X)..."

if [ ! -d ".git" ]; then
  echo "❌ Error: No se encontró un repositorio Git (.git) en $(pwd)." >&2
  exit 1
fi

if command -v lefthook >/dev/null 2>&1; then
  lefthook install
  echo "✅ ¡Barrera Lefthook activada! Todo 'git commit' y 'git push' ejecutará validaciones efímeras."
  exit 0
fi

mkdir -p .git/hooks

cat > .git/hooks/pre-commit << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
STAGED=$(git diff --cached --name-only --diff-filter=ACMR)
if [ -n "${STAGED}" ] && [ -x "./scripts/verificar-secretos.sh" ]; then
  # shellcheck disable=SC2086
  ./scripts/verificar-secretos.sh ${STAGED}
fi
if [ -f "./.agents/scripts/sync_governance.py" ] && [ -f "./manifest.json" ]; then
  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$(pwd):/app:ro" -w /app sinfallas/base-python-uv:3.15 \
    bash -c "python3 .agents/scripts/sync_governance.py --check && python3 .agents/scripts/verify_docs_invariants.py"
fi
EOF

cat > .git/hooks/commit-msg << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
MSG_FILE="${1:-}"
if [ -n "${MSG_FILE}" ] && [ -f "${MSG_FILE}" ]; then
  FIRST_LINE=$(head -n 1 "${MSG_FILE}")
  if ! printf '%s\n' "${FIRST_LINE}" | grep -Eq '^(Merge |Revert "|(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-zA-Z0-9_.,/-]+\))?!?: .+)'; then
    echo "❌ [Conventional Commits] El mensaje no cumple el formato '<tipo>(<alcance>): <descripción>'." >&2
    exit 1
  fi
fi
EOF

cat > .git/hooks/pre-push << 'EOF'
#!/usr/bin/env bash
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
  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e PNPM_HOME=/tmp/pnpm -e pnpm_config_store_dir=/tmp/.pnpm-store \
    -v "$(pwd)/mcp-server:/app" -w /app sinfallas/base-node-ionic:26 \
    bash -c "[ -d node_modules/.bin ] || pnpm install --frozen-lockfile --silent; pnpm --silent run lint && pnpm --silent run typecheck && pnpm --silent run test:unit && rm -rf coverage .eslintcache"
  if [ -x "./scripts/probar-mcp-example.sh" ]; then
    ./scripts/probar-mcp-example.sh --in-place
  fi
fi
if [ -f "./scripts/generar-manifiesto.py" ]; then
  docker run --rm -e COVERAGE_FILE=/tmp/.coverage -e UV_CACHE_DIR=/tmp/uv-cache -e RUFF_CACHE_DIR=/tmp/ruff-cache \
    -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$(pwd):/app" -w /app sinfallas/base-python-uv:3.15 \
    bash -c "python3 scripts/generar-manifiesto.py --check && python3 .agents/scripts/sync_governance.py --check && python3 .agents/scripts/verify_docs_invariants.py && python3 .agents/scripts/verify_roadmap_consistency.py && python3 .agents/scripts/verify_topological_health.py && python3 .agents/scripts/verify_json_no_duplicate_keys.py && ruff check tests/meta_qa .agents/scripts/release_readiness_gate.py && uv run --with pytest --with pytest-cov pytest -o cache_dir=/tmp/pytest-cache --import-mode=importlib tests/*.unit.py tests/meta_qa/test_governance_scripts.py -q"
fi
if [ -d "./mcp-server/test" ]; then
  docker run --rm -v "$(pwd)/mcp-server/test:/app/src/test/java/examples/test:ro" -v "$(pwd):/repo:ro" sinfallas/karatelabs:1.5.1 mvn -B -q clean test
fi
if [ -d "./bash-scripts/test" ]; then
  docker run --rm -v "$(pwd):/repo:ro" -w /repo/bash-scripts sinfallas/base-bash-qa:latest \
    bash -c "shellcheck -x ../scripts/*.sh ../.agents/scripts/*.sh ../instalar-hooks.sh ./*.sh && bats test/*.bats ../tests/bats/*.bats"
fi
if [ -x "./.agents/scripts/validate_calm_architecture.sh" ]; then
  ./.agents/scripts/validate_calm_architecture.sh
fi
if [ -x "./.agents/scripts/certify_task_completion.sh" ]; then
  ./.agents/scripts/certify_task_completion.sh
fi
EOF

chmod +x .git/hooks/pre-commit .git/hooks/commit-msg .git/hooks/pre-push
echo "✅ ¡Barrera Git POSIX activada sin contaminar el host (Rule Zero)!"
exit 0
