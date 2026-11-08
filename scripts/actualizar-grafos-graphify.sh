#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
# Propósito: Extracción y actualización canónica e incremental de grafos semánticos AST (Graphify)
# para los stacks presentes en el proyecto (FastAPI, Python, Node, Vue 3, React, PHP, MCP, Backend, Frontend o Raíz).
# Cumple estrictamente con la Regla Cero (ejecución en contenedor Docker efímero) y salida Pass-Quiet (1 línea).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="sinfallas/remote-graphify:latest"
FORCE_ALL=false

if [ "${1:-}" = "--all" ] || [ "${1:-}" = "--force" ]; then
  FORCE_ALL=true
  shift
fi

if ! command -v docker &>/dev/null; then
  echo "❌ Error: Docker no está instalado o no se encuentra en el PATH." >&2
  exit 1
fi

docker pull -q "${IMAGE_NAME}" >/dev/null 2>&1 || true

extract_graph_in_dir() {
  local target_dir="$1"
  local log_file="/tmp/graphify_ast_$$.log"
  if ! docker run --rm \
    -e OLLAMA_BASE_URL="" \
    -v "${target_dir}:/app" \
    -w /app \
    "${IMAGE_NAME}" \
    sh -c "graphify extract . --code-only && graphify cluster-only ." >"${log_file}" 2>&1; then
    echo "❌ [Graphify AST] Error al extraer el grafo en '${target_dir}':" >&2
    cat "${log_file}" >&2
    rm -f "${log_file}"
    return 1
  fi
  rm -f "${log_file}"
  docker run --rm \
    -v "${target_dir}:/work" \
    "${IMAGE_NAME}" \
    sh -c "rm -rf /work/graphify-out/cache /work/graphify-out/20* /work/graphify-out/.graphify_* /work/graphify-out/.cloud-cta-shown 2>/dev/null || true; chown -R $(id -u):$(id -g) /work/graphify-out 2>/dev/null || true" >/dev/null 2>&1 || true
}

stack_needs_update() {
  local target_dir="$1"
  local rel_name="$2"
  local graph_file="${target_dir}/graphify-out/graph.json"

  if [ "${FORCE_ALL}" = true ] || [ ! -f "${graph_file}" ]; then
    return 0
  fi

  # 1. Revisar si existen archivos de código más recientes que graph.json
  local newer_files
  newer_files=$(find "${target_dir}" -maxdepth 4 \
    \( -name node_modules -o -name .git -o -name dist -o -name coverage -o -name graphify-out -o -name .venv -o -name vendor \) -prune \
    -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.py' -o -name '*.vue' -o -name '*.php' -o -name '*.sh' \) \
    -newer "${graph_file}" -print -quit 2>/dev/null || true)
  if [ -n "${newer_files}" ]; then
    return 0
  fi

  # 2. Revisar git status para cambios de código (excluyendo *.md y graphify-out)
  if command -v git &>/dev/null && [ -d "${REPO_ROOT}/.git" ]; then
    local git_code_changes
    git_code_changes=$(git -C "${REPO_ROOT}" status --porcelain "${rel_name}" 2>/dev/null |
      grep -vE '(\.md$|graphify-out/)' || true)
    if [ -n "${git_code_changes}" ]; then
      return 0
    fi
  fi

  return 1
}

if [ $# -ge 1 ] && [ -d "${REPO_ROOT}/$1" ]; then
  extract_graph_in_dir "${REPO_ROOT}/$1"
  echo "✔ [Graphify AST] Grafo semántico actualizado para '$1' -> $1/graphify-out/graph.json."
  exit 0
fi

STACKS=()
for s in fastapi python node-backend vue3 react-frontend php mcp-server backend frontend; do
  if [ -d "${REPO_ROOT}/${s}" ] && { [ -f "${REPO_ROOT}/${s}/docker-compose.qa.yml" ] || [ -f "${REPO_ROOT}/${s}/package.json" ] || [ -f "${REPO_ROOT}/${s}/pyproject.toml" ] || [ -f "${REPO_ROOT}/${s}/composer.json" ]; }; then
    STACKS+=("${s}")
  fi
done

if [ ${#STACKS[@]} -eq 0 ]; then
  if stack_needs_update "${REPO_ROOT}" "."; then
    extract_graph_in_dir "${REPO_ROOT}"
    echo "✔ [Graphify AST] Grafo semántico actualizado en raíz (graphify-out/graph.json)."
  else
    echo "✔ [Graphify AST] Sin cambios de código en raíz (graphify-out/graph.json al día)."
  fi
else
  UPDATED=()
  SKIPPED=()
  for s in "${STACKS[@]}"; do
    if stack_needs_update "${REPO_ROOT}/${s}" "${s}"; then
      extract_graph_in_dir "${REPO_ROOT}/${s}"
      UPDATED+=("${s}")
    else
      SKIPPED+=("${s}")
    fi
  done
  echo "✔ [Graphify AST] Actualizados: ${#UPDATED[@]} (${UPDATED[*]:-ninguno}) | Omitidos sin cambios de código: ${#SKIPPED[@]} (${SKIPPED[*]:-ninguno})."
fi
