// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { certify11xGate } from '../src/tools/certify-gate.js';

describe('certify-gate', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-gate-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function setupNominalProject(dir: string): void {
    fs.writeFileSync(path.join(dir, 'TESTING.md'), '# Testing QA 11X\nCoverage >= 95%');
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n- Initial feature\n');
    fs.writeFileSync(path.join(dir, '.npmrc'), 'ignore-scripts=true\n');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'app' }, null, 2));

    const compDir = path.join(dir, 'src', 'components');
    fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'Header.vue'), '<template><header>ok</header></template>');
    fs.writeFileSync(path.join(compDir, 'Header.unit.ts'), '// unit test');

    const modelDir = path.join(dir, 'src', 'models');
    fs.mkdirSync(modelDir, { recursive: true });
    fs.writeFileSync(path.join(modelDir, 'user.py'), '# user model');
    const alembicDir = path.join(dir, 'alembic', 'versions');
    fs.mkdirSync(alembicDir, { recursive: true });
    fs.writeFileSync(path.join(alembicDir, '001_init.py'), '# migration');
  }

  it('certifica exitosamente un proyecto que cumple todas las compuertas 11X', async () => {
    setupNominalProject(tempDir);

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(true);
    expect(result.checks.zero_unmerged_examples).toBe(true);
    expect(result.checks.zero_secrets_exposed).toBe(true);
    expect(result.checks.json_integrity).toBe(true);
    expect(result.checks.zero_orphan_ui_components).toBe(true);
    expect(result.checks.orm_alembic_parity).toBe(true);
    expect(result.checks.security_stig_owasp_clean).toBe(true);
    expect(result.checks.documentation_synced).toBe(true);
    expect(result.blockers.length).toBe(0);
  });

  it('bloquea la certificación si existen archivos .example sin fusionar en la raíz', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'docker-compose.yml.example'), '# example');

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.zero_unmerged_examples).toBe(false);
    expect(result.blockers.some((b) => b.includes('.example sin fusionar'))).toBe(true);
  });

  it('permite archivos .example si el proyecto evaluado es qa-testing-blueprints', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify({ repository: 'qa-testing-blueprints' }));
    fs.writeFileSync(path.join(tempDir, 'docker-compose.yml.example'), '# example');

    const result = await certify11xGate(tempDir);
    expect(result.checks.zero_unmerged_examples).toBe(true);
  });

  it('bloquea la certificación si detecta claves duplicadas en JSON', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'config.json'), '{\n  "port": 8080,\n  "port": 9090\n}\n');

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.json_integrity).toBe(false);
    expect(result.blockers.some((b) => b.includes('Claves duplicadas'))).toBe(true);
  });

  it('bloquea la certificación si existen componentes UI huérfanos sin prueba unitaria', async () => {
    setupNominalProject(tempDir);
    const compDir = path.join(tempDir, 'src', 'components');
    fs.writeFileSync(path.join(compDir, 'Modal.vue'), '<template><div>modal</div></template>');

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.zero_orphan_ui_components).toBe(false);
    expect(result.blockers.some((b) => b.includes('Componente UI huérfano'))).toBe(true);
  });

  it('bloquea la certificación si existen modelos SQLAlchemy sin directorio de migraciones Alembic', async () => {
    setupNominalProject(tempDir);
    const alembicDir = path.join(tempDir, 'alembic');
    fs.rmSync(alembicDir, { recursive: true, force: true });

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.orm_alembic_parity).toBe(false);
    expect(result.blockers.some((b) => b.includes('Modelos SQLAlchemy detectados'))).toBe(true);
  });

  it('bloquea la certificación si falta TESTING.md o CHANGELOG.md carece de ## [Unreleased]', async () => {
    setupNominalProject(tempDir);
    fs.unlinkSync(path.join(tempDir, 'TESTING.md'));
    fs.writeFileSync(path.join(tempDir, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0]\n');

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.documentation_synced).toBe(false);
    expect(result.blockers.some((b) => b.includes('TESTING.md'))).toBe(true);
    expect(result.blockers.some((b) => b.includes('## [Unreleased]'))).toBe(true);
  });

  it('bloquea si falta por completo el archivo CHANGELOG.md', async () => {
    setupNominalProject(tempDir);
    fs.unlinkSync(path.join(tempDir, 'CHANGELOG.md'));

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.blockers.some((b) => b.includes('Falta archivo de historial CHANGELOG.md'))).toBe(true);
  });

  it('bloquea la certificación y propaga vulnerabilidad HIGH no secreta', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'src', 'schemas.py'), 'class UserCreateRequest(BaseModel):\n  name: str\n');

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.security_stig_owasp_clean).toBe(false);
    expect(result.blockers.some((b) => b.includes('Vulnerabilidad HIGH'))).toBe(true);
  });

  it('bloquea la certificación y propaga secretos como vulnerabilidad crítica', async () => {
    setupNominalProject(tempDir);
    fs.writeFileSync(path.join(tempDir, 'secret.py'), 'TOKEN = "ghp_111122223333444455556666777788889999"\n');

    const result = await certify11xGate(tempDir);
    expect(result.gate_passed).toBe(false);
    expect(result.checks.zero_secrets_exposed).toBe(false);
    expect(result.blockers.some((b) => b.includes('Secreto detectado'))).toBe(true);
  });
});
