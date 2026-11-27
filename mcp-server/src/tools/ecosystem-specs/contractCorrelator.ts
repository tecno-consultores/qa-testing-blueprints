// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { stripTrailingSlashes } from './envExtractor.js';
import {
  REDACTED_ENV_VALUE,
  type AstStructuralFinding,
  type BrokenConsumerCallFinding,
  type ChannelAsymmetryFinding,
  type ConsumerHttpCall,
  type EcosystemFindingsBundle,
  type EnvConfigDriftFinding,
  type HttpVerb,
  type ImprovementOpportunity,
  type IntegrationEdge,
  type OrphanProviderEndpointFinding,
  type ProjectAnalysisRecord,
  type ProviderEndpoint,
} from './types.js';

const CAT_BROKEN = 'BROKEN_CONSUMER_CALL' as const;
const CAT_ORPHAN = 'ORPHAN_PROVIDER_ENDPOINT' as const;
const CAT_ASYMMETRY = 'CHANNEL_ASYMMETRY' as const;
const CAT_ENV = 'ENV_CONFIG_DRIFT' as const;
const CAT_AST = 'AST_STRUCTURAL_FINDINGS' as const;
const KIND_BASE_URL_DRIFT = 'BASE_URL_DRIFT' as const;

const PARAM_TOKEN = '{param}';
const INFRA_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/health',
  '/healthz',
  '/ready',
  '/readyz',
  '/live',
  '/livez',
  '/metrics',
  '/docs',
  '/redoc',
  '/openapi.json',
  '/api/health',
  '/api/v1/health',
]);

const BUILTIN_ENV_KEYS: ReadonlySet<string> = new Set([
  'NODE_ENV',
  'MODE',
  'DEV',
  'PROD',
  'SSR',
  'BASE_URL',
  'PATH',
  'HOME',
  'PWD',
  'CI',
  'TZ',
  'LANG',
]);

const VERSION_SEGMENT_RE = /^\/(?:api\/)?v\d+(?=\/|$)/i;

function splitPathSegments(normalizedPath: string): string[] {
  return normalizedPath.split('/').filter(Boolean);
}

export function pathsMatchContract(consumerNorm: string, providerNorm: string): boolean {
  if (consumerNorm === providerNorm) return true;
  const cSegs = splitPathSegments(consumerNorm);
  const pSegs = splitPathSegments(providerNorm);
  if (cSegs.length !== pSegs.length) return false;
  for (let i = 0; i < cSegs.length; i += 1) {
    const cs = cSegs[i];
    const ps = pSegs[i];
    if (cs === ps || cs === PARAM_TOKEN || ps === PARAM_TOKEN) continue;
    return false;
  }
  return true;
}

function findSuggestedProviderEndpoint(
  consumerNorm: string,
  allProviders: readonly ProviderEndpoint[]
): string | undefined {
  const cSegs = splitPathSegments(consumerNorm);
  const lastSeg = cSegs[cSegs.length - 1];
  if (!lastSeg) return undefined;
  for (const ep of allProviders) {
    const pSegs = splitPathSegments(ep.normalized_path);
    if (pSegs[pSegs.length - 1] === lastSeg) {
      return `${ep.method} ${ep.normalized_path} (${ep.project_slug}:${ep.file}:${ep.line})`;
    }
  }
  return undefined;
}

