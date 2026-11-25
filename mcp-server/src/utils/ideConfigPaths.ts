// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';

const MCP_CONFIG_JSON_FILE = 'mcp_config.json';
const CLAUDE_DESKTOP_CONFIG_FILE = 'claude_desktop_config.json';
const SETTINGS_JSON_FILE = 'settings.json';
const CONFIG_YAML_FILE = 'config.yaml';

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
export const GEMINI_CLI_MCP_REL_PATH = path.join('.gemini', SETTINGS_JSON_FILE);
export const HERMES_CANONICAL_MCP_REL_PATH = path.join('.hermes', 'mcp.json');
export const HERMES_FALLBACK_MCP_REL_PATH = path.join('.hermes', CONFIG_YAML_FILE);
export const OPENCODE_CANONICAL_MCP_REL_PATH = path.join('.config', 'opencode', 'opencode.json');
export const OPENCODE_FALLBACK_MCP_REL_PATH = path.join('.opencode', 'opencode.json');
export const CLINE_CLI_MCP_REL_PATH = path.join('.cline', 'data', 'settings', 'cline_mcp_settings.json');
export const KILO_CODE_GLOBAL_JSONC_REL_PATH = path.join('.config', 'kilo', 'kilo.jsonc');
export const AMAZON_Q_MCP_REL_PATH = path.join('.aws', 'amazonq', 'mcp.json');
export const JUNIE_MCP_REL_PATH = path.join('.junie', 'mcp', 'mcp.json');
export const AUGMENT_MCP_REL_PATH = path.join('.augment', SETTINGS_JSON_FILE);
export const TRAE_MCP_REL_PATH = path.join('.trae', 'mcp.json');
export const CONTINUE_MCP_REL_PATH = path.join('.continue', 'mcpServers', 'qa-11x.yaml');

const VSCODE_USER_BY_PLATFORM: Readonly<Partial<Record<NodeJS.Platform, string>>> = {
  darwin: path.join('Library', 'Application Support', 'Code', 'User'),
  win32: path.join('AppData', 'Roaming', 'Code', 'User'),
};
const VSCODE_USER_LINUX = path.join('.config', 'Code', 'User');

function resolveVsCodeUserDir(platform: NodeJS.Platform): string {
  return VSCODE_USER_BY_PLATFORM[platform] ?? VSCODE_USER_LINUX;
}

function resolveVsCodeGlobalStorageFile(
  platform: NodeJS.Platform,
  extensionId: string,
  fileName: string
): string {
  return path.join(resolveVsCodeUserDir(platform), 'globalStorage', extensionId, 'settings', fileName);
}

const CLAUDE_DESKTOP_BY_PLATFORM: Readonly<Partial<Record<NodeJS.Platform, string>>> = {
  darwin: path.join('Library', 'Application Support', 'Claude', CLAUDE_DESKTOP_CONFIG_FILE),
  win32: path.join('AppData', 'Roaming', 'Claude', CLAUDE_DESKTOP_CONFIG_FILE),
};
const CLAUDE_DESKTOP_LINUX_REL_PATH = path.join('.config', 'Claude', CLAUDE_DESKTOP_CONFIG_FILE);

export type JsonMcpClient =
  | 'antigravity'
  | 'cursor'
  | 'windsurf'
  | 'claude-desktop'
  | 'hermes'
  | 'cline'
  | 'roo-code'
  | 'kilo-code'
  | 'amazon-q'
  | 'jetbrains-ai'
  | 'devin'
  | 'augment'
  | 'trae';

const PLATFORM_JSON_CLIENT_RESOLVERS: Readonly<
  Record<JsonMcpClient, (platform: NodeJS.Platform) => string>
