// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { MCP_SERVER_VERSION } from '../services/github-fetcher.js';
import { SUPPORTED_AGENT_IDS } from '../tools/initOrAppendAgentsMd.js';

export type HelpLang = 'en' | 'es';

export type CanonicalSubcommandName =
  | 'quickstart'
  | 'install-skill'
  | 'init-agents'
  | 'reconcile-agents'
  | 'tms-sync'
  | 'doctor'
  | 'upgrade'
  | 'certify'
  | 'audit'
  | 'blast-radius'
  | 'mcp-config'
  | 'completion';

export type MetaCommandName = 'help' | 'version' | 'stdio';
export type CatalogCommandName = CanonicalSubcommandName | MetaCommandName;

export interface BilingualText {
  readonly en: string;
  readonly es: string;
}

export interface CliFlagSpec {
  readonly long: string;
  readonly short?: string;
  readonly aliases?: readonly string[];
  readonly argLabel?: string;
  readonly values?: readonly string[];
  readonly zshMeta?: string;
  readonly desc: BilingualText;
}

export interface CliSubcommandSpec {
  readonly name: CanonicalSubcommandName;
  readonly aliases: readonly string[];
  readonly usageArgs: BilingualText;
  readonly altUsage?: BilingualText;
  readonly summary: BilingualText;
  readonly flags: readonly CliFlagSpec[];
}

export interface HelpSurfaceCounts {
  readonly tools: number;
  readonly resources: number;
}

const DEFAULT_COUNTS: HelpSurfaceCounts = { tools: 19, resources: 13 };
const BIN_INVOCATION = 'npx -y @sinfallas/mcp-qa-11x';
const USAGE_DIR_OPTIONS: BilingualText = {
  en: '[dir] [options]',
  es: '[dir] [opciones]',
};
const USAGE_OPTIONS: BilingualText = {
  en: '[options]',
  es: '[opciones]',
};
const USAGE_COMPLETION_SHELLS = '<fish|bash|zsh>';
const AGENT_COUNT = SUPPORTED_AGENT_IDS.length;

const COMMON_PROJECT_FLAG: CliFlagSpec = {
  long: '--project-path',
  short: '-p',
  aliases: ['--dir'],
  argLabel: '<dir>',
  desc: {
    en: 'Target project directory (default: cwd)',
    es: 'Directorio del proyecto destino (por defecto: cwd)',
  },
};

const COMMON_JSON_FLAG: CliFlagSpec = {
  long: '--json',
  desc: {
    en: 'Emit machine-readable JSON output',
    es: 'Emite salida estructurada en JSON',
  },
};

const COMMON_DRY_RUN_FLAG: CliFlagSpec = {
  long: '--dry-run',
  desc: {
    en: 'Simulate without modifying files on disk',
    es: 'Simula la operación sin modificar archivos en disco',
  },
};

const COMMON_OFFLINE_FLAG: CliFlagSpec = {
  long: '--offline',
  desc: {
    en: 'Skip remote npm/GitHub version lookup',
    es: 'Omite consulta remota de versión en npm/GitHub',
  },
};

const COMMON_HELP_FLAG: CliFlagSpec = {
  long: '--help',
  short: '-h',
  desc: {
    en: 'Show this help message and exit 0',
    es: 'Muestra esta ayuda y sale con código 0',
  },
};

const LANG_FLAG: CliFlagSpec = {
  long: '--lang',
  short: '-l',
  argLabel: '<auto|es|en>',
  values: ['auto', 'es', 'en'],
  zshMeta: 'lang',
  desc: {
    en: 'Output language policy (default: auto)',
    es: 'Política de idioma de salida (por defecto: auto)',
  },
};

const AGENTS_FLAG: CliFlagSpec = {
  long: '--agents',
  short: '-a',
  argLabel: '<auto|all|csv>',
  desc: {
    en: `Optional Thin-Repo bridge targets (auto | all | CSV of ${AGENT_COUNT} agents)`,
    es: `Puentes Thin-Repo opcionales (auto | all | CSV de ${AGENT_COUNT} agentes)`,
  },
};