function correlateSingleConsumerCall(
  call: ConsumerHttpCall,
  allProviders: readonly ProviderEndpoint[],
  matchedEndpointKeys: Set<string>,
  edges: IntegrationEdge[]
): BrokenConsumerCallFinding | null {
  if (call.is_external || allProviders.length === 0) return null;

  const pathMatches = allProviders.filter((ep) =>
    pathsMatchContract(call.normalized_path, ep.normalized_path)
  );
  const exactMatches = pathMatches.filter((ep) => ep.method === call.method);
  if (exactMatches.length > 0) {
    for (const ep of exactMatches) {
      matchedEndpointKeys.add(`${ep.project_slug}:${ep.method}:${ep.normalized_path}`);
      edges.push({
        consumer_slug: call.project_slug,
        consumer_channel: call.channel,
        provider_slug: ep.project_slug,
        method: call.method,
        normalized_path: ep.normalized_path,
        consumer_location: `${call.project_slug}/${call.file}:L${call.line}`,
        provider_location: `${ep.project_slug}/${ep.file}:L${ep.line}`,
      });
    }
    return null;
  }

  if (pathMatches.length > 0) {
    const available: HttpVerb[] = Array.from(new Set(pathMatches.map((ep) => ep.method))).sort((a, b) =>
      a.localeCompare(b)
    );
    return {
      category: CAT_BROKEN,
      reason: 'METHOD_NOT_ALLOWED_405',
      severity: 'HIGH',
      consumer_slug: call.project_slug,
      consumer_channel: call.channel,
      method: call.method,
      raw_url: call.raw_url,
      normalized_path: call.normalized_path,
      file: call.file,
      line: call.line,
      available_methods: available,
      message: `${call.project_slug}/${call.file}:L${call.line} invokes ${call.method} ${call.normalized_path}, but provider only exposes [${available.join(', ')}].`,
    };
  }

  const suggestion = findSuggestedProviderEndpoint(call.normalized_path, allProviders);
  return {
    category: CAT_BROKEN,
    reason: 'ENDPOINT_NOT_FOUND_404',
    severity: 'HIGH',
    consumer_slug: call.project_slug,
    consumer_channel: call.channel,
    method: call.method,
    raw_url: call.raw_url,
    normalized_path: call.normalized_path,
    file: call.file,
    line: call.line,
    ...(suggestion ? { suggested_endpoint: suggestion } : {}),
    message: `${call.project_slug}/${call.file}:L${call.line} calls ${call.method} ${call.normalized_path} with no matching provider endpoint.`,
  };
}

function collectOrphanEndpoints(
  projects: readonly ProjectAnalysisRecord[],
  allProviders: readonly ProviderEndpoint[],
  matchedEndpointKeys: ReadonlySet<string>
): OrphanProviderEndpointFinding[] {
  const hasConsumers = projects.some(
    (p) =>
      p.role === 'web' ||
      p.role === 'mobile' ||
      p.role === 'mixed' ||
      p.consumer_calls.some((c) => !c.is_external)
  );
  if (!hasConsumers) return [];
  const findings: OrphanProviderEndpointFinding[] = [];
  for (const ep of allProviders) {
    if (INFRA_EXEMPT_PATHS.has(ep.normalized_path)) continue;
    const key = `${ep.project_slug}:${ep.method}:${ep.normalized_path}`;
    if (matchedEndpointKeys.has(key)) continue;
    findings.push({
      category: CAT_ORPHAN,
      severity: 'MEDIUM',
      provider_slug: ep.project_slug,
      method: ep.method,
      path: ep.path,
      normalized_path: ep.normalized_path,
      file: ep.file,
      line: ep.line,
      message: `${ep.project_slug}/${ep.file}:L${ep.line} exposes ${ep.method} ${ep.normalized_path} with no detected consumer callers.`,
    });
  }
  return findings;
}

