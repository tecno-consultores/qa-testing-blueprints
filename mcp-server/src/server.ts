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
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { BlueprintResources } from './resources/blueprint-resources.js';
import { AI_EVALS_REDTEAM_RESOURCE, readAiEvalsBlueprint } from './resources/aiEvalsBlueprint.js';
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
import { initOrAppendAgentsMd } from './cli/init-agents-md.js';
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
} from './types.js';

const MARKDOWN_MIME_TYPE = 'text/markdown' as const;
const TRAVERSAL_SEG_RE = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

export type RawGenericHandler = (request: unknown, extra: unknown) => unknown;

export interface ServerSurfaceRegistry {
  readonly toolNames: ReadonlySet<string>;
  readonly resourceUris: ReadonlySet<string>;
}

export interface V2ToolRegistration {
  readonly definition: Tool;
  readonly inputSchema: z.ZodType<Record<string, unknown>>;
  readonly execute: (args: Record<string, unknown>) => Promise<CallToolResult> | CallToolResult;
}

const SERVER_SURFACE_REGISTRY = new WeakMap<McpServer, ServerSurfaceRegistry>();
const SERVER_DISPATCHER_REGISTRY = new WeakMap<McpServer, Map<string, RawGenericHandler>>();
const WRAPPED_READ_HANDLERS = new WeakSet<RawGenericHandler>();

const ValidateCalmInputSchema = z
  .object({
    workspaceRoot: z.string().optional(),
    architecturePath: z.string().optional(),
  })
  .passthrough();

const EvaluateReleaseGateInputSchema = z
  .object({
    workspaceRoot: z.string().optional(),
    scope: z.enum(['full', 'smoke']).optional(),
    dryRun: z.boolean().optional(),
    enforce: z.boolean().optional(),
    timestamp: z.string().optional(),
    junitXmlPath: z.string().optional(),
    junitXmlContent: z.string().optional(),
    telemetryJsonPath: z.string().optional(),
    telemetry: z.record(z.unknown()).optional(),
    defectsJsonPath: z.string().optional(),
    defects: z.record(z.unknown()).optional(),
    thresholds: z
      .object({
        minPassRatePct: z.number().optional(),
        maxErrorRatePct: z.number().optional(),
        maxP95Ms: z.number().optional(),
        maxP99Ms: z.number().optional(),
        maxActiveIncidents: z.number().optional(),
        maxOpenBlockers: z.number().optional(),
        maxOpenCriticals: z.number().optional(),
        maxQaEscapes: z.number().optional(),
      })
      .passthrough()
      .optional(),
    minPassRatePct: z.number().optional(),
    maxErrorRatePct: z.number().optional(),
    maxP95Ms: z.number().optional(),
    maxP99Ms: z.number().optional(),
    maxActiveIncidents: z.number().optional(),
    maxOpenBlockers: z.number().optional(),
    maxOpenCriticals: z.number().optional(),
    maxQaEscapes: z.number().optional(),
  })
  .passthrough();

const EvaluateTrajectoryInputSchema = z
  .object({
    mode: z.enum(['offline', 'live']).optional(),
    workspaceRoot: z.string().optional(),
    testPath: z.string().optional(),
    steps: z
      .array(
        z
          .object({
            tool: z.string(),
            args: z.unknown().optional(),
            status: z.enum(['passed', 'failed', 'error']).optional(),
            output: z.string().optional(),
            retries: z.number().min(0).optional(),
            compiled: z.boolean().optional(),
            durationMs: z.number().min(0).optional(),
          })
          .passthrough()
      )
      .optional(),
    requiredSequence: z.array(z.string()).optional(),
    actualOutput: z.string().optional(),
    retrievalContext: z.array(z.string()).optional(),
    enforceAstBeforeEdit: z.boolean().optional(),
    timeoutMs: z.number().optional(),
  })
  .passthrough();

const RunLlmRedTeamInputSchema = z
  .object({
    mode: z.enum(['offline', 'live']).optional(),
    workspaceRoot: z.string().optional(),
    configPath: z.string().optional(),
    timeoutMs: z.number().optional(),
  })
  .passthrough();

const AuditVibeInputSchema = z
  .object({
    targetDir: z.string().optional(),
    workspaceRoot: z.string().optional(),
    dryRun: z.boolean().optional(),
    remediationSubdir: z.string().optional(),
    maxLines: z.number().optional(),
    enforce: z.boolean().optional(),
  })
  .passthrough();

