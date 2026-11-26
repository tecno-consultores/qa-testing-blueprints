# SPDX-License-Identifier: MIT
# Copyright (C) 2026 QA Testing Blueprints Contributors

setup() {
  load '/opt/bats-libs/bats-support/load.bash'
  load '/opt/bats-libs/bats-assert/load.bash'

  if [ -f "${BATS_TEST_DIRNAME}/../../scripts/actualizar-grafos-graphify.sh" ]; then
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  elif [ -f "/repo/scripts/actualizar-grafos-graphify.sh" ]; then
    REPO_ROOT="/repo"
  else
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  fi

  GRAPHIFY_SCRIPT="${REPO_ROOT}/scripts/actualizar-grafos-graphify.sh"
  CALM_SCRIPT="${REPO_ROOT}/.agents/scripts/validate_calm_architecture.sh"
}

_populate_minimal_bin() {
  local bin_dir="$1"
  mkdir -p "${bin_dir}"
  local tool resolved
  for tool in bash sh dirname basename cd pwd find grep awk sort xargs git touch mkdir rm cp mv cat mktemp chmod chown tr head tail sed python3 env id; do
    resolved="$(command -v "${tool}" || true)"
    if [ -n "${resolved}" ]; then
      ln -sf "${resolved}" "${bin_dir}/${tool}"
    fi
  done
}

_setup_graphify_docker_stub() {
  local bin_dir="$1"
  local docker_log="$2"
  : >"${docker_log}"
  cat >"${bin_dir}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"${docker_log}"
if [ "\${1:-}" = "pull" ]; then
  exit 0
fi
if [ "\${MOCK_GRAPHIFY_FAIL:-0}" = "1" ]; then
  echo "simulated graphify failure" >&2
  exit 1
fi
mount_host=""
prev=""
for arg in "\$@"; do
  if [ "\${prev}" = "-v" ]; then
    mount_host="\${arg%%:*}"
  fi
  prev="\${arg}"
done
if [ -n "\${mount_host}" ] && printf '%s' "\$*" | grep -q "graphify extract"; then
  mkdir -p "\${mount_host}/graphify-out"
  printf '{"nodes":[],"links":[]}\n' >"\${mount_host}/graphify-out/graph.json"
fi
exit 0
EOF
  chmod +x "${bin_dir}/docker"
}

_install_calm_real_node_and_cli_stub() {
  local bin_dir="$1"
  local real_node=""
  real_node="$(command -v node || true)"
  if [ -z "${real_node}" ] || [ ! -x "${real_node}" ]; then
    return 1
  fi
  ln -sf "${real_node}" "${bin_dir}/node"
  cat >"${bin_dir}/calm" <<'EOF'
#!/usr/bin/env bash
if [ -n "${CALM_CLI_LOG:-}" ]; then
  printf '%s\n' "$*" >>"${CALM_CLI_LOG}"
fi
if [ "${MOCK_CALM_CLI_FAIL:-0}" = "1" ]; then
  echo "calm-cli syntax failure" >&2
  exit 1
fi
if [ "${MOCK_CALM_HAS_ERRORS:-0}" = "1" ]; then
  printf '{"hasErrors":true,"hasWarnings":false}\n'
  exit 0
fi
printf '{"hasErrors":false,"hasWarnings":false}\n'
exit 0
EOF
  chmod +x "${bin_dir}/calm"
}

