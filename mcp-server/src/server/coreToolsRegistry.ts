// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { reconcileAgentsGovernance } from '../cli/reconcile-agents.js';
import { resolveSafeProjectPath } from '../security/workspacePathValidator.js';
import type { GitHubFetcher } from '../services/github-fetcher.js';
import type { SurgicalMerger } from '../services/surgical-merger.js';
import { inspectAstBlastRadius } from '../tools/blast-radius.js';
import { bootstrapOrMerge11x } from '../tools/bootstrap-merge.js';
import { certify11xGate } from '../tools/certify-gate.js';
import { cleanWorkspace11x } from '../tools/clean-workspace.js';
import { runEphemeralQa } from '../tools/ephemeral-runner.js';
import { fetchBlueprintBundle } from '../tools/fetch-bundle.js';
import { initOrAppendAgentsMd } from '../tools/initOrAppendAgentsMd.js';
import { inspectProjectConfig } from '../tools/inspect-project.js';
import { proposeSkillEvolutionPr } from '../tools/propose-evolution-pr.js';
import { auditSecurityStigOwasp } from '../tools/security-auditor.js';
import { auditTestPyramidGaps } from '../tools/test-pyramid-auditor.js';
import {
  AuditSecurityInputSchema,
  AuditTestPyramidInputSchema,
  BlastRadiusInputSchema,
  BootstrapMergeInputSchema,
  CertifyGateInputSchema,
  CleanWorkspaceInputSchema,
  FetchBundleInputSchema,
  InitAgentsMdInputSchema,
  InspectProjectInputSchema,
  ProposeEvolutionPrInputSchema,
  ReconcileAgentsInputSchema,
  RunEphemeralQaInputSchema,
} from '../types.js';
import { getToolAnnotations, toJsonToolResult } from './toolResults.js';

export const CORE_REGISTERED_TOOL_NAMES = [
  'inspect_project_config',
  'fetch_blueprint_bundle',
  'bootstrap_or_merge_11x',
  'inspect_ast_blast_radius',
  'clean_workspace_11x',
  'audit_security_stig_owasp',
  'run_ephemeral_qa',
  'certify_11x_gate',
  'audit_test_pyramid_gaps',
  'init_or_append_agents_md',
  'propose_skill_evolution_pr',
  'reconcile_agents_governance',
] as const;

export function registerCoreAnalysisTools(
  server: McpServer,
  fetcher: GitHubFetcher,
  merger: SurgicalMerger
): void {
  server.registerTool(
    'inspect_project_config',
    {
      description:
        'Audits user project directory, detecting stacks, strict linter flags, missing 11X files, and QA 11X version/skill update availability.',
      inputSchema: InspectProjectInputSchema,
      annotations: getToolAnnotations('inspect_project_config'),
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(await inspectProjectConfig(safePath, undefined, { fetcher }));
    }
  );

  server.registerTool(
    'fetch_blueprint_bundle',
    {
      description:
        'Downloads on-demand blueprint templates and scripts for the requested stack with SHA-256 validation.',
      inputSchema: FetchBundleInputSchema,
      annotations: getToolAnnotations('fetch_blueprint_bundle'),
    },
    async (args) =>
      toJsonToolResult(
        await fetchBlueprintBundle(
          args.stack,
          args.include_common_and_agents,
          fetcher,
          args.include_content
        )
      )
  );

  server.registerTool(
    'bootstrap_or_merge_11x',
    {
      description:
        'Surgically injects or merges 11X quality standard templates without altering existing production dependencies or code (dry_run default true).',
      inputSchema: BootstrapMergeInputSchema,
      annotations: getToolAnnotations('bootstrap_or_merge_11x'),
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await bootstrapOrMerge11x(safePath, args.stack, args.dry_run, {
          fetcher,
          merger,
          createBackup: args.create_backup,
        })
      );
    }
  );

  server.registerTool(
    'inspect_ast_blast_radius',
    {
      description:
        'Queries the AST knowledge graph (graphify-out/graph.json) for code/architecture Q&A and pre-refactoring blast-radius analysis.',
      inputSchema: BlastRadiusInputSchema,
      annotations: getToolAnnotations('inspect_ast_blast_radius'),
    },
    async (args, extra) => {
      const targetSymbol = args.target_symbol ?? '';
      const hasScope =
        args.changed_since_ref !== undefined || args.include_git_signals === true;
      if (!targetSymbol.trim() && !hasScope) {
        throw new Error(
          'Se requiere target_symbol (o changed_since_ref / include_git_signals).'
        );
      }
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await inspectAstBlastRadius(safePath, targetSymbol, args.max_items, {
          autoBuildIfMissing: args.auto_build_if_missing,
          refreshGraph: args.refresh_graph,
          changedSinceRef: args.changed_since_ref,
          maxTokensBudget: args.max_tokens_budget,
          includeGitSignals: args.include_git_signals,
          signal: extra.signal,
        })
      );
    }
  );

  server.registerTool(
    'clean_workspace_11x',
    {
      description:
        'Audits or executes workspace sanitation, removing transient test artifacts, Docker cache residues, workspace status=restarting CrashLoop containers (found_containers/removed_containers), and orphan Compose networks (dry_run default).',
      inputSchema: CleanWorkspaceInputSchema,
      annotations: getToolAnnotations('clean_workspace_11x'),
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await cleanWorkspace11x(safePath, args.dry_run, args.deep_prune)
      );
    }
  );

  server.registerTool(
    'audit_security_stig_owasp',
    {
      description:
        'Statically audits project source code against 22 DISA ASD STIG V6R5 / OWASP v4.2 reference controls + 37 static scanner rules covering Anti-Silo QA/Healthcheck/TTY/CI/Contract/Docker/Loop-Containment/Playwright/SSR/Stryker/WS-PubSub/UI patterns (including QA-HEALTH-01, QA-CLI-TTY-01, QA-DOCKER-TTY-01, QA-DOCKER-LOOP-01, QA-CI-ESCAPE-01, QA-MAKE-CURDIR-01, QA-CONTRACT-SDK-01, QA-DOCKER-LOCK-01, QA-PLAYWRIGHT-PIN-01, QA-SSR-HYDRATION-01, QA-STRYKER-CFG-01, SEC-WS-PUBSUB-01, and UI-11X-01..03).',
      inputSchema: AuditSecurityInputSchema,
      annotations: getToolAnnotations('audit_security_stig_owasp'),
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await auditSecurityStigOwasp(safePath, {
          maxFindings: args.max_findings,
          includeExamples: args.include_examples,
          ingestExternalSarif: args.ingest_external_sarif,
        })
      );
    }
  );
}

