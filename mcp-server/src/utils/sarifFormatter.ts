// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { redactPiiAndSecrets } from '../security/promptGuard.js';
import { MCP_SERVER_VERSION } from '../services/github-fetcher.js';

export type SarifSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type SarifLevel = 'error' | 'warning' | 'note';

export interface SarifFindingInput {
  readonly ruleId: string;
  readonly severity: SarifSeverity;
  readonly message: string;
  readonly file: string;
  readonly line?: number;
  readonly remediation?: string;
}

export interface BuildSarifOptions {
  readonly toolName?: string;
  readonly toolVersion?: string;
  readonly informationUri?: string;
}

const SARIF_SCHEMA_URI = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_VERSION = '2.1.0';
const DEFAULT_TOOL_NAME = '@sinfallas/mcp-qa-11x';
const DEFAULT_INFO_URI = 'https://github.com/tecno-consultores/qa-testing-blueprints';

const SEVERITY_TO_LEVEL: Readonly<Record<SarifSeverity, SarifLevel>> = {
  CRITICAL: 'error',
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'note',
  INFO: 'note',
};

export function severityToSarifLevel(severity: SarifSeverity): SarifLevel {
  return SEVERITY_TO_LEVEL[severity];
}

function normalizeArtifactUri(rawFile: string): string {
  let cleaned = rawFile.replace(/\\/g, '/').trim();
  while (cleaned.startsWith('./')) {
    cleaned = cleaned.slice(2);
  }
  if (cleaned.length === 0) {
    return '.';
  }
  return cleaned
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

interface MutableSarifRule {
  readonly rule: Record<string, unknown>;
  hasExplicitRemediation: boolean;
  highestLevel: SarifLevel;
}

const SARIF_LEVEL_RANK: Readonly<Record<SarifLevel, number>> = {
  note: 0,
  warning: 1,
  error: 2,
};

function buildSarifRules(
  findings: readonly SarifFindingInput[]
): Record<string, unknown>[] {
  const seen = new Map<string, MutableSarifRule>();
  for (const item of findings) {
    const level = severityToSarifLevel(item.severity);
    const existing = seen.get(item.ruleId);
    if (existing) {
      if (!existing.hasExplicitRemediation && item.remediation) {
        existing.rule.help = { text: redactPiiAndSecrets(item.remediation) };
        existing.hasExplicitRemediation = true;
      }
      if (SARIF_LEVEL_RANK[level] > SARIF_LEVEL_RANK[existing.highestLevel]) {
        existing.rule.defaultConfiguration = { level };
        existing.highestLevel = level;
      }
      continue;
    }
    const helpText = item.remediation
      ? redactPiiAndSecrets(item.remediation)
      : redactPiiAndSecrets(item.message);
    seen.set(item.ruleId, {
      hasExplicitRemediation: Boolean(item.remediation),
      highestLevel: level,
      rule: {
        id: item.ruleId,
        shortDescription: { text: item.ruleId },
        help: { text: helpText },
        defaultConfiguration: { level },
      },
    });
  }
  return Array.from(seen.values(), (entry) => entry.rule);
}

function buildSarifResultEntry(item: SarifFindingInput): Record<string, unknown> {
  const safeLine =
    typeof item.line === 'number' && Number.isFinite(item.line) && item.line >= 1
      ? Math.trunc(item.line)
      : 1;
  return {
    ruleId: item.ruleId,
    level: severityToSarifLevel(item.severity),
    message: { text: redactPiiAndSecrets(item.message) },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: normalizeArtifactUri(item.file) },
          region: { startLine: safeLine },
        },
      },
    ],
    properties: {
      severity: item.severity,
      ...(item.remediation ? { remediation: redactPiiAndSecrets(item.remediation) } : {}),
    },
  };
}

export function buildSarifLog(
  findings: readonly SarifFindingInput[],
  options: BuildSarifOptions = {}
): Record<string, unknown> {
  const toolName = options.toolName ?? DEFAULT_TOOL_NAME;
  const toolVersion = options.toolVersion ?? MCP_SERVER_VERSION;
  const informationUri = options.informationUri ?? DEFAULT_INFO_URI;

  return {
    $schema: SARIF_SCHEMA_URI,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: toolName,
            version: toolVersion,
            informationUri,
            rules: buildSarifRules(findings),
          },
        },
        results: findings.map(buildSarifResultEntry),
      },
    ],
  };
}