@test "actualizar-grafos-graphify.sh (Virgen): repo vacio sin grafos construye grafo root en Docker pineado" {
  local work="${BATS_TEST_TMPDIR}/graph_virgin_ws"
  local bin_dir="${BATS_TEST_TMPDIR}/graph_virgin_bin"
  local docker_log="${BATS_TEST_TMPDIR}/graph_virgin_docker.log"
  mkdir -p "${work}/scripts"
  cp "${GRAPHIFY_SCRIPT}" "${work}/scripts/actualizar-grafos-graphify.sh"
  chmod +x "${work}/scripts/actualizar-grafos-graphify.sh"
  _populate_minimal_bin "${bin_dir}"
  _setup_graphify_docker_stub "${bin_dir}" "${docker_log}"

  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh"
  assert_success
  assert_output --partial "Actualizados: 1 (root)"
  assert_output --partial "Omitidos sin cambios de código: 0 (ninguno)"
  [ -f "${work}/graphify-out/graph.json" ]

  run grep -F "sinfallas/remote-graphify@sha256:" "${docker_log}"
  assert_success
  run grep -F -- "-e OLLAMA_BASE_URL=" "${docker_log}"
  assert_success
  run grep -F -- "--security-opt=no-new-privileges:true" "${docker_log}"
  assert_success
  run grep -F -- "-u $(id -u):$(id -g)" "${docker_log}"
  assert_success
  run grep -F -- "-e HOME=/tmp" "${docker_log}"
  assert_success
}

@test "actualizar-grafos-graphify.sh (Nominal): incremental por mtime, git dirty no-.md, target stack y --all" {
  local work="${BATS_TEST_TMPDIR}/graph_nom_ws"
  local bin_dir="${BATS_TEST_TMPDIR}/graph_nom_bin"
  local docker_log="${BATS_TEST_TMPDIR}/graph_nom_docker.log"
  mkdir -p "${work}/scripts" "${work}/fastapi/graphify-out" "${work}/graphify-out"
  cp "${GRAPHIFY_SCRIPT}" "${work}/scripts/actualizar-grafos-graphify.sh"
  chmod +x "${work}/scripts/actualizar-grafos-graphify.sh"
  printf '[project]\nname="api"\n' >"${work}/fastapi/pyproject.toml"
  printf 'def ping():\n    return True\n' >"${work}/fastapi/app.py"
  printf '# Docs\n' >"${work}/fastapi/README.md"
  printf '{"nodes":[],"links":[]}\n' >"${work}/fastapi/graphify-out/graph.json"
  printf '{"nodes":[],"links":[]}\n' >"${work}/graphify-out/graph.json"

  git -C "${work}" init -q
  git -C "${work}" config user.email "qa@example.com"
  git -C "${work}" config user.name "QA Bot"
  git -C "${work}" add .
  git -C "${work}" commit -q -m "chore: baseline"

  # 1. Todo más viejo que graph.json -> omite root y fastapi
  touch -t 202601010000 "${work}/scripts/actualizar-grafos-graphify.sh" "${work}/fastapi/app.py" "${work}/fastapi/README.md" "${work}/fastapi/pyproject.toml"
  touch -t 202601010010 "${work}/graphify-out/graph.json" "${work}/fastapi/graphify-out/graph.json"
  _populate_minimal_bin "${bin_dir}"
  _setup_graphify_docker_stub "${bin_dir}" "${docker_log}"

  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh"
  assert_success
  assert_output --partial "Actualizados: 0 (ninguno)"
  assert_output --partial "Omitidos sin cambios de código: 2 (root fastapi)"

  # 2. Cambio en *.md solamente con mtime anterior -> sigue omitiendo
  printf '# Docs v2\n' >"${work}/fastapi/README.md"
  touch -t 202601010000 "${work}/fastapi/README.md"
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh"
  assert_success
  assert_output --partial "Actualizados: 0 (ninguno)"

  # 2b. Cambio en *.md UTF-8 no-ASCII (docs/guía.md) con mtime anterior -> sigue omitiendo (core.quotePath=false)
  mkdir -p "${work}/docs"
  printf '# Guía UTF-8\n' >"${work}/docs/guía.md"
  touch -t 202601010000 "${work}/docs/guía.md"
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh"
  assert_success
  assert_output --partial "Actualizados: 0 (ninguno)"
  assert_output --partial "Omitidos sin cambios de código: 2 (root fastapi)"
  rm -rf "${work}/docs"

  # 3. Script en raíz más nuevo que graph.json -> actualiza root y omite fastapi
  touch -t 202601010020 "${work}/scripts/actualizar-grafos-graphify.sh"
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh"
  assert_success
  assert_output --partial "Actualizados: 1 (root)"
  assert_output --partial "Omitidos sin cambios de código: 1 (fastapi)"
  touch -t 202601010000 "${work}/scripts/actualizar-grafos-graphify.sh"
  touch -t 202601010030 "${work}/graphify-out/graph.json"

  # 4. Cambio sucio en git aunque mtime sea antiguo -> actualiza fastapi y root
  printf 'def ping():\n    return 2\n' >"${work}/fastapi/app.py"
  touch -t 202601010000 "${work}/fastapi/app.py"
  touch -t 202601010030 "${work}/fastapi/graphify-out/graph.json"
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh"
  assert_success
  assert_output --partial "Actualizados: 2 (root fastapi)"
  git -C "${work}" checkout -- fastapi/app.py fastapi/README.md
  touch -t 202601010000 "${work}/fastapi/app.py" "${work}/fastapi/README.md"
  touch -t 202601010040 "${work}/graphify-out/graph.json" "${work}/fastapi/graphify-out/graph.json"

  # 4b. GRAPH_REPORT.md con 'Built from commit:' distinto de HEAD -> actualiza root; igual a HEAD -> omite
  printf '# Graph Report\n- Built from commit: `00000000`\n' >"${work}/graphify-out/GRAPH_REPORT.md"
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh"
  assert_success
  assert_output --partial "Actualizados: 1 (root)"
  assert_output --partial "Omitidos sin cambios de código: 1 (fastapi)"

  local cur_short
  cur_short=$(git -C "${work}" rev-parse --short=8 HEAD)
  printf '# Graph Report\n- Built from commit: `%s`\n' "${cur_short}" >"${work}/graphify-out/GRAPH_REPORT.md"
  touch -t 202601010050 "${work}/graphify-out/graph.json"
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh"
  assert_success
  assert_output --partial "Actualizados: 0 (ninguno)"
  assert_output --partial "Omitidos sin cambios de código: 2 (root fastapi)"

  # 5. Stack específico + --all
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh" fastapi
  assert_success
  assert_output --partial "Grafo semántico actualizado para 'fastapi' -> fastapi/graphify-out/graph.json"

  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh" --all
  assert_success
  assert_output --partial "Actualizados: 2 (root fastapi)"
}

