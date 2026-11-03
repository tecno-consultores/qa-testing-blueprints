// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BlueprintResources } from './resources/blueprint-resources.js';
import { GitHubFetcher } from './services/github-fetcher.js';
import { SurgicalMerger } from './services/surgical-merger.js';
import { inspectProjectConfig } from './tools/inspect-project.js';
import { fetchBlueprintBundle } from './tools/fetch-bundle.js';
import { bootstrapOrMerge11x } from './tools/bootstrap-merge.js';
import { inspectAstBlastRadius } from './tools/blast-radius.js';
import {
  InspectProjectInputSchema,
  FetchBundleInputSchema,
  BootstrapMergeInputSchema,
  BlastRadiusInputSchema,
} from './types.js';

export function createMcpServer(options?: {
  fetcher?: GitHubFetcher;
  merger?: SurgicalMerger;
}): McpServer {
  const fetcher = options?.fetcher || new GitHubFetcher();
  const merger = options?.merger || new SurgicalMerger();
  const resources = new BlueprintResources(fetcher);

  const server = new McpServer({
    name: '@sinfallas/mcp-qa-11x',
    version: '2.7.0',
  });

  // ============================================================================
  // 📚 Registro de Recursos MCP (blueprint://*)
  // ============================================================================

  // 1. Manifiesto criptográfico remoto / local
  server.resource(
    'blueprint-manifest',
    'blueprint://manifest',
    {
      description: 'Manifiesto criptográfico JSON con los hashes SHA-256 de todos los stacks y archivos.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const res = await resources.getManifestResource();
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
  );

  // 2. Filosofía y 13 capas de calidad
  server.resource(
    'blueprint-philosophy',
    'blueprint://core/philosophy',
    {
      description: 'Filosofía y reglas de calidad Nivel 11X (13 capas y Rule Zero).',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const res = await resources.getPhilosophyResource();
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
  );

  // 3. Catálogo de los 22 patrones DISA ASD STIG V6R5 y OWASP v4.2
  server.resource(
    'blueprint-security',
    'blueprint://security/disa-owasp-22',
    {
      description: 'Catálogo de los 22 patrones canónicos de seguridad por diseño.',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const res = await resources.getSecurityResource();
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
  );

  // 4. Guía operativa por stack (blueprint://{stack}/readme)
  server.resource(
    'blueprint-stack-readme',
    new ResourceTemplate('blueprint://{stack}/readme', { list: undefined }),
    {
      description: 'Guía operativa de testing y QA para el stack solicitado.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const stack = String(variables.stack);
      const res = await resources.getStackReadmeResource(stack);
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
  );

  // 5. Reglas de Refactoring UI (blueprint://ui/refactoring-ui/{topic})
  server.resource(
    'blueprint-refactoring-ui',
    new ResourceTemplate('blueprint://ui/refactoring-ui/{topic}', { list: undefined }),
    {
      description: 'Reglas de diseño táctico y accesibilidad WCAG 2.1 AA de Refactoring UI.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const topic = String(variables.topic);
      const res = await resources.getRefactoringUiResource(topic);
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
  );

  // 6. Plantilla canónica de bitácora en caliente (.agents/ACTIVE_TASK.md.example)
  server.resource(
    'blueprint-active-task-template',
    'blueprint://core/active-task-template',
    {
      description: 'Plantilla canónica de bitácora en caliente (.agents/ACTIVE_TASK.md.example) para resiliencia ante caídas de sesión o IDE.',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const res = await resources.getActiveTaskTemplateResource();
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
  );

  // ============================================================================
  // 🛠️ Registro de Herramientas MCP (Tools 1 a 4)
  // ============================================================================

  // Tool 1: inspect_project_config
  server.tool(
    'inspect_project_config',
    'Audita el directorio del proyecto del usuario detectando el stack, configuraciones estrictas y qué archivos del estándar 11X faltan.',
    InspectProjectInputSchema.shape,
    async (args) => {
      const result = await inspectProjectConfig(args.project_path);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // Tool 2: fetch_blueprint_bundle
  server.tool(
    'fetch_blueprint_bundle',
    'Descarga bajo demanda desde GitHub (con verificación SHA-256) las plantillas .example y scripts del stack solicitado.',
    FetchBundleInputSchema.shape,
    async (args) => {
      const result = await fetchBlueprintBundle(args.stack, args.include_common_and_agents, fetcher);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // Tool 3: bootstrap_or_merge_11x
  server.tool(
    'bootstrap_or_merge_11x',
    'Inyecta o fusiona quirúrgicamente las plantillas del estándar 11X sin alterar dependencias de producción ni scripts de negocio preexistentes.',
    BootstrapMergeInputSchema.shape,
    async (args) => {
      const result = await bootstrapOrMerge11x(
        args.project_path,
        args.stack,
        args.dry_run,
        fetcher,
        merger
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // Tool 4: inspect_ast_blast_radius
  server.tool(
    'inspect_ast_blast_radius',
    'Calcula el radio de impacto y archivos dependientes antes de refactorizar un símbolo, función o módulo.',
    BlastRadiusInputSchema.shape,
    async (args) => {
      const result = await inspectAstBlastRadius(args.project_path, args.target_symbol);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  return server;
}
