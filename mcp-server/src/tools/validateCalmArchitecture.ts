// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { resolveRealTargetWithSymlinks } from '../security/pathRealResolver.js';

export const DEFAULT_CALM_ARCHITECTURE_PATH = 'architecture/qa-11x.calm.json';

const NODE_ID_IDE_HOST = 'qa-11x-ai-ide-host';
const NODE_ID_MCP_SERVER = 'mcp-qa-11x-server';
const NODE_ID_EPHEMERAL_RUNNERS = 'ephemeral-docker-runners';
const NODE_ID_POSTGRES_RLS = 'postgres17-rls-store';
const NODE_ID_KEYDB_CACHE = 'keydb-state-cache';
const NODE_ID_GOVERNANCE_GATE = 'governance-certification-gate';

export const REQUIRED_CALM_NODE_IDS = [
  NODE_ID_IDE_HOST,
  NODE_ID_MCP_SERVER,
  NODE_ID_EPHEMERAL_RUNNERS,
  NODE_ID_POSTGRES_RLS,
  NODE_ID_KEYDB_CACHE,
  NODE_ID_GOVERNANCE_GATE,
] as const;

export const REQUIRED_CALM_RELATIONSHIP_EDGES = [
  [NODE_ID_IDE_HOST, NODE_ID_MCP_SERVER],
  [NODE_ID_MCP_SERVER, NODE_ID_EPHEMERAL_RUNNERS],
  [NODE_ID_EPHEMERAL_RUNNERS, NODE_ID_POSTGRES_RLS],
  [NODE_ID_EPHEMERAL_RUNNERS, NODE_ID_KEYDB_CACHE],
  [NODE_ID_MCP_SERVER, NODE_ID_GOVERNANCE_GATE],
] as const;

export const REQUIRED_CALM_CONTROL_IDS = [
  'prompt-injection-guard',
  'rule-zero-ephemeral-docker',
  'postgres-rls-isolation',
  'worm-hmac-audit-chain',
  'vault-aes-256-gcm',
  'git-closure-human-gate',
  'cli-tty-anti-hang-guard',
] as const;

const UNIQUE_ID_FIELD = 'unique-id';
const REMEDIATION_CALM_MODEL =
  'Asegura un archivo JSON válido conforme a FINOS CALM dentro del workspace con los 6 nodos, 5 aristas y 7 controles obligatorios QA-11X.';
const REMEDIATION_TRAVERSAL =
  'Proporciona una ruta relativa contenida dentro del workspace sin saltos .. ni enlaces simbólicos externos.';
const REMEDIATION_CONTROL =
  'Restaura o reactiva el control obligatorio en la sección controls con description, requirement-url y config.control-id.';
const REMEDIATION_REL =
  'Verifica que source/destination existan en nodes, que los unique-id no estén duplicados y que ningún nodo crítico quede desconectado.';
const MCP_SERVER_DIR_SUFFIX = `${path.sep}mcp-server`;

export type CalmViolationCode =
  | 'PATH_TRAVERSAL'
  | 'FILE_NOT_FOUND'
  | 'INVALID_JSON'
  | 'INVALID_DOCUMENT_ROOT'
  | 'MISSING_NODE_FIELD'
  | 'DUPLICATE_NODE_ID'
  | 'MISSING_RELATIONSHIP_FIELD'
  | 'DUPLICATE_RELATIONSHIP_ID'
  | 'DANGLING_RELATIONSHIP_NODE'
  | 'ORPHAN_CRITICAL_NODE'
  | 'MISSING_REQUIRED_NODE'
  | 'MISSING_REQUIRED_RELATIONSHIP'
  | 'MISSING_REQUIRED_CONTROL'
  | 'INACTIVE_CONTROL';

export interface CalmViolation {
  code: CalmViolationCode;
  subject: string;
  message: string;
  remediation: string;
}

export type CalmValidationProfile = 'auto' | 'generic' | 'qa-11x-self';

export interface ValidateCalmArchitectureArgs {
  workspaceRoot?: string;
  architecturePath?: string;
  profile?: CalmValidationProfile;
}

export interface CalmValidationResult {
  valid: boolean;
  architecturePath: string;
  nodeCount: number;
  relationshipCount: number;
  controlCount: number;
  violations: CalmViolation[];
  summary: string;
  remediationHint?: string;
}

