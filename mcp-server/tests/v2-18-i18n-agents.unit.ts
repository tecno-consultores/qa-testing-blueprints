// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseLangArg, runInstallSkillCli } from '../src/cli/install-skill.js';
import { initOrAppendAgentsMd } from '../src/cli/init-agents-md.js';
import { GitHubFetcher } from '../src/services/github-fetcher.js';

describe('v2.18.0 i18n & Multi-Agent Targets (codex, windsurf, --lang auto|es|en)', () => {
  let tmpDir: string;
  let fakeHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-18-test-work-'));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-18-test-home-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('parseLangArg', () => {
    it('returns auto by default or when empty', () => {
      expect(parseLangArg([])).toBe('auto');
    });

    it('parses --lang and -l flags correctly', () => {
      expect(parseLangArg(['--lang', 'es'])).toBe('es');
      expect(parseLangArg(['-l', 'en'])).toBe('en');
      expect(parseLangArg(['--lang=es'])).toBe('es');
      expect(parseLangArg(['--lang=auto'])).toBe('auto');
    });

    it('throws error for unsupported language options', () => {
      expect(() => parseLangArg(['--lang', 'fr'])).toThrow("Modo de idioma no válido: 'fr'");
      expect(() => parseLangArg(['--lang=de'])).toThrow("Modo de idioma no válido: 'de'");
    });

    it('respects process.env.QA_OUTPUT_LANG when set', () => {
      const orig = process.env.QA_OUTPUT_LANG;
      try {
        process.env.QA_OUTPUT_LANG = 'es';
        expect(parseLangArg([])).toBe('es');
      } finally {
        if (orig === undefined) {
          delete process.env.QA_OUTPUT_LANG;
        } else {
          process.env.QA_OUTPUT_LANG = orig;
        }
      }
    });
  });

  describe('install-skill with codex and windsurf targets', () => {
    it('installs skills into ~/.codex/skills for --target codex', async () => {
      const origHome = process.env.HOME;
      process.env.HOME = fakeHome;

      const mockFetcher = new GitHubFetcher();
      vi.spyOn(mockFetcher, 'fetchManifest').mockResolvedValue({
        schema_version: '1.0.0',
        blueprint_version: '2.18.0',
        generated_at_utc: '2026-11-11T00:00:00Z',
        repository: 'tecno-consultores/qa-testing-blueprints',
        default_branch: 'main',
        raw_base_url: 'https://raw.githubusercontent.com',
        stacks: {},
        common_files: [],
        agent_governance_files: [
          {
            path: '.agents/skills/qa-11x-architect/SKILL.md',
            target_name: '.agents/skills/qa-11x-architect/SKILL.md',
            merge_strategy: 'overwrite',
            sha256: 'mock-sha',
            size_bytes: 123,
          },
        ],
      });
      vi.spyOn(mockFetcher, 'fetchFileContent').mockResolvedValue('# Mock Skill Content');

      try {
        await runInstallSkillCli(['--target', 'codex'], mockFetcher);
        const codexSkill = path.join(fakeHome, '.codex', 'skills', 'qa-11x-architect', 'SKILL.md');
        expect(fs.existsSync(codexSkill)).toBe(true);
        expect(fs.readFileSync(codexSkill, 'utf-8')).toBe('# Mock Skill Content');
      } finally {
        process.env.HOME = origHome;
      }
    });

    it('installs skills into ~/.codeium/windsurf/skills for --target windsurf', async () => {
      const origHome = process.env.HOME;
      process.env.HOME = fakeHome;

      const mockFetcher = new GitHubFetcher();
      vi.spyOn(mockFetcher, 'fetchManifest').mockResolvedValue({
        schema_version: '1.0.0',
        blueprint_version: '2.18.0',
        generated_at_utc: '2026-11-11T00:00:00Z',
        repository: 'tecno-consultores/qa-testing-blueprints',
        default_branch: 'main',
        raw_base_url: 'https://raw.githubusercontent.com',
        stacks: {},
        common_files: [],
        agent_governance_files: [
          {
            path: '.agents/skills/qa-11x-architect/SKILL.md',
            target_name: '.agents/skills/qa-11x-architect/SKILL.md',
            merge_strategy: 'overwrite',
            sha256: 'mock-sha',
            size_bytes: 123,
          },
        ],
      });
      vi.spyOn(mockFetcher, 'fetchFileContent').mockResolvedValue('# Mock Skill Content Windsurf');

      try {
        await runInstallSkillCli(['--target', 'windsurf'], mockFetcher);
        const windsurfSkill = path.join(fakeHome, '.codeium', 'windsurf', 'skills', 'qa-11x-architect', 'SKILL.md');
        expect(fs.existsSync(windsurfSkill)).toBe(true);
        expect(fs.readFileSync(windsurfSkill, 'utf-8')).toBe('# Mock Skill Content Windsurf');
      } finally {
        process.env.HOME = origHome;
      }
    });

    it('auto-detects codex and windsurf directories when present in HOME', async () => {
      const origHome = process.env.HOME;
      process.env.HOME = fakeHome;

      fs.mkdirSync(path.join(fakeHome, '.codex'), { recursive: true });
      fs.mkdirSync(path.join(fakeHome, '.codeium', 'windsurf'), { recursive: true });

      const mockFetcher = new GitHubFetcher();
      vi.spyOn(mockFetcher, 'fetchManifest').mockResolvedValue({
        schema_version: '1.0.0',
        blueprint_version: '2.18.0',
        generated_at_utc: '2026-11-11T00:00:00Z',
        repository: 'tecno-consultores/qa-testing-blueprints',
        default_branch: 'main',
        raw_base_url: 'https://raw.githubusercontent.com',
        stacks: {},
        common_files: [],
        agent_governance_files: [
          {
            path: '.agents/skills/qa-11x-architect/SKILL.md',
            target_name: '.agents/skills/qa-11x-architect/SKILL.md',
            merge_strategy: 'overwrite',
            sha256: 'mock-sha',
            size_bytes: 123,
          },
        ],
      });
      vi.spyOn(mockFetcher, 'fetchFileContent').mockResolvedValue('# Multi-Agent Mock');

      try {
        await runInstallSkillCli(['--target', 'auto'], mockFetcher);
        expect(fs.existsSync(path.join(fakeHome, '.codex', 'skills', 'qa-11x-architect', 'SKILL.md'))).toBe(true);
        expect(fs.existsSync(path.join(fakeHome, '.codeium', 'windsurf', 'skills', 'qa-11x-architect', 'SKILL.md'))).toBe(true);
      } finally {
        process.env.HOME = origHome;
      }
    });
  });

  describe('init_or_append_agents_md MCP tool with lang parameter', () => {
    it('generates English policy when lang=en', async () => {
      const res = await initOrAppendAgentsMd({ projectPath: tmpDir, lang: 'en' });
      expect(res.content).toContain('strictly in **English**');
    });

    it('generates Spanish policy when lang=es', async () => {
      const res = await initOrAppendAgentsMd({ projectPath: tmpDir, lang: 'es' });
      expect(res.content).toContain('strictly in **Spanish**');
    });

    it('generates dynamic mirroring policy when lang=auto', async () => {
      const res = await initOrAppendAgentsMd({ projectPath: tmpDir, lang: 'auto' });
      expect(res.content).toContain("user's prompt language");
    });
  });
});