@test "actualizar-grafos-graphify.sh (Degradado): falla sin docker y propaga fallo en extraccion" {
  local work="${BATS_TEST_TMPDIR}/graph_deg_ws"
  local bin_dir="${BATS_TEST_TMPDIR}/graph_deg_bin"
  local docker_log="${BATS_TEST_TMPDIR}/graph_deg_docker.log"
  mkdir -p "${work}/scripts"
  cp "${GRAPHIFY_SCRIPT}" "${work}/scripts/actualizar-grafos-graphify.sh"
  chmod +x "${work}/scripts/actualizar-grafos-graphify.sh"
  _populate_minimal_bin "${bin_dir}"

  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh"
  assert_failure 1
  assert_output --partial "Docker no está instalado"

  _setup_graphify_docker_stub "${bin_dir}" "${docker_log}"
  run env PATH="${bin_dir}" MOCK_GRAPHIFY_FAIL=1 LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh"
  assert_failure 1
  assert_output --partial "Error al extraer el grafo"

  # Path traversal y symlink escape fuera de REPO_ROOT en TARGET_STACK
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh" "../escape"
  assert_failure 1
  assert_output --partial "inválido o fuera de REPO_ROOT"

  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh" "/tmp"
  assert_failure 1
  assert_output --partial "inválido o fuera de REPO_ROOT"
}

