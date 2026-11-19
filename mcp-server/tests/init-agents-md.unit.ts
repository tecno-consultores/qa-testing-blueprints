// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CONNECTOR_START_MARKER,
  CONNECTOR_END_MARKER,
  INIT_AGENTS_HELP_TEXT,
  buildConnectorBlock,
  buildGlobalGeminiBlock,
  mergeOrAppendAgentsMdContent,
  initOrAppendAgentsMd,
  parseInitAgentsArgs,
  resolveProjectDisplayName,
  runInitAgentsCli,
} from '../src/cli/init-agents-md.js';
import { WorkspacePathValidationError } from '../src/security/workspacePathValidator.js';

describe('init-agents-md (Non-destructive AGENTS.md connector injection)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-init-agents-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('buildConnectorBlock', () => {
    it('generates canonical connector block with given project name and detected stacks', () => {
      const block = buildConnectorBlock('mi-proyecto-backend', ['fastapi', 'bash-scripts']);
      expect(block).toContain(CONNECTOR_START_MARKER);
      expect(block).toContain(CONNECTOR_END_MARKER);
      expect(block).toContain('mi-proyecto-backend');
      expect(block).toContain('fastapi, bash-scripts');
      expect(block).toContain('@sinfallas/mcp-qa-11x');
      expect(block).toContain('Rule Zero');
      expect(block).toContain('Mandatory 11-Step Execution & Closure Workflow');
      expect(block).toContain('/plan');
      expect(block).toContain('.agents/ACTIVE_TASK.md');
      expect(block).toContain('./scripts/actualizar-grafos-graphify.sh');
      expect(block).toContain('docs/specs/');
      expect(block).toContain('CHANGELOG.md');
      expect(block).toContain('ROADMAP.md');
      expect(block).toContain('3-Path Proportional Execution');
      expect(block).toContain('MICRO_CHANGE');
      expect(block).toContain('HIGH-IQ TOKEN ECONOMY');
      expect(block).toContain('Karate Labs BDD');
      expect(block).toContain('QA-TEST-SYNC-01');
      expect(block).toContain('git push');
    });

    it('falls back to "general" when stacks list is empty', () => {
      const block = buildConnectorBlock('repo-vacio', []);
      expect(block).toContain('repo-vacio');
      expect(block).toContain('general');
    });

    it('generates ultra-compact zero-duplication global GEMINI.md block with Graphify AST-First Q&A', () => {
      const defaultBlock = buildGlobalGeminiBlock();
      expect(defaultBlock).toContain(CONNECTOR_START_MARKER);
      expect(defaultBlock).toContain(CONNECTOR_END_MARKER);
      expect(defaultBlock).toContain('Global Thin-Client QA 11X Connector');
      expect(defaultBlock).toContain('Graphify AST-First (Code Q&A & Pre-Change)');
      expect(defaultBlock).toContain('Zero-Duplication Global Consumption');
      expect(defaultBlock).toContain('QA-TEST-SYNC-01');
      expect(defaultBlock).toContain("user's prompt language");
      expect(defaultBlock).not.toContain('Step 1 (Plan):');

      const esBlock = buildGlobalGeminiBlock('es');
      expect(esBlock).toContain('Conector Global Thin-Client QA 11X');
      expect(esBlock).toContain('Graphify AST-First (Consultas de Código Q&A y Pre-Cambio)');
      expect(esBlock).toContain('sin duplicar reglas ni skills en los proyectos locales');
      expect(esBlock).toContain('QA-TEST-SYNC-01');

      const enBlock = buildGlobalGeminiBlock('en');
      expect(enBlock).toContain('Global Thin-Client QA 11X Connector');
      expect(enBlock).toContain('strictly in **English**');
      expect(enBlock).toContain('QA-TEST-SYNC-01');
    });

    it('injects dynamic mirroring language policy into connector block based on lang param', () => {
      const autoBlock = buildConnectorBlock('app', ['fastapi'], 'auto');
      expect(autoBlock).toContain("user's prompt language");
      expect(autoBlock).toContain('explicitly ignoring `AGENTS.md` and `.agents/**`');

      const esBlock = buildConnectorBlock('app', ['fastapi'], 'es');
      expect(esBlock).toContain('strictly in **Spanish**');

      const enBlock = buildConnectorBlock('app', ['fastapi'], 'en');
      expect(enBlock).toContain('strictly in **English**');
    });
  });

  describe('mergeOrAppendAgentsMdContent', () => {
    it('creates content from scratch when existing content is empty or whitespace only', () => {
      const res = mergeOrAppendAgentsMdContent('', 'nuevo-repo', ['vue3']);
      expect(res.action).toBe('created');
      expect(res.finalContent).toContain('# SPDX-License-Identifier: MIT');
      expect(res.finalContent).toContain('# 🤖 AI Agent Directives & Technical Governance — nuevo-repo');
      expect(res.finalContent).toContain(CONNECTOR_START_MARKER);
      expect(res.finalContent).toContain('vue3');
      expect(res.changes.length).toBeGreaterThan(0);

      const resWhitespace = mergeOrAppendAgentsMdContent('   \n  \t  ', 'otro-repo', []);
      expect(resWhitespace.action).toBe('created');
    });

    it('appends connector block non-destructively to existing content without markers', () => {
      const existing = `# Reglas de Negocio Propias
- No tocar el módulo de facturación
- Mantener compatibilidad con RouterOS v7`;

      const res = mergeOrAppendAgentsMdContent(existing, 'rosgrid', ['python']);
      expect(res.action).toBe('appended');
      expect(res.finalContent.startsWith(existing)).toBe(true);
      expect(res.finalContent).toContain('\n\n---\n\n');
      expect(res.finalContent).toContain(CONNECTOR_START_MARKER);
      expect(res.finalContent).toContain('rosgrid');
      expect(res.changes[0]).toContain('Agregado bloque conector QA 11X');
    });

    it('updates connector block idempotently when markers already exist', () => {
      const existing = `# Encabezado Previo
Regla 1

${CONNECTOR_START_MARKER}
Contenido viejo del conector v1
${CONNECTOR_END_MARKER}

# Pie de Página Previo
Regla Final`;

      const res = mergeOrAppendAgentsMdContent(existing, 'repo-actualizado', ['node-backend']);
      expect(res.action).toBe('updated_block');
      expect(res.finalContent).toContain('# Encabezado Previo');
      expect(res.finalContent).toContain('# Pie de Página Previo');
      expect(res.finalContent).not.toContain('Contenido viejo del conector v1');
      expect(res.finalContent).toContain(CONNECTOR_START_MARKER);
      expect(res.finalContent).toContain('repo-actualizado');
      expect(res.finalContent).toContain('node-backend');
      expect(res.changes[0]).toContain('Actualizado bloque conector QA 11X');
    });
  });

  describe('initOrAppendAgentsMd', () => {
    it('throws error if project path does not exist', async () => {
      const nonExistent = path.join(tmpDir, 'directorio-inexistente');
      await expect(initOrAppendAgentsMd({ projectPath: nonExistent })).rejects.toThrow(
        'El directorio especificado no existe'
      );
    });

    it('throws error if project path is a file and not a directory', async () => {
      const filePath = path.join(tmpDir, 'archivo.txt');
      fs.writeFileSync(filePath, 'hola', 'utf-8');
      await expect(initOrAppendAgentsMd({ projectPath: filePath })).rejects.toThrow(
        'La ruta especificada no es un directorio'
      );
    });

    it('creates AGENTS.md when it does not exist in target project', async () => {
      // Mock minimal node project
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', dependencies: { vue: '^3.0.0' } })
      );

      const resDryOmitted = await initOrAppendAgentsMd({ projectPath: tmpDir });
      expect(resDryOmitted.action).toBe('dry_run');
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);

      const result = await initOrAppendAgentsMd({ projectPath: tmpDir, dryRun: false });
      expect(result.action).toBe('created');
      expect(result.detected_stacks).toContain('vue3');
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);

      const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
      expect(content).toContain(CONNECTOR_START_MARKER);
      expect(content).toContain('vue3');
    });

    it('appends non-destructively when AGENTS.md exists without connector markers', async () => {
      const initialAgents = '# Reglas Iniciales del Proyecto\n1. Respetar contratos existentes.';
      fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), initialAgents, 'utf-8');

      const result = await initOrAppendAgentsMd({ projectPath: tmpDir, dryRun: false });
      expect(result.action).toBe('appended');

      const saved = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
      expect(saved.startsWith(initialAgents)).toBe(true);
      expect(saved).toContain(CONNECTOR_START_MARKER);
    });

    it('updates idempotently when AGENTS.md already contains connector markers', async () => {
      const oldBlock = `${CONNECTOR_START_MARKER}\nAntiguo conector\n${CONNECTOR_END_MARKER}`;
      const fullAgents = `# Reglas Propias\n\n${oldBlock}\n\n# Mas reglas`;
      fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), fullAgents, 'utf-8');

      const result = await initOrAppendAgentsMd({ projectPath: tmpDir, dryRun: false });
      expect(result.action).toBe('updated_block');

      const saved = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
      expect(saved).toContain('# Reglas Propias');
      expect(saved).toContain('# Mas reglas');
      expect(saved).not.toContain('Antiguo conector');
      expect(saved).toContain(CONNECTOR_START_MARKER);
    });

    it('does not write to disk in dryRun mode', async () => {
      const result = await initOrAppendAgentsMd({ projectPath: tmpDir, dryRun: true });
      expect(result.action).toBe('dry_run');
      expect(result.content).toContain(CONNECTOR_START_MARKER);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
    });

    it('rejects "/" and unsafe paths via SEC-PATH-01 while helper falls back to "Project" when basename is empty', async () => {
      await expect(initOrAppendAgentsMd({ projectPath: '/', dryRun: true })).rejects.toThrow(
        WorkspacePathValidationError
      );
      await expect(initOrAppendAgentsMd({ projectPath: '../outside', dryRun: true })).rejects.toThrow(
        WorkspacePathValidationError
      );
      await expect(initOrAppendAgentsMd({ projectPath: os.tmpdir(), dryRun: true })).rejects.toThrow(
        WorkspacePathValidationError
      );
      const fallbackName = resolveProjectDisplayName('/');
      expect(fallbackName).toBe('Project');
      expect(buildConnectorBlock(fallbackName, [])).toContain('This project (`Project`)');
    });
  });

  describe('parseInitAgentsArgs and runInitAgentsCli', () => {
    it('parses default CLI arguments', () => {
      const prevLang = process.env.QA_OUTPUT_LANG;
      try {
        delete process.env.QA_OUTPUT_LANG;
        const parsed = parseInitAgentsArgs([]);
        expect(parsed.projectPath).toBe(process.cwd());
        expect(parsed.dryRun).toBe(false);
        expect(parsed.lang).toBe('auto');

        process.env.QA_OUTPUT_LANG = 'en';
        expect(parseInitAgentsArgs([]).lang).toBe('en');
      } finally {
        if (prevLang === undefined) {
          delete process.env.QA_OUTPUT_LANG;
        } else {
          process.env.QA_OUTPUT_LANG = prevLang;
        }
      }
    });

    it('parses --dry-run and --project-path flags', () => {
      const prevLang = process.env.QA_OUTPUT_LANG;
      try {
        delete process.env.QA_OUTPUT_LANG;
        const parsed1 = parseInitAgentsArgs(['--dry-run', '--project-path', '/custom/path']);
        expect(parsed1.projectPath).toBe('/custom/path');
        expect(parsed1.dryRun).toBe(true);
        expect(parsed1.lang).toBe('auto');
      } finally {
        if (prevLang === undefined) {
          delete process.env.QA_OUTPUT_LANG;
        } else {
          process.env.QA_OUTPUT_LANG = prevLang;
        }
      }

      const parsed2 = parseInitAgentsArgs(['-p', '/other/path', '--lang', 'es']);
      expect(parsed2.projectPath).toBe('/other/path');
      expect(parsed2.lang).toBe('es');

      const parsed3 = parseInitAgentsArgs(['--project-path=/equal/path', '--lang=en']);
      expect(parsed3.projectPath).toBe('/equal/path');
      expect(parsed3.lang).toBe('en');

      const parsed4 = parseInitAgentsArgs(['/positional/path', '-l', 'auto']);
      expect(parsed4.projectPath).toBe('/positional/path');
      expect(parsed4.lang).toBe('auto');

      const parsed5 = parseInitAgentsArgs(['-p=/short/eq', '-l=en', '-a=cursor']);
      expect(parsed5.projectPath).toBe('/short/eq');
      expect(parsed5.lang).toBe('en');
      expect(parsed5.agents).toEqual(['cursor']);

      const parsed6 = parseInitAgentsArgs(['--dir=/dir/eq']);
      expect(parsed6.projectPath).toBe('/dir/eq');

      expect(parseInitAgentsArgs(['my-app'], '/tmp/base').projectPath).toBe(
        path.resolve('/tmp/base', 'my-app')
      );
      expect(parseInitAgentsArgs(['../escape'], '/tmp/base').projectPath).toBe('../escape');

      // Rejects unknown hyphen flags and missing flag values explicitly
      expect(() => parseInitAgentsArgs(['--unknown', '--project-path'])).toThrow(
        "Opción CLI desconocida en init-agents: '--unknown'"
      );
      expect(() => parseInitAgentsArgs(['-p'])).toThrow(
        "Falta el valor requerido para la opción '-p'"
      );
      expect(() => parseInitAgentsArgs(['extra-one', 'extra-two'])).toThrow(
        'Argumento posicional inesperado'
      );

      // Rejects invalid lang and empty inline option values
      expect(() => parseInitAgentsArgs(['--lang', 'fr'])).toThrow("Modo de idioma no válido: 'fr'");
      expect(() => parseInitAgentsArgs(['--project-path='])).toThrow(
        "Falta el valor requerido para la opción '--project-path'"
      );
      expect(parseInitAgentsArgs(['--help', '-h']).projectPath).toBe(process.cwd());
    });

    it('runs runInitAgentsCli successfully logging information and non-destructive help', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        await runInitAgentsCli(['--help']);
        expect(logSpy).toHaveBeenCalledWith(INIT_AGENTS_HELP_TEXT);
        await runInitAgentsCli(['-h']);
        expect(logSpy).toHaveBeenCalledWith(INIT_AGENTS_HELP_TEXT);
        expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);

        await runInitAgentsCli(['--project-path', tmpDir]);
        expect(logSpy).toHaveBeenCalled();
        expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);

        // Run again with dry-run
        await runInitAgentsCli(['--project-path', tmpDir, '--dry-run']);
        expect(logSpy).toHaveBeenCalled();
      } finally {
        logSpy.mockRestore();
      }
    });
  });
});
