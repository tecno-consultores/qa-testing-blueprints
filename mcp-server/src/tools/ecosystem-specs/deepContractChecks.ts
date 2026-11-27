// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type {
  ConsumerHttpCall,
  DomainModelSymbol,
  IntegrationEdge,
  PayloadSchemaDriftFinding,
  ProjectAnalysisRecord,
  ProviderEndpoint,
  SpecVsCodeDriftFinding,
  UnhandledContractFinding,
} from './types.js';

const CAT_SPEC_DRIFT = 'SPEC_VS_CODE_DRIFT' as const;
const CAT_PAYLOAD_DRIFT = 'PAYLOAD_SCHEMA_DRIFT' as const;
const CAT_UNHANDLED = 'UNHANDLED_PAGINATION_OR_ERROR_CONTRACT' as const;
const PAGINATION_PARAM_RE = /^(?:page|limit|offset|cursor|per_page|page_size)$/i;
const MUTATING_VERBS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function toSnakeLower(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

export function detectSpecVsCodeDrift(
  projects: readonly ProjectAnalysisRecord[]
): SpecVsCodeDriftFinding[] {
  const findings: SpecVsCodeDriftFinding[] = [];
  for (const proj of projects) {
    const codeEps = proj.endpoints.filter((e) => e.source_kind === 'code');
    const specEps = proj.endpoints.filter((e) => e.source_kind === 'openapi');
    if (codeEps.length === 0 || specEps.length === 0) continue;

    const codeKeys = new Set(codeEps.map((e) => `${e.method}:${e.normalized_path}`));
    const specKeys = new Set(specEps.map((e) => `${e.method}:${e.normalized_path}`));

    for (const ep of specEps) {
      if (!codeKeys.has(`${ep.method}:${ep.normalized_path}`)) {
        findings.push({
          category: CAT_SPEC_DRIFT,
          kind: 'IN_OPENAPI_MISSING_IN_CODE',
          severity: 'HIGH',
          project_slug: proj.slug,
          method: ep.method,
          normalized_path: ep.normalized_path,
          file: ep.file,
          line: ep.line,
          message: `${proj.slug}/${ep.file}:L${ep.line} declares ${ep.method} ${ep.normalized_path} in OpenAPI, but no matching code route was found.`,
        });
      }
    }
    for (const ep of codeEps) {
      if (!specKeys.has(`${ep.method}:${ep.normalized_path}`)) {
        findings.push({
          category: CAT_SPEC_DRIFT,
          kind: 'IN_CODE_MISSING_IN_OPENAPI',
          severity: 'MEDIUM',
          project_slug: proj.slug,
          method: ep.method,
          normalized_path: ep.normalized_path,
          file: ep.file,
          line: ep.line,
          message: `${proj.slug}/${ep.file}:L${ep.line} implements ${ep.method} ${ep.normalized_path} in code, but it is undocumented in OpenAPI.`,
        });
      }
    }
  }
  return findings;
}

function compareModelPairFields(
  consumer: ProjectAnalysisRecord,
  provider: ProjectAnalysisRecord,
  cModel: DomainModelSymbol,
  pModel: DomainModelSymbol
): PayloadSchemaDriftFinding[] {
  const cFields = cModel.fields ?? [];
  const pFields = pModel.fields ?? [];
  if (cFields.length === 0 || pFields.length === 0) return [];

  const findings: PayloadSchemaDriftFinding[] = [];
  const cNames = new Set(cFields.map((f) => f.name));
  const cSnake = new Map<string, string>(cFields.map((f) => [toSnakeLower(f.name), f.name]));
  const pNames = new Set(pFields.map((f) => f.name));
  const pSnake = new Map<string, string>(pFields.map((f) => [toSnakeLower(f.name), f.name]));
  const cLoc = `${consumer.slug}/${cModel.file}:L${cModel.line}`;
  const pLoc = `${provider.slug}/${pModel.file}:L${pModel.line}`;

  for (const pf of pFields) {
    if (cNames.has(pf.name)) continue;
    const altName = cSnake.get(toSnakeLower(pf.name));
    if (altName) {
      findings.push({
        category: CAT_PAYLOAD_DRIFT,
        kind: 'CASING_MISMATCH',
        severity: 'HIGH',
        consumer_slug: consumer.slug,
        provider_slug: provider.slug,
        consumer_model: cModel.name,
        provider_model: pModel.name,
        field_name: `${altName} vs ${pf.name}`,
        consumer_location: cLoc,
        provider_location: pLoc,
        message: `${cLoc} (${cModel.name}.${altName}) mismatches casing with ${pLoc} (${pModel.name}.${pf.name}).`,
      });
    } else if (pf.required) {
      findings.push({
        category: CAT_PAYLOAD_DRIFT,
        kind: 'MISSING_REQUIRED_FIELD',
        severity: 'HIGH',
        consumer_slug: consumer.slug,
        provider_slug: provider.slug,
        consumer_model: cModel.name,
        provider_model: pModel.name,
        field_name: pf.name,
        consumer_location: cLoc,
        provider_location: pLoc,
        message: `${cLoc} (${cModel.name}) omits required provider field '${pf.name}' declared in ${pLoc} (${pModel.name}).`,
      });
    }
  }

  for (const cf of cFields) {
    if (pNames.has(cf.name) || pSnake.has(toSnakeLower(cf.name))) continue;
    findings.push({
      category: CAT_PAYLOAD_DRIFT,
      kind: 'UNDECLARED_CONSUMER_FIELD',
      severity: 'MEDIUM',
      consumer_slug: consumer.slug,
      provider_slug: provider.slug,
      consumer_model: cModel.name,
      provider_model: pModel.name,
      field_name: cf.name,
      consumer_location: cLoc,
      provider_location: pLoc,
      message: `${cLoc} (${cModel.name}) references field '${cf.name}' not declared in ${pLoc} (${pModel.name}).`,
    });
  }
  return findings;
}

function findMatchingConsumerCall(
  proj: ProjectAnalysisRecord,
  edge: IntegrationEdge
): ConsumerHttpCall | undefined {
  return proj.consumer_calls.find(
    (c) => `${proj.slug}/${c.file}:L${c.line}` === edge.consumer_location && c.method === edge.method
  );
}

function findMatchingProviderEndpoint(
  proj: ProjectAnalysisRecord,
  edge: IntegrationEdge
): ProviderEndpoint | undefined {
  return proj.endpoints.find(
    (e) => `${proj.slug}/${e.file}:L${e.line}` === edge.provider_location && e.method === edge.method
  );
}

function compareEdgePayloadPairs(
  consumer: ProjectAnalysisRecord,
  provider: ProjectAnalysisRecord,
  edge: IntegrationEdge,
  seenPairs: Set<string>
): PayloadSchemaDriftFinding[] {
  const call = findMatchingConsumerCall(consumer, edge);
  const ep = findMatchingProviderEndpoint(provider, edge);
  if (!call || !ep) return [];

  const out: PayloadSchemaDriftFinding[] = [];
  const pairs: Array<readonly [string | undefined, string | undefined]> = [
    [call.request_type_arg, ep.request_model],
    [call.response_type_arg, ep.response_model],
  ];
  for (const [cName, pName] of pairs) {
    if (!cName || !pName) continue;
    const pairKey = `${consumer.slug}:${cName}->${provider.slug}:${pName}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    const cModel = consumer.models.find((m) => m.name === cName);
    const pModel = provider.models.find((m) => m.name === pName);
    if (cModel && pModel) {
      out.push(...compareModelPairFields(consumer, provider, cModel, pModel));
    }
  }
  return out;
}

export function detectPayloadSchemaDrift(
  projects: readonly ProjectAnalysisRecord[],
  edges: readonly IntegrationEdge[]
): PayloadSchemaDriftFinding[] {
  const bySlug = new Map<string, ProjectAnalysisRecord>(projects.map((p) => [p.slug, p]));
  const findings: PayloadSchemaDriftFinding[] = [];
  const seenPairs = new Set<string>();

  for (const edge of edges) {
    const consumer = bySlug.get(edge.consumer_slug);
    const provider = bySlug.get(edge.provider_slug);
    if (!consumer || !provider) continue;
    findings.push(...compareEdgePayloadPairs(consumer, provider, edge, seenPairs));
  }
  return findings;
}

function collectEdgeUnhandledFindings(
  consumer: ProjectAnalysisRecord,
  provider: ProjectAnalysisRecord,
  edge: IntegrationEdge,
  seen: Set<string>
): UnhandledContractFinding[] {
  const call = findMatchingConsumerCall(consumer, edge);
  const ep = findMatchingProviderEndpoint(provider, edge);
  if (!call || !ep) return [];

  const out: UnhandledContractFinding[] = [];
  if (MUTATING_VERBS.has(call.method) && call.has_error_handling === false) {
    const key = `err:${edge.consumer_location}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({
        category: CAT_UNHANDLED,
        kind: 'MISSING_ERROR_HANDLING',
        severity: 'MEDIUM',
        consumer_slug: consumer.slug,
        provider_slug: provider.slug,
        method: call.method,
        normalized_path: edge.normalized_path,
        file: call.file,
        line: call.line,
        message: `${edge.consumer_location} invokes mutating ${call.method} ${edge.normalized_path} without local error/status handling.`,
      });
    }
  }

  const hasPaginationQuery = (ep.query_params ?? []).some((q) => PAGINATION_PARAM_RE.test(q));
  if (call.method === 'GET' && hasPaginationQuery && call.reads_pagination_envelope === false) {
    const key = `pag:${edge.consumer_location}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({
        category: CAT_UNHANDLED,
        kind: 'UNHANDLED_PAGINATION_ENVELOPE',
        severity: 'LOW',
        consumer_slug: consumer.slug,
        provider_slug: provider.slug,
        method: call.method,
        normalized_path: edge.normalized_path,
        file: call.file,
        line: call.line,
        message: `${edge.consumer_location} calls paginated GET ${edge.normalized_path} without reading pagination envelope fields/query params.`,
      });
    }
  }
  return out;
}

export function detectUnhandledContracts(
  projects: readonly ProjectAnalysisRecord[],
  edges: readonly IntegrationEdge[]
): UnhandledContractFinding[] {
  const bySlug = new Map<string, ProjectAnalysisRecord>(projects.map((p) => [p.slug, p]));
  const findings: UnhandledContractFinding[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    const consumer = bySlug.get(edge.consumer_slug);
    const provider = bySlug.get(edge.provider_slug);
    if (!consumer || !provider) continue;
    findings.push(...collectEdgeUnhandledFindings(consumer, provider, edge, seen));
  }
  return findings;
}