export const CLI_COMMAND_CATALOG: readonly CliSubcommandSpec[] = [
  {
    name: 'quickstart',
    aliases: [],
    usageArgs: USAGE_DIR_OPTIONS,
    summary: {
      en: 'Zero-config 30s onboarding (.qa-11x.json, AGENTS.md, PR check)',
      es: 'Adopción cero-configuración en 30s (.qa-11x.json, AGENTS.md, PR check)',
    },
    flags: [
      COMMON_PROJECT_FLAG,
      {
        long: '--tier',
        short: '-T',
        argLabel: '<starter|standard|enterprise>',
        values: ['starter', 'standard', 'enterprise'],
        zshMeta: 'tier',
        desc: {
          en: 'Quickstart gate profile (default: starter)',
          es: 'Perfil de compuertas quickstart (por defecto: starter)',
        },
      },
      LANG_FLAG,
      AGENTS_FLAG,
      {
        long: '--ci',
        argLabel: '<github|none>',
        values: ['github', 'none'],
        zshMeta: 'ci',
        desc: {
          en: 'CI workflow generator (default: github)',
          es: 'Generador de workflow CI (por defecto: github)',
        },
      },
      COMMON_DRY_RUN_FLAG,
      {
        long: '--force',
        short: '-f',
        desc: {
          en: 'Overwrite customized CI/task files',
          es: 'Sobrescribe archivos CI/tareas personalizados',
        },
      },
      COMMON_JSON_FLAG,
      COMMON_HELP_FLAG,
    ],
  },
  {
    name: 'install-skill',
    aliases: ['install'],
    usageArgs: USAGE_OPTIONS,
    summary: {
      en: 'Install global 11X skills, scripts, and AGENTS.md connector',
      es: 'Instala skills globales 11X, scripts y conector AGENTS.md',
    },
    flags: [
      {
        long: '--target',
        short: '-t',
        argLabel: '<env>',
        desc: {
          en: 'auto (default) | workspace | antigravity | claude | cursor | windsurf | codex | hermes | all',
          es: 'auto (por defecto) | workspace | antigravity | claude | cursor | windsurf | codex | hermes | all',
        },
      },
      COMMON_PROJECT_FLAG,
      LANG_FLAG,
      AGENTS_FLAG,
      {
        long: '--include-scripts',
        desc: {
          en: 'Install operational 11X scripts (.agents/scripts, schemas, common)',
          es: 'Instala scripts operacionales 11X (.agents/scripts, schemas y comunes)',
        },
      },
      {
        long: '--init-agents',
        desc: {
          en: 'Inject or update the QA 11X connector in AGENTS.md',
          es: 'Inyecta o actualiza el conector QA 11X en AGENTS.md',
        },
      },
      {
        long: '--reconcile',
        desc: {
          en: 'Deduplicate canonical rules in .agents/ before syncing',
          es: 'Reconcilia y poda reglas duplicadas en .agents/ antes de sincronizar',
        },
      },
      COMMON_DRY_RUN_FLAG,
      COMMON_HELP_FLAG,
    ],
  },
  {
    name: 'init-agents',
    aliases: ['init-agents-md'],
    usageArgs: USAGE_DIR_OPTIONS,
    summary: {
      en: 'Create or update AGENTS.md connector and optional Thin-Repo bridges',
      es: 'Crea o actualiza el conector AGENTS.md y puentes Thin-Repo opcionales',
    },
    flags: [COMMON_PROJECT_FLAG, LANG_FLAG, AGENTS_FLAG, COMMON_DRY_RUN_FLAG, COMMON_HELP_FLAG],
  },
  {
    name: 'reconcile-agents',
    aliases: [],
    usageArgs: USAGE_DIR_OPTIONS,
    summary: {
      en: 'Deduplicate canonical rules in .agents/ and isolate domain rules',
      es: 'Deduplica reglas canónicas en .agents/ y aísla reglas de dominio',
    },
    flags: [
      COMMON_PROJECT_FLAG,
      {
        long: '--scan-workspaces',
        argLabel: '<dir>',
        desc: {
          en: 'Scan repositories under <dir> (dry-run by default)',
          es: 'Escanea repositorios bajo <dir> (por defecto: --dry-run)',
        },
      },
      {
        long: '--apply',
        desc: {
          en: 'Apply reconciliation changes during --scan-workspaces',
          es: 'Aplica cambios durante --scan-workspaces',
        },
      },
      {
        long: '--allow-dirty',
        desc: {
          en: 'Allow --apply on repositories with dirty git status',
          es: 'Permite --apply en repos con git status sucio',
        },
      },
      {
        long: '--prune-bridges',
        desc: {
          en: 'Back up and prune redundant pure QA-11X bridge files',
          es: 'Respalda y elimina puentes QA-11X puros sin reglas propias',
        },
      },
      COMMON_DRY_RUN_FLAG,
      COMMON_JSON_FLAG,
      COMMON_HELP_FLAG,
    ],
  },
  {
    name: 'tms-sync',
    aliases: [],
    usageArgs: {
      en: '--mode <inventory|push-results|pull-stories> [options]',
      es: '--mode <inventory|push-results|pull-stories> [opciones]',
    },
    summary: {
      en: 'Zero-infra traceability sync (jira|zephyr|xray|github-issues)',
      es: 'Sincronización de trazabilidad Zero-Infra (jira|zephyr|xray|github-issues)',
    },
    flags: [
      {
        long: '--mode',
        short: '-m',
        argLabel: '<mode>',
        values: ['inventory', 'push-results', 'pull-stories'],
        zshMeta: 'mode',
        desc: {
          en: 'Operation mode: inventory | push-results | pull-stories',
          es: 'Modo de operación: inventory | push-results | pull-stories',
        },
      },
      {
        long: '--provider',
        argLabel: '<id>',
        values: ['jira', 'zephyr', 'xray', 'github-issues'],
        zshMeta: 'provider',
        desc: {
          en: 'TMS provider: jira | zephyr | xray | github-issues',
          es: 'Proveedor TMS: jira | zephyr | xray | github-issues',
        },
      },
      {
        long: '--target-dir',
        argLabel: '<dir>',
        desc: {
          en: 'Relative directory containing BDD features or test suites',
          es: 'Directorio relativo con features BDD o suites de prueba',
        },
      },
      {
        long: '--junit-xml',
        argLabel: '<path>',
        desc: {
          en: 'Relative path to JUnit XML report',
          es: 'Ruta relativa del reporte JUnit XML',
        },
      },
      {
        long: '--base-url',
        argLabel: '<url>',
        desc: {
          en: 'HTTPS base URL of the enterprise TMS instance',
          es: 'URL base HTTPS de la instancia TMS empresarial',
        },
      },
      {
        long: '--project-key',
        argLabel: '<key>',
        desc: {
          en: 'TMS project key (e.g. QA11X)',
          es: 'Clave de proyecto TMS (ej. QA11X)',
        },
      },
      {
        long: '--issue-key',
        argLabel: '<key>',
        desc: {
          en: 'Target TMS issue or story key',
          es: 'Clave de historia o incidencia TMS destino',
        },
      },
      {
        long: '--test-execution-key',
        argLabel: '<key>',
        desc: {
          en: 'Xray or Zephyr test execution key',
          es: 'Clave de ejecución de pruebas Xray o Zephyr',
        },
      },
      {
        long: '--repo',
        argLabel: '<owner/repo>',
        desc: {
          en: 'GitHub owner/repo slug for github-issues provider',
          es: 'Slug GitHub owner/repo para proveedor github-issues',
        },
      },
      {
        long: '--required-keys',
        argLabel: '<csv>',
        desc: {
          en: 'Required @JIRA/@TC traceability keys (CSV)',
          es: 'Claves @JIRA/@TC obligatorias de trazabilidad (CSV)',
        },
      },
      {
        long: '--timeout-ms',
        argLabel: '<ms>',
        desc: {
          en: 'HTTP request timeout in milliseconds (<= 180000)',
          es: 'Timeout de solicitud HTTP en milisegundos (<= 180000)',
        },
      },
      COMMON_DRY_RUN_FLAG,
      {
        long: '--live',
        desc: {
          en: 'Execute live HTTPS writes against TMS provider',
          es: 'Ejecuta escritura HTTPS en vivo contra el proveedor TMS',
        },
      },
      COMMON_JSON_FLAG,
      COMMON_HELP_FLAG,
    ],
  },
  {
    name: 'doctor',
    aliases: ['status'],
    usageArgs: USAGE_DIR_OPTIONS,
    summary: {
      en: 'Inspect active binary, npx caches, global skills, IDE configs & Docker health (CrashLoops, bridge nets, NM veth*, temp/RAM; alias: status)',
      es: 'Inspecciona binario activo, cachés npx, skills globales, configs IDE y salud Docker (CrashLoops, redes bridge, NM veth*, temp/RAM; alias: status)',
    },
    flags: [COMMON_PROJECT_FLAG, COMMON_OFFLINE_FLAG, COMMON_JSON_FLAG, COMMON_HELP_FLAG],
  },
  {
    name: 'upgrade',
    aliases: ['cache-clean'],
    usageArgs: USAGE_OPTIONS,
    summary: {
      en: 'Clean @sinfallas/mcp-qa-11x caches and sync global skills (alias: cache-clean)',
      es: 'Limpia cachés de @sinfallas/mcp-qa-11x y sincroniza skills globales (alias: cache-clean)',
    },
    flags: [
      {
        long: '--cache-only',
        desc: {
          en: 'Clean _npx and blueprint caches without syncing skills',
          es: 'Limpia cachés _npx y blueprints sin reinstalar skills',
        },
      },
      {
        long: '--target',
        short: '-t',
        argLabel: '<env>',
        desc: {
          en: 'Skill destination target (default: all)',
          es: 'Destino de skills para install-skill (por defecto: all)',
        },
      },
      {
        long: '--reconcile',
        desc: {
          en: 'Reconcile and prune duplicate rules in .agents/ during sync',
          es: 'Reconcilia y poda reglas duplicadas en .agents/ al sincronizar',
        },
      },
      COMMON_OFFLINE_FLAG,
      COMMON_DRY_RUN_FLAG,
      COMMON_JSON_FLAG,
      COMMON_HELP_FLAG,
    ],
  },
  {
    name: 'certify',
    aliases: [],
    usageArgs: USAGE_DIR_OPTIONS,
    summary: {
      en: 'Headless 11-check 11X gate & release readiness verdict (--strict, --release-gate)',
      es: 'Compuerta headless 11X de 11 controles y veredicto Release Readiness (--strict, --release-gate)',
    },
    flags: [
      COMMON_PROJECT_FLAG,
      {
        long: '--strict',
        desc: {
          en: 'Fail with exitCode=20 if any check is SKIPPED',
          es: 'Falla con exitCode=20 si alguna verificación queda en SKIPPED',
        },
      },
      {
        long: '--require-lint-evidence',
        desc: {
          en: 'Require fresh lint evidence on dirty trees (enabled by default; matches MCP)',
          es: 'Exige evidencia reciente de lint en árboles sucios (activo por defecto; paridad MCP)',
        },
      },
      {
        long: '--no-require-lint-evidence',
        desc: {
          en: 'Opt out of fresh lint evidence enforcement on dirty trees',
          es: 'Desactiva la exigencia de evidencia reciente de lint en árboles sucios',
        },
      },
      {
        long: '--require-unit-evidence',
        desc: {
          en: 'Require fresh unit test evidence on dirty trees (enabled by default; matches MCP)',
          es: 'Exige evidencia reciente de pruebas unitarias en árboles sucios (activo por defecto; paridad MCP)',
        },
      },
      {
        long: '--no-require-unit-evidence',
        desc: {
          en: 'Opt out of fresh unit test evidence enforcement on dirty trees',
          es: 'Desactiva la exigencia de evidencia reciente de pruebas unitarias en árboles sucios',
        },
      },
      {
        long: '--allow-unmerged-examples',
        desc: {
          en: 'Skip unmerged root .example files verification',
          es: 'Omite verificación de archivos .example sin fusionar en raíz',
        },
      },
      {
        long: '--release-gate',
        desc: {
          en: 'Also evaluate Release Readiness gate (exitCode=30 on NO_GO; requires --junit-xml)',
          es: 'Evalúa además compuerta Release Readiness (exitCode=30 en NO_GO; requiere --junit-xml)',
        },
      },
      {
        long: '--junit-xml',
        argLabel: '<path>',
        desc: {
          en: 'Relative path to JUnit XML report required by --release-gate',
          es: 'Ruta relativa del reporte JUnit XML requerida por --release-gate',
        },
      },
      COMMON_OFFLINE_FLAG,
      COMMON_JSON_FLAG,
      COMMON_HELP_FLAG,
    ],
  },
  {
    name: 'audit',
    aliases: [],
    usageArgs: USAGE_DIR_OPTIONS,
    summary: {
      en: 'Static Zero-LLM audit (security 37 rules incl. QA-DOCKER-LOOP-01 | pyramid | vibe | calm | all) with text/json/sarif output',
      es: 'Auditoría estática Zero-LLM (security 37 reglas incl. QA-DOCKER-LOOP-01 | pyramid | vibe | calm | all) en formato text/json/sarif',
    },
    flags: [
      COMMON_PROJECT_FLAG,
      {
        long: '--mode',
        short: '-m',
        argLabel: '<mode>',
        values: ['security', 'pyramid', 'vibe', 'calm', 'all'],
        zshMeta: 'mode',
        desc: {
          en: 'security | pyramid | vibe | calm | all (default: security)',
          es: 'security | pyramid | vibe | calm | all (por defecto: security)',
        },
      },
      {
        long: '--format',
        short: '-f',
        argLabel: '<fmt>',
        values: ['text', 'json', 'sarif'],
        zshMeta: 'format',
        desc: {
          en: 'text | json | sarif (default: text)',
          es: 'text | json | sarif (por defecto: text)',
        },
      },
      COMMON_JSON_FLAG,
      {
        long: '--sarif',
        desc: {
          en: 'Emit SARIF 2.1.0 output for GitHub Code Scanning',
          es: 'Emite salida SARIF 2.1.0 para GitHub Code Scanning',
        },
      },
      {
        long: '--fail-on',
        argLabel: '<lvl>',
        values: ['critical', 'high', 'medium', 'any', 'none'],
        zshMeta: 'severity',
        desc: {
          en: 'critical | high | medium | any | none (default: high)',
          es: 'critical | high | medium | any | none (por defecto: high)',
        },
      },
      {
        long: '--include-examples',
        desc: {
          en: 'Include .example template files in security audit',
          es: 'Incluye plantillas .example en la auditoría de seguridad',
        },
      },
      {
        long: '--max-findings',
        argLabel: '<n>',
        desc: {
          en: 'Maximum findings reported per engine (default: 50)',
          es: 'Máximo de hallazgos reportados por motor (por defecto: 50)',
        },
      },
      {
        long: '--architecture-path',
        argLabel: '<rel>',
        desc: {
          en: 'Relative path to FINOS CALM model (default: architecture/qa-11x.calm.json)',
          es: 'Ruta relativa del modelo FINOS CALM (por defecto: architecture/qa-11x.calm.json)',
        },
      },
      {
        long: '--profile',
        argLabel: '<profile>',
        values: ['auto', 'generic', 'qa-11x-self'],
        zshMeta: 'profile',
        desc: {
          en: 'FINOS CALM validation profile: auto | generic | qa-11x-self',
          es: 'Perfil de validación FINOS CALM: auto | generic | qa-11x-self',
        },
      },
      COMMON_HELP_FLAG,
    ],
  },
  {
    name: 'blast-radius',
    aliases: [],
    usageArgs: {
      en: '[symbol] [options]',
      es: '[símbolo] [opciones]',
    },
    summary: {
      en: 'Bidirectional AST impact & differential PR routing triage',
      es: 'Impacto AST bidireccional y enrutamiento diferencial de PR',
    },
    flags: [
      {
        long: '--symbol',
        short: '-s',
        argLabel: '<symbol>',
        desc: {
          en: 'Target symbol or file to audit AST blast radius',
          es: 'Símbolo o archivo objetivo para auditar radio de explosión AST',
        },
      },
      COMMON_PROJECT_FLAG,
      {
        long: '--changed-since',
        argLabel: '<ref>',
        desc: {
          en: 'Git ref to evaluate semantic diff and recommended path',
          es: 'Referencia Git para evaluar diff semántico y ruta recomendada',
        },
      },
      {
        long: '--git-signals',
        desc: {
          en: 'Mine Git history (-M --numstat) for hotspots, co-change, and bus-factor',
          es: 'Mina historia Git (-M --numstat) para hotspots, co-cambio y bus-factor',
        },
      },
      {
        long: '--auto-build',
        desc: {
          en: 'Build graphify-out/graph.json if missing',
          es: 'Construye graphify-out/graph.json si no existe',
        },
      },
      {
        long: '--refresh',
        desc: {
          en: 'Rebuild AST graph before inspecting',
          es: 'Reconstruye el grafo AST antes de inspeccionar',
        },
      },
      {
        long: '--max-tokens',
        argLabel: '<n>',
        desc: {
          en: 'Maximum token budget for semantic diff',
          es: 'Presupuesto máximo de tokens para el diff semántico',
        },
      },
      {
        long: '--max-items',
        argLabel: '<n>',
        desc: {
          en: 'Maximum dependent symbols/tests listed',
          es: 'Máximo de dependientes/pruebas listados',
        },
      },
      COMMON_JSON_FLAG,
      COMMON_HELP_FLAG,
    ],
  },
  {
    name: 'mcp-config',
    aliases: [],
    usageArgs: USAGE_OPTIONS,
    summary: {
      en: 'Print or safely merge mcpServers config for supported IDE/CLI clients',
      es: 'Imprime o fusiona de forma segura la configuración mcpServers para clientes IDE/CLI',
    },
    flags: [
      {
        long: '--client',
        short: '-c',
        argLabel: '<id|all>',
        values: [
          'antigravity',
          'claude-code',
          'claude-desktop',
          'cursor',
          'vscode',
          'windsurf',
          'codex',
          'gemini-cli',
          'hermes',
          'all',
        ],
        zshMeta: 'client',
        desc: {
          en: 'antigravity | claude-code | claude-desktop | cursor | vscode | windsurf | codex | gemini-cli | hermes | all',
          es: 'antigravity | claude-code | claude-desktop | cursor | vscode | windsurf | codex | gemini-cli | hermes | all',
        },
      },
      {
        long: '--print',
        desc: {
          en: 'Print configuration snippet or CLI command (default)',
          es: 'Imprime el snippet o comando de configuración (por defecto)',
        },
      },
      {
        long: '--install',
        desc: {
          en: 'Install configuration into JSON/TOML files with .11x-backup',
          es: 'Instala la configuración en archivos JSON/TOML con respaldo .11x-backup',
        },
      },
      {
        long: '--pin-version',
        desc: {
          en: `Pin exact version @sinfallas/mcp-qa-11x@${MCP_SERVER_VERSION} (default)`,
          es: `Fija la versión exacta @sinfallas/mcp-qa-11x@${MCP_SERVER_VERSION} (por defecto)`,
        },
      },
      {
        long: '--latest',
        desc: {
          en: 'Use floating @sinfallas/mcp-qa-11x@latest tag instead of pinned version',
          es: 'Usa etiqueta flotante @sinfallas/mcp-qa-11x@latest en vez de versión fija',
        },
      },
      {
        long: '--toolset',
        argLabel: '<core|auto|full>',
        values: ['core', 'auto', 'full'],
        zshMeta: 'toolset',
        desc: {
          en: 'MCP toolset exposure profile: core (8) | auto | full (19, default)',
          es: 'Perfil de exposición de herramientas MCP: core (8) | auto | full (19, por defecto)',
        },
      },
      COMMON_DRY_RUN_FLAG,
      COMMON_JSON_FLAG,
      COMMON_HELP_FLAG,
    ],
  },
  {
    name: 'completion',
    aliases: [],
    usageArgs: {
      en: USAGE_COMPLETION_SHELLS,
      es: USAGE_COMPLETION_SHELLS,
    },
    altUsage: {
      en: `   or: ${BIN_INVOCATION} completion --shell <fish|bash|zsh>`,
      es: `    o: ${BIN_INVOCATION} completion --shell <fish|bash|zsh>`,
    },
    summary: {
      en: 'Emit native shell completion script (fish|bash|zsh)',
      es: 'Emite script nativo de autocompletado de shell (fish|bash|zsh)',
    },
    flags: [
      {
        long: '--shell',
        argLabel: '<fish|bash|zsh>',
        values: ['fish', 'bash', 'zsh'],
        zshMeta: 'shell',
        desc: {
          en: 'Target shell for autocompletion script',
          es: 'Shell objetivo para el script de autocompletado',
        },
      },
      COMMON_HELP_FLAG,
    ],
  },
];