@test "validate_calm_architecture.sh (CLI & Docker Rule Zero): --help, flags invalidos e invocacion --network none" {
  run env LC_ALL=C bash "${CALM_SCRIPT}" --help
  assert_success
  assert_output --partial "Uso: validate_calm_architecture.sh"

  run env LC_ALL=C bash "${CALM_SCRIPT}" --unknown-flag
  assert_failure 1
  assert_output --partial "Argumento no soportado"

  run env LC_ALL=C bash "${CALM_SCRIPT}" --arch ""
  assert_failure 1
  assert_output --partial "Falta argumento para --arch"

  run env LC_ALL=C bash "${CALM_SCRIPT}" architecture/qa-11x.calm.json architecture/extra.calm.json
  assert_failure 1
  assert_output --partial "Demasiados argumentos posicionales"

  local work="${BATS_TEST_TMPDIR}/calm_docker_ws"
  local bin_dir="${BATS_TEST_TMPDIR}/calm_docker_bin"
  local docker_log="${BATS_TEST_TMPDIR}/calm_docker.log"
  mkdir -p "${work}/.agents/scripts"
  cp "${CALM_SCRIPT}" "${work}/.agents/scripts/validate_calm_architecture.sh"
  chmod +x "${work}/.agents/scripts/validate_calm_architecture.sh"
  _populate_minimal_bin "${bin_dir}"
  cat >"${bin_dir}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >"${docker_log}"
exit 0
EOF
  chmod +x "${bin_dir}/docker"

  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch=architecture/qa-11x.calm.json
  assert_success
  run cat "${docker_log}"
  assert_success
  assert_output --partial "--network none"
  assert_output --partial "ARCH_INPUT=architecture/qa-11x.calm.json"
  assert_output --partial ":ro"
  assert_output --partial "sinfallas/base-node-ionic:26@sha256:"
}