export const VALIDATE_CALM_ARCHITECTURE_TOOL: Pick<Tool, 'name' | 'description'> = {
  name: 'validate_calm_architecture',
  description:
    'Validates FINOS CALM architecture models for structural, referential, and mandatory 7 QA-11X security control compliance.',
};

type JsonRecord = Record<string, unknown>;

interface ParsedNodesResult {
  nodeIds: Set<string>;
  nodeCount: number;
}

interface ParsedRelationshipsResult {
  edgeKeys: Set<string>;
  connectedNodes: Set<string>;
  relationshipCount: number;
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveDefaultWorkspaceRoot(): string {
  const cwd = path.resolve(process.cwd());
  const defaultCalmAtCwd = path.join(cwd, DEFAULT_CALM_ARCHITECTURE_PATH);
  if (fs.existsSync(defaultCalmAtCwd)) {
    return cwd;
  }
  if (cwd.endsWith(MCP_SERVER_DIR_SUFFIX)) {
    const parent = path.dirname(cwd);
    if (fs.existsSync(path.join(parent, DEFAULT_CALM_ARCHITECTURE_PATH))) {
      return parent;
    }
  }
  return cwd;
}

function isContainedPath(rootReal: string, candidatePath: string): boolean {
  const rel = path.relative(rootReal, candidatePath);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function resolveSafeArchitectureFile(
  workspaceRoot: string,
  architecturePath: string,
  violations: CalmViolation[]
): { resolvedPath: string; displayPath: string } | null {
  if (architecturePath.includes('\0') || workspaceRoot.includes('\0')) {
    violations.push({
      code: 'PATH_TRAVERSAL',
      subject: architecturePath,
      message: 'Ruta rechazada por contener bytes nulos.',
      remediation: REMEDIATION_TRAVERSAL,
    });
    return null;
  }

  const rootResolved = path.resolve(workspaceRoot);
  const candidate = path.resolve(rootResolved, architecturePath);
  if (!isContainedPath(rootResolved, candidate)) {
    violations.push({
      code: 'PATH_TRAVERSAL',
      subject: architecturePath,
      message: `La ruta '${architecturePath}' escapa los límites del workspace.`,
      remediation: REMEDIATION_TRAVERSAL,
    });
    return null;
  }

  const rootOutcome = resolveRealTargetWithSymlinks(rootResolved);
  const targetOutcome = resolveRealTargetWithSymlinks(candidate);
  if (!rootOutcome.ok || !targetOutcome.ok) {
    violations.push({
      code: 'PATH_TRAVERSAL',
      subject: architecturePath,
      message: `Ciclo o enlace simbólico inválido detectado en '${architecturePath}'.`,
      remediation: REMEDIATION_TRAVERSAL,
    });
    return null;
  }

  const rootReal = rootOutcome.resolved;
  const realTarget = targetOutcome.resolved;
  if (!isContainedPath(rootReal, realTarget)) {
    violations.push({
      code: 'PATH_TRAVERSAL',
      subject: architecturePath,
      message: `Enlace simbólico fuera del workspace detectado en '${architecturePath}'.`,
      remediation: REMEDIATION_TRAVERSAL,
    });
    return null;
  }

  if (!fs.existsSync(rootReal) || !fs.existsSync(realTarget) || !fs.statSync(realTarget).isFile()) {
    violations.push({
      code: 'FILE_NOT_FOUND',
      subject: architecturePath,
      message: `Archivo de arquitectura CALM no encontrado: '${architecturePath}'.`,
      remediation: REMEDIATION_CALM_MODEL,
    });
    return null;
  }

  return {
    resolvedPath: realTarget,
    displayPath: path.relative(rootReal, realTarget).split(path.sep).join('/'),
  };
}

function loadCalmJsonDocument(
  filePath: string,
  displayPath: string,
  violations: CalmViolation[]
): JsonRecord | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    violations.push({
      code: 'FILE_NOT_FOUND',
      subject: displayPath,
      message: `No se pudo leer el modelo CALM: ${err instanceof Error ? err.message : String(err)}`,
      remediation: REMEDIATION_CALM_MODEL,
    });
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    violations.push({
      code: 'INVALID_JSON',
      subject: displayPath,
      message: `JSON inválido en modelo CALM: ${err instanceof Error ? err.message : String(err)}`,
      remediation: REMEDIATION_CALM_MODEL,
    });
    return null;
  }

