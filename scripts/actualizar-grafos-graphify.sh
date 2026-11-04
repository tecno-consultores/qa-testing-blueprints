#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors
# Propósito: Extracción y actualización canónica de grafos semánticos AST (Graphify)
# para los stacks presentes en el proyecto (FastAPI, Python, Node, Vue 3, React).
# Cumple estrictamente con la Regla Cero (ejecución en contenedor Docker efímero).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="sinfallas/remote-graphify:latest"

if ! command -v docker &> /dev/null; then
  echo "❌ Error: Docker no está instalado o no se encuentra en el PATH." >&2
  exit 1
fi

docker pull -q "${IMAGE_NAME}" >/dev/null

STACKS=()
for s in fastapi python node-backend vue3 react-frontend; do
  if [ -f "${REPO_ROOT}/${s}/docker-compose.qa.yml" ]; then
    STACKS+=("${s}")
  fi
done

if [ ${#STACKS[@]} -eq 0 ] && [ -f "${REPO_ROOT}/docker-compose.qa.yml" ]; then
  docker compose -f "${REPO_ROOT}/docker-compose.qa.yml" --profile graphify run --rm graphify graphify extract . --code-only
  docker compose -f "${REPO_ROOT}/docker-compose.qa.yml" --profile graphify run --rm graphify graphify cluster-only .
  docker run --rm -v "${REPO_ROOT}:/work" "${IMAGE_NAME}" chown -R "$(id -u):$(id -g)" /work/graphify-out 2>/dev/null || true
  echo "✔ [Graphify AST] Grafo semántico actualizado en raíz."
else
  for s in "${STACKS[@]}"; do
    docker compose -f "${REPO_ROOT}/${s}/docker-compose.qa.yml" --profile graphify run --rm graphify graphify extract . --code-only
    docker compose -f "${REPO_ROOT}/${s}/docker-compose.qa.yml" --profile graphify run --rm graphify graphify cluster-only .
    docker run --rm -v "${REPO_ROOT}:/work" "${IMAGE_NAME}" chown -R "$(id -u):$(id -g)" "/work/${s}/graphify-out" 2>/dev/null || true
  done
  echo "✔ [Graphify AST] Grafos semánticos actualizados (${#STACKS[@]} stacks: ${STACKS[*]})."
fi
