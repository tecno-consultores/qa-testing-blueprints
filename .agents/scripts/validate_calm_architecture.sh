#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CALM_DOCKER_IMAGE="${QA_NODE_IMAGE:-sinfallas/base-node-ionic:26@sha256:275f3d8bbfef87f4e836e4f77d92c0d199821154079b050eaef53ce33ae6de60}"
ARCH_ARG=""
ARCH_EXPLICIT=0
PROFILE_ARG="auto"

usage() {
  cat <<'EOF'
Uso: validate_calm_architecture.sh [--arch <ruta_relativa> | <ruta_relativa>] [--profile auto|generic|qa-11x-self]
Valida el modelo FINOS CALM y los controles bloqueantes QA-11X en Docker efímero (Rule Zero).
EOF
}

POSITIONAL_SET=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --arch)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        printf '❌ [CALM] Falta argumento para --arch\n' >&2
        exit 1
      fi
      ARCH_ARG="$2"
      ARCH_EXPLICIT=1
      shift 2
      ;;
    --arch=*)
      ARCH_ARG="${1#--arch=}"
      if [ -z "${ARCH_ARG}" ]; then
        printf '❌ [CALM] Falta argumento para --arch=\n' >&2
        exit 1
      fi
      ARCH_EXPLICIT=1
      shift
      ;;
    --profile)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        printf '❌ [CALM] Falta argumento para --profile\n' >&2
        exit 1
      fi
      PROFILE_ARG="$2"
      shift 2
      ;;
    --profile=*)
      PROFILE_ARG="${1#--profile=}"
      if [ -z "${PROFILE_ARG}" ]; then
        printf '❌ [CALM] Falta argumento para --profile=\n' >&2
        exit 1
      fi
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      printf '❌ [CALM] Argumento no soportado: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [ "${POSITIONAL_SET}" -eq 1 ]; then
        printf '❌ [CALM] Demasiados argumentos posicionales: %s\n' "$1" >&2
        usage >&2
        exit 1
      fi
      ARCH_ARG="$1"
      ARCH_EXPLICIT=1
      POSITIONAL_SET=1
      shift
      ;;
  esac
done

if [[ "${PROFILE_ARG}" != "auto" && "${PROFILE_ARG}" != "generic" && "${PROFILE_ARG}" != "qa-11x-self" ]]; then
  printf '❌ [CALM] Perfil no soportado: %s (use auto, generic o qa-11x-self)\n' "${PROFILE_ARG}" >&2
  exit 1
fi

detect_declared_tier() {
  local cfg="${REPO_ROOT}/.qa-11x.json"
  if [ -f "${cfg}" ]; then
    local matched
    matched="$(sed -n 's/.*"tier"[[:space:]]*:[[:space:]]*"\([a-zA-Z]*\)".*/\1/p' "${cfg}" | head -n 1 | tr '[:upper:]' '[:lower:]')"
    case "${matched}" in
      starter | standard | enterprise)
        printf '%s' "${matched}"
        return 0
        ;;
    esac
  fi
  printf 'standard'
}

resolve_default_calm_arch() {
  if [ "${ARCH_EXPLICIT}" -eq 1 ]; then
    return 0
  fi
  if [ -f "${REPO_ROOT}/architecture/qa-11x.calm.json" ]; then
    ARCH_ARG="architecture/qa-11x.calm.json"
    return 0
  fi
  local first_calm=""
  if [ -d "${REPO_ROOT}/architecture" ]; then
    first_calm="$(find "${REPO_ROOT}/architecture" -maxdepth 2 -type f -name '*.calm.json' | LC_ALL=C sort | head -n 1 || true)"
  fi
  if [ -n "${first_calm}" ]; then
    ARCH_ARG="${first_calm#"${REPO_ROOT}/"}"
    return 0
  fi
  local is_upstream=0
  if [ "${PROFILE_ARG}" = "qa-11x-self" ] || { [ -f "${REPO_ROOT}/scripts/generar-manifiesto.py" ] && [ -f "${REPO_ROOT}/manifest.json" ]; }; then
    is_upstream=1
  fi
  local effective_tier
  effective_tier="$(detect_declared_tier)"
  if [ "${is_upstream}" -eq 0 ] && [ "${effective_tier}" != "enterprise" ]; then
    printf '⚠️ [SKIPPED] Sin archivo architecture/*.calm.json (tier=%s; CALM obligatorio solo en enterprise).\n' "${effective_tier}"
    exit 0
  fi
  if [ "${is_upstream}" -eq 0 ] && [ "${effective_tier}" = "enterprise" ]; then
    printf '❌ [CALM] Tier enterprise requiere architecture/*.calm.json y no se encontró ninguno en %s/architecture.\n' "${REPO_ROOT}" >&2
    exit 1
  fi
  ARCH_ARG="architecture/qa-11x.calm.json"
}