  if (!isPlainRecord(parsed)) {
    violations.push({
      code: 'INVALID_DOCUMENT_ROOT',
      subject: displayPath,
      message: 'La raíz del documento CALM debe ser un objeto JSON.',
      remediation: REMEDIATION_CALM_MODEL,
    });
    return null;
  }

  return parsed;
}

function validateSingleNode(
  entry: unknown,
  index: number,
  nodeIds: Set<string>,
  violations: CalmViolation[]
): void {
  const fallbackSubject = `nodes[${index}]`;
  if (!isPlainRecord(entry)) {
    violations.push({
      code: 'MISSING_NODE_FIELD',
      subject: fallbackSubject,
      message: 'Cada entrada en nodes debe ser un objeto JSON.',
      remediation: REMEDIATION_CALM_MODEL,
    });
    return;
  }

  const requiredFields = [UNIQUE_ID_FIELD, 'node-type', 'name', 'description'];
  const missing = requiredFields.filter((field) => !isNonEmptyString(entry[field]));
  const rawId = isNonEmptyString(entry[UNIQUE_ID_FIELD]) ? entry[UNIQUE_ID_FIELD].trim() : fallbackSubject;

  if (missing.length > 0) {
    violations.push({
      code: 'MISSING_NODE_FIELD',
      subject: rawId,
      message: `El nodo '${rawId}' omite campos CALM obligatorios: ${missing.join(', ')}.`,
      remediation: REMEDIATION_CALM_MODEL,
    });
    return;
  }

  if (nodeIds.has(rawId)) {
    violations.push({
      code: 'DUPLICATE_NODE_ID',
      subject: rawId,
      message: `Identificador de nodo duplicado '${rawId}'.`,
      remediation: REMEDIATION_REL,
    });
    return;
  }

  nodeIds.add(rawId);
}

function parseAndValidateNodes(doc: JsonRecord, violations: CalmViolation[]): ParsedNodesResult {
  const nodeIds = new Set<string>();
  const rawNodes = doc.nodes;
  if (!Array.isArray(rawNodes)) {
    violations.push({
      code: 'MISSING_NODE_FIELD',
      subject: 'nodes',
      message: 'El documento CALM debe definir un arreglo nodes.',
      remediation: REMEDIATION_CALM_MODEL,
    });
    return { nodeIds, nodeCount: 0 };
  }

  rawNodes.forEach((entry, index) => validateSingleNode(entry, index, nodeIds, violations));
  return { nodeIds, nodeCount: rawNodes.length };
}

function extractNodeInterfaceId(refValue: unknown): string | null {
  if (!isPlainRecord(refValue)) {
    return null;
  }
  return isNonEmptyString(refValue.node) ? refValue.node.trim() : null;
}

function extractStringArrayNodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isNonEmptyString).map((item) => item.trim());
}

function extractRelationshipEndpoints(relType: JsonRecord): Array<[string, string]> {
  if (isPlainRecord(relType.connects)) {
    const src = extractNodeInterfaceId(relType.connects.source);
    const dst = extractNodeInterfaceId(relType.connects.destination);
    return src && dst ? [[src, dst]] : [];
  }

  if (isPlainRecord(relType.interacts)) {
    const actor = isNonEmptyString(relType.interacts.actor) ? relType.interacts.actor.trim() : null;
    const targets = extractStringArrayNodes(relType.interacts.nodes);
    return actor ? targets.map((target): [string, string] => [actor, target]) : [];
  }

  const containerBlock = isPlainRecord(relType['deployed-in'])
    ? relType['deployed-in']
    : relType['composed-of'];
  if (isPlainRecord(containerBlock)) {
    const container = isNonEmptyString(containerBlock.container)
      ? containerBlock.container.trim()
      : null;
    const targets = extractStringArrayNodes(containerBlock.nodes);
    return container ? targets.map((target): [string, string] => [container, target]) : [];
  }

  return [];
}

interface EndpointNodesValidationInput {
  readonly relId: string;
  readonly src: string;
  readonly dst: string;
  readonly nodeIds: Set<string>;
  readonly violations: CalmViolation[];
}

