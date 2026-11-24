// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ReadResourceRequestSchema,
  type CallToolResult,
  type ReadResourceRequest,
  type ReadResourceResult,
  type Tool,
  type ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { BlueprintResources } from './resources/blueprint-resources.js';
import {
  AI_EVALS_REDTEAM_RESOURCE,
  readAiEvalsBlueprint,
  type BlueprintFetcherPathHints,
} from './resources/aiEvalsBlueprint.js';
import {
  MOBILE_APPIUM_RESOURCE,
  VIBE_RESCUE_RESOURCE,
  readMobileAppiumBlueprint,
  readVibeRescueBlueprint,
} from './resources/stackBlueprints.js';
import {
  TACTICAL_PATTERNS_SKILL_RESOURCE,
  readTacticalPatternsSkillResource,
} from './resources/tacticalPatternsSkill.js';
import {
  getActiveResourceLang,
  parseResourceUriAndLang,
  runWithResourceLang,
} from './resources/resourceLang.js';
import { resolveSafeProjectPath } from './security/workspacePathValidator.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from './services/github-fetcher.js';
import { SurgicalMerger } from './services/surgical-merger.js';
import { inspectProjectConfig } from './tools/inspect-project.js';
import { fetchBlueprintBundle } from './tools/fetch-bundle.js';
import { bootstrapOrMerge11x } from './tools/bootstrap-merge.js';
import { inspectAstBlastRadius } from './tools/blast-radius.js';
import { cleanWorkspace11x } from './tools/clean-workspace.js';
import { auditSecurityStigOwasp } from './tools/security-auditor.js';
import { runEphemeralQa } from './tools/ephemeral-runner.js';
import { certify11xGate } from './tools/certify-gate.js';
import { auditTestPyramidGaps } from './tools/test-pyramid-auditor.js';
import { initOrAppendAgentsMd } from './tools/initOrAppendAgentsMd.js';
import { reportDebugCatchError, throwIfSignalAborted } from './utils/diagnosticFormatter.js';
import { proposeSkillEvolutionPr } from './tools/propose-evolution-pr.js';
import { reconcileAgentsGovernance } from './cli/reconcile-agents.js';
import {
  VALIDATE_CALM_ARCHITECTURE_TOOL,
  handleValidateCalmArchitecture,
} from './tools/validateCalmArchitecture.js';
import {
  EVALUATE_RELEASE_GATE_TOOL,
  handleEvaluateReleaseGate,
} from './tools/evaluateReleaseGate.js';
import {
  EVALUATE_AGENT_TRAJECTORY_TOOL,
  handleEvaluateAgentTrajectory,
} from './tools/evaluateAgentTrajectory.js';
import {
  RUN_LLM_RED_TEAM_TOOL,
  handleRunLlmRedTeam,
} from './tools/runLlmRedTeam.js';
import {
  AUDIT_VIBE_PROTOTYPE_TOOL,
  handleAuditVibePrototype,
} from './tools/auditVibePrototype.js';
import { SYNC_ENTERPRISE_TMS_TOOL, handleSyncEnterpriseTms } from './integrations/tmsSyncCli.js';
import {
  SESSION_FLIGHT_RECORDER_TOOL,
  handleSessionFlightRecorder,
} from './tools/sessionFlightRecorder.js';
import {
  InspectProjectInputSchema,
  FetchBundleInputSchema,
  BootstrapMergeInputSchema,
  BlastRadiusInputSchema,
  CleanWorkspaceInputSchema,
  AuditSecurityInputSchema,
  RunEphemeralQaInputSchema,
  CertifyGateInputSchema,
  AuditTestPyramidInputSchema,
  InitAgentsMdInputSchema,
  ProposeEvolutionPrInputSchema,
  ReconcileAgentsInputSchema,
  type ResourceLanguage,
} from './types.js';

const MARKDOWN_MIME_TYPE = 'text/markdown' as const;
const TRAVERSAL_SEG_RE = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

export type RawGenericHandler = (request: unknown, extra: unknown) => unknown;

export interface ServerSurfaceRegistry {
  readonly toolNames: ReadonlySet<string>;
  readonly resourceUris: ReadonlySet<string>;
}

export interface V2ToolExecutionExtra {
  readonly signal?: AbortSignal;
}

export interface V2ToolRegistration {
  readonly definition: Pick<Tool, 'name' | 'description'>;
  readonly annotations: ToolAnnotations;
  readonly inputSchema: z.ZodType<Record<string, unknown>>;
  readonly execute: (
    args: Record<string, unknown>,
    extra?: V2ToolExecutionExtra
  ) => Promise<CallToolResult> | CallToolResult;
}

const SERVER_SURFACE_REGISTRY = new WeakMap<McpServer, ServerSurfaceRegistry>();
const SERVER_DISPATCHER_REGISTRY = new WeakMap<McpServer, Map<string, RawGenericHandler>>();
const WRAPPED_READ_HANDLERS = new WeakSet<RawGenericHandler>();

