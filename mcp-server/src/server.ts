// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BlueprintResources } from './resources/blueprint-resources.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from './services/github-fetcher.js';
import { SurgicalMerger } from './services/surgical-merger.js';
import { inspectProjectConfig } from './tools/inspect-project.js';
import { fetchBlueprintBundle } from './tools/fetch-bundle.js';
import { bootstrapOrMerge11x } from './tools/bootstrap-merge.js';
import { inspectAstBlastRadius } from './tools/blast-radius.js';
import { cleanWorkspace11x } from './tools/clean-workspace.js';
import { auditSecurityStigOwasp } from './tools/security-auditor.js';
import { runEphemeralQa } from './tools/ephemeral-runner.js';
import { certify11xGate } from './tools/certify-gate.js';
import { auditTestPyramidGaps } from './tools/test-pyramid-auditor.js';
import { initOrAppendAgentsMd } from './cli/init-agents-md.js';
import { proposeSkillEvolutionPr } from './tools/propose-evolution-pr.js';
import { reconcileAgentsGovernance } from './cli/reconcile-agents.js';
import {
  InspectProjectInputSchema,
  FetchBundleInputSchema,
  BootstrapMergeInputSchema,
  BlastRadiusInputSchema,
  CleanWorkspaceInputSchema,
  AuditSecurityInputSchema,
  RunEphemeralQaInputSchema,
  CertifyGateInputSchema,
  AuditTestPyramidInputSchema,
  InitAgentsMdInputSchema,
  ProposeEvolutionPrInputSchema,
  ReconcileAgentsInputSchema,
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
    version: MCP_SERVER_VERSION,
  });

  const MARKDOWN_MIME_TYPE = 'text/markdown';

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
      mimeType: MARKDOWN_MIME_TYPE,
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
      mimeType: MARKDOWN_MIME_TYPE,
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

  // 3b. Blueprint táctico PostgreSQL 17 RLS Multi-Transacción (after_begin) y Auditoría WORM Determinista (seq_num + pg_advisory_xact_lock)
  server.resource(
    'blueprint-postgres-rls-worm',
    'blueprint://database/postgres-rls-worm',
    {
      description:
        'Guía e implementación canónica de PostgreSQL 17 RLS Multi-Transacción (after_begin en AsyncSession, rol NOSUPERUSER NOBYPASSRLS, funciones SECURITY DEFINER) y serialización determinista de cadenas forenses WORM (seq_num BIGINT + pg_advisory_xact_lock).',
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri) => {
      const res = await resources.getPostgresRlsWormResource();
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
      mimeType: MARKDOWN_MIME_TYPE,
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
      mimeType: MARKDOWN_MIME_TYPE,
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
      mimeType: MARKDOWN_MIME_TYPE,
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

  // 7. Script canónico de limpieza y saneamiento (blueprint://core/cleanup-script)
  server.resource(
    'blueprint-cleanup-script',
    'blueprint://core/cleanup-script',
    {
      description: 'Script canónico de limpieza y saneamiento (limpieza.sh) con fallback Alpine para eliminar residuos de Docker (UID 0 / root) sin requerir sudo.',
      mimeType: 'text/x-shellscript',
    },
    async (uri) => {
      const res = await resources.getCleanupScriptResource();
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

  // 8. Validador canónico de consistencia de ROADMAP y ACTIVE_TASK (blueprint://core/roadmap-validator)
  server.resource(
    'blueprint-roadmap-validator',
    'blueprint://core/roadmap-validator',
    {
      description: 'Validador canónico de consistencia (.agents/scripts/verify_roadmap_consistency.py) para auditar la coherencia bidireccional entre ROADMAP.md y ACTIVE_TASK.md.',
      mimeType: 'text/x-python',
    },
    async (uri) => {
      const res = await resources.getRoadmapValidatorResource();
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
  // 🛠️ Registro de Herramientas MCP (Tools 1 a 12)
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
            text: JSON.stringify(result),
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
      const result = await fetchBlueprintBundle(
        args.stack,
        args.include_common_and_agents,
        fetcher,
        args.include_content ?? false
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
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
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  // Tool 4: inspect_ast_blast_radius
  server.tool(
    'inspect_ast_blast_radius',
    'Consulta el grafo AST (graphify-out/graph.json) tanto para responder preguntas sobre código/arquitectura (ubicación exacta, quién llama al símbolo y a quién invoca) como para calcular el radio de impacto antes de refactorizar.',
    BlastRadiusInputSchema.shape,
    async (args) => {
      const result = await inspectAstBlastRadius(
        args.project_path,
        args.target_symbol,
        args.max_items,
        {
          autoBuildIfMissing: args.auto_build_if_missing,
          refreshGraph: args.refresh_graph,
        }
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  // Tool 5: clean_workspace_11x
  server.tool(
    'clean_workspace_11x',
    'Audita o ejecuta la limpieza y saneamiento del espacio de trabajo eliminando artefactos temporales de pruebas y cachés de Docker (modo dry_run por defecto).',
    CleanWorkspaceInputSchema.shape,
    async (args) => {
      const result = await cleanWorkspace11x(
        args.project_path,
        args.dry_run ?? true,
        args.deep_prune ?? false
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  // Tool 6: audit_security_stig_owasp
  server.tool(
    'audit_security_stig_owasp',
    'Audita estáticamente el código fuente del proyecto destino frente a los 22 patrones DISA ASD STIG V6R5 y OWASP v4.2.',
    AuditSecurityInputSchema.shape,
    async (args) => {
      const result = await auditSecurityStigOwasp(args.project_path, args.max_findings);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  // Tool 7: run_ephemeral_qa
  server.tool(
    'run_ephemeral_qa',
    'Ejecuta de forma segura e inyectable un target de pruebas del Makefile dentro de contenedores Docker efímeros (Rule Zero) y resume la salida con parsers ahorradores de tokens.',
    RunEphemeralQaInputSchema.shape,
    async (args) => {
      const result = await runEphemeralQa(
        args.project_path,
        args.stage,
        args.timeout_seconds,
        { skipIfDocsOnly: args.skip_if_docs_only }
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  // Tool 8: certify_11x_gate
  server.tool(
    'certify_11x_gate',
    'Ejecuta las validaciones de cierre del estándar 11X (ejemplos, secretos, JSON, huérfanos UI/API, ORM, evidencia lint pre-push, auditoría STIG y documentación) y verifica si está listo para commit.',
    CertifyGateInputSchema.shape,
    async (args) => {
      const result = await certify11xGate(args.project_path, {
        requireLintEvidence: args.require_lint_evidence,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  // Tool 9: audit_test_pyramid_gaps
  server.tool(
    'audit_test_pyramid_gaps',
    'Audita un proyecto existente frente a las 13 capas de la pirámide 11X, identificando capas faltantes, archivos sin tests unitarios, endpoints sin escenarios Karate API, vistas sin BDD/E2E y un plan de rescate priorizado.',
    AuditTestPyramidInputSchema.shape,
    async (args) => {
      const result = await auditTestPyramidGaps(
        args.project_path,
        args.stack,
        args.max_items
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  // Tool 10: init_or_append_agents_md
  server.tool(
    'init_or_append_agents_md',
    'Crea el archivo AGENTS.md si no existe, o añade de forma aditiva y no destructiva el bloque conector de QA 11X (MCP y Skill) al final de un AGENTS.md existente sin borrar contenido previo.',
    InitAgentsMdInputSchema.shape,
    async (args) => {
      const result = await initOrAppendAgentsMd({
        projectPath: args.project_path,
        dryRun: Boolean(args.dry_run),
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  // Tool 11: propose_skill_evolution_pr
  server.tool(
    'propose_skill_evolution_pr',
    'Propone una mejora o caso borde a qa-testing-blueprints creando un PR vía gh CLI local autenticado o generando un archivo de propuesta local y URL prellenada de GitHub (Zero-Trust, 0 tokens empaquetados).',
    ProposeEvolutionPrInputSchema.shape,
    async (args) => {
      const result = await proposeSkillEvolutionPr(args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  // Tool 12: reconcile_agents_governance
  server.tool(
    'reconcile_agents_governance',
    'Reconcilia la gobernanza en .agents/ para proyectos consumidores: respalda en .agents/backups/, poda directivas duplicadas ya promovidas a qa-testing-blueprints y extrae limpiamente reglas de negocio hacia domain_<project>_rules.md.',
    ReconcileAgentsInputSchema.shape,
    async (args) => {
      const result = await reconcileAgentsGovernance({
        projectPath: args.project_path,
        dryRun: args.dry_run,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  return server;
}
