// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { z } from 'zod';

const LIVE_TIMEOUT_MSG = 'Live mode requires timeoutMs >= 180000 ms.';
const LIVE_TIMEOUT_DESC = 'Timeout in milliseconds for live mode (>= 180000).';
const WORKSPACE_CONTAINMENT_DESC = 'Workspace root directory for path containment checks.';

export const ValidateCalmInputSchema = z
  .object({
    workspaceRoot: z
      .string()
      .optional()
      .describe('Workspace root directory (optional; defaults to current repository).'),
    architecturePath: z
      .string()
      .optional()
      .describe(
        "Relative path of the FINOS CALM model inside workspaceRoot (default 'architecture/qa-11x.calm.json')."
      ),
    profile: z
      .enum(['auto', 'generic', 'qa-11x-self'])
      .optional()
      .describe(
        "Validation profile: 'auto' (default), 'generic' (any consumer CALM model), or 'qa-11x-self' (upstream QA-11X 6-node/5-edge/7-control governance)."
      ),
  })
  .strict();

export const EvaluateReleaseGateInputSchema = z
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
    enforce: z.boolean().optional().describe('Equivalent to dryRun=false when true.'),
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
        maxP95Ms: z.number().optional().describe('Maximum p95 latency in ms (default 500).'),
        maxP99Ms: z.number().optional().describe('Maximum p99 latency in ms (default 1000).'),
        maxActiveIncidents: z
          .number()
          .optional()
          .describe('Maximum active incidents (default 0).'),
        maxOpenBlockers: z.number().optional().describe('Maximum open blockers (default 0).'),
        maxOpenCriticals: z.number().optional().describe('Maximum open criticals (default 0).'),
        maxQaEscapes: z.number().optional().describe('Maximum QA escapes (default 0).'),
      })
      .strict()
      .optional()
      .describe('Partial override of corporate release thresholds.'),
    minPassRatePct: z.number().optional().describe('Direct override for minPassRatePct.'),
    maxErrorRatePct: z.number().optional().describe('Direct override for maxErrorRatePct.'),
    maxP95Ms: z.number().optional().describe('Direct override for maxP95Ms.'),
    maxP99Ms: z.number().optional().describe('Direct override for maxP99Ms.'),
    maxActiveIncidents: z.number().optional().describe('Direct override for maxActiveIncidents.'),
    maxOpenBlockers: z.number().optional().describe('Direct override for maxOpenBlockers.'),
    maxOpenCriticals: z.number().optional().describe('Direct override for maxOpenCriticals.'),
    maxQaEscapes: z.number().optional().describe('Direct override for maxQaEscapes.'),
  })
  .strict();

export const EvaluateTrajectoryInputSchema = z
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
      .describe(
        'Relative path to Pytest/DeepEval test (default ai-evals/rag/test_rag_faithfulness.py).'
      ),
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
    timeoutMs: z.number().min(180_000, LIVE_TIMEOUT_MSG).optional().describe(LIVE_TIMEOUT_DESC),
  })
  .strict();

export const RunLlmRedTeamInputSchema = z
  .object({
    mode: z
      .enum(['offline', 'live'])
      .optional()
      .describe('Audit mode (offline by default, zero network).'),
    workspaceRoot: z.string().optional().describe(WORKSPACE_CONTAINMENT_DESC),
    configPath: z
      .string()
      .optional()
      .describe('Relative path to Promptfoo YAML config (default ai-evals/promptfooconfig.yaml).'),
    timeoutMs: z.number().min(180_000, LIVE_TIMEOUT_MSG).optional().describe(LIVE_TIMEOUT_DESC),
  })
  .strict();

export const AuditVibeInputSchema = z
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
      .describe(
        'Relative subdirectory inside targetDir for generated remediation files when dryRun=false.'
      ),
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

export const SyncEnterpriseTmsInputSchema = z
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
    workspaceRoot: z.string().optional().describe(WORKSPACE_CONTAINMENT_DESC),
  })
  .strict();

export const SessionFlightRecorderInputSchema = z
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
      .describe(
        'Concise active intent strictly <= 140 Unicode chars (SEC-06 sanitized). Required for save.'
      ),
    completed_steps: z.array(z.string()).optional().describe('List of completed step IDs.'),
    planned_steps: z.array(z.string()).optional().describe('Ordered list of planned step IDs.'),
    allowed_globs: z
      .array(z.string())
      .optional()
      .describe('Optional diff blast-radius allowed globs.'),
    forbidden_globs: z
      .array(z.string())
      .optional()
      .describe('Optional diff blast-radius forbidden globs.'),
    reason: z.string().optional().describe("Optional closure/abort reason for 'clear'."),
  })
  .strict();
