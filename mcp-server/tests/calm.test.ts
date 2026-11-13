// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

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

type CalmDoc = Record<string, any>;

const CANONICAL_CALM_FIXTURE: CalmDoc = {
  $schema: 'https://calm.finos.org/release/1.2/meta/calm.json',
  nodes: [
    {
      'unique-id': 'qa-11x-ai-ide-host',
      'node-type': 'actor',
      name: 'QA-11X AI IDE Host',
      description: 'Agentic IDE host',
    },
    {
      'unique-id': 'mcp-qa-11x-server',
      'node-type': 'service',
      name: 'MCP QA-11X Server',
      description: 'MCP server',
    },
    {
      'unique-id': 'ephemeral-docker-runners',
      'node-type': 'system',
      name: 'Ephemeral Docker Runners',
      description: 'Non-root runners',
    },
    {
      'unique-id': 'postgres17-rls-store',
      'node-type': 'database',
      name: 'PostgreSQL 17 RLS Store',
      description: 'PostgreSQL 17 RLS',
    },
    {
      'unique-id': 'keydb-state-cache',
      'node-type': 'database',
      name: 'KeyDB State Cache',
      description: 'KeyDB cache',
    },
    {
      'unique-id': 'governance-certification-gate',
      'node-type': 'service',
      name: 'Governance Certification Gate',
      description: '10-stage gate',
    },
  ],
  relationships: [
    {
      'unique-id': 'rel-ide-to-mcp-server',
      'relationship-type': {
        connects: {
          source: { node: 'qa-11x-ai-ide-host' },
          destination: { node: 'mcp-qa-11x-server' },
        },
      },
    },
    {
      'unique-id': 'rel-mcp-to-ephemeral-runners',
      'relationship-type': {
        connects: {
          source: { node: 'mcp-qa-11x-server' },
          destination: { node: 'ephemeral-docker-runners' },
        },
      },
    },
    {
      'unique-id': 'rel-runners-to-postgres17-rls',
      'relationship-type': {
        connects: {
          source: { node: 'ephemeral-docker-runners' },
          destination: { node: 'postgres17-rls-store' },
        },
      },
    },
    {
      'unique-id': 'rel-runners-to-keydb-cache',
      'relationship-type': {
        connects: {
          source: { node: 'ephemeral-docker-runners' },
          destination: { node: 'keydb-state-cache' },
        },
      },
    },
    {
      'unique-id': 'rel-mcp-to-governance-gate',
      'relationship-type': {
        connects: {
          source: { node: 'mcp-qa-11x-server' },
          destination: { node: 'governance-certification-gate' },
        },
      },
    },
  ],
  controls: Object.fromEntries(
    REQUIRED_CALM_CONTROL_IDS.map((controlId, index) => [
      controlId,
      {
        description: `Control ${controlId}`,
        requirements: [
          {
            'requirement-url': 'https://calm.finos.org/release/1.2/meta/control-requirement.json',
            config: {
              'control-id': `QA-CTRL-${index + 1}`,
              name: controlId,
              description: `Requirement for ${controlId}`,
            },
          },
        ],
      },
    ])
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
      delete doc.controls[controlId];
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
    disabledDoc.controls['postgres-rls-isolation'].enabled = false;
    const wsDisabled = createWorkspaceWithModel(disabledDoc);
    expect(validateCalmArchitecture({ workspaceRoot: wsDisabled }).violations[0]?.code).toBe(
      'INACTIVE_CONTROL'
    );

    const nonObjControlDoc = loadCanonicalDoc();
    nonObjControlDoc.controls['prompt-injection-guard'] = 'invalid';
    const wsNonObjCtrl = createWorkspaceWithModel(nonObjControlDoc);
    expect(validateCalmArchitecture({ workspaceRoot: wsNonObjCtrl }).violations[0]?.code).toBe(
      'INACTIVE_CONTROL'
    );

    const emptyReqsDoc = loadCanonicalDoc();
    emptyReqsDoc.controls['vault-aes-256-gcm'].requirements = [{ 'requirement-url': '', config: {} }];
    const wsEmptyReqs = createWorkspaceWithModel(emptyReqsDoc);
    expect(validateCalmArchitecture({ workspaceRoot: wsEmptyReqs }).violations[0]?.code).toBe(
      'INACTIVE_CONTROL'
    );

    const missingConfigDoc = loadCanonicalDoc();
    missingConfigDoc.controls['worm-hmac-audit-chain'].requirements = [
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
    danglingDoc.relationships[0]['relationship-type'].connects.destination.node = 'ghost-node';
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
    dupNodeDoc.nodes.push({ ...dupNodeDoc.nodes[0] });
    const wsDupNode = createWorkspaceWithModel(dupNodeDoc);
    expect(
      validateCalmArchitecture({ workspaceRoot: wsDupNode }).violations.some(
        (v) => v.code === 'DUPLICATE_NODE_ID'
      )
    ).toBe(true);

    const dupRelDoc = loadCanonicalDoc();
    dupRelDoc.relationships.push({ ...dupRelDoc.relationships[0] });
    const wsDupRel = createWorkspaceWithModel(dupRelDoc);
    expect(
      validateCalmArchitecture({ workspaceRoot: wsDupRel }).violations.some(
        (v) => v.code === 'DUPLICATE_RELATIONSHIP_ID'
      )
    ).toBe(true);

    const missingNodeDoc = loadCanonicalDoc();
    missingNodeDoc.nodes = missingNodeDoc.nodes.filter(
      (n: CalmDoc) => n['unique-id'] !== REQUIRED_CALM_NODE_IDS[3]
    );
    const wsMissingNode = createWorkspaceWithModel(missingNodeDoc);
    expect(
      validateCalmArchitecture({ workspaceRoot: wsMissingNode }).violations.some(
        (v) => v.code === 'MISSING_REQUIRED_NODE' && v.subject === REQUIRED_CALM_NODE_IDS[3]
      )
    ).toBe(true);

    const badNodeDoc = loadCanonicalDoc();
    badNodeDoc.nodes.push('not-an-object', { 'unique-id': 'bad-node', 'node-type': 'service' });
    const wsBadNode = createWorkspaceWithModel(badNodeDoc);
    const resBadNode = validateCalmArchitecture({ workspaceRoot: wsBadNode });
    expect(
      resBadNode.violations.filter((v) => v.code === 'MISSING_NODE_FIELD').length
    ).toBeGreaterThanOrEqual(2);

    const badRelDoc = loadCanonicalDoc();
    badRelDoc.relationships.push(
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

    const wsReadFail = createWorkspaceWithModel(loadCanonicalDoc());
    const unreadableFile = path.join(wsReadFail, DEFAULT_CALM_ARCHITECTURE_PATH);
    fs.chmodSync(unreadableFile, 0o000);
    try {
      const resReadFail = validateCalmArchitecture({ workspaceRoot: wsReadFail });
      expect(resReadFail.valid).toBe(false);
      expect(resReadFail.violations[0]?.code).toBe('FILE_NOT_FOUND');
    } finally {
      fs.chmodSync(unreadableFile, 0o644);
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
    } finally {
      fs.rmSync(outsideFile, { force: true });
    }
  });
});
