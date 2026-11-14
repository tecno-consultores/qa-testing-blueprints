// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as crypto from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import {
  MAX_TASK_CAPACITY,
  MIN_TASK_CAPACITY,
  TASK_CAPACITY_EXTENSION_URI as COMPAT_TASK_CAPACITY_URI,
  type GuardLifecycleState,
} from '../utils/taskStateGuard.js';

export const CANONICAL_TASK_CAPACITY_URI = 'urn:qa-11x:extensions:task-capacity:v1' as const;
export { COMPAT_TASK_CAPACITY_URI };
export const SUPPORTED_TASK_CAPACITY_URIS = [
  CANONICAL_TASK_CAPACITY_URI,
  COMPAT_TASK_CAPACITY_URI,
] as const;

export const DEFAULT_AGENT_NAME = 'qa-11x-mcp-agent' as const;
export const DEFAULT_AGENT_VERSION = '2.20.3' as const;
export const DEFAULT_STANDARD_VERSION = 'QA-11X v2.0' as const;
export const DEFAULT_ACTIVE_MODEL = 'local-or-frontier-hybrid' as const;
export const DEFAULT_AGENT_URL = 'stdio://sinfallas/mcp-qa-11x' as const;
export const DEFAULT_A2A_PROTOCOL_VERSION = '0.2.1' as const;
export const DEFAULT_TASK_CAPACITY = 4;
export const DEFAULT_AGENT_CARD_RELATIVE_PATH = '.well-known/agent-card.json' as const;
export const GIT_CLOSURE_HUMAN_GATE_ID = 'QA-GIT-GATE-01' as const;

const TAG_SECURITY = 'security';
const TAG_DOCKER = 'docker';
const TAG_TESTING = 'testing';
const TAG_GOVERNANCE = 'governance';
const TAG_ARCHITECTURE = 'architecture';

export type TaskCapacityExtensionUri = (typeof SUPPORTED_TASK_CAPACITY_URIS)[number];
export type CapacityLifecycleState = Extract<GuardLifecycleState, 'AVAILABLE' | 'BUSY'>;

export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
}