function validateEndpointNodes(input: EndpointNodesValidationInput): boolean {
  const { relId, src, dst, nodeIds, violations } = input;
  let allExist = true;
  for (const endpoint of [src, dst]) {
    if (!nodeIds.has(endpoint)) {
      allExist = false;
      violations.push({
        code: 'DANGLING_RELATIONSHIP_NODE',
        subject: `${relId}:${endpoint}`,
        message: `La relación '${relId}' referencia el nodo inexistente '${endpoint}'.`,
        remediation: REMEDIATION_REL,
      });
    }
  }
  return allExist;
}

interface RelationshipValidationContext {
  readonly nodeIds: Set<string>;
  readonly relIds: Set<string>;
  readonly state: ParsedRelationshipsResult;
  readonly violations: CalmViolation[];
}

function validateSingleRelationship(
  entry: unknown,
  index: number,
  ctx: RelationshipValidationContext
): void {
  const { nodeIds, relIds, state, violations } = ctx;
  const fallbackSubject = `relationships[${index}]`;
  if (!isPlainRecord(entry) || !isNonEmptyString(entry[UNIQUE_ID_FIELD])) {
    violations.push({
      code: 'MISSING_RELATIONSHIP_FIELD',
      subject: fallbackSubject,
      message: `La relación en '${fallbackSubject}' debe incluir unique-id válido.`,
      remediation: REMEDIATION_REL,
    });
    return;
  }

  const relId = entry[UNIQUE_ID_FIELD].trim();
  if (relIds.has(relId)) {
    violations.push({
      code: 'DUPLICATE_RELATIONSHIP_ID',
      subject: relId,
      message: `Identificador de relación duplicado '${relId}'.`,
      remediation: REMEDIATION_REL,
    });
    return;
  }
  relIds.add(relId);

  const relType = entry['relationship-type'];
  if (!isPlainRecord(relType)) {
    violations.push({
      code: 'MISSING_RELATIONSHIP_FIELD',
      subject: relId,
      message: `La relación '${relId}' carece de relationship-type válido.`,
      remediation: REMEDIATION_REL,
    });
    return;
  }

  const pairs = extractRelationshipEndpoints(relType);
  if (pairs.length === 0) {
    violations.push({
      code: 'MISSING_RELATIONSHIP_FIELD',
      subject: relId,
      message: `La relación '${relId}' no define nodos origen/destino válidos.`,
      remediation: REMEDIATION_REL,
    });
    return;
  }

  for (const [src, dst] of pairs) {
    if (validateEndpointNodes({ relId, src, dst, nodeIds, violations })) {
      state.edgeKeys.add(`${src}->${dst}`);
      state.connectedNodes.add(src);
      state.connectedNodes.add(dst);
    }
  }
}

function parseAndValidateRelationships(
  doc: JsonRecord,
  nodeIds: Set<string>,
  violations: CalmViolation[]
): ParsedRelationshipsResult {
  const state: ParsedRelationshipsResult = {
    edgeKeys: new Set<string>(),
    connectedNodes: new Set<string>(),
    relationshipCount: 0,
  };
  const rawRelationships = doc.relationships;
  if (!Array.isArray(rawRelationships)) {
    violations.push({
      code: 'MISSING_RELATIONSHIP_FIELD',
      subject: 'relationships',
      message: 'El documento CALM debe definir un arreglo relationships.',
      remediation: REMEDIATION_REL,
    });
    return state;
  }

  state.relationshipCount = rawRelationships.length;
  const relIds = new Set<string>();
  const ctx: RelationshipValidationContext = { nodeIds, relIds, state, violations };
  rawRelationships.forEach((entry, index) => validateSingleRelationship(entry, index, ctx));
  return state;
}

function isValidControlRequirement(item: unknown): boolean {
  if (!isPlainRecord(item) || !isNonEmptyString(item['requirement-url'])) {
    return false;
  }
  if (!isPlainRecord(item.config)) {
    return false;
  }
  return isNonEmptyString(item.config['control-id']);
}