> = {
  antigravity: () => ANTIGRAVITY_CANONICAL_MCP_REL_PATH,
  cursor: () => CURSOR_MCP_REL_PATH,
  windsurf: () => WINDSURF_MCP_REL_PATH,
  'claude-desktop': (platform) => resolveClaudeDesktopMcpRelPath(platform),
  hermes: () => HERMES_CANONICAL_MCP_REL_PATH,
  cline: (platform) => resolveClineMcpRelPath(platform),
  'roo-code': (platform) => resolveRooCodeMcpRelPath(platform),
  'kilo-code': (platform) => resolveKiloCodeMcpRelPath(platform),
  'amazon-q': () => AMAZON_Q_MCP_REL_PATH,
  'jetbrains-ai': () => JUNIE_MCP_REL_PATH,
  devin: (platform) => resolveDevinMcpRelPath(platform),
  augment: () => AUGMENT_MCP_REL_PATH,
  trae: () => TRAE_MCP_REL_PATH,
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

/** Resolves the platform-specific VS Code user MCP configuration relative path. */
export function resolveVsCodeMcpRelPath(platform: NodeJS.Platform = process.platform): string {
  return path.join(resolveVsCodeUserDir(platform), 'mcp.json');
}

/** Resolves the platform-specific Zed Editor settings.json relative path. */
export function resolveZedMcpRelPath(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32'
    ? path.join('AppData', 'Roaming', 'Zed', SETTINGS_JSON_FILE)
    : path.join('.config', 'zed', SETTINGS_JSON_FILE);
}

/** Resolves the platform-specific Cline VS Code extension MCP config relative path. */
export function resolveClineMcpRelPath(platform: NodeJS.Platform = process.platform): string {
  return resolveVsCodeGlobalStorageFile(platform, 'saoudrizwan.claude-dev', 'cline_mcp_settings.json');
}

/** Resolves the platform-specific Roo Code VS Code extension MCP config relative path. */
export function resolveRooCodeMcpRelPath(platform: NodeJS.Platform = process.platform): string {
  return resolveVsCodeGlobalStorageFile(platform, 'rooveterinaryinc.roo-cline', 'mcp_settings.json');
}

/** Resolves the platform-specific Kilo Code VS Code extension MCP config relative path. */
export function resolveKiloCodeMcpRelPath(platform: NodeJS.Platform = process.platform): string {
  return resolveVsCodeGlobalStorageFile(platform, 'kilocode.kilo-code', 'mcp_settings.json');
}

/** Resolves the platform-specific Devin MCP configuration relative path. */
export function resolveDevinMcpRelPath(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32'
    ? path.join('AppData', 'Roaming', 'devin', MCP_CONFIG_JSON_FILE)
    : path.join('.config', 'devin', MCP_CONFIG_JSON_FILE);
}

/** Resolves the platform-specific Block Goose config.yaml relative path. */
export function resolveGooseMcpRelPath(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32'
    ? path.join('AppData', 'Roaming', 'Block', 'goose', 'config', CONFIG_YAML_FILE)
    : path.join('.config', 'goose', CONFIG_YAML_FILE);
}

/** Resolves the canonical JSON MCP configuration relative path for a supported client. */
export function resolveJsonMcpClientRelPath(
  client: JsonMcpClient,
  platform: NodeJS.Platform = process.platform
): string {
  return PLATFORM_JSON_CLIENT_RESOLVERS[client](platform);
}

/** Resolves an existing fallback MCP path (e.g. legacy Antigravity) before defaulting to canonical. */
export function resolveActiveJsonMcpClientRelPath(
  client: JsonMcpClient,
  homeDir: string,
  platform: NodeJS.Platform = process.platform
): string {
  const canonical = resolveJsonMcpClientRelPath(client, platform);
  if (
    client === 'antigravity' &&
    !fs.existsSync(path.join(homeDir, canonical)) &&
    fs.existsSync(path.join(homeDir, ANTIGRAVITY_FALLBACK_MCP_REL_PATH))
  ) {
    return ANTIGRAVITY_FALLBACK_MCP_REL_PATH;
  }
  return canonical;
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
    { client: 'vscode', relPaths: [resolveVsCodeMcpRelPath(platform)] },
    { client: 'windsurf', relPaths: [WINDSURF_MCP_REL_PATH] },
    { client: 'codex', relPaths: [CODEX_MCP_REL_PATH] },
    { client: 'gemini-cli', relPaths: [GEMINI_CLI_MCP_REL_PATH] },
    {
      client: 'hermes',
      relPaths: [HERMES_CANONICAL_MCP_REL_PATH, HERMES_FALLBACK_MCP_REL_PATH],
    },
    {
      client: 'opencode',
      relPaths: [OPENCODE_CANONICAL_MCP_REL_PATH, OPENCODE_FALLBACK_MCP_REL_PATH],
    },
    { client: 'zed', relPaths: [resolveZedMcpRelPath(platform)] },
    {
      client: 'cline',
      relPaths: [resolveClineMcpRelPath(platform), CLINE_CLI_MCP_REL_PATH],
    },
    { client: 'roo-code', relPaths: [resolveRooCodeMcpRelPath(platform)] },
    {
      client: 'kilo-code',
      relPaths: [resolveKiloCodeMcpRelPath(platform), KILO_CODE_GLOBAL_JSONC_REL_PATH],
    },
    { client: 'amazon-q', relPaths: [AMAZON_Q_MCP_REL_PATH] },
    { client: 'jetbrains-ai', relPaths: [JUNIE_MCP_REL_PATH] },
    { client: 'devin', relPaths: [resolveDevinMcpRelPath(platform)] },
    { client: 'augment', relPaths: [AUGMENT_MCP_REL_PATH] },
    { client: 'trae', relPaths: [TRAE_MCP_REL_PATH] },
    { client: 'continue', relPaths: [CONTINUE_MCP_REL_PATH] },
    { client: 'goose', relPaths: [resolveGooseMcpRelPath(platform)] },
  ];
}

/** Returns absolute candidate paths to inspect for browser MCP registration in a home directory. */
export function getBrowserMcpCandidatePaths(
  baseHome: string,
  platform: NodeJS.Platform = process.platform
): string[] {
  return getDoctorIdeMcpTargets(platform).flatMap((target) =>
    target.relPaths.map((relPath) => path.join(baseHome, relPath))
  );
}