export const CLI_GLOBAL_META_FLAGS: readonly CliFlagSpec[] = [
  {
    long: '--stdio',
    desc: {
      en: 'Force JSON-RPC stdio transport',
      es: 'Fuerza transporte JSON-RPC sobre stdio',
    },
  },
  {
    long: '--toolset',
    argLabel: '<core|auto|full>',
    values: ['core', 'auto', 'full'],
    zshMeta: 'toolset',
    desc: {
      en: 'Select MCP toolset profile for stdio server (core | auto | full)',
      es: 'Selecciona el perfil de herramientas MCP en modo stdio (core | auto | full)',
    },
  },
  {
    long: '--verbose',
    desc: {
      en: 'Include verbose offline diagnostics with --version',
      es: 'Incluye diagnósticos offline detallados con --version',
    },
  },
  {
    long: '--version',
    short: '-v',
    desc: {
      en: 'Print active package version (or offline doctor with --json/--verbose)',
      es: 'Muestra versión activa del paquete (o doctor offline con --json/--verbose)',
    },
  },
  COMMON_HELP_FLAG,
];

const SUBCOMMAND_SPEC_BY_NAME = new Map<CanonicalSubcommandName, CliSubcommandSpec>(
  CLI_COMMAND_CATALOG.map((spec) => [spec.name, spec])
);