export function registerQaGovernanceTools(server: McpServer, fetcher: GitHubFetcher): void {
  server.registerTool(
    'run_ephemeral_qa',
    {
      description:
        'Safely runs a Makefile QA target (lint, unit, bdd, e2e, perf, chaos, profile, all) inside ephemeral Docker containers (Rule Zero) with atomic cross-process FIFO slot serialization (QA_MAX_CONCURRENT_CONTAINERS=1, COMPOSE_PARALLEL_LIMIT=1), passive Linux RAM/thermal guards (exit_code=75 exempt from BREAKER-42), TDD RED-phase verification (expect_red), pre-flight CrashLoop detection/remediation, guaranteed Compose teardown on timeout/abort, and token-saving log parsers.',
      inputSchema: RunEphemeralQaInputSchema,
      annotations: getToolAnnotations('run_ephemeral_qa'),
    },
    async (args, extra) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await runEphemeralQa(safePath, args.stage, args.timeout_seconds, {
          skipIfDocsOnly: args.skip_if_docs_only,
          expectRed: args.expect_red,
          signal: extra.signal,
        })
      );
    }
  );

  server.registerTool(
    'certify_11x_gate',
    {
      description:
        'Executes 11X certification gates (secrets, JSON, orphan UI/API, ORM parity, fresh lint+unit evidence, STIG + external SARIF audit, docs) and checks version/skill update status before local git commit.',
      inputSchema: CertifyGateInputSchema,
      annotations: getToolAnnotations('certify_11x_gate'),
    },
    async (args, extra) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await certify11xGate(safePath, {
          requireLintEvidence: args.require_lint_evidence,
          requireUnitEvidence: args.require_unit_evidence,
          strict: args.strict,
          allowUnmergedExamples: args.allow_unmerged_examples,
          updateOptions: { fetcher },
          signal: extra.signal,
        })
      );
    }
  );

  server.registerTool(
    'audit_test_pyramid_gaps',
    {
      description:
        'Audits existing project against the 13 layers of the 11X pyramid, reporting uncovered files/endpoints and a prioritized rescue plan.',
      inputSchema: AuditTestPyramidInputSchema,
      annotations: getToolAnnotations('audit_test_pyramid_gaps'),
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(await auditTestPyramidGaps(safePath, args.stack, args.max_items));
    }
  );

  server.registerTool(
    'init_or_append_agents_md',
    {
      description:
        'Creates AGENTS.md or additively injects the QA 11X connector block with dynamic language policy without overwriting existing content.',
      inputSchema: InitAgentsMdInputSchema,
      annotations: getToolAnnotations('init_or_append_agents_md'),
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await initOrAppendAgentsMd({
          projectPath: safePath,
          dryRun: Boolean(args.dry_run),
          lang: args.lang,
          agents: args.agents,
        })
      );
    }
  );

  server.registerTool(
    'propose_skill_evolution_pr',
    {
      description:
        'Proposes a Dual-Consumer improvement (AI skill/rule + MCP executable gate + human manual in docs/) to qa-testing-blueprints via gh CLI or pre-filled GitHub URL.',
      inputSchema: ProposeEvolutionPrInputSchema,
      annotations: getToolAnnotations('propose_skill_evolution_pr'),
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(await proposeSkillEvolutionPr({ ...args, project_path: safePath }));
    }
  );

  server.registerTool(
    'reconcile_agents_governance',
    {
      description:
        'Reconciles .agents/ governance rules in consumer projects: creates backup, prunes promoted duplicates, and extracts domain rules (dry_run default true).',
      inputSchema: ReconcileAgentsInputSchema,
      annotations: getToolAnnotations('reconcile_agents_governance'),
    },
    async (args) => {
      const safePath = resolveSafeProjectPath(args.project_path);
      return toJsonToolResult(
        await reconcileAgentsGovernance({
          projectPath: safePath,
          dryRun: args.dry_run,
          pruneBridges: args.prune_bridges,
        })
      );
    }
  );
}