resolve_default_calm_arch

run_calm_validation_payload() {
  node - <<'JSEOF'
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_NODES = [
  "qa-11x-ai-ide-host",
  "mcp-qa-11x-server",
  "ephemeral-docker-runners",
  "postgres17-rls-store",
  "keydb-state-cache",
  "governance-certification-gate",
];

const REQUIRED_EDGES = [
  ["qa-11x-ai-ide-host", "mcp-qa-11x-server"],
  ["mcp-qa-11x-server", "ephemeral-docker-runners"],
  ["ephemeral-docker-runners", "postgres17-rls-store"],
  ["ephemeral-docker-runners", "keydb-state-cache"],
  ["mcp-qa-11x-server", "governance-certification-gate"],
];

const REQUIRED_CONTROLS = [
  "prompt-injection-guard",
  "rule-zero-ephemeral-docker",
  "postgres-rls-isolation",
  "worm-hmac-audit-chain",
  "vault-aes-256-gcm",
  "git-closure-human-gate",
  "cli-tty-anti-hang-guard",
];

function failVerbose(relPath, errors) {
  console.error(`❌ [CALM] ${relPath} rechazado (${errors.length} violación(es)):`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

function findDuplicateJsonKeys(source) {
  const duplicates = [];
  const stack = [];
  let i = 0;

  const skipWs = () => {
    while (i < source.length && /\s/.test(source[i])) i += 1;
  };

  const readString = () => {
    const startIdx = i;
    i += 1;
    let out = "";
    while (i < source.length) {
      const ch = source[i];
      if (ch === "\\") {
        out += source.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === "\"") {
        i += 1;
        const rawLiteral = source.slice(startIdx, i);
        try {
          return JSON.parse(rawLiteral);
        } catch {
          return out;
        }
      }
      out += ch;
      i += 1;
    }
    return out;
  };

  while (i < source.length) {
    skipWs();
    if (i >= source.length) break;
    const ch = source[i];
    if (ch === "{") {
      stack.push({ type: "object", keys: new Set(), expectKey: true });
      i += 1;
    } else if (ch === "[") {
      stack.push({ type: "array" });
      i += 1;
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      i += 1;
    } else if (ch === ",") {
      const top = stack[stack.length - 1];
      if (top && top.type === "object") top.expectKey = true;
      i += 1;
    } else if (ch === ":") {
      const top = stack[stack.length - 1];
      if (top && top.type === "object") top.expectKey = false;
      i += 1;
    } else if (ch === "\"") {
      const top = stack[stack.length - 1];
      const str = readString();
      if (top && top.type === "object" && top.expectKey) {
        if (top.keys.has(str)) duplicates.push(str);
        top.keys.add(str);
        top.expectKey = false;
      }
    } else {
      i += 1;
    }
  }
  return duplicates;
}

const root = fs.realpathSync(process.cwd());
const inputRel = process.env.ARCH_INPUT || "architecture/qa-11x.calm.json";

if (!inputRel || inputRel.includes("\0") || path.isAbsolute(inputRel)) {
  failVerbose(inputRel, ["[PATH_TRAVERSAL] Ruta inválida o absoluta fuera del workspace."]);
}

const candidate = path.resolve(root, inputRel);
const relCheck = path.relative(root, candidate);
if (relCheck === ".." || relCheck.startsWith(`..${path.sep}`) || path.isAbsolute(relCheck)) {
  failVerbose(inputRel, [`[PATH_TRAVERSAL] La ruta ${inputRel} escapa el workspace.`]);
}

if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
  failVerbose(inputRel, [`[FILE_NOT_FOUND] Archivo no encontrado: ${inputRel}`]);
}

const realTarget = fs.realpathSync(candidate);
const realRel = path.relative(root, realTarget);
if (realRel === ".." || realRel.startsWith(`..${path.sep}`) || path.isAbsolute(realRel)) {
  failVerbose(inputRel, [`[PATH_TRAVERSAL] Enlace simbólico fuera del workspace: ${inputRel}`]);
}

const raw = fs.readFileSync(realTarget, "utf8");
const dupKeys = findDuplicateJsonKeys(raw);
if (dupKeys.length > 0) {
  failVerbose(inputRel, [`[DUPLICATE_JSON_KEY] Claves duplicadas: ${dupKeys.join(", ")}`]);
}

let doc;
try {
  doc = JSON.parse(raw);
} catch (err) {
  failVerbose(inputRel, [`[INVALID_JSON] ${err.message}`]);
}

if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
  failVerbose(inputRel, ["[INVALID_DOCUMENT_ROOT] La raíz CALM debe ser un objeto JSON."]);
}

const errors = [];
const nodeIds = new Set();
const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
if (!Array.isArray(doc.nodes)) errors.push("[MISSING_NODE_FIELD] Falta arreglo nodes.");

for (const node of nodes) {
  if (
    !node ||
    typeof node !== "object" ||
    typeof node["unique-id"] !== "string" ||
    !node["unique-id"].trim() ||
    typeof node["node-type"] !== "string" ||
    !node["node-type"].trim() ||
    typeof node.name !== "string" ||
    !node.name.trim() ||
    typeof node.description !== "string" ||
    !node.description.trim()
  ) {
    errors.push("[MISSING_NODE_FIELD] Nodo sin unique-id, node-type, name o description válidos.");
    if (!node || typeof node !== "object" || typeof node["unique-id"] !== "string" || !node["unique-id"].trim()) {
      continue;
    }
  }
  const id = node["unique-id"].trim();
  if (nodeIds.has(id)) errors.push(`[DUPLICATE_NODE_ID] ${id}`);
  nodeIds.add(id);
}

const relIds = new Set();
const edgeKeys = new Set();
const connectedNodes = new Set();
const rels = Array.isArray(doc.relationships) ? doc.relationships : [];
if (!Array.isArray(doc.relationships)) errors.push("[MISSING_RELATIONSHIP_FIELD] Falta arreglo relationships.");

for (const rel of rels) {
  if (!rel || typeof rel !== "object" || typeof rel["unique-id"] !== "string" || !rel["unique-id"].trim()) {
    errors.push("[MISSING_RELATIONSHIP_FIELD] Relación sin unique-id válido.");
    continue;
  }
  const id = rel["unique-id"].trim();
  if (relIds.has(id)) errors.push(`[DUPLICATE_RELATIONSHIP_ID] ${id}`);
  relIds.add(id);

  const rtype = rel["relationship-type"];
  const endpoints = [];
  if (rtype && typeof rtype === "object") {
    if (rtype.connects && rtype.connects.source && rtype.connects.destination) {
      endpoints.push([rtype.connects.source.node, rtype.connects.destination.node]);
    }
    if (rtype.interacts && rtype.interacts.actor && Array.isArray(rtype.interacts.nodes)) {
      for (const n of rtype.interacts.nodes) endpoints.push([rtype.interacts.actor, n]);
    }
    if (rtype["deployed-in"] && rtype["deployed-in"].container && Array.isArray(rtype["deployed-in"].nodes)) {
      for (const n of rtype["deployed-in"].nodes) endpoints.push([rtype["deployed-in"].container, n]);
    }
    if (rtype["composed-of"] && rtype["composed-of"].container && Array.isArray(rtype["composed-of"].nodes)) {
      for (const n of rtype["composed-of"].nodes) endpoints.push([rtype["composed-of"].container, n]);
    }
  }
  const validEndpoints = endpoints.filter(
    ([src, dst]) => typeof src === "string" && typeof dst === "string" && src.trim() && dst.trim(),
  );
  if (validEndpoints.length === 0) {
    errors.push(`[MISSING_RELATIONSHIP_FIELD] Relación ${id} sin source/destination.`);
    continue;
  }
  for (const [src, dst] of validEndpoints) {
    if (!nodeIds.has(src)) errors.push(`[DANGLING_RELATIONSHIP_NODE] ${id} -> nodo inexistente ${src}`);
    if (!nodeIds.has(dst)) errors.push(`[DANGLING_RELATIONSHIP_NODE] ${id} -> nodo inexistente ${dst}`);
    if (nodeIds.has(src) && nodeIds.has(dst)) {
      edgeKeys.add(`${src}->${dst}`);
      connectedNodes.add(src);
      connectedNodes.add(dst);
    }
  }
}

const profileArg = (process.env.CALM_PROFILE || "auto").trim();
const isUpstream =
  profileArg === "qa-11x-self"
    ? true
    : profileArg === "generic"
      ? false
      : fs.existsSync(path.join(root, "scripts", "generar-manifiesto.py"));
if (isUpstream) {
  for (const reqNode of REQUIRED_NODES) {
    if (!nodeIds.has(reqNode)) errors.push(`[MISSING_REQUIRED_NODE] Falta nodo obligatorio ${reqNode}`);
  }
}

for (const id of nodeIds) {
  if (!connectedNodes.has(id)) errors.push(`[ORPHAN_CRITICAL_NODE] Nodo desconectado ${id}`);
}

if (isUpstream) {
  for (const [src, dst] of REQUIRED_EDGES) {
    if (!edgeKeys.has(`${src}->${dst}`)) {
      errors.push(`[MISSING_REQUIRED_RELATIONSHIP] Falta arista ${src}->${dst}`);
    }
  }
}

const referencedControls = new Set();
for (const node of nodes) {
  if (node && typeof node === "object" && node.controls && typeof node.controls === "object" && !Array.isArray(node.controls)) {
    for (const key of Object.keys(node.controls)) referencedControls.add(key);
  }
}
for (const rel of rels) {
  if (rel && typeof rel === "object" && rel.controls && typeof rel.controls === "object" && !Array.isArray(rel.controls)) {
    for (const key of Object.keys(rel.controls)) referencedControls.add(key);
  }
}

const collectControlTargetRefs = (entry) => {
  const refs = [];
  if (!entry || typeof entry !== "object") return refs;
  for (const field of ["node", "relationship", "target"]) {
    if (typeof entry[field] === "string" && entry[field].trim()) refs.push(entry[field].trim());
  }
  for (const field of ["nodes", "relationships", "applies-to"]) {
    if (Array.isArray(entry[field])) {
      for (const item of entry[field]) {
        if (typeof item === "string" && item.trim()) refs.push(item.trim());
      }
    }
  }
  return refs;
};

const controls = doc.controls && typeof doc.controls === "object" && !Array.isArray(doc.controls) ? doc.controls : null;
if (!controls) {
  if (isUpstream) {
    errors.push("[MISSING_REQUIRED_CONTROL] Falta bloque controls.");
  }
} else {
  if (isUpstream) {
    for (const ctrl of REQUIRED_CONTROLS) {
      const entry = controls[ctrl];
      if (!entry) {
        errors.push(`[MISSING_REQUIRED_CONTROL] Falta control obligatorio ${ctrl}`);
      } else if (entry.enabled === false || !entry.description || !Array.isArray(entry.requirements) || entry.requirements.length === 0) {
        errors.push(`[INACTIVE_CONTROL] Control inactivo o incompleto: ${ctrl}`);
      }
    }
  }
  for (const [ctrlId, entry] of Object.entries(controls)) {
    if (entry && (entry.enabled === false || !entry.description || !Array.isArray(entry.requirements) || entry.requirements.length === 0)) {
      if (!isUpstream || !REQUIRED_CONTROLS.includes(ctrlId)) {
        errors.push(`[INACTIVE_CONTROL] Control inactivo o incompleto: ${ctrlId}`);
      }
    }
    const targetRefs = collectControlTargetRefs(entry);
    for (const targetId of targetRefs) {
      if (!nodeIds.has(targetId) && !relIds.has(targetId)) {
        errors.push(`[DANGLING_CONTROL_TARGET] Control ${ctrlId} referencia nodo o relación inexistente: ${targetId}`);
      }
    }
    const validDirectRef = targetRefs.some((targetId) => nodeIds.has(targetId) || relIds.has(targetId));
    if (!referencedControls.has(ctrlId) && !validDirectRef) {
      errors.push(`[UNREFERENCED_CONTROL] Control ${ctrlId} no referencia ningún nodo ni relación existente.`);
    }
  }
}

if (errors.length > 0) failVerbose(realRel.split(path.sep).join("/"), errors);

const displayPath = realRel.split(path.sep).join("/");
process.stdout.write(`${displayPath}|${nodes.length}|${rels.length}|${controls ? Object.keys(controls).length : 0}`);
JSEOF
}