const COMMAND_LOOKUP_MAP = new Map<string, CatalogCommandName>();
for (const spec of CLI_COMMAND_CATALOG) {
  COMMAND_LOOKUP_MAP.set(spec.name, spec.name);
  for (const alias of spec.aliases) {
    COMMAND_LOOKUP_MAP.set(alias, spec.name);
  }
}
COMMAND_LOOKUP_MAP.set('--help', 'help');
COMMAND_LOOKUP_MAP.set('-h', 'help');
COMMAND_LOOKUP_MAP.set('help', 'help');
COMMAND_LOOKUP_MAP.set('--version', 'version');
COMMAND_LOOKUP_MAP.set('-v', 'version');
COMMAND_LOOKUP_MAP.set('version', 'version');

/** Resolves any CLI subcommand or alias safely via Map (zero prototype lookup). */
export function resolveCatalogCommand(token: string): CatalogCommandName | undefined {
  return COMMAND_LOOKUP_MAP.get(token);
}

/** Returns declarative specification for a canonical CLI subcommand. */
export function getCatalogSubcommandSpec(
  name: CanonicalSubcommandName
): CliSubcommandSpec | undefined {
  return SUBCOMMAND_SPEC_BY_NAME.get(name);
}

function normalizeLangToken(raw: string | undefined): HelpLang | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'es' || normalized.startsWith('es_') || normalized.startsWith('es-')) {
    return 'es';
  }
  if (normalized === 'en' || normalized.startsWith('en_') || normalized.startsWith('en-')) {
    return 'en';
  }
  return undefined;
}