function stripVersionPrefix(normalizedPath: string): string {
  const stripped = normalizedPath.replace(VERSION_SEGMENT_RE, '');
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function indexCallsByResource(
  calls: readonly ConsumerHttpCall[]
): Map<string, Set<string>> {
  const byResource = new Map<string, Set<string>>();
  for (const call of calls) {
    if (call.is_external) continue;
    const resource = stripVersionPrefix(call.normalized_path);
    const set = byResource.get(resource) ?? new Set<string>();
    set.add(`${call.method} ${call.normalized_path}`);
    byResource.set(resource, set);
  }
  return byResource;
}

function compareResourceChannels(
  resource: string,
  wList: readonly string[],
  mList: readonly string[]
): ChannelAsymmetryFinding | null {
  if (wList.length > 0 && mList.length === 0) {
    return {
      category: CAT_ASYMMETRY,
      kind: 'WEB_ONLY_ENDPOINT',
      severity: 'INFO',
      normalized_path: resource,
      web_calls: wList,
      mobile_calls: [],
      message: `Resource '${resource}' is consumed only by Web (${wList.join(', ')}) and not by Mobile.`,
    };
  }
  if (mList.length > 0 && wList.length === 0) {
    return {
      category: CAT_ASYMMETRY,
      kind: 'MOBILE_ONLY_ENDPOINT',
      severity: 'INFO',
      normalized_path: resource,
      web_calls: [],
      mobile_calls: mList,
      message: `Resource '${resource}' is consumed only by Mobile (${mList.join(', ')}) and not by Web.`,
    };
  }
  if (wList.join('|') !== mList.join('|')) {
    return {
      category: CAT_ASYMMETRY,
      kind: 'METHOD_OR_VERSION_DIVERGENCE',
      severity: 'HIGH',
      normalized_path: resource,
      web_calls: wList,
      mobile_calls: mList,
      message: `Web [${wList.join(', ')}] and Mobile [${mList.join(', ')}] diverge on resource '${resource}'.`,
    };
  }
  return null;
}

function detectChannelAsymmetry(projects: readonly ProjectAnalysisRecord[]): ChannelAsymmetryFinding[] {
  const webCalls = projects.flatMap((p) => p.consumer_calls.filter((c) => c.channel === 'web' && !c.is_external));
  const mobileCalls = projects.flatMap((p) =>
    p.consumer_calls.filter((c) => c.channel === 'mobile' && !c.is_external)
  );
  if (webCalls.length === 0 || mobileCalls.length === 0) return [];

  const webMap = indexCallsByResource(webCalls);
  const mobileMap = indexCallsByResource(mobileCalls);
  const allResources = Array.from(new Set([...webMap.keys(), ...mobileMap.keys()])).sort((a, b) =>
    a.localeCompare(b)
  );
  const findings: ChannelAsymmetryFinding[] = [];
  for (const resource of allResources) {
    const wList = Array.from(webMap.get(resource) ?? []).sort((a, b) => a.localeCompare(b));
    const mList = Array.from(mobileMap.get(resource) ?? []).sort((a, b) => a.localeCompare(b));
    const finding = compareResourceChannels(resource, wList, mList);
    if (finding) findings.push(finding);
  }
  return findings;
}

function collectIntraProjectEnvDrift(project: ProjectAnalysisRecord): EnvConfigDriftFinding[] {
  const findings: EnvConfigDriftFinding[] = [];
  const exampleEntries = project.env_vars.filter(
    (e) => e.source === 'env_file' && e.env_file_kind === 'example'
  );
  const codeRefs = project.env_vars.filter((e) => e.source === 'code_ref');
  const exampleKeys = new Set(exampleEntries.map((e) => e.key));
  const codeRefKeys = new Set(codeRefs.map((e) => e.key));
  const reportedMissing = new Set<string>();

  for (const ref of codeRefs) {
    if (BUILTIN_ENV_KEYS.has(ref.key) || exampleKeys.has(ref.key) || reportedMissing.has(ref.key)) {
      continue;
    }
    reportedMissing.add(ref.key);
    findings.push({
      category: CAT_ENV,
      kind: 'MISSING_IN_ENV_EXAMPLE',
      severity: 'MEDIUM',
      project_slug: project.slug,
      key: ref.key,
      file: ref.file,
      line: ref.line,
      message: `${project.slug}/${ref.file}:L${ref.line} reads '${ref.key}' which is missing from .env.example.`,
    });
  }

  for (const ex of exampleEntries) {
    if (codeRefKeys.has(ex.key) || BUILTIN_ENV_KEYS.has(ex.key)) continue;
    findings.push({
      category: CAT_ENV,
      kind: 'UNUSED_ENV_EXAMPLE_KEY',
      severity: 'LOW',
      project_slug: project.slug,
      key: ex.key,
      file: ex.file,
      line: ex.line,
      message: `${project.slug}/${ex.file}:L${ex.line} declares '${ex.key}' with no code reference found.`,
    });
  }
  return findings;
}

function extractPortFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    return parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  } catch {
    return null;
  }
}

interface ConsumerEnvUrlRef {
  readonly slug: string;
  readonly key: string;
  readonly url: string;
  readonly file: string;
  readonly line: number;
}

