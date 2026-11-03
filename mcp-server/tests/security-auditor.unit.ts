// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { auditSecurityStigOwasp } from '../src/tools/security-auditor.js';

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
    expect(sec03s[0].severity).toBe('CRITICAL');
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
      `
TOKEN = "ghp_123456789012345678901234567890123456"
PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\\nMIIEowIBAAKCAQEA..."
password = "SuperSecretPassword123!"
      `
    );

    const result = await auditSecurityStigOwasp(tempDir);
    const sec10s = result.findings.filter((f) => f.rule_id === 'SEC-10');
    expect(sec10s.length).toBeGreaterThanOrEqual(2);
    expect(sec10s[0].severity).toBe('CRITICAL');
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
    expect(uiIssues[0].severity).toBe('MEDIUM');
  });
});