function extractLangFromPair(token: string, nextToken: string | undefined): HelpLang | undefined {
  if (token === '--lang' || token === '-l') {
    return normalizeLangToken(nextToken);
  }
  if (token.startsWith('--lang=')) {
    return normalizeLangToken(token.slice('--lang='.length));
  }
  if (token.startsWith('-l=')) {
    return normalizeLangToken(token.slice('-l='.length));
  }
  return undefined;
}

function extractLangFlagFromArgs(args: readonly string[]): HelpLang | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const matched = extractLangFromPair(args[i] ?? '', args[i + 1]);
    if (matched) {
      return matched;
    }
  }
  return undefined;
}

/** Resolves CLI help language from `--lang`/`-l` flag or `QA_OUTPUT_LANG` (Spec 19 default: en). */
export function resolveCliHelpLang(
  args: readonly string[] = [],
  env: NodeJS.ProcessEnv = process.env
): HelpLang {
  return extractLangFlagFromArgs(args) ?? normalizeLangToken(env.QA_OUTPUT_LANG) ?? 'en';
}

function formatFlagLeftColumn(spec: CliFlagSpec): string {
  const names = [spec.long, ...(spec.aliases ?? []), ...(spec.short ? [spec.short] : [])];
  const joined = names.join(', ');
  return spec.argLabel ? `${joined} ${spec.argLabel}` : joined;
}

