<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores) -->

# Changelog — `@sinfallas/mcp-qa-11x`

All notable changes to the `@sinfallas/mcp-qa-11x` npm package and MCP server are documented in this file.

## [2.21.0] - 2026-11-14

### Added
- **Consolidated 18-Tool & 12-Resource Public MCP Surface:** Exposed the 6 v2.0 tools (`validate_calm_architecture`, `evaluate_release_gate`, `evaluate_agent_trajectory`, `run_llm_red_team`, `audit_vibe_prototype`, `sync_enterprise_tms`) and 3 new resources (`blueprint://ai/evals-redteam`, `blueprint://mobile-appium/readme`, `blueprint://vibe-rescue/readme`) alongside all 12 v1 tools and 9 v1 resource entries (`blueprint://{stack}/readme` + `blueprint://ui/refactoring-ui/{topic}` templates explicitly listed).
- **30-Second CLI Onboarding (`quickstart`):** Wired `npx -y @sinfallas/mcp-qa-11x@latest quickstart` in `src/index.ts` and `src/cli.ts` with progressive adoption tiers (`starter`, `standard`, `enterprise`), stack auto-detection, `--json`, and `--dry-run`.
- **End-to-End Runtime Protection:** Wrapped all MCP tool calls inside `attachPromptGuard` with `promptGuard` (`NFKC`, Trojan Source / prompt-injection blocking, `QA-GIT-GATE-01` bypass prevention, PII/secret redaction) and `TaskStateGuard` + `formatFailVerboseReport` (`Fail-Verbose` telemetry without leaking credentials).
- **Clean-Room Tarball E2E Verifier (`example/verify-v2.sh`):** Added clean-room `npm pack` + isolated `/tmp` installation verifier certifying `--version`, `--help`, `quickstart`, TTY non-blocking exit (`QA-CLI-TTY-01`), all 18 tools, all 12 resources, and v1/v2 parity outside the monorepo.
- **GEO & Global AI Skill Catalogs (`llms.txt` & `catalogs/*`):** Added repository `llms.txt` and canonical manifests for QASkills.sh, SkillsLLM.com, and AgenticSkills.io synchronized with SHA-256 checksums (`manifest.json`).

### Changed
- **Package & Agent Card Version (`2.20.3` -> `2.21.0`):** Standardized `@sinfallas/mcp-qa-11x` SemVer minor release (`2.21.0`) across `package.json`, A2A agent card descriptor (`src/a2a/agentCard.ts`), Allure diagnostic metadata (`src/utils/diagnosticFormatter.ts`), TMS CLI user-agent (`src/integrations/tmsSyncCli.ts`), and published tarball `files` (`dist/**/*`, `README.md`, `CHANGELOG.md`).

### Preserved
- **100% v1 Compatibility:** Retained all 12 v1 tools, 9 v1 resource templates/static URIs, `install-skill` (`install`), `init-agents` (`init-agents-md`), `reconcile-agents`, `--stdio`, and `QA-CLI-TTY-01` `< 5s` non-hanging interactive terminal exit.

## [2.20.3] - 2026-11-12

- Interactive terminal guard (`QA-CLI-TTY-01` on `process.stdin.isTTY`), `--stdio` flag, `install` alias, `reconcile-agents`, and 12-tool / 9-resource stdio baseline verified in `example/run-example-e2e.mjs`.