function collectEnvUrlsAndProviderPorts(projects: readonly ProjectAnalysisRecord[]): {
  readonly consumerUrls: ConsumerEnvUrlRef[];
  readonly providerPorts: Set<string>;
} {
  const consumerUrls: ConsumerEnvUrlRef[] = [];
  const providerPorts = new Set<string>();
  for (const proj of projects) {
    const isConsumer = proj.role === 'web' || proj.role === 'mobile';
    for (const ev of proj.env_vars) {
      const sample = ev.sanitized_sample;
      if (ev.source !== 'env_file' || !sample || sample === REDACTED_ENV_VALUE) continue;
      if (proj.role === 'api' && ev.category === 'port_or_host' && /^\d{2,5}$/.test(sample)) {
        providerPorts.add(sample);
      }
      if (isConsumer && ev.category === 'url_or_endpoint' && /^https?:\/\//i.test(sample)) {
        consumerUrls.push({
          slug: proj.slug,
          key: ev.key,
          url: stripTrailingSlashes(sample),
          file: ev.file,
          line: ev.line,
        });
      }
    }
  }
  return { consumerUrls, providerPorts };
}

function collectCrossProjectBaseUrlDrift(
  projects: readonly ProjectAnalysisRecord[]
): EnvConfigDriftFinding[] {
  const { consumerUrls, providerPorts } = collectEnvUrlsAndProviderPorts(projects);
  const findings: EnvConfigDriftFinding[] = [];
  const uniqueUrls = Array.from(new Set(consumerUrls.map((c) => c.url)));
  if (uniqueUrls.length > 1 && consumerUrls[0]) {
    const first = consumerUrls[0];
    findings.push({
      category: CAT_ENV,
      kind: KIND_BASE_URL_DRIFT,
      severity: 'HIGH',
      project_slug: first.slug,
      key: first.key,
      file: first.file,
      line: first.line,
      related_projects: Array.from(new Set(consumerUrls.map((c) => c.slug))),
      message: `Consumer projects configure conflicting API base URLs across .env files: ${uniqueUrls.join(' vs ')}.`,
    });
  }
  if (providerPorts.size === 0) return findings;
  for (const cu of consumerUrls) {
    const port = extractPortFromUrl(cu.url);
    if (port && /^https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(cu.url) && !providerPorts.has(port)) {
      findings.push({
        category: CAT_ENV,
        kind: KIND_BASE_URL_DRIFT,
        severity: 'HIGH',
        project_slug: cu.slug,
        key: cu.key,
        file: cu.file,
        line: cu.line,
        message: `${cu.slug}/${cu.file}:L${cu.line} points '${cu.key}' to port ${port}, but API providers declare PORT [${Array.from(providerPorts).join(', ')}].`,
      });
    }
  }
  return findings;
}

function collectAstStructuralFindings(
  projects: readonly ProjectAnalysisRecord[]
): AstStructuralFinding[] {
  const findings: AstStructuralFinding[] = [];
  for (const proj of projects) {
    for (const cycle of proj.graph.cycles) {
      findings.push({
        category: CAT_AST,
        kind: 'DEPENDENCY_CYCLE',
        severity: 'HIGH',
        project_slug: proj.slug,
        target: cycle,
        details: 'Directed cross-file dependency cycle detected in Graphify AST graph.',
        message: `[${proj.slug}] Directed AST dependency cycle: ${cycle}.`,
      });
    }
    for (const gm of proj.graph.god_modules) {
      findings.push({
        category: CAT_AST,
        kind: 'GOD_MODULE',
        severity: 'MEDIUM',
        project_slug: proj.slug,
        target: gm.module,
        details: `nodes=${gm.nodes_count}, Ca=${gm.fan_in}, Ce=${gm.fan_out}, I=${gm.instability}, coupling=${gm.coupling_score}`,
        message: `[${proj.slug}] God-module candidate '${gm.module}' (coupling=${gm.coupling_score}, I=${gm.instability}).`,
      });
    }
  }
  return findings;
}