const ValidateCalmInputSchema = z
  .object({
    workspaceRoot: z
      .string()
      .optional()
      .describe('Workspace root directory (optional; defaults to current repository).'),
    architecturePath: z
      .string()
      .optional()
      .describe("Relative path of the FINOS CALM model inside workspaceRoot (default 'architecture/qa-11x.calm.json')."),
    profile: z
      .enum(['auto', 'generic', 'qa-11x-self'])
      .optional()
      .describe("Validation profile: 'auto' (default), 'generic' (any consumer CALM model), or 'qa-11x-self' (upstream QA-11X 6-node/5-edge/7-control governance)."),
  })
  .strict();

const EvaluateReleaseGateInputSchema = z
  .object({
    workspaceRoot: z
      .string()
      .optional()
      .describe('Workspace root for path containment (optional).'),
    scope: z
      .enum(['full', 'smoke'])
      .optional()
      .describe('Evaluation scope: full (evaluates 3 signals) or smoke (returns SKIPPED).'),
    dryRun: z
      .boolean()
      .optional()
      .describe('Informative mode by default (true). When false, NO_GO sets isError=true.'),
    enforce: z
      .boolean()
      .optional()
      .describe('Equivalent to dryRun=false when true.'),
    timestamp: z
      .string()
      .optional()
      .describe('Optional ISO-8601 timestamp normalized to UTC (Z).'),
    junitXmlPath: z
      .string()
      .optional()
      .describe('Relative path to JUnit XML report inside workspaceRoot.'),
    junitXmlContent: z
      .string()
      .optional()
      .describe('Inline JUnit XML payload (alternative to junitXmlPath).'),
    telemetryJsonPath: z
      .string()
      .optional()
      .describe('Relative path to observability telemetry JSON (OTel/Prometheus/Datadog/Grafana).'),
    telemetry: z
      .record(z.unknown())
      .optional()
      .describe('Inline telemetry JSON snapshot (snake_case or camelCase).'),
    defectsJsonPath: z
      .string()
      .optional()
      .describe('Relative path to QA defects and escapes JSON.'),
    defects: z
      .record(z.unknown())
      .optional()
      .describe('Inline defect summary JSON (open_blockers, open_criticals, qa_escapes).'),
    thresholds: z
      .object({
        minPassRatePct: z
          .number()
          .optional()
          .describe('Minimum JUnit pass percentage (default 100).'),
        maxErrorRatePct: z
          .number()
          .optional()
          .describe('Maximum error rate % (default 1.0).'),
        maxP95Ms: z
          .number()
          .optional()
          .describe('Maximum p95 latency in ms (default 500).'),
        maxP99Ms: z
          .number()
          .optional()
          .describe('Maximum p99 latency in ms (default 1000).'),
        maxActiveIncidents: z
          .number()
          .optional()
          .describe('Maximum active incidents (default 0).'),
        maxOpenBlockers: z
          .number()
          .optional()
          .describe('Maximum open blockers (default 0).'),
        maxOpenCriticals: z
          .number()
          .optional()
          .describe('Maximum open criticals (default 0).'),
        maxQaEscapes: z
          .number()
          .optional()
          .describe('Maximum QA escapes (default 0).'),
      })
      .strict()
      .optional()
      .describe('Partial override of corporate release thresholds.'),
    minPassRatePct: z
      .number()
      .optional()
      .describe('Direct override for minPassRatePct.'),
    maxErrorRatePct: z
      .number()
      .optional()
      .describe('Direct override for maxErrorRatePct.'),
    maxP95Ms: z
      .number()
      .optional()
      .describe('Direct override for maxP95Ms.'),
    maxP99Ms: z
      .number()
      .optional()
      .describe('Direct override for maxP99Ms.'),
    maxActiveIncidents: z
      .number()
      .optional()
      .describe('Direct override for maxActiveIncidents.'),
    maxOpenBlockers: z
      .number()
      .optional()
      .describe('Direct override for maxOpenBlockers.'),
    maxOpenCriticals: z
      .number()
      .optional()
      .describe('Direct override for maxOpenCriticals.'),
    maxQaEscapes: z
      .number()
      .optional()
      .describe('Direct override for maxQaEscapes.'),
  })
  .strict();

const EvaluateTrajectoryInputSchema = z
  .object({
    mode: z
      .enum(['offline', 'live'])
      .optional()
      .describe('Execution mode (offline by default, zero network).'),
    workspaceRoot: z
      .string()
      .optional()
      .describe('Project root directory for path containment checks.'),
    testPath: z
      .string()
      .optional()
      .describe('Relative path to Pytest/DeepEval test (default ai-evals/rag/test_rag_faithfulness.py).'),
    steps: z
      .array(
        z
          .object({
            tool: z.string().describe('Invoked tool identifier.'),
            args: z.unknown().optional().describe('Arguments supplied to the tool call.'),
            status: z
              .enum(['passed', 'failed', 'error'])
              .optional()
              .describe('Execution status of the step.'),
            output: z.string().optional().describe('Raw step output text.'),
            retries: z.number().min(0).optional().describe('Retry count for this step (>= 0).'),
            compiled: z.boolean().optional().describe('Whether compilation passed after edit.'),
            durationMs: z
              .number()
              .min(0)
              .optional()
              .describe('Observed step execution duration in milliseconds.'),
          })
          .strict()
      )
      .optional()
      .describe('Tool execution steps recorded for the agent.'),
    requiredSequence: z
      .array(z.string())
      .optional()
      .describe('Expected ordering of key tools across the trajectory.'),
    actualOutput: z
      .string()
      .optional()
      .describe('Final text emitted by the agent or RAG pipeline.'),
    retrievalContext: z
      .array(z.string())
      .optional()
      .describe('Retrieved context snippets used to verify [doc_id] citations and numeric claims.'),
    enforceAstBeforeEdit: z
      .boolean()
      .optional()
      .describe('Require prior AST blast-radius inspection before file edits (default true).'),
    timeoutMs: z
      .number()
      .min(180_000, 'Live mode requires timeoutMs >= 180000 ms.')
      .optional()
      .describe('Timeout in milliseconds for live mode (>= 180000).'),
  })
  .strict();

