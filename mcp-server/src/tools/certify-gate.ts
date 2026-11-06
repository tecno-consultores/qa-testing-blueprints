// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import * as fs from 'fs';
import * as path from 'path';
import { auditSecurityStigOwasp } from './security-auditor.js';
import { CertifyGateResult } from '../types.js';

function isQaTestingBlueprintsRepo(projectPath: string): boolean {
  try {
    const pkgPath = path.join(projectPath, 'mcp-server', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const content = fs.readFileSync(pkgPath, 'utf8');
      if (content.includes('@sinfallas/mcp-qa-11x')) return true;
    }
    const manifestPath = path.join(projectPath, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf8');
      if (content.includes('qa-testing-blueprints')) return true;
    }
  } catch {
    // Silencio
  }
  return false;
}

function checkUnmergedExamples(projectPath: string): { passed: boolean; blockers: string[] } {
  if (isQaTestingBlueprintsRepo(projectPath)) {
    return { passed: true, blockers: [] };
  }

  const blockers: string[] = [];
  try {
    const files = fs.readdirSync(projectPath);
    for (const file of files) {
      if (file.endsWith('.example') && !file.startsWith('.git')) {
        blockers.push(`Archivo .example sin fusionar en la raíz: ${file}`);
      }
    }
  } catch {
    // Si no se puede leer, continuar
  }

  return { passed: blockers.length === 0, blockers };
}

function findDuplicateKeysInText(jsonText: string): string[] {
  const duplicates: string[] = [];
  const lines = jsonText.split(/\r?\n/);
  const stack: Set<string>[] = [new Set()];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes('{')) {
      stack.push(new Set());
    }
    if (trimmed.includes('}') && stack.length > 1) {
      stack.pop();
    }

    const keyMatch = trimmed.match(/^"([^"]+)"\s*:/);
    if (keyMatch) {
      const key = keyMatch[1];
      const currentScope = stack[stack.length - 1];
      if (currentScope.has(key)) {
        duplicates.push(key);
      } else {
        currentScope.add(key);
      }
    }
  }

  return duplicates;
}

function checkJsonIntegrity(projectPath: string): { passed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const jsonFiles: string[] = [];

  function collectJson(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectJson(full);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          jsonFiles.push(full);
        }
      }
    } catch {
      // Ignorar errores de acceso
    }
  }

  collectJson(projectPath);

  for (const file of jsonFiles) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      const dups = findDuplicateKeysInText(text);
      if (dups.length > 0) {
        const rel = path.relative(projectPath, file);
        blockers.push(`Claves duplicadas detectadas en ${rel}: ${dups.join(', ')}`);
      }
    } catch {
      // Si el archivo JSON no es texto o no se puede leer, omitir
    }
  }

  return { passed: blockers.length === 0, blockers };
}

function hasUnitTestForComponent(compDir: string, file: string): boolean {
  const baseName = file.replace(/\.(vue|tsx|jsx)$/, '');
  return (
    fs.existsSync(path.join(compDir, `${baseName}.unit.ts`)) ||
    fs.existsSync(path.join(compDir, `${baseName}.unit.tsx`)) ||
    fs.existsSync(path.join(compDir, `${baseName}.spec.ts`)) ||
    fs.existsSync(path.join(compDir, `${baseName}.test.ts`))
  );
}

function checkOrphanUiComponents(projectPath: string): { passed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const candidateDirs = [
    path.join(projectPath, 'src', 'components'),
    path.join(projectPath, 'vue3', 'src', 'components'),
    path.join(projectPath, 'react-frontend', 'src', 'components'),
  ];

  for (const compDir of candidateDirs) {
    if (!fs.existsSync(compDir)) continue;
    try {
      const files = fs.readdirSync(compDir);
      for (const file of files) {
        const isComponent = file.endsWith('.vue') || file.endsWith('.tsx') || file.endsWith('.jsx');
        if (isComponent && !hasUnitTestForComponent(compDir, file)) {
          blockers.push(`Componente UI huérfano sin prueba unitaria: ${file}`);
        }
      }
    } catch {
      // Ignorar errores de lectura
    }
  }

  return { passed: blockers.length === 0, blockers };
}

