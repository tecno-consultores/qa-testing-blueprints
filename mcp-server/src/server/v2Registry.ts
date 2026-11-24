// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import { SYNC_ENTERPRISE_TMS_TOOL, handleSyncEnterpriseTms } from '../integrations/tmsSyncCli.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import {
  AUDIT_VIBE_PROTOTYPE_TOOL,
  handleAuditVibePrototype,
} from '../tools/auditVibePrototype.js';
import {
  EVALUATE_AGENT_TRAJECTORY_TOOL,
  handleEvaluateAgentTrajectory,
} from '../tools/evaluateAgentTrajectory.js';
import {
  EVALUATE_RELEASE_GATE_TOOL,
  handleEvaluateReleaseGate,
} from '../tools/evaluateReleaseGate.js';
import { RUN_LLM_RED_TEAM_TOOL, handleRunLlmRedTeam } from '../tools/runLlmRedTeam.js';
import {
  SESSION_FLIGHT_RECORDER_TOOL,
  handleSessionFlightRecorder,
} from '../tools/sessionFlightRecorder.js';
import {
  VALIDATE_CALM_ARCHITECTURE_TOOL,
  handleValidateCalmArchitecture,
} from '../tools/validateCalmArchitecture.js';
import { throwIfSignalAborted } from '../utils/diagnosticFormatter.js';
import { ensureStructuredToolResult, getToolAnnotations } from './toolResults.js';
import {
  AuditVibeInputSchema,
  EvaluateReleaseGateInputSchema,
  EvaluateTrajectoryInputSchema,
  RunLlmRedTeamInputSchema,
  SessionFlightRecorderInputSchema,
  SyncEnterpriseTmsInputSchema,
  ValidateCalmInputSchema,
} from './v2Schemas.js';

const TRAVERSAL_SEG_RE = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

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

export const V2_TOOL_REGISTRATIONS: readonly V2ToolRegistration[] = [
  {
    definition: VALIDATE_CALM_ARCHITECTURE_TOOL,
    annotations: getToolAnnotations(VALIDATE_CALM_ARCHITECTURE_TOOL.name),
    inputSchema: ValidateCalmInputSchema,
    execute: (args, extra) => {
      throwIfSignalAborted(
        extra?.signal,
        'validate_calm_architecture abortado por timeout o cancelación.'
      );
      return handleValidateCalmArchitecture(args);
    },
  },
  {
    definition: EVALUATE_RELEASE_GATE_TOOL,
    annotations: getToolAnnotations(EVALUATE_RELEASE_GATE_TOOL.name),
    inputSchema: EvaluateReleaseGateInputSchema,
    execute: (args, extra) => {
      throwIfSignalAborted(
        extra?.signal,
        'evaluate_release_gate abortado por timeout o cancelación.'
      );
      return handleEvaluateReleaseGate(args);
    },
  },
  {
    definition: EVALUATE_AGENT_TRAJECTORY_TOOL,
    annotations: getToolAnnotations(EVALUATE_AGENT_TRAJECTORY_TOOL.name),
    inputSchema: EvaluateTrajectoryInputSchema,
    execute: async (args, extra) =>
      await handleEvaluateAgentTrajectory(args, { signal: extra?.signal }),
  },
  {
    definition: RUN_LLM_RED_TEAM_TOOL,
    annotations: getToolAnnotations(RUN_LLM_RED_TEAM_TOOL.name),
    inputSchema: RunLlmRedTeamInputSchema,
    execute: async (args, extra) => await handleRunLlmRedTeam(args, { signal: extra?.signal }),
  },
  {
    definition: AUDIT_VIBE_PROTOTYPE_TOOL,
    annotations: getToolAnnotations(AUDIT_VIBE_PROTOTYPE_TOOL.name),
    inputSchema: AuditVibeInputSchema,
    execute: (args, extra) => {
      throwIfSignalAborted(
        extra?.signal,
        'audit_vibe_prototype abortado por timeout o cancelación.'
      );
      return handleAuditVibePrototype(args);
    },
  },
  {
    definition: SYNC_ENTERPRISE_TMS_TOOL,
    annotations: getToolAnnotations(SYNC_ENTERPRISE_TMS_TOOL.name),
    inputSchema: SyncEnterpriseTmsInputSchema,
    execute: async (args, extra) =>
      await handleSyncEnterpriseTms(args, { signal: extra?.signal }),
  },
  {
    definition: SESSION_FLIGHT_RECORDER_TOOL,
    annotations: getToolAnnotations(SESSION_FLIGHT_RECORDER_TOOL.name),
    inputSchema: SessionFlightRecorderInputSchema,
    execute: async (args, extra) =>
      await handleSessionFlightRecorder(args, { signal: extra?.signal }),
  },
];

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

export function registerV2Tools(server: McpServer): void {
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
        const result = await entry.execute(args, { signal: extra.signal });
        return ensureStructuredToolResult(result);
      }
    );
  }
}