export interface AgentSkillDescriptor {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface TaskCapacityExtensionParams {
  capacity: number;
  minCapacity: typeof MIN_TASK_CAPACITY;
  maxCapacity: typeof MAX_TASK_CAPACITY;
  compatibleUris: TaskCapacityExtensionUri[];
}

export interface AgentExtensionDeclaration {
  uri: TaskCapacityExtensionUri;
  required: boolean;
  description: string;
  params: TaskCapacityExtensionParams;
}

export interface AgentSecurityProfile {
  promptGuard: boolean;
  ruleZeroEphemeralDocker: boolean;
  gitClosureHumanGate: string;
}

export interface AgentCard {
  name: string;
  description: string;
  version: string;
  url: string;
  protocolVersion: string;
  standardVersion: string;
  activeModel: string;
  capabilities: AgentCapabilities;
  skills: AgentSkillDescriptor[];
  extensions: AgentExtensionDeclaration[];
  securityProfile: AgentSecurityProfile;
}

export interface BuildAgentCardOptions {
  name?: string;
  description?: string;
  version?: string;
  url?: string;
  protocolVersion?: string;
  standardVersion?: string;
  activeModel?: string;
  capacity?: number;
  taskCapacityExtensionUri?: string;
  capabilities?: Partial<AgentCapabilities>;
  skills?: readonly AgentSkillDescriptor[];
  securityProfile?: Partial<AgentSecurityProfile>;
}

export interface CapacityStatusEvaluation {
  state: CapacityLifecycleState;
  runningTasks: number;
  capacity: number;
  availableSlots: number;
  saturated: boolean;
}

export interface WriteAgentCardResult {
  outputPath: string;
  relativePath: string;
  bytesWritten: number;
  card: AgentCard;
}

export const QA_11X_V2_SKILLS: readonly AgentSkillDescriptor[] = [
  {
    id: 'qa-11x-architect',
    name: 'QA 11X Architect',
    description: 'Orquestación maestra de la pirámide 11X, 13 capas y gobernanza de proyectos.',
    tags: [TAG_GOVERNANCE, TAG_TESTING, 'pyramid'],
  },
  {
    id: 'qa-11x-devsecops-hardener',
    name: 'QA 11X DevSecOps Hardener',
    description: 'Controles DISA ASD STIG V6R5, OWASP v4.2, RLS multi-tenant y bóveda AES-GCM.',
    tags: [TAG_SECURITY, 'stig', 'owasp'],
  },
  {
    id: 'qa-11x-docker-certifier',
    name: 'QA 11X Docker Certifier',
    description: 'Ejecución efímera Regla Cero, cobertura >= 95%, mutación y complejidad Grado A.',
    tags: [TAG_DOCKER, TAG_TESTING, 'rule-zero'],
  },
  {
    id: 'qa-11x-systematic-debugging',
    name: 'QA 11X Systematic Debugging',
    description: 'Diagnóstico determinista en 4 fases con aislamiento de causa raíz y bloqueo RED-to-GREEN.',
    tags: [TAG_TESTING, 'debugging', 'root-cause'],
  },
  {
    id: 'qa-11x-screenplay-builder',
    name: 'QA 11X Screenplay Builder',
    description: 'Arquitectura Screenplay proporcional E2E, selectores ARIA y aserciones temporales.',
    tags: [TAG_TESTING, 'e2e', 'screenplay'],
  },
  {
    id: 'qa-11x-llm-evaluator',
    name: 'QA 11X LLM Evaluator',
    description: 'Evaluación dual offline determinista y red-teaming OWASP LLM Top 10 en Docker.',
    tags: [TAG_SECURITY, TAG_TESTING, 'llm-eval'],
  },
  {
    id: 'qa-11x-vibe-rescue',
    name: 'QA 11X Vibe Rescue',
    description: 'Endurecimiento empresarial en 5 etapas para prototipos AI sin degradar UX.',
    tags: [TAG_SECURITY, TAG_GOVERNANCE, 'hardening'],
  },
  {
    id: 'docker-trivy-keydb-hardening',
    name: 'Docker Trivy & KeyDB Hardening',
    description: 'Contenedores non-root, Trivy HIGH/CRITICAL=0, builds multi-etapa y caché KeyDB.',
    tags: [TAG_DOCKER, TAG_SECURITY, 'trivy'],
  },
  {
    id: 'graphify-ast-navigator',
    name: 'Graphify AST Navigator',
    description: 'Grafo de conocimiento AST, radio de impacto y salud topológica entre capas.',
    tags: [TAG_ARCHITECTURE, 'ast', 'blast-radius'],
  },
  {
    id: 'refactoring-ui',
    name: 'Refactoring UI',
    description: 'Jerarquía visual, escala espacial, tipografía tabular y contraste WCAG 2.1 AA.',
    tags: ['ui', 'wcag', TAG_ARCHITECTURE],
  },
] as const;

function assertNonEmptyText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0')) {
    throw new Error(`[A2A_INVALID_INPUT] '${label}' debe ser un texto no vacío sin bytes nulos.`);
  }
  return value.trim();
}

function pickText(value: string | undefined, fallback: string, label: string): string {
  return value === undefined ? fallback : assertNonEmptyText(value, label);
}

export function isSupportedTaskCapacityUri(uri: string): uri is TaskCapacityExtensionUri {
  return uri === CANONICAL_TASK_CAPACITY_URI || uri === COMPAT_TASK_CAPACITY_URI;
}

export function validateTaskCapacityUri(uri: string): TaskCapacityExtensionUri {
  const clean = assertNonEmptyText(uri, 'taskCapacityExtensionUri');
  if (!isSupportedTaskCapacityUri(clean)) {
    throw new Error(
      `[A2A_UNSUPPORTED_EXTENSION_URI] URI '${clean}' incompatible; se esperaba '${CANONICAL_TASK_CAPACITY_URI}' o '${COMPAT_TASK_CAPACITY_URI}'.`
    );
  }
  return clean;
}

export function validateTaskCapacity(capacity: number = DEFAULT_TASK_CAPACITY): number {
  if (!Number.isInteger(capacity) || capacity < MIN_TASK_CAPACITY || capacity > MAX_TASK_CAPACITY) {
    throw new RangeError(
      `[A2A_INVALID_CAPACITY] Capacidad '${capacity}' fuera de rango: debe ser entero entre ${MIN_TASK_CAPACITY} y ${MAX_TASK_CAPACITY}.`
    );
  }
  return capacity;
}

function validateNonNegativeInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(
      `[A2A_INVALID_COUNTER] '${label}' (${value}) debe ser un entero finito >= 0.`
    );
  }
  return value;
}

function cloneSkills(skills: readonly AgentSkillDescriptor[]): AgentSkillDescriptor[] {
  return skills.map((skill) => ({
    id: assertNonEmptyText(skill.id, 'skill.id'),
    name: assertNonEmptyText(skill.name, 'skill.name'),
    description: assertNonEmptyText(skill.description, 'skill.description'),
    tags: skill.tags.map((tag) => assertNonEmptyText(tag, 'skill.tag')),
  }));
}

function resolveCapabilities(overrides?: Partial<AgentCapabilities>): AgentCapabilities {
  return {
    streaming: overrides?.streaming ?? false,
    pushNotifications: overrides?.pushNotifications ?? false,
    stateTransitionHistory: overrides?.stateTransitionHistory ?? true,
  };
}

function resolveSecurityProfile(overrides?: Partial<AgentSecurityProfile>): AgentSecurityProfile {
  return {
    promptGuard: overrides?.promptGuard ?? true,
    ruleZeroEphemeralDocker: overrides?.ruleZeroEphemeralDocker ?? true,
    gitClosureHumanGate: pickText(
      overrides?.gitClosureHumanGate,
      GIT_CLOSURE_HUMAN_GATE_ID,
      'securityProfile.gitClosureHumanGate'
    ),
  };
}

function buildDefaultDescription(
  activeModel: string,
  standardVersion: string,
  skills: readonly AgentSkillDescriptor[]
): string {
  const skillIds = skills.map((item) => item.id).join(', ');
  return `Agente MCP ${standardVersion} (${activeModel}) con ${skills.length} skills declaradas: ${skillIds}.`;
}

export function buildAgentCard(options: BuildAgentCardOptions = {}): AgentCard {
  const name = pickText(options.name, DEFAULT_AGENT_NAME, 'name');
  const version = pickText(options.version, DEFAULT_AGENT_VERSION, 'version');
  const url = pickText(options.url, DEFAULT_AGENT_URL, 'url');
  const protocolVersion = pickText(
    options.protocolVersion,
    DEFAULT_A2A_PROTOCOL_VERSION,
    'protocolVersion'
  );
  const standardVersion = pickText(
    options.standardVersion,
    DEFAULT_STANDARD_VERSION,
    'standardVersion'
  );
  const activeModel = pickText(options.activeModel, DEFAULT_ACTIVE_MODEL, 'activeModel');
  const capacity = validateTaskCapacity(options.capacity ?? DEFAULT_TASK_CAPACITY);
  const extensionUri = validateTaskCapacityUri(
    options.taskCapacityExtensionUri ?? CANONICAL_TASK_CAPACITY_URI
  );
  const skills = cloneSkills(options.skills ?? QA_11X_V2_SKILLS);
  const description =
    options.description === undefined
      ? buildDefaultDescription(activeModel, standardVersion, skills)
      : assertNonEmptyText(options.description, 'description');

  return {
    name,
    description,
    version,
    url,
    protocolVersion,
    standardVersion,
    activeModel,
    capabilities: resolveCapabilities(options.capabilities),
    skills,
    extensions: [
      {
        uri: extensionUri,
        required: true,
        description:
          'Declaración determinista de capacidad concurrente de tareas (1..32 slots) alineada con TaskStateGuard.',
        params: {
          capacity,
          minCapacity: MIN_TASK_CAPACITY,
          maxCapacity: MAX_TASK_CAPACITY,
          compatibleUris: [...SUPPORTED_TASK_CAPACITY_URIS],
        },
      },
    ],
    securityProfile: resolveSecurityProfile(options.securityProfile),
  };
}

