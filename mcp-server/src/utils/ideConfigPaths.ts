// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';

const MCP_CONFIG_JSON_FILE = 'mcp_config.json';
const CLAUDE_DESKTOP_CONFIG_FILE = 'claude_desktop_config.json';

export const ANTIGRAVITY_CANONICAL_MCP_REL_PATH = path.join(
  '.gemini',
  'antigravity',
  MCP_CONFIG_JSON_FILE
);
export const ANTIGRAVITY_FALLBACK_MCP_REL_PATH = path.join(
  '.gemini',
  'config',
  MCP_CONFIG_JSON_FILE
);
export const CLAUDE_CODE_MCP_REL_PATH = '.claude.json';
export const CURSOR_MCP_REL_PATH = path.join('.cursor', 'mcp.json');
export const WINDSURF_MCP_REL_PATH = path.join('.codeium', 'windsurf', MCP_CONFIG_JSON_FILE);
export const CODEX_MCP_REL_PATH = path.join('.codex', 'config.toml');
export const HERMES_CANONICAL_MCP_REL_PATH = path.join('.hermes', 'mcp.json');
export const HERMES_FALLBACK_MCP_REL_PATH = path.join('.hermes', 'config.yaml');

const CLAUDE_DESKTOP_DARWIN_REL_PATH = path.join(
  'Library',
  'Application Support',
  'Claude',
  CLAUDE_DESKTOP_CONFIG_FILE
);
const CLAUDE_DESKTOP_WIN32_REL_PATH = path.join(
  'AppData',
  'Roaming',
  'Claude',
  CLAUDE_DESKTOP_CONFIG_FILE
);
const CLAUDE_DESKTOP_LINUX_REL_PATH = path.join(
  '.config',
  'Claude',
  CLAUDE_DESKTOP_CONFIG_FILE
);

const CLAUDE_DESKTOP_BY_PLATFORM: Readonly<Partial<Record<NodeJS.Platform, string>>> = {
  darwin: CLAUDE_DESKTOP_DARWIN_REL_PATH,
  win32: CLAUDE_DESKTOP_WIN32_REL_PATH,
};

export type JsonMcpClient = 'antigravity' | 'cursor' | 'windsurf' | 'claude-desktop' | 'hermes';

const STATIC_JSON_CLIENT_REL_PATHS: Readonly<Record<Exclude<JsonMcpClient, 'claude-desktop'>, string>> = {
  antigravity: ANTIGRAVITY_CANONICAL_MCP_REL_PATH,
  cursor: CURSOR_MCP_REL_PATH,
  windsurf: WINDSURF_MCP_REL_PATH,
  hermes: HERMES_CANONICAL_MCP_REL_PATH,
};

export interface IdeMcpTargetSpec {
  readonly client: string;
  readonly relPaths: readonly string[];
}

/** Resolves the platform-specific Claude Desktop MCP configuration relative path. */
export function resolveClaudeDesktopMcpRelPath(
  platform: NodeJS.Platform = process.platform
): string {
  return CLAUDE_DESKTOP_BY_PLATFORM[platform] ?? CLAUDE_DESKTOP_LINUX_REL_PATH;
}

/** Resolves the canonical JSON MCP configuration relative path for a supported client. */
export function resolveJsonMcpClientRelPath(
  client: JsonMcpClient,
  platform: NodeJS.Platform = process.platform
): string {
  if (client === 'claude-desktop') {
    return resolveClaudeDesktopMcpRelPath(platform);
  }
  return STATIC_JSON_CLIENT_REL_PATHS[client];
}

/** Returns IDE MCP configuration targets (including canonical and fallback paths) for doctor audits. */
export function getDoctorIdeMcpTargets(
  platform: NodeJS.Platform = process.platform
): readonly IdeMcpTargetSpec[] {
  return [
    {
      client: 'antigravity',
      relPaths: [ANTIGRAVITY_CANONICAL_MCP_REL_PATH, ANTIGRAVITY_FALLBACK_MCP_REL_PATH],
    },
    { client: 'claude', relPaths: [CLAUDE_CODE_MCP_REL_PATH] },
    { client: 'claude-desktop', relPaths: [resolveClaudeDesktopMcpRelPath(platform)] },
    { client: 'cursor', relPaths: [CURSOR_MCP_REL_PATH] },
    { client: 'windsurf', relPaths: [WINDSURF_MCP_REL_PATH] },
    { client: 'codex', relPaths: [CODEX_MCP_REL_PATH] },
    {
      client: 'hermes',
      relPaths: [HERMES_CANONICAL_MCP_REL_PATH, HERMES_FALLBACK_MCP_REL_PATH],
    },
  ];
}

/** Returns absolute candidate paths to inspect for browser MCP registration in a home directory. */
export function getBrowserMcpCandidatePaths(
  baseHome: string,
  platform: NodeJS.Platform = process.platform
): string[] {
  const relPaths = [
    ANTIGRAVITY_CANONICAL_MCP_REL_PATH,
    ANTIGRAVITY_FALLBACK_MCP_REL_PATH,
    CLAUDE_CODE_MCP_REL_PATH,
    CURSOR_MCP_REL_PATH,
    WINDSURF_MCP_REL_PATH,
    resolveClaudeDesktopMcpRelPath(platform),
    HERMES_CANONICAL_MCP_REL_PATH,
    HERMES_FALLBACK_MCP_REL_PATH,
  ];
  return relPaths.map((relPath) => path.join(baseHome, relPath));
}