const RunLlmRedTeamInputSchema = z
  .object({
    mode: z
      .enum(['offline', 'live'])
      .optional()
      .describe('Audit mode (offline by default, zero network).'),
    workspaceRoot: z
      .string()
      .optional()
      .describe('Workspace root directory for path containment checks.'),
    configPath: z
      .string()
      .optional()
      .describe('Relative path to Promptfoo YAML config (default ai-evals/promptfooconfig.yaml).'),
    timeoutMs: z
      .number()
      .min(180_000, 'Live mode requires timeoutMs >= 180000 ms.')
      .optional()
      .describe('Timeout in milliseconds for live mode (>= 180000).'),
  })
  .strict();

const AuditVibeInputSchema = z
  .object({
    targetDir: z
      .string()
      .optional()
      .describe('Relative or contained prototype directory path inside workspaceRoot.'),
    workspaceRoot: z
      .string()
      .optional()
      .describe('Allowed project root for anti-Path Traversal containment.'),
    dryRun: z
      .boolean()
      .optional()
      .describe('Safe read-only mode without disk writes (default true).'),
    remediationSubdir: z
      .string()
      .optional()
      .describe('Relative subdirectory inside targetDir for generated remediation files when dryRun=false.'),
    maxLines: z
      .number()
      .optional()
      .describe('Maximum lines per module before triggering VIBE-ARCH-004 (default 500).'),
    enforce: z
      .boolean()
      .optional()
      .describe('If true, returns isError=true in MCP when verdict is RESCUE_REQUIRED.'),
  })
  .strict();

const SyncEnterpriseTmsInputSchema = z
  .object({
    mode: z
      .enum(['inventory', 'push-results', 'pull-stories'])
      .describe('Synchronization operation mode: inventory, push-results, or pull-stories.'),
    provider: z
      .enum(['jira', 'zephyr', 'xray', 'github-issues'])
      .optional()
      .describe('Target enterprise TMS provider (jira, zephyr, xray, or github-issues).'),
    targetDir: z
      .string()
      .optional()
      .describe('Relative subdirectory containing BDD features or test suites.'),
    junitXmlPath: z
      .string()
      .optional()
      .describe('Relative path to JUnit XML report inside workspaceRoot.'),
    junitXmlContent: z
      .string()
      .optional()
      .describe('Inline JUnit XML payload (alternative to junitXmlPath).'),
    baseUrl: z
      .string()
      .optional()
      .describe('HTTPS base URL of the enterprise TMS instance (anti-SSRF validated).'),
    projectKey: z
      .string()
      .optional()
      .describe('Enterprise TMS project key (e.g. QA11X).'),
    issueKey: z
      .string()
      .optional()
      .describe('Target TMS issue or story key (e.g. QA11X-42).'),
    testExecutionKey: z
      .string()
      .optional()
      .describe('Optional Xray/Zephyr test execution key.'),
    repo: z
      .string()
      .optional()
      .describe('GitHub owner/repo identifier when provider is github-issues.'),
    requiredKeys: z
      .array(z.string())
      .optional()
      .describe('Mandatory @JIRA/@TC traceability keys required during inventory validation.'),
    dryRun: z
      .boolean()
      .optional()
      .describe('Safe simulation mode (default true) without executing remote writes.'),
    timeoutMs: z
      .number()
      .positive()
      .max(180_000)
      .optional()
      .describe('HTTP request timeout in milliseconds (positive, <= 180000).'),
    workspaceRoot: z
      .string()
      .optional()
      .describe('Workspace root directory for path containment checks.'),
  })
  .strict();

const SessionFlightRecorderInputSchema = z
  .object({
    project_path: z
      .string()
      .optional()
      .describe('Target project workspace root directory (defaults to current directory).'),
    action: z
      .enum(['save', 'recover', 'clear'])
      .describe("Operation to perform: 'save', 'recover', or 'clear'."),
    task_id: z
      .string()
      .optional()
      .describe("Task identifier (e.g. 'HITO-26-V31'). Required for 'save'."),
    active_step: z
      .string()
      .optional()
      .describe("Active step identifier (e.g. 'F4'). Required for 'save'."),
    intent_140chars: z
      .string()
      .optional()
      .describe('Concise active intent strictly <= 140 Unicode chars (SEC-06 sanitized). Required for save.'),
    completed_steps: z
      .array(z.string())
      .optional()
      .describe('List of completed step IDs.'),
    planned_steps: z
      .array(z.string())
      .optional()
      .describe('Ordered list of planned step IDs.'),
    allowed_globs: z
      .array(z.string())
      .optional()
      .describe('Optional diff blast-radius allowed globs.'),
    forbidden_globs: z
      .array(z.string())
      .optional()
      .describe('Optional diff blast-radius forbidden globs.'),
    reason: z
      .string()
      .optional()
      .describe("Optional closure/abort reason for 'clear'."),
  })
  .strict();

