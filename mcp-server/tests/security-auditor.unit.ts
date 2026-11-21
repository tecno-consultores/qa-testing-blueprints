// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { auditSecurityStigOwasp, groupFindingsByRule } from '../src/tools/security-auditor.js';

describe('security-auditor', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-sec-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('aprueba un proyecto nominal limpio sin hallazgos de severidad alta o crítica', async () => {
    // 1. .npmrc con ignore-scripts
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'clean-app' }));
    fs.writeFileSync(path.join(tempDir, '.npmrc'), 'ignore-scripts=true\n');

    // 2. Esquema Pydantic con extra="forbid"
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'schema.py'),
      `
from pydantic import BaseModel, ConfigDict
import unicodedata

class UserCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str

    def validate_name(self, v):
        return unicodedata.normalize('NFKC', v)
      `
    );

    // 3. main.py con cabeceras OSHP y docs condicionales
    fs.writeFileSync(
      path.join(srcDir, 'main.py'),
      `
from fastapi import FastAPI
app = FastAPI(docs_url=None if PROD else '/docs')
# Headers: Strict-Transport-Security, Content-Security-Policy, X-Content-Type-Options
      `
    );

    const result = await auditSecurityStigOwasp(tempDir);
    expect(result.passed).toBe(true);
    expect(result.findings_count.CRITICAL).toBe(0);
    expect(result.findings_count.HIGH).toBe(0);
  });

  it('detecta violación SEC-01 (Mass Assignment en Pydantic sin extra=forbid)', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'model.py'),
      `
class ItemCreateRequest(BaseModel):
    name: str
    price: float
      `
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec01 = result.findings.find((f) => f.rule_id === 'SEC-01');
    expect(sec01).toBeDefined();
    expect(sec01?.severity).toBe('HIGH');
    expect(result.passed).toBe(false);
  });

  it('detecta violación SEC-02 (Anti-CSWSH en WebSockets sin origin check)', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'ws.py'),
      `
@router.websocket('/ws/telemetry')
async def ws_endpoint(websocket):
    await websocket.accept()
      `
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec02 = result.findings.find((f) => f.rule_id === 'SEC-02');
    expect(sec02).toBeDefined();
    expect(sec02?.severity).toBe('HIGH');
    expect(result.passed).toBe(false);
  });

  it('detecta violaciones SEC-03 (Command Injection, eval, pickle, yaml inseguro)', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'risky.py'),
      `
subprocess.run("ls -la", shell=True)
os.system("echo test")
data = pickle.loads(b"data")
cfg = yaml.load(content)
result = eval("2 + 2")
      `
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec03s = result.findings.filter((f) => f.rule_id === 'SEC-03');
    expect(sec03s.length).toBeGreaterThanOrEqual(4);
    expect(sec03s[0]?.severity).toBe('CRITICAL');
    expect(result.findings_count.CRITICAL).toBeGreaterThanOrEqual(4);
    expect(result.passed).toBe(false);
  });

  it('detecta violación SEC-04 (XML XXE sin defusedxml)', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'parse.py'),
      `
from xml.etree import ElementTree as ET
root = ET.fromstring("<root></root>")
      `
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec04 = result.findings.find((f) => f.rule_id === 'SEC-04');
    expect(sec04).toBeDefined();
    expect(sec04?.severity).toBe('HIGH');
  });

  it('detecta violación SEC-05 (Falta de canonicalización Unicode NFKC)', async () => {
    const apiDir = path.join(tempDir, 'src', 'api');
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(
      path.join(apiDir, 'routes.py'),
      `
# route validator handling raw str without normalization
def validate_input(val: str):
    if len(val) > 10:
        return val
      `
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec05 = result.findings.find((f) => f.rule_id === 'SEC-05');
    expect(sec05).toBeDefined();
    expect(sec05?.severity).toBe('MEDIUM');
  });

  it('detecta violación SEC-06 (Inyección HTML dinámica v-html sin escape)', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'Component.vue'),
      `
<template>
  <div v-html="userSuppliedRawHtml"></div>
</template>
      `
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec06 = result.findings.find((f) => f.rule_id === 'SEC-06');
    expect(sec06).toBeDefined();
    expect(sec06?.severity).toBe('HIGH');
  });

  it('detecta violación SEC-07 (Swagger FastAPI expuesto sin desactivación en prod)', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'app.py'),
      `
from fastapi import FastAPI
app = FastAPI(title="Mi API")
      `
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec07 = result.findings.find((f) => f.rule_id === 'SEC-07');
    expect(sec07).toBeDefined();
    expect(sec07?.severity).toBe('MEDIUM');
  });

  it('detecta violación SEC-09 (package.json sin .npmrc con ignore-scripts=true)', async () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'my-pkg' }));

    const result = await auditSecurityStigOwasp(tempDir);
    const sec09 = result.findings.find((f) => f.rule_id === 'SEC-09');
    expect(sec09).toBeDefined();
    expect(sec09?.severity).toBe('HIGH');
  });

  it('acepta .npmrc con espacio ignore-scripts = true', async () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'my-pkg' }));
    fs.writeFileSync(path.join(tempDir, '.npmrc'), 'ignore-scripts = true\n');

    const result = await auditSecurityStigOwasp(tempDir);
    const sec09 = result.findings.find((f) => f.rule_id === 'SEC-09');
    expect(sec09).toBeUndefined();
  });

  it('detecta violación SEC-09 por pnpm.onlyBuiltDependencies obsoleto y plugin:security/recommended sin -legacy en ESLint 8', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'vue3-app',
        devDependencies: { 'eslint-plugin-security': '^3.0.1' },
        pnpm: { onlyBuiltDependencies: ['esbuild'] },
      })
    );
    fs.writeFileSync(path.join(tempDir, '.npmrc'), 'ignore-scripts=true\n');
    fs.writeFileSync(
      path.join(tempDir, '.eslintrc.json'),
      JSON.stringify({ extends: ['eslint:recommended', 'plugin:security/recommended'] })
    );

    const bad = await auditSecurityStigOwasp(tempDir);
    const sec09Findings = bad.findings.filter((f) => f.rule_id === 'SEC-09');
    expect(sec09Findings).toHaveLength(2);
    expect(sec09Findings.every((f) => f.severity === 'MEDIUM')).toBe(true);

    // Corregir migrando a pnpm-workspace.yaml y plugin:security/recommended-legacy
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'vue3-app',
        devDependencies: { 'eslint-plugin-security': '^3.0.1' },
      })
    );
    fs.writeFileSync(path.join(tempDir, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: true\n');
    fs.writeFileSync(
      path.join(tempDir, '.eslintrc.json'),
      JSON.stringify({ extends: ['eslint:recommended', 'plugin:security/recommended-legacy'] })
    );

    const clean = await auditSecurityStigOwasp(tempDir);
    expect(clean.findings.some((f) => f.rule_id === 'SEC-09')).toBe(false);
  });

  it('maneja JSON corrupto o configuraciones parciales en higiene SEC-09 sin lanzar excepciones', async () => {
    const vueSub = path.join(tempDir, 'vue3');
    fs.mkdirSync(vueSub, { recursive: true });
    fs.writeFileSync(path.join(vueSub, 'package.json'), '{not-valid-json');
    fs.writeFileSync(path.join(vueSub, '.npmrc'), 'ignore-scripts=true\n');

    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'root', pnpm: { overrides: {} }, dependencies: { 'eslint-plugin-security': '^2.0.0' } })
    );
    fs.writeFileSync(path.join(tempDir, '.npmrc'), 'ignore-scripts=true\n');
    fs.writeFileSync(path.join(tempDir, '.eslintrc.json'), JSON.stringify({ rules: {} }));

    const result = await auditSecurityStigOwasp(tempDir);
    expect(result.findings.some((f) => f.rule_id === 'SEC-09')).toBe(false);
  });

  it('detecta violación SEC-08 (Servidor backend sin cabeceras OSHP)', async () => {
    fs.writeFileSync(path.join(tempDir, 'main.py'), '# server without security headers\nprint("hello")\n');

    const result = await auditSecurityStigOwasp(tempDir);
    const sec08 = result.findings.find((f) => f.rule_id === 'SEC-08');
    expect(sec08).toBeDefined();
    expect(sec08?.severity).toBe('MEDIUM');
  });

  it('detecta violación SEC-10 (Secretos o claves privadas hardcodeadas)', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'keys.py'),
      [
        '',
        'TOKEN = "ghp_123456789012345678901234567890123456"', // qa-secret-fixture-ok
        'PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\\nMIIEowIBAAKCAQEA..."', // qa-secret-fixture-ok
        'password = "SuperSecretPassword123!"', // qa-secret-fixture-ok
        '      ',
      ].join('\n')
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec10s = result.findings.filter((f) => f.rule_id === 'SEC-10');
    expect(sec10s.length).toBeGreaterThanOrEqual(2);
    expect(sec10s[0]?.severity).toBe('CRITICAL');
  });

  it('detecta violaciones de geometría visual y contraste UI-11X-01', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'View.vue'),
      `
<template>
  <footer class="fixed bottom-0">pie</footer>
  <button class="outline-none">click</button>
  <p class="text-white/40">texto invisible</p>
</template>
      `
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const uiIssues = result.findings.filter((f) => f.rule_id === 'UI-11X-01');
    expect(uiIssues.length).toBe(3);
    expect(uiIssues[0]?.severity).toBe('MEDIUM');
  });

  it('detecta violaciones de PHP: SEC-03 (unserialize inseguro, shell_exec, system, passthru)', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'unsafe.php'),
      `<?php
$data = unserialize($_POST['payload']);
shell_exec("ls -la " . $_GET['dir']);
system("cat /etc/passwd");
passthru("whoami");
`
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec03s = result.findings.filter((f) => f.rule_id === 'SEC-03');
    expect(sec03s.length).toBe(4);
    expect(sec03s.every((f) => f.severity === 'CRITICAL')).toBe(true);
  });

  it('no reporta SEC-03 si unserialize incluye allowed_classes', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'safe.php'),
      `<?php
$data = unserialize($payload, ["allowed_classes" => false]);
`
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec03s = result.findings.filter((f) => f.rule_id === 'SEC-03');
    expect(sec03s.length).toBe(0);
  });

  it('detecta violación SEC-04 en PHP (XML sin LIBXML_NONET)', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'xml.php'),
      `<?php
$doc = new DOMDocument();
$doc->loadXML($userInput);
$xml = simplexml_load_string($rawXml);
`
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec04 = result.findings.find((f) => f.rule_id === 'SEC-04');
    expect(sec04).toBeDefined();
    expect(sec04?.severity).toBe('HIGH');
  });

  it('no reporta SEC-04 en PHP si se especifica LIBXML_NONET, pero sí flaggea LIBXML_NOENT / LIBXML_DTDLOAD aunque esté LIBXML_NONET', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'safe_xml.php'),
      `<?php
$xml = simplexml_load_string($rawXml, 'SimpleXMLElement', LIBXML_NONET);
`
    );

    const safeRes = await auditSecurityStigOwasp(tempDir);
    expect(safeRes.findings.find((f) => f.rule_id === 'SEC-04' && f.file === 'safe_xml.php')).toBeUndefined();

    fs.writeFileSync(
      path.join(tempDir, 'unsafe_noent.php'),
      `<?php
$doc = new DOMDocument();
$doc->loadXML($rawXml, LIBXML_NONET | LIBXML_NOENT);
`
    );
    const unsafeRes = await auditSecurityStigOwasp(tempDir);
    const sec04Noent = unsafeRes.findings.find(
      (f) => f.rule_id === 'SEC-04' && f.file === 'unsafe_noent.php'
    );
    expect(sec04Noent).toBeDefined();
    expect(sec04Noent?.severity).toBe('CRITICAL');
  });

  it('detecta QA-DOCKER-LOCK-01 tras flags RUN --mount y npm install sin npm ci, así como .mjs en SEC-10', async () => {
    fs.writeFileSync(tempDir + '/package.json', JSON.stringify({ name: 'lock-test' }), 'utf8');
    fs.writeFileSync(tempDir + '/.npmrc', 'ignore-scripts=true\n', 'utf8');
    fs.writeFileSync(
      tempDir + '/Dockerfile',
      [
        'FROM node:24-alpine',
        'RUN --mount=type=cache,target=/root/.npm npm install',
        'RUN --mount=type=cache,target=/root/.pnpm pnpm install',
      ].join('\n'),
      'utf8'
    );
    const fakeAiKey = 'sk-ant-api03-' + 'X'.repeat(24);
    fs.writeFileSync(tempDir + '/leak.mjs', `export const key = "${fakeAiKey}";\n`, 'utf8');

    const lockRes = await auditSecurityStigOwasp(tempDir);
    const lockFindings = lockRes.findings.filter(
      (f) => f.rule_id === 'QA-DOCKER-LOCK-01' && f.file === 'Dockerfile'
    );
    expect(lockFindings.length).toBeGreaterThanOrEqual(2);
    expect(lockRes.findings.some((f) => f.rule_id === 'SEC-10' && f.file === 'leak.mjs')).toBe(true);

    // Opciones con comillas en RUN --mount, pnpm add <pkg>, yarn install sin --immutable, y excepciones npm ci / -g
    fs.writeFileSync(
      tempDir + '/Dockerfile',
      [
        'FROM node:24-alpine',
        'RUN --mount="type=cache,target=/root/.npm" pnpm add lodash',
        'RUN yarn install',
        'RUN npm ci',
        'RUN npm install -g pnpm',
      ].join('\n'),
      'utf8'
    );
    const quotedLockRes = await auditSecurityStigOwasp(tempDir);
    const quotedLockLines = quotedLockRes.findings
      .filter((f) => f.rule_id === 'QA-DOCKER-LOCK-01' && f.file === 'Dockerfile')
      .map((f) => f.line);
    expect(quotedLockLines).toEqual([2, 3]);
  });

  it('detecta violación SEC-05 en PHP en controllers sin normalización NFKC', async () => {
    const controllersDir = path.join(tempDir, 'src', 'controllers');
    fs.mkdirSync(controllersDir, { recursive: true });
    fs.writeFileSync(
      path.join(controllersDir, 'UserController.php'),
      `<?php
namespace App\\Controllers;
class UserController {
    public function validate(string $input) {
        $validator = Validation::createValidator();
    }
}
`
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec05 = result.findings.find((f) => f.rule_id === 'SEC-05');
    expect(sec05).toBeDefined();
    expect(sec05?.severity).toBe('MEDIUM');
  });

  it('no reporta SEC-05 en PHP si contiene FORM_KC o normalize', async () => {
    const controllersDir = path.join(tempDir, 'src', 'controllers');
    fs.mkdirSync(controllersDir, { recursive: true });
    fs.writeFileSync(
      path.join(controllersDir, 'SafeController.php'),
      `<?php
namespace App\\Controllers;
class SafeController {
    public function validate(string $input) {
        $clean = \\Normalizer::normalize($input, \\Normalizer::FORM_KC);
        $validator = Validation::createValidator();
    }
}
`
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec05 = result.findings.find((f) => f.rule_id === 'SEC-05');
    expect(sec05).toBeUndefined();
  });

  it('detecta violación SEC-11 cuando se asigna directamente claims.get("sub") o payload.sub a actor_username', async () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'audit_endpoint.py'),
      `# actor_username = claims.get("sub")
def record_action(claims):
    actor_username = claims.get("sub")
    return actor_username
`
    );
    fs.writeFileSync(
      path.join(srcDir, 'audit_service.ts'),
      `// actor_username: payload.sub
export function buildAudit(payload: { sub: string }) {
  return { actor_username: payload.sub };
}
`
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec11s = result.findings.filter((f) => f.rule_id === 'SEC-11');
    expect(sec11s.length).toBe(2);
    expect(sec11s.every((f) => f.severity === 'HIGH')).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('detecta violación SEC-11 cuando un test reemplaza write_audit_log con AsyncMock sin aserciones sobre call_args', async () => {
    const testsDir = path.join(tempDir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(
      path.join(testsDir, 'test_audit_blind.unit.py'),
      `from unittest.mock import AsyncMock, patch

async def test_create_router():
    with patch("app.routers.write_audit_log", new_callable=AsyncMock):
        assert True
`
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec11 = result.findings.find((f) => f.rule_id === 'SEC-11');
    expect(sec11).toBeDefined();
    expect(sec11?.severity).toBe('HIGH');
    expect(sec11?.message).toContain('Mock ciego sobre write_audit_log');
  });

  it('aprueba SEC-11 (0 hallazgos) cuando el test de auditoría verifica assert_awaited_once o call_args', async () => {
    const testsDir = path.join(tempDir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(
      path.join(testsDir, 'test_audit_verified.unit.py'),
      `from unittest.mock import AsyncMock, patch

async def test_create_router():
    with patch("app.routers.write_audit_log", new_callable=AsyncMock) as mock_audit:
        mock_audit.assert_awaited_once()
        assert mock_audit.call_args.kwargs["actor_username"] == "admin_noc"
`
    );
    fs.writeFileSync(
      path.join(testsDir, 'test_other.unit.py'),
      `def test_unrelated():
    write_audit_log_name = "write_audit_log"
    assert write_audit_log_name == "write_audit_log"
`
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec11s = result.findings.filter((f) => f.rule_id === 'SEC-11');
    expect(sec11s.length).toBe(0);
  });

  it('detecta violaciones UI-11X-02 (else return MAINTENANCE y setInterval sin clearInterval)', async () => {
    const viewsDir = path.join(tempDir, 'src', 'views');
    fs.mkdirSync(viewsDir, { recursive: true });
    fs.writeFileSync(
      path.join(viewsDir, 'NocMonitor.vue'),
      `<script setup lang="ts">
import { onMounted } from 'vue';
function getEventBadge(type: string) {
  if (type === 'DOWN') return 'CAÍDA';
  else return 'MAINTENANCE';
}
onMounted(() => {
  setInterval(() => {}, 5000);
});
</script>
`
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const ui02s = result.findings.filter((f) => f.rule_id === 'UI-11X-02');
    expect(ui02s.length).toBe(2);
    expect(ui02s.some((f) => f.severity === 'MEDIUM')).toBe(true);
    expect(ui02s.some((f) => f.severity === 'HIGH')).toBe(true);
  });

  it('aprueba UI-11X-02 cuando setInterval se limpia con clearInterval y los tests se ignoran', async () => {
    const viewsDir = path.join(tempDir, 'src', 'views');
    fs.mkdirSync(viewsDir, { recursive: true });
    fs.writeFileSync(
      path.join(viewsDir, 'CleanDashboard.vue'),
      `<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  timer = setInterval(() => {}, 5000);
});
onUnmounted(() => {
  clearInterval(timer);
});
</script>
`
    );
    fs.writeFileSync(
      path.join(viewsDir, 'CleanDashboard.unit.ts'),
      `// En tests no debe disparar UI-11X-02
setInterval(() => {}, 1000);
`
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const ui02s = result.findings.filter((f) => f.rule_id === 'UI-11X-02');
    expect(ui02s.length).toBe(0);
  });

  it('agrupa hallazgos correctamente con groupFindingsByRule y respeta límite de ubicaciones', () => {
    const rawFindings = [
      {
        rule_id: 'SEC-11-01',
        severity: 'MEDIUM' as const,
        stig_owasp_ref: 'Ref 1',
        file: 'src/a.ts',
        line: 10,
        message: 'Msg 1',
        remediation: 'Rem 1',
      },
      {
        rule_id: 'SEC-11-01',
        severity: 'MEDIUM' as const,
        stig_owasp_ref: 'Ref 1',
        file: 'src/b.ts',
        line: 20,
        message: 'Msg 1',
        remediation: 'Rem 1',
      },
      {
        rule_id: 'SEC-11-02',
        severity: 'HIGH' as const,
        stig_owasp_ref: 'Ref 2',
        file: 'src/c.ts',
        line: 30,
        message: 'Msg 2',
        remediation: 'Rem 2',
      },
    ];

    const grouped = groupFindingsByRule(rawFindings, 1);
    expect(grouped.length).toBe(2);
    const sec01 = grouped.find((g) => g.rule_id === 'SEC-11-01');
    expect(sec01).toBeDefined();
    expect(sec01?.occurrences_count).toBe(2);
    expect(sec01?.locations.length).toBe(1);
    expect(sec01?.locations[0]).toBe('src/a.ts:10');

    const sec02 = grouped.find((g) => g.rule_id === 'SEC-11-02');
    expect(sec02?.occurrences_count).toBe(1);
  });

  it('limita los hallazgos individuales cuando se especifica maxFindings manteniendo conteo total y agrupados', async () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'insecure-app' }));
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    for (let i = 1; i <= 4; i++) {
      fs.writeFileSync(
        path.join(srcDir, `module_${i}.py`),
        `import pickle\nobj = pickle.loads(b"data${i}")\n`
      );
    }

    const fullResult = await auditSecurityStigOwasp(tempDir);
    expect(fullResult.findings.length).toBeGreaterThanOrEqual(4);

    const limitedResult = await auditSecurityStigOwasp(tempDir, 2);
    expect(limitedResult.findings.length).toBe(2);
    expect(limitedResult.findings_count.CRITICAL).toBe(fullResult.findings_count.CRITICAL);
    expect(limitedResult.truncated_findings_count).toBe(fullResult.findings.length - 2);
    expect(limitedResult.grouped_findings).toBeDefined();
    expect(limitedResult.grouped_findings?.length).toBeGreaterThanOrEqual(1);
    expect(limitedResult.grouped_findings?.[0]?.occurrences_count).toBeGreaterThanOrEqual(4);
  });

  it('no reporta falso positivo SEC-11 en tests unitarios que importan y ejecutan write_audit_log real para verificar record_sha256_hash', async () => {
    const testsDir = path.join(tempDir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(
      path.join(testsDir, 'test_audit_worm.unit.py'),
      `from unittest.mock import AsyncMock, MagicMock
from src.core.audit import write_audit_log

async def test_write_audit_log_hash_chain():
    session = MagicMock()
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    entry = await write_audit_log(session, tenant_id="t1", actor_username="admin", action="CREATE")
    assert len(entry.record_sha256_hash) == 64
    assert entry.prev_record_hash == "0" * 64
`
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec11 = result.findings.filter((f) => f.rule_id === 'SEC-11');
    expect(sec11.length).toBe(0);
  });

  it('detecta SEC-13 (RLS sin after_begin), SEC-14 (WORM sin seq_num + pg_advisory_xact_lock) y QA-COV-01 (pytest -o addopts="" sin --cov)', async () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'db.py'),
      `from sqlalchemy.ext.asyncio import AsyncSession
async def set_tenant(session: AsyncSession, tid: str):
    await session.execute("SELECT set_config('app.current_tenant_id', :t, true)", {"t": tid})
`
    );
    fs.writeFileSync(
      path.join(srcDir, 'audit.py'),
      `async def write_audit_log(session, tenant_id):
    q = select(AuditLog.record_sha256_hash).order_by(AuditLog.created_at.desc()).limit(1)
    prev_record_hash = "0" * 64
    record_sha256_hash = "a" * 64
`
    );
    fs.writeFileSync(
      path.join(tempDir, 'Makefile'),
      `qa-unit:\n\tdocker compose run --rm qa-backend pytest -o addopts="" tests/\n`
    );

    const result = await auditSecurityStigOwasp(tempDir);
    expect(result.findings.some((f) => f.rule_id === 'SEC-13')).toBe(true);
    expect(result.findings.some((f) => f.rule_id === 'SEC-14')).toBe(true);
    expect(result.findings.some((f) => f.rule_id === 'QA-COV-01')).toBe(true);

    // Ahora corregimos los 3 archivos y verificamos que pasen limpiamente
    fs.writeFileSync(
      path.join(srcDir, 'db.py'),
      `from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
@event.listens_for(AsyncSession.sync_session_class, "after_begin")
def _reapply(session, tx, conn):
    pass
async def set_tenant(session: AsyncSession, tid: str):
    session.sync_session.info["tenant_id"] = tid
    await session.execute("SELECT set_config('app.current_tenant_id', :t, true)", {"t": tid})
`
    );
    fs.writeFileSync(
      path.join(srcDir, 'audit.py'),
      `async def write_audit_log(session, tenant_id):
    await session.execute("SELECT pg_advisory_xact_lock(hashtext(:k))")
    q = select(AuditLog.record_sha256_hash).order_by(AuditLog.seq_num.desc()).limit(1)
    prev_record_hash = "0" * 64
    record_sha256_hash = "a" * 64
`
    );
    fs.writeFileSync(
      path.join(tempDir, 'Makefile'),
      `qa-unit:\n\tdocker compose run --rm -e COVERAGE_FILE=/tmp/.coverage qa-backend pytest -o addopts="" --cov=src --cov-fail-under=95 tests/\n`
    );

    const cleanResult = await auditSecurityStigOwasp(tempDir);
    expect(cleanResult.findings.some((f) => f.rule_id === 'SEC-13')).toBe(false);
    expect(cleanResult.findings.some((f) => f.rule_id === 'SEC-14')).toBe(false);
    expect(cleanResult.findings.some((f) => f.rule_id === 'QA-COV-01')).toBe(false);
  });

  it('detecta QA-SMOKE-01 (desincronización de singleton settings en smoke test) y SEC-15 (falta de propagación -e LOCAL_ADMIN_PASS en docker exec)', async () => {
    const testsDir = path.join(tempDir, 'tests');
    const scriptsDir = path.join(tempDir, 'scripts');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.mkdirSync(scriptsDir, { recursive: true });

    fs.writeFileSync(
      path.join(testsDir, 'test_production_boot_smoke.py'),
      `import os
from src.main import create_app

def test_smoke():
    os.environ["ROSGRID_ENV"] = "production"
    app = create_app()
    assert app.docs_url is None
`
    );

    fs.writeFileSync(
      path.join(scriptsDir, 'probar-prod-local.sh'),
      `#!/usr/bin/env bash
LOCAL_ADMIN_PASS="$(openssl rand -base64 24)"
docker compose up -d
docker exec api pytest tests/contracts/
`
    );

    const res = await auditSecurityStigOwasp(tempDir);
    expect(res.findings.some((f) => f.rule_id === 'QA-SMOKE-01')).toBe(true);
    expect(res.findings.some((f) => f.rule_id === 'SEC-15')).toBe(true);

    // Corregir ambos archivos sincronizando settings.ROSGRID_ENV y propagando -e ROSGRID_ADMIN_PASSWORD="${LOCAL_ADMIN_PASS}"
    fs.writeFileSync(
      path.join(testsDir, 'test_production_boot_smoke.py'),
      `import os
from src.main import create_app, settings

def test_smoke():
    prev = settings.ROSGRID_ENV
    try:
        os.environ["ROSGRID_ENV"] = "production"
        settings.ROSGRID_ENV = "production"
        app = create_app()
        assert app.docs_url is None
    finally:
        settings.ROSGRID_ENV = prev
`
    );

    fs.writeFileSync(
      path.join(scriptsDir, 'probar-prod-local.sh'),
      `#!/usr/bin/env bash
LOCAL_ADMIN_PASS="$(openssl rand -base64 24)"
export JWT_SECRET_KEY="$(openssl rand -hex 32)"
docker compose up -d
docker exec -e ROSGRID_ADMIN_PASSWORD="\${LOCAL_ADMIN_PASS}" api pytest tests/contracts/
`
    );

    const cleanRes = await auditSecurityStigOwasp(tempDir);
    expect(cleanRes.findings.some((f) => f.rule_id === 'QA-SMOKE-01')).toBe(false);
    expect(cleanRes.findings.some((f) => f.rule_id === 'SEC-15')).toBe(false);
  });

  describe('UI-11X-03: Multi-Format Favicons, PWA Manifest & Cloudflare Edge Headers', () => {
    it('aprueba SPA mínima virgen sin enlaces rotos ni suite PWA/favicons', async () => {
      const pubDir = path.join(tempDir, 'public');
      fs.mkdirSync(pubDir, { recursive: true });
      fs.writeFileSync(path.join(pubDir, 'robots.txt'), 'User-agent: *\nDisallow: /api/\n', 'utf8');
      fs.writeFileSync(
        path.join(tempDir, 'index.html'),
        '<!doctype html><html><head><title>App Interna</title></head><body><div id="app"></div></body></html>\n',
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tempDir);
      expect(res.findings.filter((f) => f.rule_id === 'UI-11X-03')).toEqual([]);
      expect(res.passed).toBe(true);
    });

    it('aprueba proyecto nominal SSG/PWA con favicon.ico 48x48, apple-touch-icon PNG 180x180, webmanifest separado y _headers/_routes.json limpios', async () => {
      const pubDir = path.join(tempDir, 'public');
      const favDir = path.join(pubDir, 'favicons');
      fs.mkdirSync(favDir, { recursive: true });
      fs.writeFileSync(path.join(pubDir, 'favicon.ico'), 'ico-bytes', 'utf8');
      fs.writeFileSync(path.join(favDir, 'apple-touch-icon.png'), 'png-bytes', 'utf8');
      fs.writeFileSync(
        path.join(tempDir, 'index.html'),
        `<!doctype html>
<html>
  <head>
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
    <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
  </head>
</html>
`,
        'utf8'
      );
      fs.writeFileSync(
        path.join(pubDir, 'site.webmanifest'),
        JSON.stringify({
          name: 'Portal',
          icons: [
            { src: '/favicons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/favicons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(pubDir, '_headers'),
        `/*
  Cache-Control: no-cache
  X-Robots-Tag: index, follow
  Cross-Origin-Resource-Policy: same-origin

/favicon.ico
  ! Cache-Control
  ! Cross-Origin-Resource-Policy
  Cache-Control: public, max-age=604800
  Cross-Origin-Resource-Policy: cross-origin

/favicons/*
  ! Cache-Control
  ! Cross-Origin-Resource-Policy
  Cache-Control: public, max-age=604800
  Cross-Origin-Resource-Policy: cross-origin
`,
        'utf8'
      );
      fs.writeFileSync(
        path.join(pubDir, '_routes.json'),
        JSON.stringify({ version: 1, include: ['/*'], exclude: ['/favicon.ico', '/favicons/*'] }),
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tempDir);
      expect(res.findings.filter((f) => f.rule_id === 'UI-11X-03')).toEqual([]);
      expect(res.passed).toBe(true);
    });

    it('detecta escapes reales de producción (apple-touch-icon webp, favicon 404, webmanifest combined, _headers sin ! y _routes /*.ico)', async () => {
      const pubDir = path.join(tempDir, 'public');
      const favDir = path.join(pubDir, 'favicons');
      fs.mkdirSync(favDir, { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'index.html'),
        `<!doctype html>
<html>
  <head>
    <link rel="icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href='/favicons/icon.webp?v=1' />
    <link rel='apple-touch-icon' href="/favicons/alt.png" />
  </head>
</html>
`,
        'utf8'
      );
      fs.writeFileSync(
        path.join(pubDir, 'site.webmanifest'),
        JSON.stringify({
          icons: [{ src: '/favicons/icon.webp', sizes: '512x512', type: 'image/webp', purpose: 'any maskable' }],
        }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(pubDir, '_headers'),
        `# Cabeceras Cloudflare Pages
  orphaned-indented: ignored
/*
  X-Robots-Tag: index, follow
  Cross-Origin-Resource-Policy: same-origin

/favicon.ico
  X-Robots-Tag: noindex
  Cross-Origin-Resource-Policy: cross-origin

/brand/*
  Cache-Control: public, max-age=3600
`,
        'utf8'
      );
      fs.writeFileSync(
        path.join(pubDir, '_routes.json'),
        JSON.stringify({ version: 1, include: ['/*'], exclude: ['/*.ico'] }),
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tempDir);
      const ui03 = res.findings.filter((f) => f.rule_id === 'UI-11X-03');
      expect(res.passed).toBe(false);
      expect(ui03.filter((f) => f.severity === 'HIGH').length).toBeGreaterThanOrEqual(5);
      expect(ui03.some((f) => f.message.includes('apple-touch-icon') && f.severity === 'HIGH')).toBe(true);
      expect(ui03.some((f) => f.message.includes('sizes="180x180"') && f.severity === 'MEDIUM')).toBe(true);
      expect(ui03.some((f) => f.message.includes('HTTP 404') && f.severity === 'HIGH')).toBe(true);
      expect(ui03.some((f) => f.message.includes('.webp') && f.severity === 'MEDIUM')).toBe(true);
      expect(ui03.some((f) => f.message.includes('any maskable') && f.severity === 'MEDIUM')).toBe(true);
      expect(ui03.some((f) => f.message.includes('192x192 y 512x512') && f.severity === 'MEDIUM')).toBe(true);
      expect(ui03.some((f) => f.message.includes('sin desacoplamiento previo') && f.severity === 'HIGH')).toBe(true);
      expect(ui03.some((f) => f.message.includes('/brand/*') && f.severity === 'MEDIUM')).toBe(true);
      expect(ui03.some((f) => f.message.includes('/*.ico') && f.severity === 'HIGH')).toBe(true);
      expect(ui03.some((f) => f.message.includes('sin excluir explícitamente "/favicon.ico"') && f.severity === 'MEDIUM')).toBe(true);
    });

    it('detecta favicon.ico existente sin sizes=48x48 y respeta exención explícita ui-11x-03-ok', async () => {
      const subDir = path.join(tempDir, 'web');
      const pubDir = path.join(subDir, 'public');
      fs.mkdirSync(path.join(pubDir, 'favicons'), { recursive: true });
      fs.writeFileSync(path.join(pubDir, 'favicon.ico'), 'ico', 'utf8');
      fs.writeFileSync(
        path.join(subDir, 'index.html'),
        '<html><head><link rel="icon" href="/favicon.ico" sizes="32x32" /></head></html>',
        'utf8'
      );
      // JSON corrupto no rompe el auditor
      fs.writeFileSync(path.join(pubDir, 'manifest.json'), '{broken json', 'utf8');
      fs.writeFileSync(path.join(pubDir, '_routes.json'), '{broken', 'utf8');

      const missing48Res = await auditSecurityStigOwasp(tempDir);
      expect(
        missing48Res.findings.some(
          (f) => f.rule_id === 'UI-11X-03' && f.severity === 'MEDIUM' && f.message.includes('sizes="48x48"')
        )
      ).toBe(true);

      // Con pragma ui-11x-03-ok en todos los archivos debe aprobar sin hallazgos
      fs.writeFileSync(
        path.join(subDir, 'index.html'),
        '<!-- ui-11x-03-ok --><html><head><link rel="apple-touch-icon" href="/x.webp" /></head></html>',
        'utf8'
      );
      fs.writeFileSync(
        path.join(pubDir, 'site.webmanifest'),
        JSON.stringify({ comment: 'ui-11x-03-ok', icons: [{ src: '/x.webp', purpose: 'any maskable' }] }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(pubDir, '_headers'),
        '# ui-11x-03-ok\n/*\n  X-Robots-Tag: noindex\n/favicon.ico\n  X-Robots-Tag: index\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(pubDir, '_routes.json'),
        JSON.stringify({ comment: 'ui-11x-03-ok', include: ['/*'], exclude: ['/*.ico'] }),
        'utf8'
      );

      const pragmaRes = await auditSecurityStigOwasp(tempDir);
      expect(pragmaRes.findings.filter((f) => f.rule_id === 'UI-11X-03')).toEqual([]);
    });

    it('cubre ramas writeAuditLog, SQL ORDER BY created_at WORM y .github/actions/*.yaml', async () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'worm-app' }));
      fs.writeFileSync(path.join(tempDir, '.npmrc'), 'ignore-scripts=true\n');
      fs.mkdirSync(path.join(tempDir, 'tests'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, '.github', 'actions', 'custom-step'), { recursive: true });

      fs.writeFileSync(
        path.join(tempDir, 'tests', 'test_audit_camel.py'),
        'from app.audit import writeAuditLog\ndef test_ok():\n    assert writeAuditLog is not None\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(tempDir, 'src', 'worm_raw_sql.py'),
        [
          'def append_worm():',
          '    prev_record_hash = "0" * 64',
          '    record_sha256_hash = "1" * 64',
          '    q = "SELECT * FROM audit_log ORDER BY created_at DESC"',
          '    return prev_record_hash, record_sha256_hash, q',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(tempDir, '.github', 'actions', 'custom-step', 'action.yaml'),
        'name: Custom\nruns:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(tempDir, '.github', 'actions', 'custom-step', 'helper.yml'),
        'steps:\n  - uses: actions/checkout@v4\n',
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tempDir);
      expect(res.findings.some((f) => f.rule_id === 'SEC-14')).toBe(true);
      expect(res.findings.some((f) => f.rule_id === 'SEC-CI-ACTION-REF' && f.file.endsWith('action.yaml'))).toBe(true);
      expect(res.findings.some((f) => f.file.endsWith('helper.yml'))).toBe(false);
    });

    it('cubre continuaciones RUN en Dockerfile, versiones Playwright divergentes, fallback SSR compartido y atributos faltantes UI-11X-03', async () => {
      fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), '[project]\nname="app"\n', 'utf8');
      fs.writeFileSync(
        path.join(tempDir, 'Dockerfile'),
        [
          'FROM python:3.13-slim',
          'RUN echo prep && pip install -r requirements.txt',
          'RUN pip install requests \\',
          '  # comentario en continuacion',
          '  && echo done',
        ].join('\n'),
        'utf8'
      );
      fs.mkdirSync(path.join(tempDir, 'docker-a'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'docker-b'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'docker-a', 'Dockerfile'),
        'FROM mcr.microsoft.com/playwright:v1.50.0-noble\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(tempDir, 'docker-b', 'Dockerfile'),
        'FROM mcr.microsoft.com/playwright:v1.51.0-noble\n',
        'utf8'
      );
      fs.mkdirSync(path.join(tempDir, 'frontend'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'frontend', 'package.json'),
        JSON.stringify({ devDependencies: { '@playwright/test': '^1.50.0' } }),
        'utf8'
      );
      fs.writeFileSync(path.join(tempDir, 'frontend', '.npmrc'), 'ignore-scripts=true\n', 'utf8');

      // Dos subproyectos SSR sin playwright.config propio comparten playwright.config.ts raíz (seenConfigs)
      fs.writeFileSync(
        path.join(tempDir, 'playwright.config.ts'),
        "export default { use: { colorScheme: 'light' } };\n",
        'utf8'
      );
      for (const sub of ['web-a', 'web-b']) {
        fs.mkdirSync(path.join(tempDir, sub, 'src'), { recursive: true });
        fs.writeFileSync(
          path.join(tempDir, sub, 'package.json'),
          JSON.stringify({ dependencies: { nuxt: '^3.14.0' } }),
          'utf8'
        );
        fs.writeFileSync(path.join(tempDir, sub, '.npmrc'), 'ignore-scripts=true\n', 'utf8');
        fs.writeFileSync(
          path.join(tempDir, sub, 'src', 'Theme.vue'),
          '<script setup>const t = localStorage.getItem("theme");</script>',
          'utf8'
        );
      }

      // link sin href y manifest icon sin src
      fs.mkdirSync(path.join(tempDir, 'web-a', 'public'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'web-a', 'index.html'),
        '<html><head><link rel="icon" /></head></html>',
        'utf8'
      );
      fs.writeFileSync(
        path.join(tempDir, 'web-a', 'public', 'site.webmanifest'),
        JSON.stringify({ icons: [{ sizes: '192x192', type: 'image/png' }] }),
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tempDir);
      expect(res.findings.some((f) => f.rule_id === 'QA-DOCKER-LOCK-01' && f.file === 'Dockerfile')).toBe(true);
      expect(res.findings.some((f) => f.rule_id === 'QA-PLAYWRIGHT-PIN-01' && f.file.startsWith('frontend/'))).toBe(true);
      expect(res.findings.filter((f) => f.rule_id === 'QA-SSR-HYDRATION-01' && f.file === 'playwright.config.ts')).toHaveLength(1);

      // Especificación semver exacta bajo múltiples Dockerfiles divergentes no dispara falsa alarma
      fs.writeFileSync(
        path.join(tempDir, 'frontend', 'package.json'),
        JSON.stringify({ devDependencies: { '@playwright/test': '1.50.0' } }),
        'utf8'
      );
      const pinnedRes = await auditSecurityStigOwasp(tempDir);
      expect(pinnedRes.findings.some((f) => f.rule_id === 'QA-PLAYWRIGHT-PIN-01' && f.file.startsWith('frontend/'))).toBe(false);

      // Unica version Playwright en Dockerfiles hermanos -> resolveExpectedPlaywrightTag toma uniqueVersions.size === 1
      const singleVerProj = path.join(tempDir, 'single-pw-ver');
      fs.mkdirSync(path.join(singleVerProj, 'e2e-runner'), { recursive: true });
      fs.mkdirSync(path.join(singleVerProj, 'ui-app', 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(singleVerProj, 'e2e-runner', 'Dockerfile'),
        'FROM mcr.microsoft.com/playwright:v1.52.0-noble\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(singleVerProj, 'ui-app', 'package.json'),
        JSON.stringify({ devDependencies: { '@playwright/test': '^1.50.0' } }),
        'utf8'
      );
      fs.writeFileSync(path.join(singleVerProj, 'ui-app', '.npmrc'), 'ignore-scripts=true\n', 'utf8');
      fs.writeFileSync(
        path.join(singleVerProj, 'ui-app', 'src', 'check_rls.sql'),
        'SELECT tablename FROM pg_catalog.pg_tables WHERE pg_tables.forcerowsecurity = true;\n',
        'utf8'
      );
      const singleRes = await auditSecurityStigOwasp(singleVerProj);
      expect(singleRes.findings.some((f) => f.rule_id === 'QA-PLAYWRIGHT-PIN-01')).toBe(true);
      expect(singleRes.findings.some((f) => f.rule_id === 'QA-PG17-RLS')).toBe(true);
    });

    it('tolera archivos con permisos EACCES en OSHP, readTextFileSafe, QA-HEALTH-01, QA-CONTRACT-SDK-01 y QA-MYPY-01', async () => {
      const caseA = path.join(tempDir, 'locked-a');
      fs.mkdirSync(path.join(caseA, 'src'), { recursive: true });
      const lockedMain = path.join(caseA, 'src', 'main.py');
      const lockedWorker = path.join(caseA, 'src', 'worker.py');
      const lockedHtml = path.join(caseA, 'index.html');
      const lockedPyproject = path.join(caseA, 'pyproject.toml');
      fs.writeFileSync(lockedMain, 'app = FastAPI()\n', 'utf8');
      fs.writeFileSync(lockedWorker, 'PROBE = "/tmp/hp1"\n', 'utf8');
      fs.writeFileSync(lockedHtml, '<html></html>', 'utf8');
      fs.writeFileSync(lockedPyproject, '[tool.mypy]\nstrict = true\n', 'utf8');
      fs.writeFileSync(path.join(caseA, 'Makefile'), 'qa-lint:\n\truff check src\n', 'utf8');
      fs.writeFileSync(path.join(caseA, 'Dockerfile'), 'FROM python:3.13-slim\nHEALTHCHECK CMD test -f /tmp/hp1\n', 'utf8');

      const caseB = path.join(tempDir, 'locked-b');
      fs.mkdirSync(path.join(caseB, 'src'), { recursive: true });
      fs.mkdirSync(path.join(caseB, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(caseB, 'package.json'), JSON.stringify({ name: 'sdk-app' }), 'utf8');
      fs.writeFileSync(path.join(caseB, '.npmrc'), 'ignore-scripts=true\n', 'utf8');
      fs.writeFileSync(path.join(caseB, 'Dockerfile'), 'FROM python:3.13-slim\nHEALTHCHECK CMD test -f /tmp/hp2\n', 'utf8');
      fs.writeFileSync(path.join(caseB, 'src', 'worker.py'), 'PROBE = "/tmp/hp2"\n', 'utf8');
      fs.writeFileSync(
        path.join(caseB, 'src', 'mcp_srv.ts'),
        'import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";\nserver.registerTool("x", {}, async () => ({ content: [] }));\n',
        'utf8'
      );
      const lockedTestPy = path.join(caseB, 'tests', 'test_worker.py');
      const lockedTestTs = path.join(caseB, 'tests', 'test_mcp.ts');
      fs.writeFileSync(lockedTestPy, 'def test_w(): pass\n', 'utf8');
      fs.writeFileSync(lockedTestTs, 'export const t = 1;\n', 'utf8');

      const lockedFiles = [lockedMain, lockedWorker, lockedHtml, lockedPyproject, lockedTestPy, lockedTestTs];
      for (const f of lockedFiles) fs.chmodSync(f, 0o000);
      try {
        const resA = await auditSecurityStigOwasp(caseA);
        expect(resA.findings.some((f) => f.rule_id === 'SEC-08')).toBe(true);
        const resB = await auditSecurityStigOwasp(caseB);
        expect(resB.findings.some((f) => f.rule_id === 'QA-HEALTH-01')).toBe(true);
        expect(resB.findings.some((f) => f.rule_id === 'QA-CONTRACT-SDK-01')).toBe(true);
      } finally {
        for (const f of lockedFiles) fs.chmodSync(f, 0o600);
      }
    });

    it('soporta includeExamples=true para auditar plantillas *.example bajo demanda sin afectar el default', async () => {
      const exDir = path.join(tempDir, 'examples-scan');
      fs.mkdirSync(exDir, { recursive: true });
      fs.writeFileSync(path.join(exDir, 'pyproject.toml'), '[project]\nname = "ex-app"\n', 'utf8');
      fs.writeFileSync(
        path.join(exDir, 'package.json.example'),
        JSON.stringify({ name: 'ex-pkg' }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(exDir, 'main.py.example'),
        'eval("1 + 1")\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(exDir, 'Dockerfile.example'),
        'FROM python:3.13-slim\nRUN pip install fastapi\n',
        'utf8'
      );

      const defaultAudit = await auditSecurityStigOwasp(exDir);
      expect(defaultAudit.total_files_scanned).toBe(0);
      expect(defaultAudit.findings.some((f) => f.rule_id === 'QA-DOCKER-LOCK-01')).toBe(false);

      const withExamples = await auditSecurityStigOwasp(exDir, { includeExamples: true });
      expect(withExamples.total_files_scanned).toBe(2);
      expect(withExamples.findings.some((f) => f.rule_id === 'SEC-03')).toBe(true);
      expect(withExamples.findings.some((f) => f.rule_id === 'QA-DOCKER-LOCK-01')).toBe(true);
    });

    it('ordena hallazgos por severidad (CRITICAL > HIGH > MEDIUM > LOW) antes de aplicar maxFindings', async () => {
      const sortDir = path.join(tempDir, 'severity-sort');
      const srcDir = path.join(sortDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(sortDir, 'package.json'), JSON.stringify({ name: 'sort-app' }));
      // Archivo primero en orden alfabético con severidad menor + archivo con CRITICAL
      fs.writeFileSync(
        path.join(srcDir, 'a_low.ts'),
        'export const debugCfg = { swagger: true };\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(srcDir, 'z_critical.py'),
        'import pickle\nobj = pickle.loads(b"bad")\n',
        'utf8'
      );

      const limited = await auditSecurityStigOwasp(sortDir, 1);
      expect(limited.findings).toHaveLength(1);
      expect(limited.findings[0]?.severity).toBe('CRITICAL');
    });

    it('QA-PG17-RLS ignora comentarios SQL (-- y /* */) y comentarios # pero detecta consultas reales y literales SQL', async () => {
      const rlsDir = path.join(tempDir, 'pg17-rls-comments');
      const dbDir = path.join(rlsDir, 'db');
      fs.mkdirSync(dbDir, { recursive: true });
      fs.writeFileSync(path.join(rlsDir, 'pyproject.toml'), '[project]\nname = "rls-test"\n', 'utf8');

      // Archivo limpio: solo comentarios SQL (-- y /* */), cadenas con '' y consulta canónica pg_class.relforcerowsecurity
      fs.writeFileSync(
        path.join(dbDir, 'rls_clean.sql'),
        [
          '-- Verificacion obligatoria PostgreSQL 15-17+ (nunca pg_tables.forcerowsecurity):',
          '/* Consulta prohibida legacy:',
          '   SELECT tablename, forcerowsecurity FROM pg_catalog.pg_tables;',
          '*/',
          "SELECT '-- literal ''pg_class'' safe', c.relname, c.relforcerowsecurity -- inline comment pg_tables.forcerowsecurity",
          'FROM pg_catalog.pg_class c',
          'JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace;',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(dbDir, 'rls_comment.py'),
        [
          '# Nunca usar pg_tables.forcerowsecurity en PostgreSQL 15-17+',
          'SQL = "SELECT c.relforcerowsecurity FROM pg_catalog.pg_class c"',
        ].join('\n'),
        'utf8'
      );

      const cleanRes = await auditSecurityStigOwasp(rlsDir);
      expect(cleanRes.findings.some((f) => f.rule_id === 'QA-PG17-RLS')).toBe(false);

      // Archivo vulnerable: comentario en línea 1 + consulta real en línea 3 -> reporta línea 3
      fs.writeFileSync(
        path.join(dbDir, 'rls_bad.sql'),
        [
          '-- Nota: forcerowsecurity ya no existe en pg_tables',
          'SELECT "tab""le", \'-- not comment\'',
          'FROM pg_catalog.pg_tables WHERE pg_tables.forcerowsecurity = true;',
        ].join('\n'),
        'utf8'
      );
      // Cadenas/comentarios sin cerrar no cuelgan el escáner ni falsamente disparan QA-PG17-RLS
      fs.writeFileSync(
        path.join(dbDir, 'rls_unterminated_str.sql'),
        "SELECT 'unterminated string without closing quote",
        'utf8'
      );
      fs.writeFileSync(
        path.join(dbDir, 'rls_unterminated_blk.sql'),
        '/* unclosed block comment pg_tables.forcerowsecurity',
        'utf8'
      );

      const badRes = await auditSecurityStigOwasp(rlsDir);
      const rlsFindings = badRes.findings.filter((f) => f.rule_id === 'QA-PG17-RLS');
      expect(rlsFindings).toHaveLength(1);
      expect(rlsFindings[0]?.file).toBe('db/rls_bad.sql');
      expect(rlsFindings[0]?.line).toBe(3);
    });

    it('QA-PG17-RLS soporta comentarios /* /* */ */ anidados, dollar-quotes $$...$$, # inline en Python/Bash y límite \\b en atribución de línea', async () => {
      const advDir = path.join(tempDir, 'pg17-rls-adv');
      const srcDir = path.join(advDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(advDir, 'pyproject.toml'), '[project]\nname = "rls-adv"\n', 'utf8');

      // 1. Comentario bloque anidado /* /* */ */ -> 0 hallazgos
      fs.writeFileSync(
        path.join(srcDir, 'nested_comment.sql'),
        '/* outer /* inner */ SELECT forcerowsecurity FROM pg_catalog.pg_tables; */\nSELECT 1;\n',
        'utf8'
      );

      // 2. Comentario inline # en .py (no dentro de cadena) -> 0 hallazgos, mientras # dentro de literal SQL sí se conserva
      fs.writeFileSync(
        path.join(srcDir, 'inline_hash.py'),
        [
          'SQL = "SELECT c.relforcerowsecurity FROM pg_catalog.pg_class c"  # do not use pg_tables.forcerowsecurity',
          'NOTE = "hash # ok"',
        ].join('\n'),
        'utf8'
      );

      // 3. Atribución de línea exacta con \bforcerowsecurity\b (no confunde relforcerowsecurity en línea 1)
      fs.writeFileSync(
        path.join(srcDir, 'line_attr.sql'),
        [
          'SELECT c.relforcerowsecurity FROM pg_catalog.pg_class c;',
          'SELECT 1;',
          'SELECT forcerowsecurity FROM pg_catalog.pg_tables;',
        ].join('\n'),
        'utf8'
      );

      // 4. Dollar-quotes ($$...$$ y $tag$...$tag$) con comilla simple interna no desincronizan el parser
      fs.writeFileSync(
        path.join(srcDir, 'dollar_fn_block_comment.sql'),
        [
          "SELECT $$ ' $$;",
          "SELECT $fn$ line1\n' line2 $fn$;",
          "SELECT ' /* ';",
          'SELECT forcerowsecurity FROM pg_catalog.pg_tables;',
        ].join('\n'),
        'utf8'
      );

      // 5. Dollar-quotes y comillas triples/simples sin cerrar no cuelgan ni disparan falsos positivos
      fs.writeFileSync(
        path.join(srcDir, 'unclosed_dollar.sql'),
        'SELECT $$unclosed pg_tables.forcerowsecurity',
        'utf8'
      );
      fs.writeFileSync(
        path.join(srcDir, 'unclosed_triple.py'),
        'DOC = """unclosed\npg_tables.forcerowsecurity',
        'utf8'
      );
      fs.writeFileSync(
        path.join(srcDir, 'unclosed_single.py'),
        'S = "unclosed pg_tables.forcerowsecurity',
        'utf8'
      );

      const res = await auditSecurityStigOwasp(advDir);
      const rls = res.findings.filter((f) => f.rule_id === 'QA-PG17-RLS');
      expect(rls.some((f) => f.file === 'src/nested_comment.sql')).toBe(false);
      expect(rls.some((f) => f.file === 'src/inline_hash.py')).toBe(false);

      const attrFinding = rls.find((f) => f.file === 'src/line_attr.sql');
      expect(attrFinding?.line).toBe(3);

      const dollarFinding = rls.find((f) => f.file === 'src/dollar_fn_block_comment.sql');
      expect(dollarFinding?.line).toBe(5);
    });

    it('SEC-08 ignora menciones OSHP en archivos de prueba y SEC-12/SEC-04/SEC-07/SEC-10 evitan falsos positivos en routers HTTP y pruebas', async () => {
      const oshpDir = path.join(tempDir, 'oshp-test-ignore');
      fs.mkdirSync(path.join(oshpDir, 'src', 'api'), { recursive: true });
      fs.mkdirSync(path.join(oshpDir, 'tests'), { recursive: true });
      fs.mkdirSync(path.join(oshpDir, 'mcp-server', 'example', 'backend', 'src', 'api'), { recursive: true });

      fs.writeFileSync(
        path.join(oshpDir, 'src', 'main.py'),
        'from fastapi import FastAPI\napp = FastAPI(docs_url=None, openapi_url=None)\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(oshpDir, 'tests', 'test_headers.py'),
        [
          'from fastapi import FastAPI',
          'import xml.etree.ElementTree as ET',
          'expected = "Strict-Transport-Security"',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        path.join(oshpDir, 'mcp-server', 'example', 'backend', 'src', 'api', 'devices.py'),
        'async def create_device_endpoint():\n    return {"ok": True}\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(oshpDir, 'src', 'promptfoo_assert.py'),
        'RULE = {"type": "not-icontains", "value": "BEGIN PRIVATE KEY"}\n',
        'utf8'
      );

      const res = await auditSecurityStigOwasp(oshpDir);
      expect(res.findings.some((f) => f.rule_id === 'SEC-08')).toBe(true);
      expect(res.findings.some((f) => f.rule_id === 'SEC-12')).toBe(false);
      expect(res.findings.some((f) => f.rule_id === 'SEC-04')).toBe(false);
      expect(res.findings.some((f) => f.rule_id === 'SEC-07')).toBe(false);
      expect(res.findings.some((f) => f.rule_id === 'SEC-10')).toBe(false);
    });

    it('SEC-10 rechaza bypasses con not-contains/not-icontains/example y SEC-12 detecta directorios mcp-*/jsonrpc-* con guion', async () => {
      const advDir = path.join(tempDir, 'sec10-sec12-adversarial');
      fs.mkdirSync(path.join(advDir, 'src', 'mcp-tools'), { recursive: true });
      fs.mkdirSync(path.join(advDir, 'src', 'jsonrpc-bridge'), { recursive: true });
      fs.mkdirSync(path.join(advDir, 'ai_evals'), { recursive: true });
      fs.mkdirSync(path.join(advDir, 'mcp-server', 'example', 'backend', 'src', 'api'), { recursive: true });

      // 1. Bypass vector 1: raw "not-contains" comment on PEM header
      fs.writeFileSync(
        path.join(advDir, 'src', 'key_bypass_comment.py'),
        'KEY = "-----BEGIN RSA PRIVATE KEY-----" # "not-contains"\n', // qa-secret-fixture-ok
        'utf8'
      );
      // 2. Bypass vector 2: Promptfoo JSON inside trailing comment on PEM header
      fs.writeFileSync(
        path.join(advDir, 'src', 'key_bypass_json_comment.py'),
        'KEY = "-----BEGIN RSA PRIVATE KEY-----" # {"type": "not-icontains", "value": "BEGIN PRIVATE KEY"}\n', // qa-secret-fixture-ok
        'utf8'
      );
      // 3. Bypass vector 3: extra key in dict
      fs.writeFileSync(
        path.join(advDir, 'src', 'key_bypass_extra_key.py'),
        'SECRET = {"k": "BEGIN PRIVATE KEY", "type": "not-icontains", "value": "BEGIN PRIVATE KEY"}\n',
        'utf8'
      );
      // 4. Bypass vector 4: same-line concatenation
      fs.writeFileSync(
        path.join(advDir, 'src', 'key_bypass_concat.ts'),
        'export const p = \'{"type": "not-icontains", "value": "BEGIN PRIVATE KEY"}\' + "-----BEGIN PRIVATE KEY-----";\n', // qa-secret-fixture-ok
        'utf8'
      );
      // 5. Bypass vector 5: placeholder/example in trailing comment on SEC10_ASSIGNED_SECRET_RE
      fs.writeFileSync(
        path.join(advDir, 'src', 'secret_comment_bypass.py'),
        'password = "SuperSecret123!" # example\napi_key="ephemeral-ollama-placeholder"\n', // qa-secret-fixture-ok
        'utf8'
      );
      // 6. Legitimate Promptfoo assertions (Python + TS const + reversed inline + YAML) -> 0 SEC-10 findings
      fs.writeFileSync(
        path.join(advDir, 'ai_evals', 'golden.py'),
        'ASSERTIONS = [\n    {"type": "not-icontains", "value": "BEGIN PRIVATE KEY"},\n    {"value": "BEGIN PRIVATE KEY", "type": "not-contains"},\n]\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(advDir, 'ai_evals', 'golden.ts'),
        'const rule = {"type": "not-icontains", "value": "BEGIN PRIVATE KEY"};\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(advDir, 'ai_evals', 'bad_inline.ts'),
        'const bad = {"type": "not-icontains", "value": "BEGIN PRIVATE KEY"} + extra;\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(advDir, 'ai_evals', 'bad_yaml_key.yaml'),
        'assert:\n  - type: not-icontains\n    other: "BEGIN PRIVATE KEY"\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(advDir, 'ai_evals', 'promptfoo.yaml'),
        'assert:\n  - type: not-icontains\n    value: "BEGIN PRIVATE KEY"\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(advDir, 'ai_evals', 'promptfoo_reversed.yml'),
        'assert:\n  - value: "BEGIN RSA PRIVATE KEY"\n    type: not-contains\n',
        'utf8'
      );
      // 7. Hyphenated MCP/JSON-RPC dirs vs mcp-server/example HTTP router
      fs.writeFileSync(
        path.join(advDir, 'src', 'mcp-tools', 'ops.py'),
        'async def delete_device(device_id: str):\n    return None\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(advDir, 'src', 'jsonrpc-bridge', 'ops.py'),
        'async def execute_reboot(node_id: str):\n    return None\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(advDir, 'mcp-server', 'example', 'backend', 'src', 'api', 'devices.py'),
        'async def create_device_endpoint():\n    return {"ok": True}\n',
        'utf8'
      );

      const res = await auditSecurityStigOwasp(advDir);
      const sec10Files = res.findings
        .filter((f) => f.rule_id === 'SEC-10' && f.severity === 'CRITICAL')
        .map((f) => f.file);
      expect(sec10Files).toContain('src/key_bypass_comment.py');
      expect(sec10Files).toContain('src/key_bypass_json_comment.py');
      expect(sec10Files).toContain('src/key_bypass_extra_key.py');
      expect(sec10Files).toContain('src/key_bypass_concat.ts');
      expect(sec10Files).toContain('src/secret_comment_bypass.py');
      expect(sec10Files).toContain('ai_evals/bad_inline.ts');
      expect(sec10Files).toContain('ai_evals/bad_yaml_key.yaml');
      expect(sec10Files).not.toContain('ai_evals/golden.py');
      expect(sec10Files).not.toContain('ai_evals/golden.ts');
      expect(sec10Files).not.toContain('ai_evals/promptfoo.yaml');
      expect(sec10Files).not.toContain('ai_evals/promptfoo_reversed.yml');

      const sec12Files = res.findings
        .filter((f) => f.rule_id === 'SEC-12' && f.severity === 'HIGH')
        .map((f) => f.file);
      expect(sec12Files).toContain('src/mcp-tools/ops.py');
      expect(sec12Files).toContain('src/jsonrpc-bridge/ops.py');
      expect(sec12Files).not.toContain('mcp-server/example/backend/src/api/devices.py');
    });
  });
});
