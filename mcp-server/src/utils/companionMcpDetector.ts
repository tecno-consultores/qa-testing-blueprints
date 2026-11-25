// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import { resolveSafeChildPath, resolveSafeHomeDir } from '../services/github-fetcher.js';
import type { CompanionMcpCapabilitySummary, CompanionMcpDiscoverySummary } from '../types.js';
import { reportDebugCatchError } from './diagnosticFormatter.js';
import { getDoctorIdeMcpTargets, type IdeMcpTargetSpec } from './ideConfigPaths.js';

interface CapabilityRuleSpec {
  readonly category: CompanionMcpCapabilitySummary['category'];
  readonly serverMatchers: ReadonlyArray<{ readonly id: string; readonly tokens: readonly string[] }>;
  readonly delegationDirective: string;
}

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const UTF8_ENCODING = 'utf-8';

const CAPABILITY_RULES: readonly CapabilityRuleSpec[] = [
  {
    category: 'browser_live',
    serverMatchers: [
      { id: 'playwright', tokens: ['@playwright/mcp', 'playwright-mcp', 'playwright'] },
      { id: 'chrome-devtools', tokens: ['chrome-devtools-mcp', 'chrome-devtools'] },
    ],
    delegationDirective:
      'Browser MCP detectado: delega inspección DOM viva, consola, red y capturas al Browser MCP; conserva qa-11x para contratos E2E Screenplay/axe-core en Docker.',
  },
  {
    category: 'sast_taint',
    serverMatchers: [
      { id: 'semgrep', tokens: ['semgrep-mcp', 'semgrep/mcp', 'semgrep'] },
      { id: 'sonarqube', tokens: ['sonarqube-mcp', 'sonarqube', 'sonarcloud'] },
      { id: 'snyk', tokens: ['snyk-mcp', 'snyk'] },
    ],
    delegationDirective:
      'SAST MCP detectado: delega taint analysis inter-archivo al SAST MCP y conserva audit_security_stig_owasp para las 37 invariantes 11X STIG/RLS/Docker.',
  },
  {
    category: 'sca_container',
    serverMatchers: [{ id: 'trivy', tokens: ['trivy-mcp', 'aquasec/trivy', 'trivy'] }],
    delegationDirective:
      'Trivy MCP detectado: delega escaneo SCA/IaC/CVE a Trivy MCP o exporta SARIF en .agents/.cache/sarif/trivy.sarif para bloqueo en certify_11x_gate.',
  },
  {
    category: 'lsp_symbolic',
    serverMatchers: [{ id: 'serena', tokens: ['serena-mcp', 'oraios/serena', 'serena'] }],
    delegationDirective:
      'Serena MCP detectado: delega edición simbólica LSP exacta a Serena MCP y conserva inspect_ast_blast_radius para triage multi-salto y topología.',
  },
  {
    category: 'mobile_live',
    serverMatchers: [{ id: 'appium', tokens: ['appium-mcp', 'appium'] }],
    delegationDirective:
      'Appium MCP detectado: delega exploración viva de sesiones móviles a Appium MCP y conserva el blueprint mobile-appium en Docker para CI.',
  },
];

function stripHashComments(raw: string, filePath: string): string {
  const lower = filePath.toLowerCase();
  if (!lower.endsWith('.toml') && !lower.endsWith('.yaml') && !lower.endsWith('.yml')) {
    return raw;
  }
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const hashIdx = line.indexOf('#');
      return hashIdx === -1 ? line : line.slice(0, hashIdx);
    })
    .join('\n');
}

function readNormalizedConfigSafe(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) {
      return null;
    }
    const raw = fs.readFileSync(filePath, UTF8_ENCODING);
    return stripHashComments(raw, filePath).toLowerCase();
  } catch (err: unknown) {
    reportDebugCatchError(`companionMcpDetector.readNormalizedConfigSafe(${filePath})`, err);
    return null;
  }
}

interface LoadedIdeConfig {
  readonly path: string;
  readonly lowerContent: string;
}

function loadIdeConfigs(homeDir: string, targets: readonly IdeMcpTargetSpec[]): LoadedIdeConfig[] {
  const loaded: LoadedIdeConfig[] = [];
  for (const target of targets) {
    for (const relPath of target.relPaths) {
      const fullPath = resolveSafeChildPath(homeDir, relPath);
      const lowerContent = readNormalizedConfigSafe(fullPath);
      if (lowerContent !== null) {
        loaded.push({ path: fullPath, lowerContent });
      }
    }
  }
  return loaded;
}

function evaluateCapability(
  spec: CapabilityRuleSpec,
  configs: readonly LoadedIdeConfig[]
): CompanionMcpCapabilitySummary {
  const matchedServers = new Set<string>();
  const configFiles = new Set<string>();

  for (const cfg of configs) {
    for (const matcher of spec.serverMatchers) {
      if (matcher.tokens.some((tok) => cfg.lowerContent.includes(tok))) {
        matchedServers.add(matcher.id);
        configFiles.add(cfg.path);
      }
    }
  }

  return {
    category: spec.category,
    detected: matchedServers.size > 0,
    matched_servers: Array.from(matchedServers).sort((a, b) => a.localeCompare(b)),
    config_files: Array.from(configFiles).sort((a, b) => a.localeCompare(b)),
    delegation_directive: spec.delegationDirective,
  };
}

/**
 * Safely detects installed Companion MCP servers across canonical IDE config files
 * (JSON/TOML/YAML, ignoring `#` comments) without exposing raw secrets or env vars.
 */
export function detectCompanionMcps(
  homeDir?: string,
  platform: NodeJS.Platform = process.platform
): CompanionMcpDiscoverySummary {
  const baseHome = resolveSafeHomeDir(homeDir);
  const configs = loadIdeConfigs(baseHome, getDoctorIdeMcpTargets(platform));
  const capabilities = CAPABILITY_RULES.map((spec) => evaluateCapability(spec, configs));
  const delegationDirectives = capabilities
    .filter((item) => item.detected)
    .map((item) => item.delegation_directive);

  return {
    detected_any: delegationDirectives.length > 0,
    capabilities,
    delegation_directives: delegationDirectives,
  };
}