function buildImprovementOpportunities(findings: EcosystemFindingsBundle): ImprovementOpportunity[] {
  const opportunities: ImprovementOpportunity[] = [];
  if (findings.BROKEN_CONSUMER_CALL.length > 0) {
    opportunities.push({
      id: 'IMP-01',
      priority: 'P1',
      title: 'Fix broken HTTP consumer calls (404/405 contract mismatches)',
      rationale: `Detected ${findings.BROKEN_CONSUMER_CALL.length} consumer HTTP call(s) without a matching provider route/method. Adopt shared OpenAPI-generated client types or consumer-driven contract tests.`,
      impacted_projects: Array.from(new Set(findings.BROKEN_CONSUMER_CALL.map((f) => f.consumer_slug))),
    });
  }
  if (findings.CHANNEL_ASYMMETRY.some((f) => f.kind === 'METHOD_OR_VERSION_DIVERGENCE')) {
    opportunities.push({
      id: 'IMP-02',
      priority: 'P1',
      title: 'Align Web and Mobile API contracts & versions',
      rationale: 'Web and Mobile clients diverge in HTTP methods or API versions for the same domain resources. Standardize on a unified API version and shared SDK layer.',
      impacted_projects: ['web', 'mobile'],
    });
  }
  if (findings.ENV_CONFIG_DRIFT.length > 0) {
    opportunities.push({
      id: 'IMP-03',
      priority: 'P2',
      title: 'Synchronize .env.example templates and API base URLs',
      rationale: `Detected ${findings.ENV_CONFIG_DRIFT.length} environment configuration drift item(s) across projects. Document all consumed keys in .env.example and align local ports/base prefixes.`,
      impacted_projects: Array.from(new Set(findings.ENV_CONFIG_DRIFT.map((f) => f.project_slug))),
    });
  }
  if (findings.AST_STRUCTURAL_FINDINGS.length > 0) {
    opportunities.push({
      id: 'IMP-04',
      priority: 'P2',
      title: 'Break AST dependency cycles and decompose god-modules',
      rationale: `Detected ${findings.AST_STRUCTURAL_FINDINGS.length} structural AST hotspot(s) (cycles/god-modules). Extract shared interfaces/ports to reduce fan-in/fan-out coupling.`,
      impacted_projects: Array.from(new Set(findings.AST_STRUCTURAL_FINDINGS.map((f) => f.project_slug))),
    });
  }
  if (findings.ORPHAN_PROVIDER_ENDPOINT.length > 0) {
    opportunities.push({
      id: 'IMP-05',
      priority: 'P3',
      title: 'Document or retire unreferenced provider endpoints',
      rationale: `Detected ${findings.ORPHAN_PROVIDER_ENDPOINT.length} provider endpoint(s) without callers inside the workspace. Confirm whether external clients depend on them or deprecate unused routes.`,
      impacted_projects: Array.from(new Set(findings.ORPHAN_PROVIDER_ENDPOINT.map((f) => f.provider_slug))),
    });
  }
  return opportunities;
}

export function correlateEcosystemContracts(
  projects: readonly ProjectAnalysisRecord[],
  maxFindingsPerCategory: number
): {
  readonly integrationEdges: IntegrationEdge[];
  readonly findings: EcosystemFindingsBundle;
  readonly improvementOpportunities: ImprovementOpportunity[];
} {
  const allProviders = projects.flatMap((p) => p.endpoints);
  const allConsumerCalls = projects.flatMap((p) => p.consumer_calls);
  const matchedEndpointKeys = new Set<string>();
  const integrationEdges: IntegrationEdge[] = [];
  const brokenCalls: BrokenConsumerCallFinding[] = [];

  for (const call of allConsumerCalls) {
    const broken = correlateSingleConsumerCall(call, allProviders, matchedEndpointKeys, integrationEdges);
    if (broken) brokenCalls.push(broken);
  }

  const orphanEndpoints = collectOrphanEndpoints(projects, allProviders, matchedEndpointKeys);
  const channelAsymmetry = detectChannelAsymmetry(projects);
  const envDrift = [
    ...projects.flatMap((p) => collectIntraProjectEnvDrift(p)),
    ...collectCrossProjectBaseUrlDrift(projects),
  ];
  const astStructural = collectAstStructuralFindings(projects);

  const findings: EcosystemFindingsBundle = {
    BROKEN_CONSUMER_CALL: brokenCalls.slice(0, maxFindingsPerCategory),
    ORPHAN_PROVIDER_ENDPOINT: orphanEndpoints.slice(0, maxFindingsPerCategory),
    CHANNEL_ASYMMETRY: channelAsymmetry.slice(0, maxFindingsPerCategory),
    ENV_CONFIG_DRIFT: envDrift.slice(0, maxFindingsPerCategory),
    AST_STRUCTURAL_FINDINGS: astStructural.slice(0, maxFindingsPerCategory),
  };

  return {
    integrationEdges,
    findings,
    improvementOpportunities: buildImprovementOpportunities(findings),
  };
}
