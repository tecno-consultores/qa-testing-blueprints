// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CALM_ARCHITECTURE_PATH,
  REQUIRED_CALM_CONTROL_IDS,
  REQUIRED_CALM_NODE_IDS,
  VALIDATE_CALM_ARCHITECTURE_TOOL,
  handleValidateCalmArchitecture,
  validateCalmArchitecture,
} from '../src/tools/validateCalmArchitecture.js';

const MCP_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_CANDIDATE = path.dirname(MCP_ROOT);
const REAL_CALM_PATH = path.join(REPO_CANDIDATE, DEFAULT_CALM_ARCHITECTURE_PATH);
const HAS_REAL_CALM_MODEL = fs.existsSync(REAL_CALM_PATH);
const VALIDATE_CALM_SH_PATH = path.join(
  REPO_CANDIDATE,
  '.agents',
  'scripts',
  'validate_calm_architecture.sh',
);

interface CalmControlRequirement {
  'requirement-url'?: string;
  config?: {
    'control-id'?: string;
    name?: string;
    description?: string;
  };
}

interface CalmControl {
  enabled?: boolean;
  description?: string;
  nodes?: string[];
  relationships?: string[];
  requirements?: CalmControlRequirement[];
}

interface CalmNode {
  'unique-id'?: string;
  'node-type'?: string;
  name?: string;
  description?: string;
  interfaces?: unknown[];
}

interface CalmRelationship {
  'unique-id'?: string;
  description?: string;
  protocol?: string;
  'relationship-type'?: {
    connects?: {
      source?: { node?: string; interfaces?: string[] };
      destination?: { node?: string; interfaces?: string[] };
    };
  } & Record<string, unknown>;
}

interface CalmDoc {
  $schema?: string;
  metadata?: unknown[];
  nodes: CalmNode[];
  relationships: CalmRelationship[];
  controls?: Record<string, CalmControl>;
}

function getControl(doc: CalmDoc, id: string): CalmControl {
  const ctrl = doc.controls?.[id];
  if (!ctrl || typeof ctrl !== 'object') {
    throw new Error(`Expected CalmControl for ${id}`);
  }
  return ctrl;
}

const CANONICAL_CONTROL_METADATA: Record<
  (typeof REQUIRED_CALM_CONTROL_IDS)[number],
  { controlId: string; name: string; description: string; reqDescription: string }
> = {
  'prompt-injection-guard': {
    controlId: 'QA-PROMPT-GUARD',
    name: 'Prompt Injection and PII Guard',
    description:
      'NFKC Unicode canonicalization, PII/credential redaction, and Fail-Closed blocking via promptGuard.ts.',
    reqDescription:
      'Sanitize NFKC inputs, redact PII/credentials, and enforce Fail-Closed interception on CallToolRequestSchema.',
  },
  'rule-zero-ephemeral-docker': {
    controlId: 'QA-RULE-ZERO',
    name: 'Rule Zero Ephemeral Non-Root Execution',
    description:
      'All tests, linters, and audits execute inside non-root ephemeral sinfallas/* Docker containers.',
    reqDescription:
      'Require non-root UID:GID mapping, HOME=/tmp, and Trivy HIGH=0 CRITICAL=0 hardened containers.',
  },
  'postgres-rls-isolation': {
    controlId: 'QA-PG17-RLS',
    name: 'PostgreSQL 17 Forced RLS Isolation',
    description:
      'Multi-tenant PostgreSQL 17 isolation with NOSUPERUSER NOBYPASSRLS and FORCE ROW LEVEL SECURITY.',
    reqDescription:
      'Enforce tenant isolation via SET LOCAL app.current_tenant_id, NOBYPASSRLS role, and FORCE ROW LEVEL SECURITY.',
  },
  'worm-hmac-audit-chain': {
    controlId: 'SEC-14',
    name: 'WORM HMAC-SHA256 Audit Chain',
    description:
      'Tamper-proof WORM audit log chained with HMAC-SHA256, BIGINT seq_num, and pg_advisory_xact_lock.',
    reqDescription:
      'Serialize append-only audit entries with BIGINT seq_num, pg_advisory_xact_lock, and cryptographic HMAC-SHA256 chaining.',
  },
  'vault-aes-256-gcm': {
    controlId: 'QA-VAULT-FIPS-SSRF',
    name: 'AES-256-GCM Vault and Anti-SSRF Control',
    description:
      'FIPS 140-3 AES-256-GCM authenticated secret vault encryption with memory zeroization and anti-SSRF guards.',
    reqDescription:
      'Encrypt secrets using FIPS 140-3 AES-256-GCM with buffer zeroization and block private-network SSRF targets.',
  },
  'git-closure-human-gate': {
    controlId: 'QA-GIT-GATE-01',
    name: 'Human-Confirmed Remote Push Gate',
    description:
      'Human-confirmed remote push gate (QA-GIT-GATE-01) forbidding automated git push or npm publish.',
    reqDescription:
      'Conclude verified tasks at local git commit and require explicit human approval before remote push or registry publish.',
  },
  'cli-tty-anti-hang-guard': {
    controlId: 'QA-CLI-TTY-01',
    name: 'TTY Anti-Hang and Container Health Contract',
    description:
      'Dual CLI/MCP interactive TTY anti-hang guard (QA-CLI-TTY-01) and unmocked container health contract (QA-HEALTH-01).',
    reqDescription:
      'Prevent interactive TTY stdio deadlocks and require unmocked container HEALTHCHECK verification.',
  },
};