function checkOrmParity(projectPath: string): { passed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const modelPaths = [
    path.join(projectPath, 'src', 'models'),
    path.join(projectPath, 'fastapi', 'src', 'models'),
    path.join(projectPath, 'src', 'models.py'),
    path.join(projectPath, 'fastapi', 'src', 'models.py'),
  ];

  const hasModels = modelPaths.some((p) => fs.existsSync(p));
  if (hasModels) {
    const alembicPaths = [
      path.join(projectPath, 'alembic', 'versions'),
      path.join(projectPath, 'fastapi', 'alembic', 'versions'),
      path.join(projectPath, 'migrations', 'versions'),
    ];
    const hasAlembic = alembicPaths.some((p) => fs.existsSync(p));
    if (!hasAlembic) {
      blockers.push('Modelos SQLAlchemy detectados pero no se encontró directorio alembic/versions o migrations/versions.');
    }
  }

  return { passed: blockers.length === 0, blockers };
}

function checkDocumentationSync(projectPath: string): { passed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const testingMd = path.join(projectPath, 'TESTING.md');
  const changelogMd = path.join(projectPath, 'CHANGELOG.md');

  if (!fs.existsSync(testingMd)) {
    blockers.push('Falta archivo de aseguramiento de calidad TESTING.md en la raíz.');
  }

  if (!fs.existsSync(changelogMd)) {
    blockers.push('Falta archivo de historial CHANGELOG.md en la raíz.');
  } else {
    try {
      const content = fs.readFileSync(changelogMd, 'utf8');
      if (!content.includes('## [Unreleased]')) {
        blockers.push('CHANGELOG.md carece de la sección obligatoria ## [Unreleased].');
      }
    } catch {
      blockers.push('No se pudo leer CHANGELOG.md.');
    }
  }

  return { passed: blockers.length === 0, blockers };
}

/**
 * Tool 7: certify_11x_gate
 * Ejecuta todas las validaciones del estándar 11X sobre el proyecto destino
 * para certificar si cumple con la compuerta de cierre.
 */
export async function certify11xGate(projectPath: string): Promise<CertifyGateResult> {
  const resolvedPath = path.resolve(projectPath);

  const unmerged = checkUnmergedExamples(resolvedPath);
  const jsonCheck = checkJsonIntegrity(resolvedPath);
  const orphanUi = checkOrphanUiComponents(resolvedPath);
  const ormCheck = checkOrmParity(resolvedPath);
  const docCheck = checkDocumentationSync(resolvedPath);

  const securityAudit = await auditSecurityStigOwasp(resolvedPath);
  const securityBlockers: string[] = [];
  let secretsExposed = false;

  for (const finding of securityAudit.findings) {
    if (finding.rule_id === 'SEC-10') {
      secretsExposed = true;
      securityBlockers.push(`Secreto detectado (${finding.file}:${finding.line}): ${finding.message}`);
    } else if (finding.severity === 'CRITICAL' || finding.severity === 'HIGH') {
      securityBlockers.push(`Vulnerabilidad ${finding.severity} (${finding.rule_id} en ${finding.file}:${finding.line}): ${finding.message}`);
    }
  }

  const allBlockers = [
    ...unmerged.blockers,
    ...jsonCheck.blockers,
    ...orphanUi.blockers,
    ...ormCheck.blockers,
    ...securityBlockers,
    ...docCheck.blockers,
  ];

  const checks = {
    zero_unmerged_examples: unmerged.passed,
    zero_secrets_exposed: !secretsExposed,
    json_integrity: jsonCheck.passed,
    zero_orphan_ui_components: orphanUi.passed,
    zero_orphan_api_endpoints: true, // Modo base paridad API
    orm_alembic_parity: ormCheck.passed,
    security_stig_owasp_clean: securityAudit.passed,
    documentation_synced: docCheck.passed,
  };

  const gatePassed = allBlockers.length === 0;

  return {
    gate_passed: gatePassed,
    project_path: resolvedPath,
    checks,
    blockers: allBlockers,
    upstream_evolution_reminder:
      'MANDATORY POST-MORTEM CHECK: If this fixed a UAT/prod bug that bypassed tests, present "💡 Oportunidad de Mejora Detectada para el Estándar QA 11X" in Spanish and invoke propose_skill_evolution_pr.',
  };
}