inner_exec() {
  local meta
  meta="$(run_calm_validation_payload)"
  IFS='|' read -r rel_path node_count rel_count ctrl_count <<<"${meta}"

  if command -v calm >/dev/null 2>&1; then
    local calm_target="${REPO_ROOT}/${rel_path}"
    if [ "${QA_CALM_IN_DOCKER:-0}" = "1" ]; then
      calm_target="/workspace/${rel_path}"
    fi
    local calm_out
    if ! calm_out="$(calm validate -a "${calm_target}" --strict -f json 2>&1)"; then
      printf '❌ [CALM] Falló @finos/calm-cli sobre %s:\n%s\n' "${rel_path}" "${calm_out}" >&2
      exit 1
    fi
    CALM_OUT="${calm_out}" node - <<'JSEOF'
const raw = process.env.CALM_OUT || "";
const start = raw.indexOf("{");
const end = raw.lastIndexOf("}");
if (start >= 0 && end > start) {
  const report = JSON.parse(raw.slice(start, end + 1));
  if (report.hasErrors || report.hasWarnings) {
    console.error("❌ [CALM] @finos/calm-cli reportó errores/advertencias:\n" + JSON.stringify(report, null, 2));
    process.exit(1);
  }
}
JSEOF
  else
    printf '⚠️ [CALM] @finos/calm-cli no detectado en PATH; ejecutando validación determinista embebida.\n' >&2
  fi

  printf '✅ [CALM] %s validado (%s nodos, %s relaciones, %s controles)\n' \
    "${rel_path}" "${node_count}" "${rel_count}" "${ctrl_count}"
}

export ARCH_INPUT="${ARCH_ARG}"
export CALM_PROFILE="${PROFILE_ARG}"
export REPO_ROOT

if [ "${QA_IN_CONTAINER:-0}" = "1" ] || { [ -f /.dockerenv ] && ! command -v docker >/dev/null 2>&1; }; then
  cd "${REPO_ROOT}"
  inner_exec
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  printf '❌ [CALM] Docker requerido bajo Regla Cero para ejecutar %s\n' "${CALM_DOCKER_IMAGE}" >&2
  exit 1
fi

docker run --rm --network none --restart=no \
  --security-opt=no-new-privileges:true \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e ARCH_INPUT="${ARCH_ARG}" \
  -e CALM_PROFILE="${PROFILE_ARG}" \
  -e REPO_ROOT="/workspace" \
  -e QA_CALM_IN_DOCKER="1" \
  -v "${REPO_ROOT}:/workspace:ro" \
  -w /workspace \
  "${CALM_DOCKER_IMAGE}" \
  bash -c '
    set -euo pipefail
    '"$(declare -f run_calm_validation_payload inner_exec)"'
    inner_exec
  '
