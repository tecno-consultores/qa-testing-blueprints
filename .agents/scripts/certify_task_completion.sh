#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "🛡️ [QA 11X Gate] Ejecutando 10 validaciones de certificación..."

# 1. Auditoría de Secretos
printf "[1/10] "
if [ -f "${REPO_ROOT}/scripts/verificar-secretos.sh" ]; then
    "${REPO_ROOT}/scripts/verificar-secretos.sh"
elif [ -f "${REPO_ROOT}/verificar-secretos.sh" ]; then
    "${REPO_ROOT}/verificar-secretos.sh"
else
    echo "ℹ️ Script verificar-secretos.sh no encontrado (omitido)."
fi

# 2. Auditoría Preventiva de Infraestructura (Trivy IaC & FS)
printf "[2/10] "
if [ -f "${REPO_ROOT}/scripts/auditar-infra.sh" ]; then
    "${REPO_ROOT}/scripts/auditar-infra.sh"
elif [ -f "${REPO_ROOT}/auditar-infra.sh" ]; then
    "${REPO_ROOT}/auditar-infra.sh"
else
    echo "ℹ️ Script auditar-infra.sh no encontrado (omitido)."
fi

# 3. Integridad de Archivos JSON (Anti-Colisión de Claves)
printf "[3/10] "
python3 "${SCRIPT_DIR}/verify_json_no_duplicate_keys.py"

# 4. Invariante de Cero Componentes UI Huérfanos
printf "[4/10] "
python3 "${SCRIPT_DIR}/verify_zero_orphan_vue_components.py"

# 5. Invariante de Cero Endpoints de API Huérfanos (Paridad Front-Back)
printf "[5/10] "
python3 "${SCRIPT_DIR}/verify_no_orphan_api_endpoints.py"

# 6. Salud Topológica y Límites de Capas (Graphify AST)
printf "[6/10] "
python3 "${SCRIPT_DIR}/verify_topological_health.py"

# 7. Paridad ORM vs Migraciones de BD y Longitud de Revision IDs
printf "[7/10] "
python3 "${SCRIPT_DIR}/verify_alembic_orm_parity.py"

# 8. Sincronización Criptográfica del Manifiesto Remoto (manifest.json)
printf "[8/10] "
if [ -f "${REPO_ROOT}/scripts/generar-manifiesto.py" ]; then
    python3 "${REPO_ROOT}/scripts/generar-manifiesto.py" --check
else
    echo "ℹ️ scripts/generar-manifiesto.py no encontrado (omitido)."
fi

# 9. Consistencia Interna de Hoja de Ruta y Tarea Activa (ROADMAP.md y ACTIVE_TASK.md)
printf "[9/10] "
python3 "${SCRIPT_DIR}/verify_roadmap_consistency.py"

# 10. Sincronización Documental y Pruebas Obligatorias (con soporte Fast-Path Documental DOCS_ONLY)
printf "[10/10] "
ALL_CHANGED=$( { git diff --name-only HEAD 2>/dev/null || true; git ls-files --others --exclude-standard 2>/dev/null || true; } | sort -u )
CODE_CHANGES=$(echo "${ALL_CHANGED}" | grep -E '^(fastapi|vue3|node-backend|python|react-frontend|bash-scripts|php|mcp-server)/' | grep -vE '\.md$' || true)
DOC_CHANGES=$(echo "${ALL_CHANGED}" | grep -E '(\.md$|^docs/)' || true)

if [ -n "${CODE_CHANGES}" ]; then
  CODE_COUNT=$(echo "${CODE_CHANGES}" | grep -c . || true)
  TEST_CHANGES=$(echo "${ALL_CHANGED}" | grep -E '(\.unit\.(py|ts|tsx)|\.e2e\.ts|test_.*\.py|.*\.test\.(ts|js)|\.feature|\.bats)' || true)
  TEST_COUNT=$( [ -n "${TEST_CHANGES}" ] && echo "${TEST_CHANGES}" | grep -c . || echo 0 )
  KARATE_CHANGES=$(echo "${ALL_CHANGED}" | grep -E '\.feature(\.example)?$' || true)
  KARATE_STATUS=$( [ -n "${KARATE_CHANGES}" ] && echo "Karate BDD actualizado" || echo "sin cambios .feature" )
  DOC_COUNT=$( [ -n "${DOC_CHANGES}" ] && echo "${DOC_CHANGES}" | grep -c . || echo 0 )

  if [ "${TEST_COUNT}" -gt 0 ] && [ "${DOC_COUNT}" -gt 0 ]; then
    echo "✔ [Doc & Test Sync] ${CODE_COUNT} archivo(s) de stack | ${TEST_COUNT} prueba(s) (${KARATE_STATUS}) | ${DOC_COUNT} doc(s) sincronizados."
  else
    echo "⚠️ [Doc & Test Sync] Cambios detectados en ${CODE_COUNT} archivo(s) de stack:"
    while IFS= read -r line; do
      [ -n "${line}" ] && echo "  - ${line}"
    done <<< "${CODE_CHANGES}"
    if [ "${TEST_COUNT}" -eq 0 ]; then
      echo "  ⚠️ ADVERTENCIA: Se modificaron stacks pero NO se detectan pruebas unitarias, E2E o BDD nuevas o modificadas."
    fi
    if [ "${DOC_COUNT}" -eq 0 ]; then
      echo "  ⚠️ ADVERTENCIA: Se modificó código pero NO se han actualizado docs/, CHANGELOG.md, TESTING.md o README.md."
    fi
  fi
elif [ -n "${DOC_CHANGES}" ]; then
  DOC_COUNT=$(echo "${DOC_CHANGES}" | grep -c . || true)
  echo "✔ [Doc Fast-Path] Solo cambios de documentación (${DOC_COUNT} archivo(s) .md); 0 cambios de código (se omite re-ejecución de suites y grafo AST)."
else
  echo "✔ [Doc & Test Sync] Árbol de código limpio (0 cambios pendientes en stacks)."
fi

echo "✅ CERTIFICACIÓN EXITOSA: El proyecto cumple con el estándar 11X"
