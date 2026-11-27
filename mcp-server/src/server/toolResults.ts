// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type {
  CallToolResult,
  ReadResourceResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';

export interface ToolExecutionHints {
  readonly readOnly: boolean;
  readonly idempotent: boolean;
}

const READ_ONLY_LOCAL: ToolAnnotations = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const READ_ONLY_OPEN: ToolAnnotations = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
});

const WRITE_SAFE_LOCAL: ToolAnnotations = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const WRITE_SAFE_OPEN: ToolAnnotations = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
});

const WRITE_DESTRUCTIVE_LOCAL: ToolAnnotations = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
});

const WRITE_NON_IDEMPOTENT_OPEN: ToolAnnotations = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
});

/** Single source of truth for MCP tool annotations across all 20 registered tools. */
export const TOOL_ANNOTATIONS: Readonly<Record<string, ToolAnnotations>> = Object.freeze({
  inspect_project_config: READ_ONLY_OPEN,
  fetch_blueprint_bundle: READ_ONLY_OPEN,
  bootstrap_or_merge_11x: WRITE_SAFE_OPEN,
  inspect_ast_blast_radius: READ_ONLY_LOCAL,
  clean_workspace_11x: WRITE_DESTRUCTIVE_LOCAL,
  audit_security_stig_owasp: READ_ONLY_LOCAL,
  run_ephemeral_qa: WRITE_SAFE_OPEN,
  certify_11x_gate: WRITE_SAFE_OPEN,
  audit_test_pyramid_gaps: READ_ONLY_LOCAL,
  init_or_append_agents_md: WRITE_SAFE_LOCAL,
  propose_skill_evolution_pr: WRITE_NON_IDEMPOTENT_OPEN,
  reconcile_agents_governance: WRITE_DESTRUCTIVE_LOCAL,
  validate_calm_architecture: READ_ONLY_LOCAL,
  evaluate_release_gate: READ_ONLY_LOCAL,
  evaluate_agent_trajectory: READ_ONLY_OPEN,
  run_llm_red_team: READ_ONLY_OPEN,
  audit_vibe_prototype: WRITE_SAFE_LOCAL,
  sync_enterprise_tms: WRITE_NON_IDEMPOTENT_OPEN,
  session_flight_recorder: WRITE_SAFE_LOCAL,
  analyze_ecosystem_specs: WRITE_SAFE_LOCAL,
});

/** Resolves ToolAnnotations for a registered tool name with fail-closed defaults. */
export function getToolAnnotations(toolName: string): ToolAnnotations {
  if (Object.hasOwn(TOOL_ANNOTATIONS, toolName)) {
    const ann = TOOL_ANNOTATIONS[toolName];
    if (ann) {
      return ann;
    }
  }
  return WRITE_NON_IDEMPOTENT_OPEN;
}

/** Propagates readOnlyHint/idempotentHint from MCP tool annotations into TaskStateGuard. */
export function getToolExecutionHints(toolName: string): ToolExecutionHints {
  const ann = getToolAnnotations(toolName);
  return {
    readOnly: Boolean(ann.readOnlyHint),
    idempotent: Boolean(ann.idempotentHint),
  };
}

/** Normalizes any tool output into a plain JSON-serializable structuredContent record. */
export function toStructuredRecord(value: unknown): Record<string, unknown> {
  const serialized: string | undefined = JSON.stringify(value);
  if (!serialized) {
    return { value: null };
  }
  const parsed: unknown = JSON.parse(serialized);
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return { value: parsed };
}

export function toSingleResourceResult(
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

/** Serializes tool output into both content[0].text (JSON) and MCP structuredContent. */
export function toJsonToolResult(result: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result),
      },
    ],
    structuredContent: toStructuredRecord(result),
  };
}

/** Ensures a CallToolResult always carries structuredContent without altering text payloads. */
export function ensureStructuredToolResult(result: CallToolResult): CallToolResult {
  if (result.structuredContent !== undefined) {
    return result;
  }
  const firstText = result.content.find((item) => item.type === 'text');
  const rawText = firstText && 'text' in firstText ? String(firstText.text) : '';
  return {
    ...result,
    structuredContent: {
      ok: !result.isError,
      summary: rawText,
    },
  };
}
