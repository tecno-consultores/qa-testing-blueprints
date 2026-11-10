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
EOF

chmod +x .git/hooks/pre-commit .git/hooks/commit-msg .git/hooks/pre-push
echo "✅ ¡Barrera Git POSIX activada sin contaminar el host (Rule Zero)!"
exit 0
