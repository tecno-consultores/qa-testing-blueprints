// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSubcommandHelpText } from '../src/cli.js';
import {
  ANTIGRAVITY_CANONICAL_MCP_REL_PATH,
  ANTIGRAVITY_FALLBACK_MCP_REL_PATH,
  CLAUDE_CODE_MCP_REL_PATH,
  CODEX_MCP_REL_PATH,
  CURSOR_MCP_REL_PATH,
  getBrowserMcpCandidatePaths,
  getDoctorIdeMcpTargets,
  HERMES_CANONICAL_MCP_REL_PATH,
  HERMES_FALLBACK_MCP_REL_PATH,
  resolveClaudeDesktopMcpRelPath,
  resolveJsonMcpClientRelPath,
  WINDSURF_MCP_REL_PATH,
} from '../src/utils/ideConfigPaths.js';

describe('ideConfigPaths & CLI help loaders', () => {
  it('resolves Claude Desktop and JSON MCP client paths across darwin, win32, and linux', () => {
    expect(resolveClaudeDesktopMcpRelPath('darwin')).toBe(
      path.join('Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    );
    expect(resolveClaudeDesktopMcpRelPath('win32')).toBe(
      path.join('AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
    );
    expect(resolveClaudeDesktopMcpRelPath('linux')).toBe(
      path.join('.config', 'Claude', 'claude_desktop_config.json')
    );

    expect(resolveJsonMcpClientRelPath('antigravity', 'linux')).toBe(
      ANTIGRAVITY_CANONICAL_MCP_REL_PATH
    );
    expect(resolveJsonMcpClientRelPath('cursor', 'darwin')).toBe(CURSOR_MCP_REL_PATH);
    expect(resolveJsonMcpClientRelPath('windsurf', 'win32')).toBe(WINDSURF_MCP_REL_PATH);
    expect(resolveJsonMcpClientRelPath('hermes', 'linux')).toBe(HERMES_CANONICAL_MCP_REL_PATH);
    expect(resolveJsonMcpClientRelPath('claude-desktop', 'darwin')).toContain('Library');
    expect(resolveJsonMcpClientRelPath('claude-desktop', 'win32')).toContain('AppData');
  });

  it('returns all 7 IDE doctor specs and absolute browser MCP candidate paths', () => {
    const targets = getDoctorIdeMcpTargets('linux');
    expect(targets.map((t) => t.client)).toEqual([
      'antigravity',
      'claude',
      'claude-desktop',
      'cursor',
      'windsurf',
      'codex',
      'hermes',
    ]);
    expect(targets[0]?.relPaths).toEqual([
      ANTIGRAVITY_CANONICAL_MCP_REL_PATH,
      ANTIGRAVITY_FALLBACK_MCP_REL_PATH,
    ]);
    expect(targets[1]?.relPaths).toEqual([CLAUDE_CODE_MCP_REL_PATH]);
    expect(targets[5]?.relPaths).toEqual([CODEX_MCP_REL_PATH]);
    expect(targets[6]?.relPaths).toEqual([
      HERMES_CANONICAL_MCP_REL_PATH,
      HERMES_FALLBACK_MCP_REL_PATH,
    ]);

    const fakeHome = path.join('/tmp', 'qa-ide-home');
    const winCandidates = getBrowserMcpCandidatePaths(fakeHome, 'win32');
    expect(winCandidates).toHaveLength(8);
    expect(winCandidates.every((candidate) => candidate.startsWith(fakeHome))).toBe(true);
    expect(winCandidates.some((candidate) => candidate.includes('AppData'))).toBe(true);
  });

  it('loads help text for all 14 CLI help-loader keys and returns null for unknown tokens', async () => {
    const tokens = [
      'quickstart',
      'install-skill',
      'init-agents',
      'reconcile-agents',
      'tms-sync',
      'doctor',
      'upgrade',
      'certify',
      'audit',
      'blast-radius',
      'mcp-config',
      'completion',
      'help',
      'version',
    ];
    for (const token of tokens) {
      const helpText = await resolveSubcommandHelpText(token);
      expect(typeof helpText).toBe('string');
      expect((helpText ?? '').length).toBeGreaterThan(20);
    }
    expect(await resolveSubcommandHelpText('unknown-cmd')).toBeNull();
  });
});