/** Renders contextual help for any of the 12 canonical subcommands in EN or ES. */
export function renderSubcommandHelpText(
  name: CanonicalSubcommandName,
  lang: HelpLang = 'en'
): string {
  const spec = SUBCOMMAND_SPEC_BY_NAME.get(name);
  if (!spec) {
    return renderRootHelpText({ lang });
  }
  const usagePrefix = lang === 'es' ? 'Uso' : 'Usage';
  const optionsHeader = lang === 'es' ? 'Opciones:' : 'Options:';
  const lines: string[] = [`${usagePrefix}: ${BIN_INVOCATION} ${spec.name} ${spec.usageArgs[lang]}`];
  if (spec.altUsage) {
    lines.push(spec.altUsage[lang]);
  }
  lines.push('', optionsHeader);
  const formatted = spec.flags.map((flag) => ({
    left: formatFlagLeftColumn(flag),
    right: flag.desc[lang],
  }));
  const width = Math.max(24, ...formatted.map((row) => row.left.length));
  for (const row of formatted) {
    lines.push(`  ${row.left.padEnd(width)}  ${row.right}`);
  }
  return lines.join('\n');
}

function renderRootCommandLines(lang: HelpLang, counts: HelpSurfaceCounts): string[] {
  const surface =
    lang === 'es'
      ? `${counts.tools} herramientas, ${counts.resources} recursos`
      : `${counts.tools} tools, ${counts.resources} resources`;
  const lines: string[] = [
    lang === 'es'
      ? `@sinfallas/mcp-qa-11x v${MCP_SERVER_VERSION} — Servidor MCP Oficial e Instalador CLI para QA Testing Blueprints`
      : `@sinfallas/mcp-qa-11x v${MCP_SERVER_VERSION} — Official MCP Server & Skill Installer for QA Testing Blueprints`,
    '',
    lang === 'es' ? 'Comandos:' : 'Commands:',
  ];
  for (const spec of CLI_COMMAND_CATALOG) {
    lines.push(`  ${spec.name.padEnd(18)}${spec.summary[lang]}`);
  }
  lines.push(
    lang === 'es'
      ? `  [--stdio]         Inicia servidor MCP sobre stdio (${surface})`
      : `  [--stdio]         Starts the MCP server over stdio (${surface})`,
    lang === 'es'
      ? '  help [comando]    Muestra esta ayuda global o la ayuda de un subcomando'
      : '  help [subcommand] Displays global help or contextual help for a subcommand',
    lang === 'es'
      ? '  --version, -v     Muestra versión activa (o doctor offline con --json / --verbose)'
      : '  --version, -v     Displays active package version (or offline doctor with --json / --verbose)'
  );
  return lines;
}