export const V2_TOOL_REGISTRATIONS: readonly V2ToolRegistration[] = [
  {
    definition: VALIDATE_CALM_ARCHITECTURE_TOOL,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: ValidateCalmInputSchema,
    execute: (args, extra) => {
      throwIfSignalAborted(extra?.signal, 'validate_calm_architecture abortado por timeout o cancelación.');
      return handleValidateCalmArchitecture(args);
    },
  },
  {
    definition: EVALUATE_RELEASE_GATE_TOOL,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: EvaluateReleaseGateInputSchema,
    execute: (args, extra) => {
      throwIfSignalAborted(extra?.signal, 'evaluate_release_gate abortado por timeout o cancelación.');
      return handleEvaluateReleaseGate(args);
    },
  },
  {
    definition: EVALUATE_AGENT_TRAJECTORY_TOOL,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: EvaluateTrajectoryInputSchema,
    execute: async (args, extra) =>
      await handleEvaluateAgentTrajectory(args, { signal: extra?.signal }),
  },
  {
    definition: RUN_LLM_RED_TEAM_TOOL,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: RunLlmRedTeamInputSchema,
    execute: async (args, extra) => await handleRunLlmRedTeam(args, { signal: extra?.signal }),
  },
  {
    definition: AUDIT_VIBE_PROTOTYPE_TOOL,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: AuditVibeInputSchema,
    execute: (args, extra) => {
      throwIfSignalAborted(extra?.signal, 'audit_vibe_prototype abortado por timeout o cancelación.');
      return handleAuditVibePrototype(args);
    },
  },
  {
    definition: SYNC_ENTERPRISE_TMS_TOOL,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    inputSchema: SyncEnterpriseTmsInputSchema,
    execute: async (args, extra) =>
      await handleSyncEnterpriseTms(args, { signal: extra?.signal }),
  },
  {
    definition: SESSION_FLIGHT_RECORDER_TOOL,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: SessionFlightRecorderInputSchema,
    execute: async (args, extra) =>
      await handleSessionFlightRecorder(args, { signal: extra?.signal }),
  },
];

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Extracts the JSON-RPC method literal name from a Zod v3 MCP request schema. */
export function extractMethodName(requestSchema: unknown): string | undefined {
  if (!isRecordObject(requestSchema) || !isRecordObject(requestSchema.shape)) {
    return undefined;
  }
  const methodField = requestSchema.shape.method;
  if (!isRecordObject(methodField)) {
    return undefined;
  }
  if (typeof methodField.value === 'string') {
    return methodField.value;
  }
  if (isRecordObject(methodField._def) && typeof methodField._def.value === 'string') {
    return methodField._def.value;
  }
  return undefined;
}

/** Idempotently attaches setRequestHandler/removeRequestHandler tracking to an McpServer. */
export function attachDispatcherTracking(server: McpServer): Map<string, RawGenericHandler> {
  const existingRegistry = SERVER_DISPATCHER_REGISTRY.get(server);
  if (existingRegistry) {
    return existingRegistry;
  }

  const registry = new Map<string, RawGenericHandler>();
  SERVER_DISPATCHER_REGISTRY.set(server, registry);

  const rawServer = server.server;
  const origSetRequestHandler = rawServer.setRequestHandler.bind(rawServer);
  const origRemoveRequestHandler = rawServer.removeRequestHandler.bind(rawServer);

  rawServer.setRequestHandler = ((
    requestSchema: Parameters<typeof origSetRequestHandler>[0],
    handler: Parameters<typeof origSetRequestHandler>[1]
  ) => {
    const method = extractMethodName(requestSchema);
    if (method !== undefined) {
      registry.set(method, handler as unknown as RawGenericHandler);
    }
    return origSetRequestHandler(requestSchema, handler);
  }) as typeof rawServer.setRequestHandler;

  rawServer.removeRequestHandler = (method: string) => {
    registry.delete(method);
    return origRemoveRequestHandler(method);
  };

  return registry;
}

/** Returns captured public setRequestHandler dispatcher map for an McpServer instance. */
export function getServerDispatcherRegistry(
  mcpServer: McpServer
): Map<string, RawGenericHandler> | undefined {
  return SERVER_DISPATCHER_REGISTRY.get(mcpServer);
}

