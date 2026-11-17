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
  const cleaned = rawFile.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  return cleaned.length > 0 ? cleaned : '.';
}

function buildSarifRules(
  findings: readonly SarifFindingInput[]
): Record<string, unknown>[] {
  const seen = new Map<string, Record<string, unknown>>();
  for (const item of findings) {
    if (seen.has(item.ruleId)) {
      continue;
    }
    const helpText = item.remediation
      ? redactPiiAndSecrets(item.remediation)
      : redactPiiAndSecrets(item.message);
    seen.set(item.ruleId, {
      id: item.ruleId,
      shortDescription: { text: item.ruleId },
      help: { text: helpText },
      defaultConfiguration: { level: severityToSarifLevel(item.severity) },
    });
  }
  return Array.from(seen.values());
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