function validateControlEntry(
  controlId: string,
  entry: unknown,
  violations: CalmViolation[]
): boolean {
  if (!isPlainRecord(entry)) {
    violations.push({
      code: 'INACTIVE_CONTROL',
      subject: controlId,
      message: `El control obligatorio '${controlId}' debe ser un objeto válido.`,
      remediation: REMEDIATION_CONTROL,
    });
    return false;
  }

  if (entry.enabled === false) {
    violations.push({
      code: 'INACTIVE_CONTROL',
      subject: controlId,
      message: `El control obligatorio '${controlId}' está deshabilitado (enabled: false).`,
      remediation: REMEDIATION_CONTROL,
    });
    return false;
  }

  const reqs = entry.requirements;
  const hasValidReqs =
    Array.isArray(reqs) && reqs.length > 0 && reqs.every(isValidControlRequirement);
  if (!isNonEmptyString(entry.description) || !hasValidReqs) {
    violations.push({
      code: 'INACTIVE_CONTROL',
      subject: controlId,
      message: `El control obligatorio '${controlId}' carece de description o requirements válidos.`,
      remediation: REMEDIATION_CONTROL,
    });
    return false;
  }

  return true;
}

function isQa11xSelfProfile(
  profile: CalmValidationProfile | undefined,
  workspaceRoot: string,
  displayPath: string
): boolean {
  if (profile === 'qa-11x-self') return true;
  if (profile === 'generic') return false;
  return (
    path.basename(displayPath) === 'qa-11x.calm.json' ||
    fs.existsSync(path.join(workspaceRoot, 'scripts', 'generar-manifiesto.py'))
  );
}

interface GovernanceValidationContext {
  readonly nodeIds: Set<string>;
  readonly relState: ParsedRelationshipsResult;
  readonly violations: CalmViolation[];
  readonly enforceQa11xSelf: boolean;
}

function validateSelfNodesAndEdges(ctx: GovernanceValidationContext): void {
  for (const requiredNode of REQUIRED_CALM_NODE_IDS) {
    if (!ctx.nodeIds.has(requiredNode)) {
      ctx.violations.push({
        code: 'MISSING_REQUIRED_NODE',
        subject: requiredNode,
        message: `Falta el nodo canónico obligatorio '${requiredNode}'.`,
        remediation: REMEDIATION_CALM_MODEL,
      });
    }
  }
  for (const [src, dst] of REQUIRED_CALM_RELATIONSHIP_EDGES) {
    const edgeKey = `${src}->${dst}`;
    if (!ctx.relState.edgeKeys.has(edgeKey)) {
      ctx.violations.push({
        code: 'MISSING_REQUIRED_RELATIONSHIP',
        subject: edgeKey,
        message: `Falta la arista arquitectónica obligatoria '${edgeKey}'.`,
        remediation: REMEDIATION_REL,
      });
    }
  }
}

function validateGenericMinimumStructure(ctx: GovernanceValidationContext): void {
  if (ctx.nodeIds.size === 0) {
    ctx.violations.push({
      code: 'MISSING_REQUIRED_NODE',
      subject: 'nodes',
      message: 'El documento CALM debe declarar al menos un nodo válido.',
      remediation: REMEDIATION_CALM_MODEL,
    });
  }
  if (ctx.relState.edgeKeys.size === 0) {
    ctx.violations.push({
      code: 'MISSING_REQUIRED_RELATIONSHIP',
      subject: 'relationships',
      message: 'El documento CALM debe declarar al menos una relación válida.',
      remediation: REMEDIATION_REL,
    });
  }
}

function validateControlsMap(
  rawControls: JsonRecord,
  violations: CalmViolation[],
  enforceQa11xSelf: boolean
): void {
  if (!enforceQa11xSelf) {
    const entries = Object.entries(rawControls);
    if (entries.length === 0) {
      violations.push({
        code: 'MISSING_REQUIRED_CONTROL',
        subject: 'controls',
        message: 'El documento CALM debe declarar al menos un control de gobernanza.',
        remediation: REMEDIATION_CONTROL,
      });
      return;
    }
    for (const [controlId, entry] of entries) {
      validateControlEntry(controlId, entry, violations);
    }
    return;
  }
  for (const controlId of REQUIRED_CALM_CONTROL_IDS) {
    if (!(controlId in rawControls)) {
      violations.push({
        code: 'MISSING_REQUIRED_CONTROL',
        subject: controlId,
        message: `Falta el control de seguridad obligatorio '${controlId}'.`,
        remediation: REMEDIATION_CONTROL,
      });
    } else {
      validateControlEntry(controlId, rawControls[controlId], violations);
    }
  }
}