/** Idempotently wraps resources/read so ?lang=es|en works across static resources and templates. */
export function wrapReadResourceDispatcher(mcpServer: McpServer): void {
  const registry = getServerDispatcherRegistry(mcpServer);
  if (!registry) {
    return;
  }
  const methodName = ReadResourceRequestSchema.shape.method.value;
  const existing = registry.get(methodName);
  if (typeof existing !== 'function' || WRAPPED_READ_HANDLERS.has(existing)) {
    return;
  }

  const wrappedHandler = async (
    request: ReadResourceRequest,
    extra: unknown
  ): Promise<ReadResourceResult> => {
    const requestedUri = request.params.uri;
    const { baseUri, lang } = parseResourceUriAndLang(requestedUri);
    const rewrittenRequest =
      baseUri === requestedUri
        ? request
        : { ...request, params: { ...request.params, uri: baseUri } };
    const result = (await runWithResourceLang(lang, () =>
      existing(rewrittenRequest, extra)
    )) as ReadResourceResult;
    if (baseUri !== requestedUri && Array.isArray(result.contents)) {
      return {
        ...result,
        contents: result.contents.map((item) => ({ ...item, uri: requestedUri })),
      };
    }
    return result;
  };

  WRAPPED_READ_HANDLERS.add(wrappedHandler as unknown as RawGenericHandler);
  mcpServer.server.setRequestHandler(ReadResourceRequestSchema, wrappedHandler);
}

function extractRegisteredResourceUri(uriOrTemplate: string | ResourceTemplate): string {
  return typeof uriOrTemplate === 'string' ? uriOrTemplate : uriOrTemplate.uriTemplate.toString();
}

/** Idempotently attaches runtime registration tracking for tools and resources. */
export function attachRegistrationTracking(server: McpServer): void {
  if (SERVER_SURFACE_REGISTRY.has(server)) {
    return;
  }
  const toolNames = new Set<string>();
  const resourceUris = new Set<string>();

  const wrapToolMethod = (methodName: 'registerTool' | 'tool'): void => {
    const orig = (Reflect.get(server, methodName) as (...args: readonly unknown[]) => unknown).bind(
      server
    );
    Reflect.set(server, methodName, (...args: readonly unknown[]) => {
      toolNames.add(String(args[0]));
      return orig(...args);
    });
  };

  const wrapResourceMethod = (methodName: 'registerResource' | 'resource'): void => {
    const orig = (Reflect.get(server, methodName) as (...args: readonly unknown[]) => unknown).bind(
      server
    );
    Reflect.set(server, methodName, (...args: readonly unknown[]) => {
      const uriOrTemplate = args[1] as string | ResourceTemplate;
      resourceUris.add(extractRegisteredResourceUri(uriOrTemplate));
      return orig(...args);
    });
  };

  wrapToolMethod('registerTool');
  wrapToolMethod('tool');
  wrapResourceMethod('registerResource');
  wrapResourceMethod('resource');

  SERVER_SURFACE_REGISTRY.set(server, { toolNames, resourceUris });
}

/** Returns runtime-registered tool names and resource URIs tracked for an McpServer instance. */
export function getRegisteredServerSurface(server: McpServer): ServerSurfaceRegistry | undefined {
  return SERVER_SURFACE_REGISTRY.get(server);
}

function resolveV2TargetDirPath(rawTargetDir: string, rawWorkspaceRoot: unknown): string {
  const normalizedTarget = rawTargetDir.normalize('NFKC').trim();
  if (
    normalizedTarget.length === 0 ||
    normalizedTarget.includes('\0') ||
    TRAVERSAL_SEG_RE.test(normalizedTarget) ||
    path.isAbsolute(normalizedTarget)
  ) {
    return resolveSafeProjectPath(rawTargetDir);
  }
  const baseRoot =
    typeof rawWorkspaceRoot === 'string'
      ? resolveSafeProjectPath(rawWorkspaceRoot)
      : resolveSafeProjectPath(process.cwd());
  return resolveSafeProjectPath(path.resolve(baseRoot, normalizedTarget));
}

/** Validates SEC-PATH-01 workspace/project/targetDir boundaries for V2/V3 MCP tool calls. */
export function validateV2ToolWorkspaceArgs(rawArgs: unknown): void {
  if (!isRecordObject(rawArgs)) {
    return;
  }
  if (typeof rawArgs.workspaceRoot === 'string') {
    resolveSafeProjectPath(rawArgs.workspaceRoot);
  }
  if (typeof rawArgs.project_path === 'string') {
    resolveSafeProjectPath(rawArgs.project_path);
  }
  if (typeof rawArgs.targetDir === 'string') {
    resolveV2TargetDirPath(rawArgs.targetDir, rawArgs.workspaceRoot);
  }
}

function toSingleResourceResult(
  uri: URL,
  res: { readonly mimeType: string; readonly text: string }
): ReadResourceResult {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: res.mimeType,
        text: res.text,
      },
    ],
  };
}

function toJsonToolResult(result: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result),
      },
    ],
  };
}

