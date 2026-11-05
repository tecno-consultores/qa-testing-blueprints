#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
# Propósito: Extracción y actualización canónica de grafos semánticos AST (Graphify)
# para los stacks presentes en el proyecto (FastAPI, Python, Node, Vue 3, React, PHP, MCP, Backend, Frontend o Raíz).
# Cumple estrictamente con la Regla Cero (ejecución en contenedor Docker efímero).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="sinfallas/remote-graphify:latest"

if ! command -v docker &> /dev/null; then
  echo "❌ Error: Docker no está instalado o no se encuentra en el PATH." >&2
  exit 1
fi

docker pull -q "${IMAGE_NAME}" >/dev/null 2>&1 || true

extract_graph_in_dir() {
  local target_dir="$1"
  local label="$2"
  docker run --rm \
    -e OLLAMA_BASE_URL="" \
    -v "${target_dir}:/app" \
    -w /app \
    "${IMAGE_NAME}" \
    sh -c "graphify extract . --code-only && graphify cluster-only ."
  docker run --rm \
    -v "${target_dir}:/work" \
    "${IMAGE_NAME}" \
    sh -c "rm -rf /work/graphify-out/cache /work/graphify-out/20* /work/graphify-out/.graphify_* /work/graphify-out/.cloud-cta-shown 2>/dev/null || true; chown -R $(id -u):$(id -g) /work/graphify-out 2>/dev/null || true"
  echo "  ✔ [${label}] -> ${label}/graphify-out/graph.json"
}

if [ $# -ge 1 ] && [ -d "${REPO_ROOT}/$1" ]; then
  extract_graph_in_dir "${REPO_ROOT}/$1" "$1"
  echo "✔ [Graphify AST] Grafo semántico actualizado para '$1'."
  exit 0
fi

STACKS=()
for s in fastapi python node-backend vue3 react-frontend php mcp-server backend frontend; do
  if [ -d "${REPO_ROOT}/${s}" ] && { [ -f "${REPO_ROOT}/${s}/docker-compose.qa.yml" ] || [ -f "${REPO_ROOT}/${s}/package.json" ] || [ -f "${REPO_ROOT}/${s}/pyproject.toml" ] || [ -f "${REPO_ROOT}/${s}/composer.json" ]; }; then
    STACKS+=("${s}")
  fi
done

if [ ${#STACKS[@]} -eq 0 ]; then
  extract_graph_in_dir "${REPO_ROOT}" "."
  echo "✔ [Graphify AST] Grafo semántico actualizado en raíz (graphify-out/graph.json)."
else
  for s in "${STACKS[@]}"; do
    extract_graph_in_dir "${REPO_ROOT}/${s}" "${s}"
  done
  echo "✔ [Graphify AST] Grafos semánticos actualizados (${#STACKS[@]} stacks: ${STACKS[*]})."
fi