function validateRequiredGovernance(doc: JsonRecord, ctx: GovernanceValidationContext): number {
  if (ctx.enforceQa11xSelf) {
    validateSelfNodesAndEdges(ctx);
  } else {
    validateGenericMinimumStructure(ctx);
  }
  for (const nodeId of ctx.nodeIds) {
    if (!ctx.relState.connectedNodes.has(nodeId)) {
      ctx.violations.push({
        code: 'ORPHAN_CRITICAL_NODE',
        subject: nodeId,
        message: `El nodo '${nodeId}' está desconectado (sin relaciones válidas).`,
        remediation: REMEDIATION_REL,
      });
    }
  }
  const rawControls = doc.controls;
  if (!isPlainRecord(rawControls)) {
    if (ctx.enforceQa11xSelf) {
      ctx.violations.push({
        code: 'MISSING_REQUIRED_CONTROL',
        subject: 'controls',
        message: 'El documento CALM debe declarar el objeto controls con los 7 controles QA-11X.',
        remediation: REMEDIATION_CONTROL,
      });
    }
    return 0;
  }
  validateControlsMap(rawControls, ctx.violations, ctx.enforceQa11xSelf);
  return Object.keys(rawControls).length;
}

function formatFailureSummary(displayPath: string, violations: CalmViolation[]): string {
  const lines = [
    `❌ [CALM] ${displayPath} rechazado (${violations.length} violación(es)):`,
    ...violations.map(
      (item) => `  - [${item.code}] (${item.subject}): ${item.message} | Remediación: ${item.remediation}`
    ),
  ];
  return lines.join('\n');
}

export function validateCalmArchitecture(
  args: ValidateCalmArchitectureArgs = {}
): CalmValidationResult {
  const workspaceRoot = args.workspaceRoot ?? resolveDefaultWorkspaceRoot();
  const architecturePath = args.architecturePath ?? DEFAULT_CALM_ARCHITECTURE_PATH;
  const violations: CalmViolation[] = [];

  const fileTarget = resolveSafeArchitectureFile(workspaceRoot, architecturePath, violations);
  if (!fileTarget) {
    return {
      valid: false,
      architecturePath,
      nodeCount: 0,
      relationshipCount: 0,
      controlCount: 0,
      violations,
      summary: formatFailureSummary(architecturePath, violations),
      remediationHint: violations[0]?.remediation ?? REMEDIATION_CALM_MODEL,
    };
  }

  const doc = loadCalmJsonDocument(fileTarget.resolvedPath, fileTarget.displayPath, violations);
  if (!doc) {
    return {
      valid: false,
      architecturePath: fileTarget.displayPath,
      nodeCount: 0,
      relationshipCount: 0,
      controlCount: 0,
      violations,
      summary: formatFailureSummary(fileTarget.displayPath, violations),
      remediationHint: violations[0]?.remediation ?? REMEDIATION_CALM_MODEL,
    };
  }

  const nodesResult = parseAndValidateNodes(doc, violations);
  const relResult = parseAndValidateRelationships(doc, nodesResult.nodeIds, violations);
  const enforceQa11xSelf = isQa11xSelfProfile(args.profile, workspaceRoot, fileTarget.displayPath);
  const controlCount = validateRequiredGovernance(doc, {
    nodeIds: nodesResult.nodeIds,
    relState: relResult,
    violations,
    enforceQa11xSelf,
  });

  if (violations.length === 0) {
    return {
      valid: true,
      architecturePath: fileTarget.displayPath,
      nodeCount: nodesResult.nodeCount,
      relationshipCount: relResult.relationshipCount,
      controlCount,
      violations: [],
      summary: `✅ [CALM] ${fileTarget.displayPath} validado (${nodesResult.nodeCount} nodos, ${relResult.relationshipCount} relaciones, ${controlCount} controles)`,
    };
  }

  return {
    valid: false,
    architecturePath: fileTarget.displayPath,
    nodeCount: nodesResult.nodeCount,
    relationshipCount: relResult.relationshipCount,
    controlCount,
    violations,
    summary: formatFailureSummary(fileTarget.displayPath, violations),
    remediationHint: violations[0]?.remediation,
  };
}

export function handleValidateCalmArchitecture(
  args: ValidateCalmArchitectureArgs = {}
): CallToolResult {
  const result = validateCalmArchitecture(args);
  return {
    isError: !result.valid,
    content: [
      {
        type: 'text',
        text: result.summary,
      },
    ],
  };
}