function renderRootFlagLines(lang: HelpLang): string[] {
  const lines: string[] = ['', lang === 'es' ? 'Opciones clave por subcomando:' : 'Key options:'];
  const seen = new Set<string>();
  for (const spec of CLI_COMMAND_CATALOG) {
    for (const flag of spec.flags) {
      if (seen.has(flag.long)) {
        continue;
      }
      seen.add(flag.long);
      const left = formatFlagLeftColumn(flag);
      lines.push(`  ${left.padEnd(36)}  ${flag.desc[lang]}`);
    }
  }
  for (const meta of CLI_GLOBAL_META_FLAGS) {
    if (!seen.has(meta.long)) {
      seen.add(meta.long);
      const left = formatFlagLeftColumn(meta);
      lines.push(`  ${left.padEnd(36)}  ${meta.desc[lang]}`);
    }
  }
  return lines;
}

/** Renders the unified root CLI help text from the single declarative catalog. */
export function renderRootHelpText(options?: {
  readonly lang?: HelpLang;
  readonly counts?: HelpSurfaceCounts;
}): string {
  const lang = options?.lang ?? 'en';
  const counts = options?.counts ?? DEFAULT_COUNTS;
  return [...renderRootCommandLines(lang, counts), ...renderRootFlagLines(lang)].join('\n');
}