function registerCoreResources(server: McpServer, resources: BlueprintResources): void {
  server.registerResource(
    'blueprint-manifest',
    'blueprint://manifest',
    {
      description: 'JSON cryptographic manifest with SHA-256 hashes of all stacks and files.',
      mimeType: 'application/json',
    },
    async (uri) => toSingleResourceResult(uri, await resources.getManifestResource())
  );

  server.registerResource(
    'blueprint-philosophy',
    'blueprint://core/philosophy',
    {
      description: 'Level-11X quality philosophy, 13 pyramid layers, and Rule Zero.',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri) =>
      toSingleResourceResult(uri, await resources.getPhilosophyResource(getActiveResourceLang(uri)))
  );

  server.registerResource(
    'blueprint-security',
    'blueprint://security/disa-owasp-22',
    {
      description:
        'Catalog of 22 DISA ASD STIG V6R5 and OWASP Developer Guide v4.2 reference controls + 36 static scanner rules.',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri) =>
      toSingleResourceResult(uri, await resources.getSecurityResource(getActiveResourceLang(uri)))
  );

  server.registerResource(
    'blueprint-postgres-rls-worm',
    'blueprint://database/postgres-rls-worm',
    {
      description:
        'Guide and reference implementation for PostgreSQL 17 Multi-Transaction RLS (after_begin) and deterministic WORM audit serialization (seq_num BIGINT + pg_advisory_xact_lock).',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri) =>
      toSingleResourceResult(
        uri,
        await resources.getPostgresRlsWormResource(getActiveResourceLang(uri))
      )
  );

  server.registerResource(
    'blueprint-stack-readme',
    new ResourceTemplate('blueprint://{stack}/readme', { list: undefined }),
    {
      description: 'Operational testing and QA guide for the requested stack.',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri, variables) =>
      toSingleResourceResult(
        uri,
        await resources.getStackReadmeResource(
          String(variables.stack ?? ''),
          getActiveResourceLang(uri)
        )
      )
  );

  server.registerResource(
    'blueprint-refactoring-ui',
    new ResourceTemplate('blueprint://ui/refactoring-ui/{topic}', { list: undefined }),
    {
      description: 'Tactical UI design and WCAG 2.1 AA accessibility rules from Refactoring UI.',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri, variables) =>
      toSingleResourceResult(
        uri,
        await resources.getRefactoringUiResource(
          String(variables.topic ?? ''),
          getActiveResourceLang(uri)
        )
      )
  );

  server.registerResource(
    'blueprint-active-task-template',
    'blueprint://core/active-task-template',
    {
      description:
        'Canonical active task diary template (.agents/ACTIVE_TASK.md.example) for session crash resilience.',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri) =>
      toSingleResourceResult(
        uri,
        await resources.getActiveTaskTemplateResource(getActiveResourceLang(uri))
      )
  );

  server.registerResource(
    'blueprint-cleanup-script',
    'blueprint://core/cleanup-script',
    {
      description:
        'Canonical cleanup script (limpieza.sh) with Alpine fallback to safely purge Docker root artifacts without sudo.',
      mimeType: 'text/x-shellscript',
    },
    async (uri) =>
      toSingleResourceResult(
        uri,
        await resources.getCleanupScriptResource(getActiveResourceLang(uri))
      )
  );

  server.registerResource(
    'blueprint-roadmap-validator',
    'blueprint://core/roadmap-validator',
    {
      description:
        'Canonical roadmap consistency validator (.agents/scripts/verify_roadmap_consistency.py) auditing ROADMAP.md and ACTIVE_TASK.md.',
      mimeType: 'text/x-python',
    },
    async (uri) =>
      toSingleResourceResult(
        uri,
        await resources.getRoadmapValidatorResource(getActiveResourceLang(uri))
      )
  );
}

async function readRemoteOrEmbeddedStackBlueprint(
  resources: BlueprintResources,
  stackId: 'mobile-appium' | 'vibe-rescue',
  lang: ResourceLanguage,
  embeddedFallback: () => { readonly mimeType: string; readonly text: string }
): Promise<{ readonly mimeType: string; readonly text: string }> {
  try {
    return await resources.getStackReadmeResource(stackId, lang);
  } catch (err: unknown) {
    // Offline/network/SHA failure falls back cleanly to embedded blueprint outside the monorepo
    reportDebugCatchError(`server.readRemoteOrEmbeddedStackBlueprint(${stackId})`, err);
    return embeddedFallback();
  }
}

function registerExtensionResources(
  server: McpServer,
  resources: BlueprintResources,
  fetcher: GitHubFetcher
): void {
  const getHints = (): BlueprintFetcherPathHints => ({
    localOverridePath: fetcher.getLocalOverridePath(),
    cacheDir: fetcher.getCacheDir(),
  });

  server.registerResource(
    AI_EVALS_REDTEAM_RESOURCE.name,
    AI_EVALS_REDTEAM_RESOURCE.uri,
    {
      description: AI_EVALS_REDTEAM_RESOURCE.description,
      mimeType: AI_EVALS_REDTEAM_RESOURCE.mimeType,
    },
    (uri) =>
      toSingleResourceResult(
        uri,
        readAiEvalsBlueprint(undefined, getActiveResourceLang(uri), getHints())
      )
  );

  server.registerResource(
    MOBILE_APPIUM_RESOURCE.name,
    MOBILE_APPIUM_RESOURCE.uri,
    {
      description: MOBILE_APPIUM_RESOURCE.description,
      mimeType: MOBILE_APPIUM_RESOURCE.mimeType,
    },
    async (uri) => {
      const lang = getActiveResourceLang(uri);
      return toSingleResourceResult(
        uri,
        await readRemoteOrEmbeddedStackBlueprint(resources, 'mobile-appium', lang, () =>
          readMobileAppiumBlueprint(undefined, lang)
        )
      );
    }
  );

  server.registerResource(
    VIBE_RESCUE_RESOURCE.name,
    VIBE_RESCUE_RESOURCE.uri,
    {
      description: VIBE_RESCUE_RESOURCE.description,
      mimeType: VIBE_RESCUE_RESOURCE.mimeType,
    },
    async (uri) => {
      const lang = getActiveResourceLang(uri);
      return toSingleResourceResult(
        uri,
        await readRemoteOrEmbeddedStackBlueprint(resources, 'vibe-rescue', lang, () =>
          readVibeRescueBlueprint(undefined, lang)
        )
      );
    }
  );

  server.registerResource(
    TACTICAL_PATTERNS_SKILL_RESOURCE.name,
    TACTICAL_PATTERNS_SKILL_RESOURCE.uri,
    {
      description: TACTICAL_PATTERNS_SKILL_RESOURCE.description,
      mimeType: TACTICAL_PATTERNS_SKILL_RESOURCE.mimeType,
    },
    (uri) =>
      toSingleResourceResult(
        uri,
        readTacticalPatternsSkillResource(undefined, getActiveResourceLang(uri), getHints())
      )
  );
}