@test "validate_calm_architecture.sh (Trimodal Virgen / Nominal / Degradado): valida arquitectura CALM real en Node.js real y bloquea anomalias" {
  local work="${BATS_TEST_TMPDIR}/calm_tri_ws"
  local bin_dir="${BATS_TEST_TMPDIR}/calm_tri_bin"
  mkdir -p "${work}/.agents/scripts" "${work}/architecture" "${work}/scripts"
  cp "${CALM_SCRIPT}" "${work}/.agents/scripts/validate_calm_architecture.sh"
  cp "${REPO_ROOT}/architecture/qa-11x.calm.json" "${work}/architecture/qa-11x.calm.json"
  touch "${work}/scripts/generar-manifiesto.py"
  chmod +x "${work}/.agents/scripts/validate_calm_architecture.sh"
  _populate_minimal_bin "${bin_dir}"
  if ! _install_calm_real_node_and_cli_stub "${bin_dir}"; then
    skip "Node.js real no disponible en esta imagen; cobertura completa de los 14 códigos CALM ejecutada en NODE_IMG (mcp-server/tests/calm.test.ts)"
  fi

  # 1. Virgen (archivo inexistente)
  run env QA_IN_CONTAINER=1 PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch architecture/missing.calm.json
  assert_failure 1
  assert_output --partial "[FILE_NOT_FOUND]"

  # 2. Nominal (arquitectura real + argumento posicional + @finos/calm-cli limpio)
  run env QA_IN_CONTAINER=1 PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" architecture/qa-11x.calm.json
  assert_success
  assert_output --partial "✅ [CALM] architecture/qa-11x.calm.json validado"

  # 3. Degradado: path traversal
  run env QA_IN_CONTAINER=1 PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch ../escape.json
  assert_failure 1
  assert_output --partial "[PATH_TRAVERSAL]"

  # 4. Degradado: clave JSON duplicada
  printf '{"nodes":[],"nodes":[]}\n' >"${work}/architecture/dup.calm.json"
  run env QA_IN_CONTAINER=1 PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch architecture/dup.calm.json
  assert_failure 1
  assert_output --partial "[DUPLICATE_JSON_KEY]"

  # 5. Degradado: nodos requeridos ausentes / huérfanos en repo fuente
  printf '{"nodes":[{"unique-id":"only-one","node-type":"service","name":"Only","description":"Orphan"}],"relationships":[],"controls":{}}\n' >"${work}/architecture/orphan.calm.json"
  run env QA_IN_CONTAINER=1 PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch architecture/orphan.calm.json
  assert_failure 1
  assert_output --partial "[MISSING_REQUIRED_NODE]"
  assert_output --partial "[ORPHAN_CRITICAL_NODE]"

  # 6. Degradado: @finos/calm-cli reporta hasErrors=true o exit 1
  run env QA_IN_CONTAINER=1 PATH="${bin_dir}" MOCK_CALM_HAS_ERRORS=1 LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch architecture/qa-11x.calm.json
  assert_failure 1
  assert_output --partial "@finos/calm-cli reportó errores/advertencias"

  run env QA_IN_CONTAINER=1 PATH="${bin_dir}" MOCK_CALM_CLI_FAIL=1 LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch architecture/qa-11x.calm.json
  assert_failure 1
  assert_output --partial "Falló @finos/calm-cli"

  # 7. Proyecto consumidor sin generar-manifiesto.py valida arquitectura propia sin exigir controles ni nodos del monorepo (--profile generic / auto)
  rm -f "${work}/scripts/generar-manifiesto.py"
  cat >"${work}/architecture/consumer.calm.json" <<'JSON'
{
  "nodes": [
    {
      "unique-id": "svc-api",
      "node-type": "service",
      "name": "Service API",
      "description": "Primary API boundary service"
    },
    {
      "unique-id": "svc-db",
      "node-type": "database",
      "name": "Primary DB",
      "description": "Tenant isolated datastore"
    }
  ],
  "relationships": [
    {
      "unique-id": "rel-1",
      "relationship-type": {"connects": {"source": {"node": "svc-api"}, "destination": {"node": "svc-db"}}}
    }
  ],
  "controls": {
    "tenant-isolation": {
      "description": "Consumer tenant isolation",
      "nodes": ["svc-api", "svc-db"],
      "requirements": [{"requirement-url": "https://example.org/c1"}]
    }
  }
}
JSON
  run env QA_IN_CONTAINER=1 PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" architecture/consumer.calm.json
  assert_success
  assert_output --partial "✅ [CALM] architecture/consumer.calm.json validado"

  # 8. Modo contenedor (QA_IN_CONTAINER=1 + QA_CALM_IN_DOCKER=1) pasa /workspace/<rel_path> a calm-cli
  local calm_log="${BATS_TEST_TMPDIR}/calm_in_docker.log"
  : >"${calm_log}"
  run env PATH="${bin_dir}" QA_IN_CONTAINER=1 QA_CALM_IN_DOCKER=1 CALM_CLI_LOG="${calm_log}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --profile qa-11x-self --arch architecture/qa-11x.calm.json
  assert_success
  run cat "${calm_log}"
  assert_success
  assert_output --partial "validate -a /workspace/architecture/qa-11x.calm.json"

  # 9. Sin calm en PATH imprime advertencia de fallback determinista y valida igualmente
  local no_calm_bin="${BATS_TEST_TMPDIR}/no_calm_bin"
  mkdir -p "${no_calm_bin}"
  _populate_minimal_bin "${no_calm_bin}"
  cp "${bin_dir}/node" "${no_calm_bin}/node"
  run env PATH="${no_calm_bin}" QA_IN_CONTAINER=1 LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" architecture/qa-11x.calm.json
  assert_success
  assert_output --partial "@finos/calm-cli no detectado en PATH"
}

@test "actualizar-grafos-graphify.sh: cubre traversal, symlink escape y dir ilegible (L117-133)" {
  local work="${BATS_TEST_TMPDIR}/graph_cov_ws"
  local bin_dir="${BATS_TEST_TMPDIR}/graph_cov_bin"
  local docker_log="${BATS_TEST_TMPDIR}/graph_cov_docker.log"
  mkdir -p "${work}/scripts"
  cp "${GRAPHIFY_SCRIPT}" "${work}/scripts/actualizar-grafos-graphify.sh"
  chmod +x "${work}/scripts/actualizar-grafos-graphify.sh"
  _populate_minimal_bin "${bin_dir}"
  _setup_graphify_docker_stub "${bin_dir}" "${docker_log}"

  ln -s /tmp "${work}/ext_symlink"
  mkdir -p "${work}/locked_dir"
  chmod 000 "${work}/locked_dir"
  ln -s "/nonexistent_target_11x" "${work}/dangling_dir" || true

  PATH="${bin_dir}" LC_ALL=C run "${work}/scripts/actualizar-grafos-graphify.sh" "/abs_bad"
  assert_failure 1

  PATH="${bin_dir}" LC_ALL=C run "${work}/scripts/actualizar-grafos-graphify.sh" "ext_symlink"
  assert_failure 1
  assert_output --partial "escapa de REPO_ROOT"

  # Directorio que falla pwd -P / cd (L126-127): subdirectorio sin permiso de ejecucion o enlace roto tras -d mock
  local locked_parent="${work}/unresolvable_sub"
  mkdir -p "${locked_parent}"
  chmod 111 "${work}/locked_dir"
  ln -s "${work}/locked_dir/nested" "${locked_parent}/link" 2>/dev/null || true
  mkdir -p "${work}/bad_chmod"
  chmod 000 "${work}/bad_chmod"
  PATH="${bin_dir}" LC_ALL=C run "${work}/scripts/actualizar-grafos-graphify.sh" "bad_chmod"
  chmod 755 "${work}/bad_chmod" "${work}/locked_dir"
  assert_failure 1
}