export function evaluateCapacityStatus(
  runningTasks: number,
  capacity: number = DEFAULT_TASK_CAPACITY
): CapacityStatusEvaluation {
  const safeCapacity = validateTaskCapacity(capacity);
  const safeRunning = validateNonNegativeInt(runningTasks, 'runningTasks');
  const saturated = safeRunning >= safeCapacity;
  return {
    state: saturated ? 'BUSY' : 'AVAILABLE',
    runningTasks: safeRunning,
    capacity: safeCapacity,
    availableSlots: Math.max(0, safeCapacity - safeRunning),
    saturated,
  };
}

function isStrictDescendant(rootReal: string, targetPath: string): boolean {
  const rel = path.relative(rootReal, targetPath);
  return rel.length > 0 && rel !== '.' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function assertRelativeOutputPath(relativeOutputPath: string): string {
  const cleanRel = assertNonEmptyText(relativeOutputPath, 'relativeOutputPath');
  if (path.isAbsolute(cleanRel)) {
    throw new Error(
      `[A2A_PATH_TRAVERSAL] La ruta de salida '${cleanRel}' debe ser relativa al workspace.`
    );
  }
  return cleanRel;
}

async function resolveVerifiedRoot(workspaceRoot: string): Promise<string> {
  const cleanRoot = assertNonEmptyText(workspaceRoot, 'workspaceRoot');
  const rootReal = await fsPromises.realpath(path.resolve(cleanRoot));
  const stat = await fsPromises.stat(rootReal);
  if (!stat.isDirectory()) {
    throw new Error(`[A2A_INVALID_ROOT] '${rootReal}' no es un directorio válido.`);
  }
  return rootReal;
}

async function ensureContainedParentDir(rootReal: string, candidateTarget: string): Promise<string> {
  if (!isStrictDescendant(rootReal, candidateTarget)) {
    throw new Error(
      `[A2A_PATH_TRAVERSAL] Acceso denegado fuera de '${rootReal}': '${candidateTarget}'.`
    );
  }
  const parentDir = path.dirname(candidateTarget);
  await fsPromises.mkdir(parentDir, { recursive: true });
  const parentReal = await fsPromises.realpath(parentDir);
  if (parentReal !== rootReal && !isStrictDescendant(rootReal, parentReal)) {
    throw new Error(
      `[A2A_PATH_TRAVERSAL] El directorio padre '${parentReal}' escapa de '${rootReal}'.`
    );
  }
  return parentReal;
}

async function assertSafeTargetFile(targetPath: string): Promise<void> {
  try {
    const targetStat = await fsPromises.lstat(targetPath);
    if (targetStat.isSymbolicLink() || targetStat.isDirectory()) {
      throw new Error(
        `[A2A_UNSAFE_TARGET] El destino '${targetPath}' es un symlink o directorio no permitido.`
      );
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      throw err;
    }
  }
}

async function writeFileAtomic(targetPath: string, payload: string): Promise<number> {
  const tempPath = path.join(path.dirname(targetPath), `.agent-card.${crypto.randomUUID()}.tmp`);
  try {
    await fsPromises.writeFile(tempPath, payload, { encoding: 'utf-8', mode: 0o644 });
    await fsPromises.rename(tempPath, targetPath);
    return Buffer.byteLength(payload, 'utf-8');
  } catch (err: unknown) {
    await fsPromises.rm(tempPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

export async function writeAgentCardFile(
  workspaceRoot: string,
  relativeOutputPath: string = DEFAULT_AGENT_CARD_RELATIVE_PATH,
  options: BuildAgentCardOptions = {}
): Promise<WriteAgentCardResult> {
  const cleanRel = assertRelativeOutputPath(relativeOutputPath);
  const rootReal = await resolveVerifiedRoot(workspaceRoot);
  const candidateTarget = path.resolve(rootReal, cleanRel);
  const parentReal = await ensureContainedParentDir(rootReal, candidateTarget);
  const safeTargetPath = path.join(parentReal, path.basename(candidateTarget));
  await assertSafeTargetFile(safeTargetPath);

  const card = buildAgentCard(options);
  const serialized = `${JSON.stringify(card, null, 2)}\n`;
  const bytesWritten = await writeFileAtomic(safeTargetPath, serialized);
  return {
    outputPath: safeTargetPath,
    relativePath: path.relative(rootReal, safeTargetPath),
    bytesWritten,
    card,
  };
}