const CANONICAL_CALM_FIXTURE: CalmDoc = {
  $schema: 'https://calm.finos.org/release/1.2/meta/calm.json',
  metadata: [
    {
      'qa-11x': {
        standard: 'QA-11X v3.8',
        version: '3.8.0',
        topology: 'zero-infra',
        owner: 'Tecno Consultores',
      },
    },
  ],
  nodes: [
    {
      'unique-id': 'qa-11x-ai-ide-host',
      'node-type': 'actor',
      name: 'QA-11X AI IDE Host',
      description: 'Agentic IDE host',
      interfaces: [{ 'unique-id': 'ide-mcp-stdio-client' }],
    },
    {
      'unique-id': 'mcp-qa-11x-server',
      'node-type': 'service',
      name: 'MCP QA-11X Server',
      description: 'MCP server',
      interfaces: [
        { 'unique-id': 'mcp-stdio-jsonrpc' },
        { 'unique-id': 'mcp-docker-cli-bridge' },
        { 'unique-id': 'mcp-governance-verifier' },
      ],
    },
    {
      'unique-id': 'ephemeral-docker-runners',
      'node-type': 'system',
      name: 'Ephemeral Docker Runners',
      description: 'Non-root runners',
      interfaces: [
        { 'unique-id': 'docker-engine-cli' },
        { 'unique-id': 'runner-db-client' },
        { 'unique-id': 'runner-cache-client' },
      ],
    },
    {
      'unique-id': 'postgres17-rls-store',
      'node-type': 'database',
      name: 'PostgreSQL 17 RLS Store',
      description: 'PostgreSQL 17 RLS',
      interfaces: [{ 'unique-id': 'postgres-tls-5432' }],
    },
    {
      'unique-id': 'keydb-state-cache',
      'node-type': 'database',
      name: 'KeyDB State Cache',
      description: 'KeyDB cache',
      interfaces: [{ 'unique-id': 'keydb-resp-tls-6379' }],
    },
    {
      'unique-id': 'governance-certification-gate',
      'node-type': 'service',
      name: 'Governance Certification Gate',
      description: '10-stage gate',
      interfaces: [{ 'unique-id': 'governance-sha256-gate' }],
    },
  ],
  relationships: [
    {
      'unique-id': 'rel-ide-to-mcp-server',
      description: 'MCP stdio JSON-RPC 2.0 transport guarded by promptGuard and QA-CLI-TTY-01.',
      'relationship-type': {
        connects: {
          source: { node: 'qa-11x-ai-ide-host', interfaces: ['ide-mcp-stdio-client'] },
          destination: { node: 'mcp-qa-11x-server', interfaces: ['mcp-stdio-jsonrpc'] },
        },
      },
    },
    {
      'unique-id': 'rel-mcp-to-ephemeral-runners',
      description: 'Docker CLI Rule Zero dispatch (-u uid:gid -e HOME=/tmp) guarded by taskStateGuard.',
      'relationship-type': {
        connects: {
          source: { node: 'mcp-qa-11x-server', interfaces: ['mcp-docker-cli-bridge'] },
          destination: { node: 'ephemeral-docker-runners', interfaces: ['docker-engine-cli'] },
        },
      },
    },
    {
      'unique-id': 'rel-runners-to-postgres17-rls',
      description: 'PostgreSQL 17 TLS connection enforcing NOBYPASSRLS tenant isolation and WORM audit chain.',
      protocol: 'TLS',
      'relationship-type': {
        connects: {
          source: { node: 'ephemeral-docker-runners', interfaces: ['runner-db-client'] },
          destination: { node: 'postgres17-rls-store', interfaces: ['postgres-tls-5432'] },
        },
      },
    },
    {
      'unique-id': 'rel-runners-to-keydb-cache',
      description: 'Hardened KeyDB RESP over TLS link for transient state and idempotency tracking.',
      protocol: 'TLS',
      'relationship-type': {
        connects: {
          source: { node: 'ephemeral-docker-runners', interfaces: ['runner-cache-client'] },
          destination: { node: 'keydb-state-cache', interfaces: ['keydb-resp-tls-6379'] },
        },
      },
    },
    {
      'unique-id': 'rel-mcp-to-governance-gate',
      description: 'Deterministic SHA-256 verification against manifest.json and 10-stage 11X certification gate.',
      'relationship-type': {
        connects: {
          source: { node: 'mcp-qa-11x-server', interfaces: ['mcp-governance-verifier'] },
          destination: { node: 'governance-certification-gate', interfaces: ['governance-sha256-gate'] },
        },
      },
    },
  ],
  controls: Object.fromEntries(
    REQUIRED_CALM_CONTROL_IDS.map((controlId) => {
      const meta = CANONICAL_CONTROL_METADATA[controlId];
      return [
        controlId,
        {
          description: meta.description,
          requirements: [
            {
              'requirement-url': 'https://calm.finos.org/release/1.2/meta/control-requirement.json',
              config: {
                'control-id': meta.controlId,
                name: meta.name,
                description: meta.reqDescription,
              },
            },
          ],
        },
      ];
    })
  ),
};