@test "actualizar-grafos-graphify.sh: cubre stack directo, error en extract_graph_in_dir y autodetección src/app/*.sh" {
  local work="${BATS_TEST_TMPDIR}/graph_extra_ws"
  local bin_dir="${BATS_TEST_TMPDIR}/graph_extra_bin"
  mkdir -p "${work}/scripts" "${work}/fastapi/src" "${work}/python/app" "${work}/bash-scripts" "${bin_dir}"
  cp "${GRAPHIFY_SCRIPT}" "${work}/scripts/actualizar-grafos-graphify.sh"
  chmod +x "${work}/scripts/actualizar-grafos-graphify.sh"
  printf '#!/usr/bin/env bash\necho ok\n' >"${work}/bash-scripts/helper.sh"
  _populate_minimal_bin "${bin_dir}"

  cat >"${bin_dir}/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "${FAIL_GRAPHIFY:-0}" == "1" ]]; then
  echo "simulated graphify error" >&2
  exit 1
fi
for a in "$@"; do
  if [[ "$a" == *":/app" ]]; then
    host_dir="${a%:/app}"
    mkdir -p "${host_dir}/graphify-out"
    printf '{"nodes":[],"links":[]}\n' >"${host_dir}/graphify-out/graph.json"
  fi
done
exit 0
EOF
  chmod +x "${bin_dir}/docker"

  # 1. Target explícito exitoso
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh" fastapi
  assert_success
  assert_output --partial "Grafo semántico actualizado para 'fastapi'"
  [ -f "${work}/fastapi/graphify-out/graph.json" ]

  # 2. Autodetección de stacks con src/, app/ y *.sh sueltos
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh" --all
  assert_success
  [ -f "${work}/python/graphify-out/graph.json" ]
  [ -f "${work}/bash-scripts/graphify-out/graph.json" ]

  # 3. Error en extract_graph_in_dir emite log_file y retorna 1
  run env FAIL_GRAPHIFY=1 PATH="${bin_dir}" LC_ALL=C bash "${work}/scripts/actualizar-grafos-graphify.sh" fastapi
  assert_failure 1
  assert_output --partial "simulated graphify error"
}

@test "validate_calm_architecture.sh: rechaza --arch= vacío, --profile vacío/inválido y propaga CALM_PROFILE" {
  run bash "${CALM_SCRIPT}" --arch=
  assert_failure 1
  assert_output --partial "Falta argumento para --arch="

  run bash "${CALM_SCRIPT}" --profile
  assert_failure 1
  assert_output --partial "Falta argumento para --profile"

  run bash "${CALM_SCRIPT}" --profile=
  assert_failure 1
  assert_output --partial "Falta argumento para --profile="

  run bash "${CALM_SCRIPT}" --profile invalid-prof
  assert_failure 1
  assert_output --partial "Perfil no soportado"

  local prof_bin="${BATS_TEST_TMPDIR}/calm_prof_bin"
  local prof_log="${BATS_TEST_TMPDIR}/calm_prof_docker.log"
  _populate_minimal_bin "${prof_bin}"
  cat >"${prof_bin}/docker" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >>"${prof_log}"
exit 0
EOF
  chmod +x "${prof_bin}/docker"

  run env QA_IN_CONTAINER=0 PATH="${prof_bin}" LC_ALL=C bash "${CALM_SCRIPT}" --profile=generic
  assert_success
  run grep -F "CALM_PROFILE=generic" "${prof_log}"
  assert_success

  run env QA_IN_CONTAINER=0 PATH="${prof_bin}" LC_ALL=C bash "${CALM_SCRIPT}" --profile qa-11x-self
  assert_success
  run grep -F "CALM_PROFILE=qa-11x-self" "${prof_log}"
  assert_success
}