function registerCoreAnalysisTools(
  server: McpServer,
  fetcher: GitHubFetcher,
  merger: SurgicalMerger
): void {
  server.registerTool(
    'inspect_project_config',
    {
      description:
        'Audits user project directory, detecting stacks, strict linter flags, missing 11X files, and QA 11X version/skill update availability.',
      inputSchema: InspectProjectInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(await inspectProjectConfig(safePath, undefined, { fetcher }));
    }
  );

  server.registerTool(
    'fetch_blueprint_bundle',
    {
      description:
        'Downloads on-demand blueprint templates and scripts for the requested stack with SHA-256 validation.',
      inputSchema: FetchBundleInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      toJsonToolResult(
        await fetchBlueprintBundle(
          args.stack,
          args.include_common_and_agents,
          fetcher,
          args.include_content
        )
      )
  );

  server.registerTool(
    'bootstrap_or_merge_11x',
    {
      description:
        'Surgically injects or merges 11X quality standard templates without altering existing production dependencies or code (dry_run default true).',
      inputSchema: BootstrapMergeInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await bootstrapOrMerge11x(safePath, args.stack, args.dry_run, {
          fetcher,
          merger,
          createBackup: args.create_backup,
        })
      );
    }
  );

  server.registerTool(
    'inspect_ast_blast_radius',
    {
      description:
        'Queries the AST knowledge graph (graphify-out/graph.json) for code/architecture Q&A and pre-refactoring blast-radius analysis.',
      inputSchema: BlastRadiusInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args, extra) => {
      const targetSymbol = args.target_symbol ?? '';
      const hasScope =
        args.changed_since_ref !== undefined || args.include_git_signals === true;
      if (!targetSymbol.trim() && !hasScope) {
        throw new Error(
          'Se requiere target_symbol (o changed_since_ref / include_git_signals).'
        );
      }
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await inspectAstBlastRadius(safePath, targetSymbol, args.max_items, {
          autoBuildIfMissing: args.auto_build_if_missing,
          refreshGraph: args.refresh_graph,
          changedSinceRef: args.changed_since_ref,
          maxTokensBudget: args.max_tokens_budget,
          includeGitSignals: args.include_git_signals,
          signal: extra.signal,
        })
      );
    }
  );

  server.registerTool(
    'clean_workspace_11x',
    {
      description:
        'Audits or executes workspace sanitation, removing transient test artifacts and Docker cache residues (dry_run default).',
      inputSchema: CleanWorkspaceInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await cleanWorkspace11x(safePath, args.dry_run, args.deep_prune)
      );
    }
  );

  server.registerTool(
    'audit_security_stig_owasp',
    {
      description:
        'Statically audits project source code against 22 DISA ASD STIG V6R5 / OWASP v4.2 reference controls + 36 static scanner rules covering Anti-Silo QA/Healthcheck/TTY/CI/Contract/Docker/Playwright/SSR/Stryker/WS-PubSub/UI patterns (including QA-HEALTH-01, QA-CLI-TTY-01, QA-DOCKER-TTY-01, QA-CI-ESCAPE-01, QA-MAKE-CURDIR-01, QA-CONTRACT-SDK-01, QA-DOCKER-LOCK-01, QA-PLAYWRIGHT-PIN-01, QA-SSR-HYDRATION-01, QA-STRYKER-CFG-01, SEC-WS-PUBSUB-01, and UI-11X-01..03).',
      inputSchema: AuditSecurityInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await auditSecurityStigOwasp(safePath, {
          maxFindings: args.max_findings,
          includeExamples: args.include_examples,
        })
      );
    }
  );
}