const SyncEnterpriseTmsInputSchema = z
  .object({
    mode: z.enum(['inventory', 'push-results', 'pull-stories']),
    provider: z.enum(['jira', 'zephyr', 'xray', 'github-issues']).optional(),
    targetDir: z.string().optional(),
    junitXmlPath: z.string().optional(),
    junitXmlContent: z.string().optional(),
    baseUrl: z.string().optional(),
    projectKey: z.string().optional(),
    issueKey: z.string().optional(),
    testExecutionKey: z.string().optional(),
    repo: z.string().optional(),
    requiredKeys: z.array(z.string()).optional(),
    dryRun: z.boolean().optional(),
    timeoutMs: z.number().optional(),
    workspaceRoot: z.string().optional(),
  })
  .passthrough();

const SessionFlightRecorderInputSchema = z
  .object({
    project_path: z.string().optional(),
    action: z.enum(['save', 'recover', 'clear']),
    task_id: z.string().optional(),
    active_step: z.string().optional(),
    intent_140chars: z.string().optional(),
    completed_steps: z.array(z.string()).optional(),
    planned_steps: z.array(z.string()).optional(),
    allowed_globs: z.array(z.string()).optional(),
    forbidden_globs: z.array(z.string()).optional(),
    reason: z.string().optional(),
  })
  .passthrough();

export const V2_TOOL_REGISTRATIONS: readonly V2ToolRegistration[] = [
  {
    definition: VALIDATE_CALM_ARCHITECTURE_TOOL,
    inputSchema: ValidateCalmInputSchema,
    execute: (args) => handleValidateCalmArchitecture(args),
  },
  {
    definition: EVALUATE_RELEASE_GATE_TOOL,
    inputSchema: EvaluateReleaseGateInputSchema,
    execute: (args) => handleEvaluateReleaseGate(args),
  },
  {
    definition: EVALUATE_AGENT_TRAJECTORY_TOOL,
    inputSchema: EvaluateTrajectoryInputSchema,
    execute: async (args) => await handleEvaluateAgentTrajectory(args),
  },
  {
    definition: RUN_LLM_RED_TEAM_TOOL,
    inputSchema: RunLlmRedTeamInputSchema,
    execute: async (args) => await handleRunLlmRedTeam(args),
  },
  {
    definition: AUDIT_VIBE_PROTOTYPE_TOOL,
    inputSchema: AuditVibeInputSchema,
    execute: (args) => handleAuditVibePrototype(args),
  },
  {
    definition: SYNC_ENTERPRISE_TMS_TOOL,
    inputSchema: SyncEnterpriseTmsInputSchema,
    execute: async (args) => await handleSyncEnterpriseTms(args),
  },
  {
    definition: SESSION_FLIGHT_RECORDER_TOOL,
    inputSchema: SessionFlightRecorderInputSchema,
    execute: async (args) => await handleSessionFlightRecorder(args),
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
        'Catalog of 22 DISA ASD STIG V6R5 and OWASP Developer Guide v4.2 reference controls + 34 static scanner rules.',
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

function registerExtensionResources(server: McpServer): void {
  server.registerResource(
    AI_EVALS_REDTEAM_RESOURCE.name,
    AI_EVALS_REDTEAM_RESOURCE.uri,
    {
      description: AI_EVALS_REDTEAM_RESOURCE.description,
      mimeType: AI_EVALS_REDTEAM_RESOURCE.mimeType,
    },
    (uri) => toSingleResourceResult(uri, readAiEvalsBlueprint(undefined, getActiveResourceLang(uri)))
  );

  server.registerResource(
    MOBILE_APPIUM_RESOURCE.name,
    MOBILE_APPIUM_RESOURCE.uri,
    {
      description: MOBILE_APPIUM_RESOURCE.description,
      mimeType: MOBILE_APPIUM_RESOURCE.mimeType,
    },
    (uri) =>
      toSingleResourceResult(uri, readMobileAppiumBlueprint(undefined, getActiveResourceLang(uri)))
  );

  server.registerResource(
    VIBE_RESCUE_RESOURCE.name,
    VIBE_RESCUE_RESOURCE.uri,
    {
      description: VIBE_RESCUE_RESOURCE.description,
      mimeType: VIBE_RESCUE_RESOURCE.mimeType,
    },
    (uri) =>
      toSingleResourceResult(uri, readVibeRescueBlueprint(undefined, getActiveResourceLang(uri)))
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
        readTacticalPatternsSkillResource(undefined, getActiveResourceLang(uri))
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
      inputSchema: InspectProjectInputSchema.shape,
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
      inputSchema: FetchBundleInputSchema.shape,
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
      inputSchema: BootstrapMergeInputSchema.shape,
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await bootstrapOrMerge11x(safePath, args.stack, args.dry_run, {
          fetcher,
          merger,
        })
      );
    }
  );

  server.registerTool(
    'inspect_ast_blast_radius',
    {
      description:
        'Queries the AST knowledge graph (graphify-out/graph.json) for code/architecture Q&A and pre-refactoring blast-radius analysis.',
      inputSchema: BlastRadiusInputSchema.shape,
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await inspectAstBlastRadius(safePath, args.target_symbol, args.max_items, {
          autoBuildIfMissing: args.auto_build_if_missing,
          refreshGraph: args.refresh_graph,
          changedSinceRef: args.changed_since_ref,
          maxTokensBudget: args.max_tokens_budget,
        })
      );
    }
  );

  server.registerTool(
    'clean_workspace_11x',
    {
      description:
        'Audits or executes workspace sanitation, removing transient test artifacts and Docker cache residues (dry_run default).',
      inputSchema: CleanWorkspaceInputSchema.shape,
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
        'Statically audits project source code against 22 DISA ASD STIG V6R5 / OWASP v4.2 reference controls + 34 static scanner rules covering Anti-Silo QA/Healthcheck/TTY/CI/Contract/Docker/Playwright/SSR/UI patterns (including QA-HEALTH-01, QA-CLI-TTY-01, QA-DOCKER-TTY-01, QA-CI-ESCAPE-01, QA-MAKE-CURDIR-01, QA-CONTRACT-SDK-01, QA-DOCKER-LOCK-01, QA-PLAYWRIGHT-PIN-01, QA-SSR-HYDRATION-01, and UI-11X-01..03).',
      inputSchema: AuditSecurityInputSchema.shape,
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(await auditSecurityStigOwasp(safePath, args.max_findings));
    }
  );
}

