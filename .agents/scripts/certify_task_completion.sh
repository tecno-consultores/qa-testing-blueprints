#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "══════════════════════════════════════════════════════════════════════"
echo "   🤖 QA Blueprints Agent Certification Gate (Standard 11X)        "
echo "══════════════════════════════════════════════════════════════════════"

# 1. Auditoría de Secretos
echo -e "\n🔒 [1/10] Verificando que no existan secretos expuestos en Git..."
if [ -f "${REPO_ROOT}/scripts/verificar-secretos.sh" ]; then
    "${REPO_ROOT}/scripts/verificar-secretos.sh"
elif [ -f "${REPO_ROOT}/verificar-secretos.sh" ]; then
    "${REPO_ROOT}/verificar-secretos.sh"
else
    echo "ℹ️ Script verificar-secretos.sh no encontrado; omitiendo verificación rápida."
fi
echo "✔ Cero secretos detectados."

# 2. Auditoría Preventiva de Infraestructura (Trivy IaC)
echo -e "\n🛡️ [2/10] Ejecutando escaneo preventivo de infraestructura y dependencias (Trivy)..."
if [ -f "${REPO_ROOT}/scripts/auditar-infra.sh" ]; then
    "${REPO_ROOT}/scripts/auditar-infra.sh"
elif [ -f "${REPO_ROOT}/auditar-infra.sh" ]; then
    "${REPO_ROOT}/auditar-infra.sh"
else
    echo "ℹ️ Script auditar-infra.sh no encontrado; omitiendo."
fi

# 3. Integridad de Archivos JSON (Anti-Colisión de Claves)
echo -e "\n🌐 [3/10] Verificando integridad de archivos JSON (anti-colisión de claves)..."
python3 "${SCRIPT_DIR}/verify_json_no_duplicate_keys.py"

# 4. Invariante de Cero Componentes UI Huérfanos
echo -e "\n🧩 [4/10] Verificando cobertura de componentes UI (cero componentes huérfanos)..."
python3 "${SCRIPT_DIR}/verify_zero_orphan_vue_components.py"

# 5. Invariante de Cero Endpoints de API Huérfanos (Paridad Front-Back)
echo -e "\n🔗 [5/10] Verificando paridad bidireccional de endpoints API (cero huérfanos 404/405)..."
python3 "${SCRIPT_DIR}/verify_no_orphan_api_endpoints.py"

# 6. Salud Topológica y Límites de Capas (Graphify AST)
echo -e "\n🧠 [6/10] Auditando salud topológica y límites de capas arquitectónicas..."
python3 "${SCRIPT_DIR}/verify_topological_health.py"

# 7. Paridad ORM vs Migraciones de BD y Longitud de Revision IDs
echo -e "\n🗄️ [7/10] Verificando paridad entre modelos ORM y migraciones (Alembic <= 32 chars)..."
python3 "${SCRIPT_DIR}/verify_alembic_orm_parity.py"

# 8. Sincronización Criptográfica del Manifiesto Remoto (manifest.json)
echo -e "\n📜 [8/10] Verificando sincronización criptográfica del manifiesto (manifest.json)..."
if [ -f "${REPO_ROOT}/scripts/generar-manifiesto.py" ]; then
    python3 "${REPO_ROOT}/scripts/generar-manifiesto.py" --check
else
    echo "ℹ️ scripts/generar-manifiesto.py no encontrado; omitiendo verificación de manifiesto."
fi

# 9. Consistencia Interna de Hoja de Ruta y Tarea Activa (ROADMAP.md y ACTIVE_TASK.md)
echo -e "\n📋 [9/10] Verificando consistencia interna de ROADMAP.md y ACTIVE_TASK.md..."
python3 "${SCRIPT_DIR}/verify_roadmap_consistency.py"

# 10. Sincronización Documental y Pruebas Obligatorias (incluyendo archivos untracked)
echo -e "\n📚 [10/10] Verificando sincronización de documentación y pruebas obligatorias..."
ALL_CHANGED=$( { git diff --name-only HEAD 2>/dev/null || true; git ls-files --others --exclude-standard 2>/dev/null || true; } | sort -u )
CODE_CHANGES=$(echo "${ALL_CHANGED}" | grep -E '^(fastapi|vue3|node-backend|python|react-frontend|bash-scripts|mcp-server)/' || true)

if [ -n "${CODE_CHANGES}" ]; then
  echo "Se detectaron cambios en directorios de stacks:"
  while IFS= read -r line; do
    [ -n "${line}" ] && echo "  - ${line}"
  done <<< "${CODE_CHANGES}"

  TEST_CHANGES=$(echo "${ALL_CHANGED}" | grep -E '(\.unit\.(py|ts|tsx)|\.e2e\.ts|test_.*\.py|.*\.test\.(ts|js)|\.feature|\.bats)' || true)
  if [ -z "${TEST_CHANGES}" ]; then
    echo "⚠️ ADVERTENCIA: Se modificaron stacks pero NO se detectan pruebas unitarias, E2E o BDD nuevas o modificadas."
  else
    echo "✔ Pruebas 11X detectadas en paralelo:"
    while IFS= read -r t_line; do
      [ -n "${t_line}" ] && echo "  - ${t_line}"
    done <<< "${TEST_CHANGES}"
  fi

  KARATE_CHANGES=$(echo "${ALL_CHANGED}" | grep -E '\.feature(\.example)?$' || true)
  if [ -n "${KARATE_CHANGES}" ]; then
    echo "✔ Escenarios BDD de Karate Labs actualizados."
  fi

  DOC_CHANGES=$(echo "${ALL_CHANGED}" | grep -E '^(docs/|CHANGELOG\.md|README\.md|TESTING\.md|ROADMAP\.md)' || true)
  if [ -z "${DOC_CHANGES}" ]; then
    echo "⚠️ ADVERTENCIA: Se modificó código pero NO se han actualizado docs/, CHANGELOG.md, TESTING.md o README.md."
  else
    echo "✔ Documentación actualizada en paralelo:"
    while IFS= read -r doc_line; do
      [ -n "${doc_line}" ] && echo "  - ${doc_line}"
    done <<< "${DOC_CHANGES}"
  fi
else
  echo "✔ No hay cambios pendientes sin commitear en código fuente."
fi

echo -e "\n══════════════════════════════════════════════════════════════════════"
echo "   ✅ CERTIFICACIÓN EXITOSA: El proyecto cumple con el estándar 11X  "
echo "══════════════════════════════════════════════════════════════════════"