function loadCanonicalDoc(): CalmDoc {
  if (HAS_REAL_CALM_MODEL) {
    return JSON.parse(fs.readFileSync(REAL_CALM_PATH, 'utf8')) as CalmDoc;
  }
  return structuredClone(CANONICAL_CALM_FIXTURE);
}

const tempDirs: string[] = [];

function createWorkspaceWithModel(doc: unknown, relPath = DEFAULT_CALM_ARCHITECTURE_PATH): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-calm-test-'));
  tempDirs.push(dir);
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const content = typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2);
  fs.writeFileSync(full, content, 'utf8');
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('validateCalmArchitecture (FINOS CALM 11X Gate)', () => {
  it('approves canonical architecture/qa-11x.calm.json with Pass-Quiet single-line summary', () => {
    const workspaceRoot = HAS_REAL_CALM_MODEL
      ? REPO_CANDIDATE
      : createWorkspaceWithModel(loadCanonicalDoc());
    const res = validateCalmArchitecture({ workspaceRoot });
    expect(res.valid).toBe(true);
    expect(res.nodeCount).toBe(6);
    expect(res.relationshipCount).toBe(5);
    expect(res.controlCount).toBe(7);
    expect(res.violations).toHaveLength(0);
    expect(res.summary).toBe(
      '✅ [CALM] architecture/qa-11x.calm.json validado (6 nodos, 5 relaciones, 7 controles)'
    );
    expect(res.summary.includes('\n')).toBe(false);

    vi.spyOn(process, 'cwd').mockReturnValue(workspaceRoot);
    const mcpRes = handleValidateCalmArchitecture();
    expect(mcpRes.isError).toBe(false);
    expect(mcpRes.content[0]).toEqual({
      type: 'text',
      text: res.summary,
    });
    expect(VALIDATE_CALM_ARCHITECTURE_TOOL.name).toBe('validate_calm_architecture');

    const canonicalDoc = loadCanonicalDoc();
    expect(getControl(canonicalDoc, 'worm-hmac-audit-chain').requirements?.[0]?.config?.['control-id']).toBe('SEC-14');
    expect(getControl(canonicalDoc, 'cli-tty-anti-hang-guard').requirements?.[0]?.config?.['control-id']).toBe(
      'QA-CLI-TTY-01'
    );
    expect(getControl(canonicalDoc, 'git-closure-human-gate').requirements?.[0]?.config?.['control-id']).toBe(
      'QA-GIT-GATE-01'
    );
    for (const node of canonicalDoc.nodes) {
      expect(Array.isArray(node.interfaces) && node.interfaces.length > 0).toBe(true);
    }
    const relById = new Map<string, CalmRelationship>(
      canonicalDoc.relationships.map((rel) => [String(rel['unique-id']), rel])
    );
    expect(relById.get('rel-runners-to-postgres17-rls')?.protocol).toBe('TLS');
    expect(relById.get('rel-runners-to-keydb-cache')?.protocol).toBe('TLS');
    for (const rel of canonicalDoc.relationships) {
      expect(typeof rel.description === 'string' && rel.description.length > 0).toBe(true);
    }

    const fixtureWs = createWorkspaceWithModel(structuredClone(CANONICAL_CALM_FIXTURE));
    const fixtureRes = validateCalmArchitecture({ workspaceRoot: fixtureWs });
    expect(fixtureRes.valid).toBe(true);
    expect(fixtureRes.controlCount).toBe(7);
  });

  it('resolves default repository root from mcp-server cwd and handles missing file in neutral cwd', () => {
    const wsWithMcpSubdir = createWorkspaceWithModel(loadCanonicalDoc());
    const mcpSubdir = path.join(wsWithMcpSubdir, 'mcp-server');
    fs.mkdirSync(mcpSubdir, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(mcpSubdir);

    const defaultCall = validateCalmArchitecture();
    expect(defaultCall.valid).toBe(true);

    const emptyWs = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-calm-empty-'));
    tempDirs.push(emptyWs);
    vi.spyOn(process, 'cwd').mockReturnValue(emptyWs);
    const missingFromCwd = validateCalmArchitecture();
    expect(missingFromCwd.valid).toBe(false);
    expect(missingFromCwd.violations[0]?.code).toBe('FILE_NOT_FOUND');

    const dirAsTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-calm-dir-'));
    tempDirs.push(dirAsTarget);
    fs.mkdirSync(path.join(dirAsTarget, 'architecture'), { recursive: true });
    const dirRes = validateCalmArchitecture({
      workspaceRoot: dirAsTarget,
      architecturePath: 'architecture',
    });
    expect(dirRes.valid).toBe(false);
    expect(dirRes.violations[0]?.code).toBe('FILE_NOT_FOUND');

    const nonexistentWsRes = validateCalmArchitecture({
      workspaceRoot: path.join(os.tmpdir(), `qa-calm-missing-root-${Date.now()}`),
    });
    expect(nonexistentWsRes.valid).toBe(false);
    expect(nonexistentWsRes.violations[0]?.code).toBe('FILE_NOT_FOUND');
  });

  it.each(REQUIRED_CALM_CONTROL_IDS)(
    'rejects model when mandatory security control %s is removed',
    (controlId) => {
      const doc = loadCanonicalDoc();
      delete doc.controls?.[controlId];
      const ws = createWorkspaceWithModel(doc);

      const res = validateCalmArchitecture({ workspaceRoot: ws });
      expect(res.valid).toBe(false);
      expect(
        res.violations.some((v) => v.code === 'MISSING_REQUIRED_CONTROL' && v.subject === controlId)
      ).toBe(true);
      expect(handleValidateCalmArchitecture({ workspaceRoot: ws }).isError).toBe(true);
    }
  );

  it('rejects inactive, malformed, or missing controls block', () => {
    const disabledDoc = loadCanonicalDoc();
    getControl(disabledDoc, 'postgres-rls-isolation').enabled = false;
    const wsDisabled = createWorkspaceWithModel(disabledDoc);
    expect(validateCalmArchitecture({ workspaceRoot: wsDisabled }).violations[0]?.code).toBe(
      'INACTIVE_CONTROL'
    );

    const nonObjControlDoc = loadCanonicalDoc();
    if (nonObjControlDoc.controls) {
      (nonObjControlDoc.controls as Record<string, unknown>)['prompt-injection-guard'] = 'invalid';
    }
    const wsNonObjCtrl = createWorkspaceWithModel(nonObjControlDoc);
    expect(validateCalmArchitecture({ workspaceRoot: wsNonObjCtrl }).violations[0]?.code).toBe(
      'INACTIVE_CONTROL'
    );

    const emptyReqsDoc = loadCanonicalDoc();
    getControl(emptyReqsDoc, 'vault-aes-256-gcm').requirements = [{ 'requirement-url': '', config: {} }];
    const wsEmptyReqs = createWorkspaceWithModel(emptyReqsDoc);
    expect(validateCalmArchitecture({ workspaceRoot: wsEmptyReqs }).violations[0]?.code).toBe(
      'INACTIVE_CONTROL'
    );

    const missingConfigDoc = loadCanonicalDoc();
    getControl(missingConfigDoc, 'worm-hmac-audit-chain').requirements = [
      { 'requirement-url': 'https://calm.finos.org/release/1.2/meta/control-requirement.json' },
    ];
    const wsMissingConfig = createWorkspaceWithModel(missingConfigDoc);
    expect(validateCalmArchitecture({ workspaceRoot: wsMissingConfig }).violations[0]?.code).toBe(
      'INACTIVE_CONTROL'
    );

    const noControlsDoc = loadCanonicalDoc();
    delete noControlsDoc.controls;
    const wsNoControls = createWorkspaceWithModel(noControlsDoc);
    expect(
      validateCalmArchitecture({ workspaceRoot: wsNoControls }).violations.some(
        (v) => v.code === 'MISSING_REQUIRED_CONTROL' && v.subject === 'controls'
      )
    ).toBe(true);
  });

  it('rejects dangling relationships, missing required edges, and disconnected critical nodes', () => {
    const danglingDoc = loadCanonicalDoc();
    const firstRel = danglingDoc.relationships[0];
    if (firstRel?.['relationship-type']?.connects?.destination) {
      firstRel['relationship-type'].connects.destination.node = 'ghost-node';
    }
    const wsDangling = createWorkspaceWithModel(danglingDoc);
    const resDangling = validateCalmArchitecture({ workspaceRoot: wsDangling });
    expect(resDangling.valid).toBe(false);
    expect(resDangling.violations.some((v) => v.code === 'DANGLING_RELATIONSHIP_NODE')).toBe(true);
    expect(resDangling.violations.some((v) => v.code === 'MISSING_REQUIRED_RELATIONSHIP')).toBe(true);

    const orphanDoc = loadCanonicalDoc();
    orphanDoc.nodes.push({
      'unique-id': 'orphan-critical-service',
      'node-type': 'service',
      name: 'Orphan Service',
      description: 'Disconnected component without relationship edges',
    });
    const wsOrphan = createWorkspaceWithModel(orphanDoc);
    const resOrphan = validateCalmArchitecture({ workspaceRoot: wsOrphan });
    expect(resOrphan.valid).toBe(false);
    expect(
      resOrphan.violations.some(
        (v) => v.code === 'ORPHAN_CRITICAL_NODE' && v.subject === 'orphan-critical-service'
      )
    ).toBe(true);
  });

  it('rejects duplicate IDs, missing required nodes, and malformed node or relationship entries', () => {
    const dupNodeDoc = loadCanonicalDoc();
    if (dupNodeDoc.nodes[0]) {
      dupNodeDoc.nodes.push({ ...dupNodeDoc.nodes[0] });
    }
    const wsDupNode = createWorkspaceWithModel(dupNodeDoc);
    expect(
      validateCalmArchitecture({ workspaceRoot: wsDupNode }).violations.some(
        (v) => v.code === 'DUPLICATE_NODE_ID'
      )
    ).toBe(true);

    const dupRelDoc = loadCanonicalDoc();
    if (dupRelDoc.relationships[0]) {
      dupRelDoc.relationships.push({ ...dupRelDoc.relationships[0] });
    }
    const wsDupRel = createWorkspaceWithModel(dupRelDoc);
    expect(
      validateCalmArchitecture({ workspaceRoot: wsDupRel }).violations.some(
        (v) => v.code === 'DUPLICATE_RELATIONSHIP_ID'
      )
    ).toBe(true);

    const missingNodeDoc = loadCanonicalDoc();
    missingNodeDoc.nodes = missingNodeDoc.nodes.filter(
      (n) => n['unique-id'] !== REQUIRED_CALM_NODE_IDS[3]
    );
    const wsMissingNode = createWorkspaceWithModel(missingNodeDoc);
    expect(
      validateCalmArchitecture({ workspaceRoot: wsMissingNode }).violations.some(
        (v) => v.code === 'MISSING_REQUIRED_NODE' && v.subject === REQUIRED_CALM_NODE_IDS[3]
      )
    ).toBe(true);

    const badNodeDoc = loadCanonicalDoc();
    (badNodeDoc.nodes as unknown[]).push('not-an-object', { 'unique-id': 'bad-node', 'node-type': 'service' });
    const wsBadNode = createWorkspaceWithModel(badNodeDoc);
    const resBadNode = validateCalmArchitecture({ workspaceRoot: wsBadNode });
    expect(
      resBadNode.violations.filter((v) => v.code === 'MISSING_NODE_FIELD').length
    ).toBeGreaterThanOrEqual(2);

    const badRelDoc = loadCanonicalDoc();
    (badRelDoc.relationships as unknown[]).push(
      'bad-rel',
      { 'unique-id': 'missing-type' },
      { 'unique-id': 'empty-type', 'relationship-type': {} },
      {
        'unique-id': 'interacts-rel',
        'relationship-type': {
          interacts: { actor: 'qa-11x-ai-ide-host', nodes: ['mcp-qa-11x-server'] },
        },
      },
      {
        'unique-id': 'deployed-rel',
        'relationship-type': {
          'deployed-in': { container: 'ephemeral-docker-runners', nodes: ['keydb-state-cache'] },
        },
      },
      {
        'unique-id': 'composed-rel',
        'relationship-type': {
          'composed-of': { container: 'mcp-qa-11x-server', nodes: ['governance-certification-gate'] },
        },
      },
      {
        'unique-id': 'bad-connects',
        'relationship-type': {
          connects: { source: 'raw-string', destination: { node: '' } },
        },
      },
      {
        'unique-id': 'bad-interacts',
        'relationship-type': {
          interacts: { actor: '', nodes: 'not-array' },
        },
      },
      {
        'unique-id': 'bad-composed',
        'relationship-type': {
          'composed-of': { container: '', nodes: ['keydb-state-cache'] },
        },
      }
    );
    const wsBadRel = createWorkspaceWithModel(badRelDoc);
    const resBadRel = validateCalmArchitecture({ workspaceRoot: wsBadRel });
    expect(
      resBadRel.violations.filter((v) => v.code === 'MISSING_RELATIONSHIP_FIELD').length
    ).toBeGreaterThanOrEqual(6);

    const nonArrayDoc = { nodes: 'bad', relationships: 'bad', controls: {} };
    const wsNonArray = createWorkspaceWithModel(nonArrayDoc);
    const resNonArray = validateCalmArchitecture({ workspaceRoot: wsNonArray });
    expect(resNonArray.violations.some((v) => v.code === 'MISSING_NODE_FIELD')).toBe(true);
    expect(resNonArray.violations.some((v) => v.code === 'MISSING_RELATIONSHIP_FIELD')).toBe(true);
  });

  it('rejects invalid JSON, non-object JSON roots, and path traversal / symlink escape attempts', () => {
    const wsInvalidJson = createWorkspaceWithModel('{ invalid json ');
    const resInvalidJson = validateCalmArchitecture({ workspaceRoot: wsInvalidJson });
    expect(resInvalidJson.valid).toBe(false);
    expect(resInvalidJson.violations[0]?.code).toBe('INVALID_JSON');

    if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
      const wsReadFail = createWorkspaceWithModel(loadCanonicalDoc());
      const unreadableFile = path.join(wsReadFail, DEFAULT_CALM_ARCHITECTURE_PATH);
      fs.chmodSync(unreadableFile, 0o000);
      try {
        const resReadFail = validateCalmArchitecture({ workspaceRoot: wsReadFail });
        expect(resReadFail.valid).toBe(false);
        expect(resReadFail.violations[0]?.code).toBe('FILE_NOT_FOUND');
      } finally {
        fs.chmodSync(unreadableFile, 0o600);
      }
    } else {
      const wsMissing = createWorkspaceWithModel(loadCanonicalDoc(), 'architecture/other.calm.json');
      const resMissing = validateCalmArchitecture({ workspaceRoot: wsMissing });
      expect(resMissing.valid).toBe(false);
      expect(resMissing.violations[0]?.code).toBe('FILE_NOT_FOUND');
    }

    const wsArrayRoot = createWorkspaceWithModel('[]');
    const resArrayRoot = validateCalmArchitecture({ workspaceRoot: wsArrayRoot });
    expect(resArrayRoot.valid).toBe(false);
    expect(resArrayRoot.violations[0]?.code).toBe('INVALID_DOCUMENT_ROOT');

    const traversalWs = createWorkspaceWithModel(loadCanonicalDoc());
    const traversalDotDot = validateCalmArchitecture({
      workspaceRoot: traversalWs,
      architecturePath: '../../etc/passwd',
    });
    expect(traversalDotDot.valid).toBe(false);
    expect(traversalDotDot.violations[0]?.code).toBe('PATH_TRAVERSAL');

    const traversalAbs = validateCalmArchitecture({
      workspaceRoot: traversalWs,
      architecturePath: '/etc/passwd',
    });
    expect(traversalAbs.valid).toBe(false);
    expect(traversalAbs.violations[0]?.code).toBe('PATH_TRAVERSAL');

    const traversalNull = validateCalmArchitecture({
      workspaceRoot: traversalWs,
      architecturePath: 'architecture/qa-11x.calm.json\0.txt',
    });
    expect(traversalNull.valid).toBe(false);
    expect(traversalNull.violations[0]?.code).toBe('PATH_TRAVERSAL');

    const outsideFile = path.join(os.tmpdir(), `qa-calm-outside-${Date.now()}.json`);
    fs.writeFileSync(outsideFile, '{}', 'utf8');
    const wsSymlink = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-calm-symlink-'));
    tempDirs.push(wsSymlink);
    try {
      fs.symlinkSync(outsideFile, path.join(wsSymlink, 'escape.calm.json'));
      const resSymlink = validateCalmArchitecture({
        workspaceRoot: wsSymlink,
        architecturePath: 'escape.calm.json',
      });
      expect(resSymlink.valid).toBe(false);
      expect(resSymlink.violations[0]?.code).toBe('PATH_TRAVERSAL');

      const loopA = path.join(wsSymlink, 'loop-a.calm.json');
      const loopB = path.join(wsSymlink, 'loop-b.calm.json');
      fs.symlinkSync(loopB, loopA);
      fs.symlinkSync(loopA, loopB);
      const resLoop = validateCalmArchitecture({
        workspaceRoot: wsSymlink,
        architecturePath: 'loop-a.calm.json',
      });
      expect(resLoop.valid).toBe(false);
      expect(resLoop.violations[0]?.code).toBe('PATH_TRAVERSAL');
    } finally {
      fs.rmSync(outsideFile, { force: true });
    }
  });

  it('executes embedded JS payload from validate_calm_architecture.sh under real Node against nominal & negative fixtures ([30], M038)', () => {
    if (!HAS_REAL_CALM_MODEL || !fs.existsSync(VALIDATE_CALM_SH_PATH)) {
      return;
    }
    const shText = fs.readFileSync(VALIDATE_CALM_SH_PATH, 'utf8');
    const startMark = "node - <<'JSEOF'\n";
    const startIdx = shText.indexOf(startMark);
    const endIdx = shText.indexOf('\nJSEOF', startIdx);
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
    const jsPayload = shText.slice(startIdx + startMark.length, endIdx);

    const runPayload = (
      cwd: string,
      archRel: string,
      profile: 'auto' | 'generic' | 'qa-11x-self' = 'auto'
    ): { ok: boolean; out: string } => {
      try {
        const stdout = execFileSync(process.execPath, ['-e', jsPayload], {
          cwd,
          env: { ...process.env, ARCH_INPUT: archRel, CALM_PROFILE: profile },
          encoding: 'utf8',
        });
        return { ok: true, out: stdout };
      } catch (err: unknown) {
        const procErr = err as { stderr?: string; stdout?: string; message?: string };
        return { ok: false, out: `${procErr.stderr ?? ''}${procErr.stdout ?? ''}` };
      }
    };

    const ws = createWorkspaceWithModel(loadCanonicalDoc());
    const nominal = runPayload(ws, DEFAULT_CALM_ARCHITECTURE_PATH, 'qa-11x-self');
    expect(nominal.ok).toBe(true);
    expect(nominal.out).toContain('architecture/qa-11x.calm.json|6|5|7');

    // Consumer generic profile without monorepo nodes/controls passes cleanly (incl. @finos/calm-cli --strict)
    const consumerFile = path.join(ws, 'architecture', 'consumer.calm.json');
    fs.writeFileSync(
      consumerFile,
      JSON.stringify({
        $schema: 'https://calm.finos.org/release/1.2/meta/calm.json',
        nodes: [
          {
            'unique-id': 'svc-a',
            'node-type': 'service',
            name: 'Service A',
            description: 'Consumer API service',
            interfaces: [{ 'unique-id': 'svc-a-db-client' }],
          },
          {
            'unique-id': 'db-b',
            'node-type': 'database',
            name: 'Database B',
            description: 'Consumer PostgreSQL database',
            interfaces: [{ 'unique-id': 'db-b-tls-5432' }],
          },
        ],
        relationships: [
          {
            'unique-id': 'rel-ab',
            description: 'Service A queries Database B over TLS',
            protocol: 'TLS',
            'relationship-type': {
              connects: {
                source: { node: 'svc-a', interfaces: ['svc-a-db-client'] },
                destination: { node: 'db-b', interfaces: ['db-b-tls-5432'] },
              },
            },
          },
        ],
        controls: {
          'tenant-rls': {
            description: 'Tenant RLS isolation control',
            nodes: ['db-b'],
            requirements: [
              {
                'requirement-url':
                  'https://calm.finos.org/release/1.2/meta/control-requirement.json',
                config: {
                  'control-id': 'CONS-RLS-01',
                  name: 'Consumer Tenant RLS',
                  description: 'Enforces tenant isolation on Database B.',
                },
              },
            ],
          },
        },
      }),
      'utf8'
    );
    expect(runPayload(ws, 'architecture/consumer.calm.json', 'generic').ok).toBe(true);

    // Exhaustive coverage of all CALM validator error codes in real Node.js:
    const badJsonFile = path.join(ws, 'architecture', 'bad.calm.json');

    // 1. INVALID_JSON
    fs.writeFileSync(badJsonFile, '{invalid', 'utf8');
    expect(runPayload(ws, 'architecture/bad.calm.json').out).toContain('[INVALID_JSON]');

    // 2. DUPLICATE_JSON_KEY
    fs.writeFileSync(badJsonFile, '{"nodes":[],"nodes":[]}', 'utf8');
    expect(runPayload(ws, 'architecture/bad.calm.json').out).toContain('[DUPLICATE_JSON_KEY]');

    // 3. Missing arrays & required nodes/relationships/controls
    fs.writeFileSync(badJsonFile, '{}', 'utf8');
    const emptyDocOut = runPayload(ws, 'architecture/bad.calm.json', 'qa-11x-self').out;
    expect(emptyDocOut).toContain('[MISSING_NODE_FIELD] Falta arreglo nodes.');
    expect(emptyDocOut).toContain('[MISSING_RELATIONSHIP_FIELD] Falta arreglo relationships.');
    expect(emptyDocOut).toContain('[MISSING_REQUIRED_NODE]');
    expect(emptyDocOut).toContain('[MISSING_REQUIRED_RELATIONSHIP]');
    expect(emptyDocOut).toContain('[MISSING_REQUIRED_CONTROL]');

    // 4. MISSING_NODE_FIELD
    const noMetaDoc = loadCanonicalDoc();
    delete noMetaDoc.nodes[0]?.['node-type'];
    delete noMetaDoc.nodes[0]?.name;
    fs.writeFileSync(badJsonFile, JSON.stringify(noMetaDoc), 'utf8');
    const noMetaRes = runPayload(ws, 'architecture/bad.calm.json');
    expect(noMetaRes.ok).toBe(false);
    expect(noMetaRes.out).toContain('[MISSING_NODE_FIELD]');

    // 5. DUPLICATE_RELATIONSHIP_ID, MISSING_RELATIONSHIP_FIELD, ORPHAN_CRITICAL_NODE, DANGLING_CONTROL_TARGET
    const structuralBad = loadCanonicalDoc();
    structuralBad.nodes.push({
      'unique-id': 'orphan-svc',
      'node-type': 'service',
      name: 'Orphan',
      description: 'Disconnected node',
    });
    const firstRel = structuralBad.relationships[0];
    if (firstRel) {
      structuralBad.relationships.push({ ...firstRel });
    }
    structuralBad.relationships.push({
      'unique-id': 'empty-rel',
      'relationship-type': {},
    });
    structuralBad.controls = {
      ...structuralBad.controls,
      'dangling-target-ctrl': {
        description: 'Points to nonexistent node',
        nodes: ['ghost-node-999'],
        requirements: [{ 'requirement-url': 'https://example.org/ghost' }],
      },
    };
    fs.writeFileSync(badJsonFile, JSON.stringify(structuralBad), 'utf8');
    const structuralOut = runPayload(ws, 'architecture/bad.calm.json', 'qa-11x-self').out;
    expect(structuralOut).toContain('[DUPLICATE_RELATIONSHIP_ID]');
    expect(structuralOut).toContain('[MISSING_RELATIONSHIP_FIELD]');
    expect(structuralOut).toContain('[ORPHAN_CRITICAL_NODE]');
    expect(structuralOut).toContain('[DANGLING_CONTROL_TARGET]');

    // 6. DUPLICATE_NODE_ID, DANGLING_RELATIONSHIP_NODE, INACTIVE_CONTROL, UNREFERENCED_CONTROL
    const dupAndDangling = loadCanonicalDoc();
    dupAndDangling.nodes.push({ ...dupAndDangling.nodes[0] });
    dupAndDangling.relationships.push({
      'unique-id': 'dangling-rel',
      'relationship-type': {
        connects: { source: { node: 'missing-node' }, destination: { node: 'mcp-qa-11x-server' } },
      },
    });
    const guardCtrl = getControl(dupAndDangling, 'prompt-injection-guard');
    guardCtrl.enabled = false;
    dupAndDangling.controls = {
      ...dupAndDangling.controls,
      'orphan-unused-ctrl': {
        description: 'Unused control',
        requirements: [{ 'requirement-url': 'https://example.org/unused' }],
      },
    };
    fs.writeFileSync(badJsonFile, JSON.stringify(dupAndDangling), 'utf8');
    const multiBad = runPayload(ws, 'architecture/bad.calm.json', 'qa-11x-self');
    expect(multiBad.ok).toBe(false);
    expect(multiBad.out).toContain('[DUPLICATE_NODE_ID]');
    expect(multiBad.out).toContain('[DANGLING_RELATIONSHIP_NODE]');
    expect(multiBad.out).toContain('[INACTIVE_CONTROL]');
    expect(multiBad.out).toContain('[UNREFERENCED_CONTROL]');

    // 7. PATH_TRAVERSAL via external symlink
    const extTarget = path.join(os.tmpdir(), `calm-ext-${Date.now()}.json`);
    fs.writeFileSync(extTarget, '{}', 'utf8');
    try {
      fs.symlinkSync(extTarget, path.join(ws, 'architecture', 'sym.calm.json'));
      const symRes = runPayload(ws, 'architecture/sym.calm.json');
      expect(symRes.ok).toBe(false);
      expect(symRes.out).toContain('[PATH_TRAVERSAL]');
    } finally {
      fs.rmSync(extTarget, { force: true });
    }

    // 8. End-to-end bash wrapper + real Node execution under QA_IN_CONTAINER=1
    const consumerScript = path.join(ws, '.agents', 'scripts', 'validate_calm_architecture.sh');
    fs.mkdirSync(path.dirname(consumerScript), { recursive: true });
    fs.copyFileSync(VALIDATE_CALM_SH_PATH, consumerScript);
    const bashExec = (args: string[], cwd: string): { ok: boolean; out: string } => {
      try {
        const out = execFileSync('/bin/bash', [consumerScript, ...args], {
          cwd,
          env: { ...process.env, QA_IN_CONTAINER: '1' },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { ok: true, out };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string };
        return { ok: false, out: `${e.stdout ?? ''}\n${e.stderr ?? ''}` };
      }
    };
    const shGeneric = bashExec(['architecture/consumer.calm.json', '--profile=generic'], ws);
    expect(shGeneric.ok).toBe(true);
    expect(shGeneric.out).toContain('validado');
    const shSelfFail = bashExec(['architecture/consumer.calm.json', '--profile', 'qa-11x-self'], ws);
    expect(shSelfFail.ok).toBe(false);
    expect(shSelfFail.out).toContain('[MISSING_REQUIRED_NODE]');
    const shBadProf = bashExec(['--profile=bogus'], ws);
    expect(shBadProf.ok).toBe(false);
    expect(shBadProf.out).toContain('Perfil no soportado');
  });
});