export interface CompletionSubcommandEntry {
  readonly name: string;
  readonly summary: string;
}

/** Emits all subcommands + aliases + meta commands for shell completion generators. */
export function getCatalogCompletionSubcommands(): readonly CompletionSubcommandEntry[] {
  const entries: CompletionSubcommandEntry[] = [];
  for (const spec of CLI_COMMAND_CATALOG) {
    entries.push({ name: spec.name, summary: spec.summary.en });
    for (const alias of spec.aliases) {
      entries.push({ name: alias, summary: `Alias for ${spec.name}` });
    }
  }
  entries.push(
    { name: 'version', summary: 'Display active MCP server version' },
    { name: 'help', summary: 'Display CLI or subcommand usage help' }
  );
  return entries;
}

export interface CompletionFlagBundle {
  readonly choiceFlags: readonly (CliFlagSpec & {
    readonly values: readonly string[];
    readonly zshMeta: string;
  })[];
  readonly valueFlags: readonly CliFlagSpec[];
  readonly booleanFlags: readonly CliFlagSpec[];
}

function mergeChoiceValues(existing: readonly string[], incoming: readonly string[]): string[] {
  return Array.from(new Set([...existing, ...incoming]));
}

function registerCatalogFlag(
  byLong: Map<string, CliFlagSpec>,
  flag: CliFlagSpec
): void {
  const prev = byLong.get(flag.long);
  if (!prev) {
    byLong.set(flag.long, flag);
    return;
  }
  if (prev.values && flag.values) {
    byLong.set(flag.long, {
      ...prev,
      values: mergeChoiceValues(prev.values, flag.values),
    });
  }
}

function collectUniqueCatalogFlags(): Map<string, CliFlagSpec> {
  const byLong = new Map<string, CliFlagSpec>();
  for (const spec of CLI_COMMAND_CATALOG) {
    for (const flag of spec.flags) {
      registerCatalogFlag(byLong, flag);
    }
  }
  for (const meta of CLI_GLOBAL_META_FLAGS) {
    registerCatalogFlag(byLong, meta);
  }
  return byLong;
}

function appendValueFlagAliases(target: CliFlagSpec[], flag: CliFlagSpec): void {
  target.push(flag);
  for (const alias of flag.aliases ?? []) {
    target.push({ long: alias, argLabel: flag.argLabel, desc: flag.desc });
  }
}

/** Collects deduplicated choice, value, and boolean flags directly from CLI_COMMAND_CATALOG. */
export function getCatalogCompletionFlags(): CompletionFlagBundle {
  const byLong = collectUniqueCatalogFlags();
  const choiceFlags: Array<
    CliFlagSpec & { readonly values: readonly string[]; readonly zshMeta: string }
  > = [];
  const valueFlags: CliFlagSpec[] = [];
  const booleanFlags: CliFlagSpec[] = [];

  for (const flag of byLong.values()) {
    if (flag.values && flag.values.length > 0 && flag.zshMeta) {
      choiceFlags.push({ ...flag, values: flag.values, zshMeta: flag.zshMeta });
    } else if (flag.argLabel) {
      appendValueFlagAliases(valueFlags, flag);
    } else {
      booleanFlags.push(flag);
    }
  }
  return { choiceFlags, valueFlags, booleanFlags };
}
