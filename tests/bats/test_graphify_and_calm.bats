#!/usr/bin/env bats
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

_install_calm_node_and_cli_stubs() {
  local bin_dir="$1"
  local real_node=""
  real_node="$(command -v node || true)"
  if [ -n "${real_node}" ] && [ -x "${real_node}" ]; then
    ln -sf "${real_node}" "${bin_dir}/node"
  else
    cat >"${bin_dir}/node" <<'PYEOF'
#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

REQUIRED_NODES = (
    "qa-11x-ai-ide-host",
    "mcp-qa-11x-server",
    "ephemeral-docker-runners",
    "postgres17-rls-store",
    "keydb-state-cache",
    "governance-certification-gate",
)
REQUIRED_EDGES = (
    ("qa-11x-ai-ide-host", "mcp-qa-11x-server"),
    ("mcp-qa-11x-server", "ephemeral-docker-runners"),
    ("ephemeral-docker-runners", "postgres17-rls-store"),
    ("ephemeral-docker-runners", "keydb-state-cache"),
    ("mcp-qa-11x-server", "governance-certification-gate"),
)
REQUIRED_CONTROLS = (
    "prompt-injection-guard",
    "rule-zero-ephemeral-docker",
    "postgres-rls-isolation",
    "worm-hmac-audit-chain",
    "vault-aes-256-gcm",
    "git-closure-human-gate",
    "cli-tty-anti-hang-guard",
)

def fail(rel_path: str, errors: list[str]) -> None:
    sys.stderr.write(f"❌ [CALM] {rel_path} rechazado ({len(errors)} violación(es)):\n")
    for err in errors:
        sys.stderr.write(f"  - {err}\n")
    sys.exit(1)

script = sys.stdin.read()
if "CALM_OUT" in script:
    raw = os.environ.get("CALM_OUT", "")
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        report = json.loads(raw[start : end + 1])
        if report.get("hasErrors") or report.get("hasWarnings"):
            sys.stderr.write("❌ [CALM] @finos/calm-cli reportó errores/advertencias\n")
            sys.exit(1)
    sys.exit(0)

root = Path(os.getcwd()).resolve()
rel = os.environ.get("ARCH_INPUT", "architecture/qa-11x.calm.json")
if not rel or "\x00" in rel or Path(rel).is_absolute():
    fail(rel, ["[PATH_TRAVERSAL] Ruta inválida o absoluta."])
candidate = (root / rel).resolve()
try:
    rel_clean = candidate.relative_to(root).as_posix()
except ValueError:
    fail(rel, [f"[PATH_TRAVERSAL] La ruta {rel} escapa el workspace."])
if not candidate.is_file():
    fail(rel, [f"[FILE_NOT_FOUND] Archivo no encontrado: {rel}"])

dups: list[str] = []
def _hook(pairs: list[tuple[str, object]]) -> dict[str, object]:
    seen: set[str] = set()
    out: dict[str, object] = {}
    for k, v in pairs:
        if k in seen:
            dups.append(k)
        seen.add(k)
        out[k] = v
    return out

raw_txt = candidate.read_text(encoding="utf-8")
doc = json.loads(raw_txt, object_pairs_hook=_hook)
if dups:
    fail(rel, [f"[DUPLICATE_JSON_KEY] Claves duplicadas: {', '.join(dups)}"])

nodes = doc.get("nodes") or []
node_ids = {n.get("unique-id") for n in nodes if isinstance(n, dict) and n.get("unique-id")}
rels = doc.get("relationships") or []
edges: set[tuple[str, str]] = set()
connected: set[str] = set()
for r in rels:
    conn = (r.get("relationship-type") or {}).get("connects") or {}
    s = (conn.get("source") or {}).get("node")
    d = (conn.get("destination") or {}).get("node")
    if s in node_ids and d in node_ids:
        edges.add((s, d))
        connected.update((s, d))

is_upstream = (root / "scripts" / "generar-manifiesto.py").is_file()
errors: list[str] = []
if is_upstream:
    for req_n in REQUIRED_NODES:
        if req_n not in node_ids:
            errors.append(f"[MISSING_REQUIRED_NODE] {req_n}")
for nid in node_ids:
    if nid not in connected:
        errors.append(f"[ORPHAN_CRITICAL_NODE] {nid}")
if is_upstream:
    for src, dst in REQUIRED_EDGES:
        if (src, dst) not in edges:
            errors.append(f"[MISSING_REQUIRED_RELATIONSHIP] {src}->{dst}")
ctrls = doc.get("controls") if isinstance(doc.get("controls"), dict) else {}
for req_c in REQUIRED_CONTROLS:
    if req_c not in ctrls:
        errors.append(f"[MISSING_REQUIRED_CONTROL] {req_c}")

if errors:
    fail(rel_clean, errors)
sys.stdout.write(f"{rel_clean}|{len(nodes)}|{len(rels)}|{len(ctrls)}")
PYEOF
    chmod +x "${bin_dir}/node"
  fi
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

@test "validate_calm_architecture.sh (Trimodal Virgen / Nominal / Degradado): valida arquitectura CALM real y bloquea anomalias" {
  local work="${BATS_TEST_TMPDIR}/calm_tri_ws"
  local bin_dir="${BATS_TEST_TMPDIR}/calm_tri_bin"
  mkdir -p "${work}/.agents/scripts" "${work}/architecture" "${work}/scripts"
  cp "${CALM_SCRIPT}" "${work}/.agents/scripts/validate_calm_architecture.sh"
  cp "${REPO_ROOT}/architecture/qa-11x.calm.json" "${work}/architecture/qa-11x.calm.json"
  touch "${work}/scripts/generar-manifiesto.py"
  chmod +x "${work}/.agents/scripts/validate_calm_architecture.sh"
  _populate_minimal_bin "${bin_dir}"
  _install_calm_node_and_cli_stubs "${bin_dir}"

  # 1. Virgen (archivo inexistente)
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch architecture/missing.calm.json
  assert_failure 1
  assert_output --partial "[FILE_NOT_FOUND]"

  # 2. Nominal (arquitectura real + argumento posicional + @finos/calm-cli limpio)
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" architecture/qa-11x.calm.json
  assert_success
  assert_output --partial "✅ [CALM] architecture/qa-11x.calm.json validado"

  # 3. Degradado: path traversal
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch ../escape.json
  assert_failure 1
  assert_output --partial "[PATH_TRAVERSAL]"

  # 4. Degradado: clave JSON duplicada
  printf '{"nodes":[],"nodes":[]}\n' >"${work}/architecture/dup.calm.json"
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch architecture/dup.calm.json
  assert_failure 1
  assert_output --partial "[DUPLICATE_JSON_KEY]"

  # 5. Degradado: nodos requeridos ausentes / huérfanos en repo fuente
  printf '{"nodes":[{"unique-id":"only-one"}],"relationships":[],"controls":{}}\n' >"${work}/architecture/orphan.calm.json"
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch architecture/orphan.calm.json
  assert_failure 1
  assert_output --partial "[MISSING_REQUIRED_NODE]"
  assert_output --partial "[ORPHAN_CRITICAL_NODE]"

  # 6. Degradado: @finos/calm-cli reporta hasErrors=true o exit 1
  run env PATH="${bin_dir}" MOCK_CALM_HAS_ERRORS=1 LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch architecture/qa-11x.calm.json
  assert_failure 1
  assert_output --partial "@finos/calm-cli reportó errores/advertencias"

  run env PATH="${bin_dir}" MOCK_CALM_CLI_FAIL=1 LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch architecture/qa-11x.calm.json
  assert_failure 1
  assert_output --partial "Falló @finos/calm-cli"

  # 7. Proyecto consumidor sin generar-manifiesto.py valida arquitectura propia sin exigir nodos del blueprint
  rm -f "${work}/scripts/generar-manifiesto.py"
  cat >"${work}/architecture/consumer.calm.json" <<'JSON'
{
  "nodes": [
    {
      "unique-id": "svc-api",
      "node-type": "service",
      "name": "Service API",
      "description": "Primary API boundary service",
      "controls": {
        "prompt-injection-guard": {},
        "rule-zero-ephemeral-docker": {},
        "postgres-rls-isolation": {},
        "worm-hmac-audit-chain": {},
        "vault-aes-256-gcm": {},
        "git-closure-human-gate": {},
        "cli-tty-anti-hang-guard": {}
      }
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
    "prompt-injection-guard": {"description": "Prompt guard", "requirements": [{"requirement-url": "https://example.org/c1"}]},
    "rule-zero-ephemeral-docker": {"description": "Rule Zero", "requirements": [{"requirement-url": "https://example.org/c2"}]},
    "postgres-rls-isolation": {"description": "RLS", "requirements": [{"requirement-url": "https://example.org/c3"}]},
    "worm-hmac-audit-chain": {"description": "WORM", "requirements": [{"requirement-url": "https://example.org/c4"}]},
    "vault-aes-256-gcm": {"description": "Vault", "requirements": [{"requirement-url": "https://example.org/c5"}]},
    "git-closure-human-gate": {"description": "Git Gate", "requirements": [{"requirement-url": "https://example.org/c6"}]},
    "cli-tty-anti-hang-guard": {"description": "TTY Guard", "requirements": [{"requirement-url": "https://example.org/c7"}]}
  }
}
JSON
  run env PATH="${bin_dir}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" architecture/consumer.calm.json
  assert_success
  assert_output --partial "✅ [CALM] architecture/consumer.calm.json validado"

  # 8. Modo contenedor (QA_IN_CONTAINER=1 + QA_CALM_IN_DOCKER=1) pasa /workspace/<rel_path> a calm-cli
  local calm_log="${BATS_TEST_TMPDIR}/calm_in_docker.log"
  : >"${calm_log}"
  run env PATH="${bin_dir}" QA_IN_CONTAINER=1 QA_CALM_IN_DOCKER=1 CALM_CLI_LOG="${calm_log}" LC_ALL=C bash "${work}/.agents/scripts/validate_calm_architecture.sh" --arch architecture/qa-11x.calm.json
  assert_success
  run cat "${calm_log}"
  assert_success
  assert_output --partial "validate -a /workspace/architecture/qa-11x.calm.json"

  # 9. Sin calm en PATH imprime advertencia de fallback determinista (L369) y valida igualmente
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

@test "validate_calm_architecture.sh: rechaza --arch= vacío con exit 1" {
  run bash "${CALM_SCRIPT}" --arch=
  assert_failure 1
  assert_output --partial "Falta argumento para --arch="
}