@test "validate_calm_architecture.sh (Hito 33): omite con SKIPPED en consumidor non-enterprise sin CALM y autodetecta architecture/*.calm.json" {
  local work="${BATS_TEST_TMPDIR}/consumer_calm_ws"
  local fake_bin="${BATS_TEST_TMPDIR}/consumer_calm_bin"
  local docker_log="${BATS_TEST_TMPDIR}/consumer_calm_docker.log"
  mkdir -p "${work}/.agents/scripts"
  cp "${CALM_SCRIPT}" "${work}/.agents/scripts/validate_calm_architecture.sh"
  chmod +x "${work}/.agents/scripts/validate_calm_architecture.sh"
  _populate_minimal_bin "${fake_bin}"
  cat >"${fake_bin}/docker" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >>"${docker_log}"
exit 0
EOF
  chmod +x "${fake_bin}/docker"

  # 0. Consumidor sin .qa-11x.json -> default standard -> SKIPPED (exit 0)
  run env QA_IN_CONTAINER=0 PATH="${fake_bin}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh"
  assert_success
  assert_output --partial "SKIPPED"

  # 1. Consumidor standard sin architecture/*.calm.json -> SKIPPED (exit 0)
  printf '{"schemaVersion":3,"tier":"standard"}\n' >"${work}/.qa-11x.json"
  run env QA_IN_CONTAINER=0 PATH="${fake_bin}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh"
  assert_success
  assert_output --partial "SKIPPED"
  [ ! -s "${docker_log}" ]

  # 2. Consumidor enterprise sin architecture/*.calm.json -> falla (exit 1)
  printf '{"schemaVersion":3,"tier":"enterprise"}\n' >"${work}/.qa-11x.json"
  run env QA_IN_CONTAINER=0 PATH="${fake_bin}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh"
  assert_failure 1

  # 2b. Upstream sin architecture/ -> cae a default architecture/qa-11x.calm.json (sin docker en PATH ejecuta inner_exec sin declare -f)
  local nodk_bin="${BATS_TEST_TMPDIR}/consumer_calm_nodk_bin"
  _populate_minimal_bin "${nodk_bin}"
  cat >"${nodk_bin}/node" <<'EOF'
#!/bin/sh
printf 'MOCK_NODE_ARCH=%s\n' "${ARCH_INPUT:-}" >&2
exit 1
EOF
  chmod +x "${nodk_bin}/node"
  mkdir -p "${work}/scripts"
  printf '# stub\n' >"${work}/scripts/generar-manifiesto.py"
  printf '{}\n' >"${work}/manifest.json"
  run env QA_IN_CONTAINER=0 PATH="${nodk_bin}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh"
  assert_failure 1
  assert_output --partial "MOCK_NODE_ARCH=architecture/qa-11x.calm.json"
  rm -f "${work}/scripts/generar-manifiesto.py" "${work}/manifest.json"

  # 3. Consumidor con architecture/mi-app.calm.json -> --arch explícito y autodetección
  mkdir -p "${work}/architecture"
  printf '{"nodes":[],"relationships":[]}\n' >"${work}/architecture/mi-app.calm.json"
  run env QA_IN_CONTAINER=0 PATH="${nodk_bin}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch architecture/mi-app.calm.json --profile invalid
  assert_failure 1
  run env QA_IN_CONTAINER=0 PATH="${fake_bin}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh"
  assert_success
  run grep -F "architecture/mi-app.calm.json" "${docker_log}"
  assert_success
}
