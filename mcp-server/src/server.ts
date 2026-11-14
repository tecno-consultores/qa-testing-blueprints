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
      description: 'JSON cryptographic manifest with SHA-256 hashes of all stacks and files.',
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
      description: 'Level-11X quality philosophy, 13 pyramid layers, and Rule Zero.',
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
      description: 'Catalog of 22 canonical security-by-design patterns (DISA ASD STIG V6R5 & OWASP v4.2).',
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
        'Guide and reference implementation for PostgreSQL 17 Multi-Transaction RLS (after_begin) and deterministic WORM audit serialization (seq_num BIGINT + pg_advisory_xact_lock).',
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
      description: 'Operational testing and QA guide for the requested stack.',
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
      description: 'Tactical UI design and WCAG 2.1 AA accessibility rules from Refactoring UI.',
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
      description: 'Canonical active task diary template (.agents/ACTIVE_TASK.md.example) for session crash resilience.',
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
      description: 'Canonical cleanup script (limpieza.sh) with Alpine fallback to safely purge Docker root artifacts without sudo.',
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
      description: 'Canonical roadmap consistency validator (.agents/scripts/verify_roadmap_consistency.py) auditing ROADMAP.md and ACTIVE_TASK.md.',
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
    'Audits user project directory, detecting stacks, strict linter flags, missing 11X files, and QA 11X version/skill update availability.',
    InspectProjectInputSchema.shape,
    async (args) => {
      const result = await inspectProjectConfig(args.project_path, undefined, { fetcher });
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
    'Downloads on-demand blueprint templates and scripts for the requested stack with SHA-256 validation.',
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
    'Surgically injects or merges 11X quality standard templates without altering existing production dependencies or code.',
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
    'Queries the AST knowledge graph (graphify-out/graph.json) for code/architecture Q&A and pre-refactoring blast-radius analysis.',
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
    'Audits or executes workspace sanitation, removing transient test artifacts and Docker cache residues (dry_run default).',
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
    'Statically audits project source code against the 22 DISA ASD STIG V6R5, OWASP v4.2, and Anti-Silo QA/Healthcheck/TTY patterns (including QA-HEALTH-01 and QA-CLI-TTY-01).',
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
    'Safely runs a Makefile QA target inside ephemeral Docker containers (Rule Zero), parsing logs for extreme token economy.',
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
    'Executes 11X certification gates (secrets, JSON, orphan UI/API, ORM parity, lint evidence, STIG audit, docs) and checks version/skill update status before git push.',
    CertifyGateInputSchema.shape,
    async (args) => {
      const result = await certify11xGate(args.project_path, {
        requireLintEvidence: args.require_lint_evidence,
        updateOptions: { fetcher },
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
    'Audits existing project against the 13 layers of the 11X pyramid, reporting uncovered files/endpoints and a prioritized rescue plan.',
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
    'Creates AGENTS.md or additively injects the QA 11X connector block with dynamic language policy without overwriting existing content.',
    InitAgentsMdInputSchema.shape,
    async (args) => {
      const result = await initOrAppendAgentsMd({
        projectPath: args.project_path,
        dryRun: Boolean(args.dry_run),
        lang: args.lang,
        agents: args.agents,
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
    'Proposes a Dual-Consumer improvement (AI skill/rule + MCP executable gate + human manual in docs/) to qa-testing-blueprints via gh CLI or pre-filled GitHub URL.',
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
    'Reconciles .agents/ governance rules in consumer projects: creates backup, prunes promoted duplicates, and extracts domain rules.',
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