function registerQaGovernanceTools(server: McpServer, fetcher: GitHubFetcher): void {
  server.registerTool(
    'run_ephemeral_qa',
    {
      description:
        'Safely runs a Makefile QA target (lint, unit, bdd, e2e, perf, chaos, profile, all) inside ephemeral Docker containers (Rule Zero), parsing logs for extreme token economy.',
      inputSchema: RunEphemeralQaInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args, extra) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await runEphemeralQa(safePath, args.stage, args.timeout_seconds, {
          skipIfDocsOnly: args.skip_if_docs_only,
          signal: extra.signal,
        })
      );
    }
  );

  server.registerTool(
    'certify_11x_gate',
    {
      description:
        'Executes 11X certification gates (secrets, JSON, orphan UI/API, ORM parity, lint evidence, STIG audit, docs) and checks version/skill update status before git push.',
      inputSchema: CertifyGateInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args, extra) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await certify11xGate(safePath, {
          requireLintEvidence: args.require_lint_evidence,
          strict: args.strict,
          allowUnmergedExamples: args.allow_unmerged_examples,
          updateOptions: { fetcher },
          signal: extra.signal,
        })
      );
    }
  );

  server.registerTool(
    'audit_test_pyramid_gaps',
    {
      description:
        'Audits existing project against the 13 layers of the 11X pyramid, reporting uncovered files/endpoints and a prioritized rescue plan.',
      inputSchema: AuditTestPyramidInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(await auditTestPyramidGaps(safePath, args.stack, args.max_items));
    }
  );

  server.registerTool(
    'init_or_append_agents_md',
    {
      description:
        'Creates AGENTS.md or additively injects the QA 11X connector block with dynamic language policy without overwriting existing content.',
      inputSchema: InitAgentsMdInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await initOrAppendAgentsMd({
          projectPath: safePath,
          dryRun: Boolean(args.dry_run),
          lang: args.lang,
          agents: args.agents,
        })
      );
    }
  );

  server.registerTool(
    'propose_skill_evolution_pr',
    {
      description:
        'Proposes a Dual-Consumer improvement (AI skill/rule + MCP executable gate + human manual in docs/) to qa-testing-blueprints via gh CLI or pre-filled GitHub URL.',
      inputSchema: ProposeEvolutionPrInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(await proposeSkillEvolutionPr({ ...args, project_path: safePath }));
    }
  );

  server.registerTool(
    'reconcile_agents_governance',
    {
      description:
        'Reconciles .agents/ governance rules in consumer projects: creates backup, prunes promoted duplicates, and extracts domain rules (dry_run default true).',
      inputSchema: ReconcileAgentsInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await reconcileAgentsGovernance({
          projectPath: safePath,
          dryRun: args.dry_run,
          pruneBridges: args.prune_bridges,
        })
      );
    }
  );
}

function registerV2Tools(server: McpServer): void {
  for (const entry of V2_TOOL_REGISTRATIONS) {
    server.registerTool(
      entry.definition.name,
      {
        description: entry.definition.description,
        inputSchema: entry.inputSchema,
        annotations: entry.annotations,
      },
      async (args, extra) => {
        validateV2ToolWorkspaceArgs(args);
        return await entry.execute(args, { signal: extra.signal });
      }
    );
  }
}

const CORE_REGISTERED_TOOL_NAMES = [
  'inspect_project_config',
  'fetch_blueprint_bundle',
  'bootstrap_or_merge_11x',
  'inspect_ast_blast_radius',
  'clean_workspace_11x',
  'audit_security_stig_owasp',
  'run_ephemeral_qa',
  'certify_11x_gate',
  'audit_test_pyramid_gaps',
  'init_or_append_agents_md',
  'propose_skill_evolution_pr',
  'reconcile_agents_governance',
] as const;

const REGISTERED_RESOURCE_URIS = [
  'blueprint://manifest',
  'blueprint://core/philosophy',
  'blueprint://security/disa-owasp-22',
  'blueprint://database/postgres-rls-worm',
  'blueprint://{stack}/readme',
  'blueprint://ui/refactoring-ui/{topic}',
  'blueprint://core/active-task-template',
  'blueprint://core/cleanup-script',
  'blueprint://core/roadmap-validator',
  AI_EVALS_REDTEAM_RESOURCE.uri,
  MOBILE_APPIUM_RESOURCE.uri,
  VIBE_RESCUE_RESOURCE.uri,
  TACTICAL_PATTERNS_SKILL_RESOURCE.uri,
] as const;

/** Computes declared MCP tool & resource surface counts without instantiating McpServer. */
export function getDeclaredSurfaceCounts(): { readonly tools: number; readonly resources: number } {
  return {
    tools: CORE_REGISTERED_TOOL_NAMES.length + V2_TOOL_REGISTRATIONS.length,
    resources: REGISTERED_RESOURCE_URIS.length,
  };
}

export function createMcpServer(options?: {
  fetcher?: GitHubFetcher;
  merger?: SurgicalMerger;
}): McpServer {
  const fetcher = options?.fetcher || new GitHubFetcher();
  const merger = options?.merger || new SurgicalMerger();
  const resources = new BlueprintResources(fetcher);

  const server = new McpServer({
    name: '@sinfallas/mcp-qa-11x',
    version: MCP_SERVER_VERSION,
  });

  attachDispatcherTracking(server);
  attachRegistrationTracking(server);

  registerCoreResources(server, resources);
  registerExtensionResources(server, resources, fetcher);
  registerCoreAnalysisTools(server, fetcher, merger);
  registerQaGovernanceTools(server, fetcher);
  registerV2Tools(server);

  wrapReadResourceDispatcher(server);

  return server;
}
