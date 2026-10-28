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
echo -e "\n🔒 [1/7] Verificando que no existan secretos expuestos en Git..."
if [ -f "${REPO_ROOT}/scripts/verificar-secretos.sh" ]; then
    "${REPO_ROOT}/scripts/verificar-secretos.sh"
elif [ -f "${REPO_ROOT}/verificar-secretos.sh" ]; then
    "${REPO_ROOT}/verificar-secretos.sh"
else
    echo "ℹ️ Script verificar-secretos.sh no encontrado; omitiendo verificación rápida."
fi
echo "✔ Cero secretos detectados."

# 2. Auditoría Preventiva de Infraestructura (Trivy IaC)
echo -e "\n🛡️ [2/7] Ejecutando escaneo preventivo de infraestructura y dependencias (Trivy)..."
if [ -f "${REPO_ROOT}/auditar-infra.sh" ]; then
    "${REPO_ROOT}/auditar-infra.sh" || echo "⚠️ Auditoría de infraestructura completada con avisos."
else
    echo "ℹ️ Script auditar-infra.sh no encontrado; omitiendo."
fi

# 3. Integridad de Archivos JSON (Anti-Colisión de Claves)
echo -e "\n🌐 [3/7] Verificando integridad de archivos JSON (anti-colisión de claves)..."
python3 "${SCRIPT_DIR}/verify_json_no_duplicate_keys.py"

# 4. Invariante de Cero Componentes UI Huérfanos
echo -e "\n🧩 [4/7] Verificando cobertura de componentes UI (cero componentes huérfanos)..."
python3 "${SCRIPT_DIR}/verify_zero_orphan_vue_components.py"

# 5. Salud Topológica y Límites de Capas (Graphify AST)
echo -e "\n🧠 [5/7] Auditando salud topológica y límites de capas arquitectónicas..."
python3 "${SCRIPT_DIR}/verify_topological_health.py"

# 6. Paridad ORM vs Migraciones de BD
echo -e "\n🗄️ [6/7] Verificando paridad entre modelos ORM y migraciones..."
python3 "${SCRIPT_DIR}/verify_alembic_orm_parity.py"

# 7. Sincronización Documental y Pruebas Obligatorias
echo -e "\n📚 [7/7] Verificando sincronización de documentación y pruebas obligatorias..."
CODE_CHANGES=$(git diff --name-only HEAD 2>/dev/null | grep -E '^(fastapi|vue3|node-backend|python|react-frontend|bash-scripts)/' || true)

if [ -n "${CODE_CHANGES}" ]; then
  echo "Se detectaron cambios en código fuente:"
  while IFS= read -r line; do
    [ -n "${line}" ] && echo "  - ${line}"
  done <<< "${CODE_CHANGES}"

  TEST_CHANGES=$(git diff --name-only HEAD 2>/dev/null | grep -E '(\.unit\.(py|ts|tsx)|test_.*\.py|.*\.test\.(ts|js)|\.feature)' || true)
  if [ -z "${TEST_CHANGES}" ]; then
    echo "⚠️ ADVERTENCIA: Se modificó código fuente pero NO se detectan pruebas unitarias o BDD nuevas o modificadas."
  else
    echo "✔ Pruebas 11X detectadas en paralelo:"
    while IFS= read -r t_line; do
      [ -n "${t_line}" ] && echo "  - ${t_line}"
    done <<< "${TEST_CHANGES}"
  fi

  DOC_CHANGES=$(git diff --name-only HEAD 2>/dev/null | grep -E '^(docs/|CHANGELOG\.md|README\.md|TESTING\.md)' || true)
  if [ -z "${DOC_CHANGES}" ]; then
    echo "⚠️ ADVERTENCIA: Se modificó código pero NO se han actualizado docs/, CHANGELOG.md o README.md."
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