function registerQaGovernanceTools(server: McpServer, fetcher: GitHubFetcher): void {
  server.registerTool(
    'run_ephemeral_qa',
    {
      description:
        'Safely runs a Makefile QA target inside ephemeral Docker containers (Rule Zero), parsing logs for extreme token economy.',
      inputSchema: RunEphemeralQaInputSchema.shape,
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await runEphemeralQa(safePath, args.stage, args.timeout_seconds, {
          skipIfDocsOnly: args.skip_if_docs_only,
        })
      );
    }
  );

  server.registerTool(
    'certify_11x_gate',
    {
      description:
        'Executes 11X certification gates (secrets, JSON, orphan UI/API, ORM parity, lint evidence, STIG audit, docs) and checks version/skill update status before git push.',
      inputSchema: CertifyGateInputSchema.shape,
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await certify11xGate(safePath, {
          requireLintEvidence: args.require_lint_evidence,
          strict: args.strict,
          allowUnmergedExamples: args.allow_unmerged_examples,
          updateOptions: { fetcher },
        })
      );
    }
  );

  server.registerTool(
    'audit_test_pyramid_gaps',
    {
      description:
        'Audits existing project against the 13 layers of the 11X pyramid, reporting uncovered files/endpoints and a prioritized rescue plan.',
      inputSchema: AuditTestPyramidInputSchema.shape,
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
      inputSchema: InitAgentsMdInputSchema.shape,
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
      inputSchema: ProposeEvolutionPrInputSchema.shape,
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
      inputSchema: ReconcileAgentsInputSchema.shape,
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await reconcileAgentsGovernance({
          projectPath: safePath,
          dryRun: args.dry_run,
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
      },
      async (args) => {
        validateV2ToolWorkspaceArgs(args);
        return await entry.execute(args);
      }
    );
  }
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
  registerExtensionResources(server);
  registerCoreAnalysisTools(server, fetcher, merger);
  registerQaGovernanceTools(server, fetcher);
  registerV2Tools(server);

  wrapReadResourceDispatcher(server);

  return server;
}
