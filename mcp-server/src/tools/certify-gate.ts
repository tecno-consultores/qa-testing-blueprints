// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

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
      if (file === '.env.example') continue;
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

const ARCHITECTURAL_API_WHITELIST: Array<{ verb: string; path: string }> = [
  { verb: 'GET', path: '/health' },
  { verb: 'GET', path: '/api/v1/health' },
  { verb: 'GET', path: '/metrics' },
  { verb: 'GET', path: '/api/v1/metrics/fleet' },
  { verb: 'POST', path: '/api/v1/mcp' },
  { verb: 'GET', path: '/users/me' },
  { verb: 'GET', path: '/api/v1/auth/me' },
  { verb: 'POST', path: '/api/v1/auth/logout' },
  { verb: 'GET', path: '/api/v1/auth/bootstrap-status' },
];

function matchesRouteSegments(routePath: string, testUrl: string): boolean {
  const routeSegs = routePath.replace(/\/+$/, '').split('/');
  const urlSegs = testUrl.replace(/\/+$/, '').split('/');
  if (routeSegs.length !== urlSegs.length) return false;
  for (let i = 0; i < routeSegs.length; i++) {
    const rSeg = routeSegs[i];
    const isParam = rSeg.startsWith('{') || rSeg.startsWith(':');
    if (!isParam && rSeg !== urlSegs[i]) return false;
  }
  return true;
}

function collectFilesWithExtensions(dir: string, exts: string[]): string[] {
  const found: string[] = [];
  if (!fs.existsSync(dir)) return found;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectFilesWithExtensions(full, exts));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      found.push(full);
    }
  }
  return found;
}

function normalizeSubRoute(sub: string): string {
  if (!sub) return '';
  return sub.startsWith('/') ? sub : `/${sub}`;
}

function extractBackendRoutesFromFile(filePath: string): Array<{ verb: string; path: string }> {
  const routes: Array<{ verb: string; path: string }> = [];
  const code = fs.readFileSync(filePath, 'utf8');
  const prefixMatch = code.match(/APIRouter\([^)]*prefix\s*=\s*['"]([^'"]+)['"]/);
  const routerPrefix = prefixMatch ? prefixMatch[1].replace(/\/+$/, '') : '';
  const basePrefix = filePath.split(path.sep).includes('v1') ? '/api/v1' : '';

  const decoRegex = /@(?:[a-zA-Z0-9_]+)\.(get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]/gi;
  let m: RegExpExecArray | null;
  while ((m = decoRegex.exec(code)) !== null) {
    const verb = m[1].toUpperCase();
    const subNorm = normalizeSubRoute(m[2]);
    routes.push({ verb, path: `${basePrefix}${routerPrefix}${subNorm}` });
  }

  const expressRegex = /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/gi;
  while ((m = expressRegex.exec(code)) !== null) {
    routes.push({ verb: m[1].toUpperCase(), path: m[2] });
  }
  return routes;
}

function extractFrontendCallsFromFile(
  projectPath: string,
  filePath: string
): Array<{ verb: string; url: string; relFile: string }> {
  const calls: Array<{ verb: string; url: string; relFile: string }> = [];
  if (/\.(unit|spec|test|e2e)\.(ts|tsx|js|jsx)$/.test(filePath)) return calls;
  const code = fs.readFileSync(filePath, 'utf8');
  const callRegex = /\b(?:http|api|axios)\.(get|post|put|patch|delete)\b[^(\n]*\(\s*['"`]([^'"`\n]+)['"`]/gi;
  let m: RegExpExecArray | null;
  while ((m = callRegex.exec(code)) !== null) {
    const verb = m[1].toUpperCase();
    let rawUrl = m[2].replace(/\s+/g, '');
    if (!rawUrl.startsWith('/api/v1') && !rawUrl.startsWith('api/v1') && !rawUrl.startsWith('/health')) {
      continue;
    }
    if (!rawUrl.startsWith('/')) rawUrl = `/${rawUrl}`;
    const cleanUrl = rawUrl.split('?')[0];
    calls.push({ verb, url: cleanUrl, relFile: path.relative(projectPath, filePath) });
  }
  return calls;
}

function matchesAnyRoute(
  verb: string,
  url: string,
  routes: Array<{ verb: string; path: string }>
): boolean {
  const testUrl = url.replace(/\$\{[^}]+\}/g, 'test_param');
  for (const r of routes) {
    if (r.verb !== verb) continue;
    if (matchesRouteSegments(r.path, testUrl)) return true;
  }
  return false;
}

function checkZeroOrphanApiEndpoints(projectPath: string): { passed: boolean; blockers: string[] } {
  const backendDirs = [
    path.join(projectPath, 'fastapi', 'src'),
    path.join(projectPath, 'node-backend', 'src'),
    path.join(projectPath, 'backend', 'src'),
    path.join(projectPath, 'src', 'api'),
  ];
  const frontendDirs = [
    path.join(projectPath, 'vue3', 'src'),
    path.join(projectPath, 'react-frontend', 'src'),
    path.join(projectPath, 'frontend', 'src'),
  ];

  const backendFiles = backendDirs.flatMap((d) => collectFilesWithExtensions(d, ['.py', '.ts', '.js']));
  const frontendFiles = frontendDirs.flatMap((d) =>
    collectFilesWithExtensions(d, ['.ts', '.tsx', '.vue', '.js', '.jsx'])
  );

  const backendRoutes = backendFiles.flatMap((f) => extractBackendRoutesFromFile(f));
  const frontendCalls = frontendFiles.flatMap((f) => extractFrontendCallsFromFile(projectPath, f));

  if (backendRoutes.length === 0 || frontendCalls.length === 0) {
    return { passed: true, blockers: [] };
  }

  const allAllowedRoutes = [...backendRoutes, ...ARCHITECTURAL_API_WHITELIST];
  const blockers: string[] = [];

  for (const call of frontendCalls) {
    if (!matchesAnyRoute(call.verb, call.url, allAllowedRoutes)) {
      blockers.push(
        `Llamada HTTP huérfana en frontend hacia endpoint inexistente (404/405): [${call.verb}] ${call.url} en ${call.relFile}`
      );
    }
  }

  return { passed: blockers.length === 0, blockers };
}

function checkOrmParity(projectPath: string): { passed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const modelPaths = [
    path.join(projectPath, 'src', 'models'),
    path.join(projectPath, 'fastapi', 'src', 'models'),
    path.join(projectPath, 'backend', 'src', 'models'),
    path.join(projectPath, 'src', 'models.py'),
    path.join(projectPath, 'fastapi', 'src', 'models.py'),
    path.join(projectPath, 'backend', 'src', 'models.py'),
  ];

  const hasModels = modelPaths.some((p) => fs.existsSync(p));
  if (hasModels) {
    const alembicPaths = [
      path.join(projectPath, 'alembic', 'versions'),
      path.join(projectPath, 'migrations', 'versions'),
      path.join(projectPath, 'fastapi', 'alembic', 'versions'),
      path.join(projectPath, 'fastapi', 'migrations', 'versions'),
      path.join(projectPath, 'backend', 'alembic', 'versions'),
      path.join(projectPath, 'backend', 'migrations', 'versions'),
    ];
    const hasAlembic = alembicPaths.some((p) => fs.existsSync(p));
    if (!hasAlembic) {
      blockers.push('Modelos SQLAlchemy detectados pero no se encontró directorio alembic/versions o migrations/versions.');
    }
  }

  return { passed: blockers.length === 0, blockers };
}

function checkDuplicateVersionHeaders(changelogContent: string): string[] {
  const blockers: string[] = [];
  const seenVersions = new Set<string>();
  const lines = changelogContent.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^##\s+\[([^\]]+)\]/);
    if (!match) continue;
    const versionTag = match[1].trim();
    if (seenVersions.has(versionTag)) {
      blockers.push(`Encabezado de versión duplicado en CHANGELOG.md: [${versionTag}].`);
    } else {
      seenVersions.add(versionTag);
    }
  }

  return blockers;
}

function resolveWithParentFallback(projectPath: string, ...segments: string[]): string {
  const directPath = path.join(projectPath, ...segments);
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  const parentPath = path.resolve(projectPath, '..', ...segments);
  if (fs.existsSync(parentPath)) {
    return parentPath;
  }
  return directPath;
}

function checkActiveTaskGovernance(projectPath: string): string[] {
  const blockers: string[] = [];
  const activeTaskPath = resolveWithParentFallback(projectPath, '.agents', 'ACTIVE_TASK.md');
  if (!fs.existsSync(activeTaskPath)) return blockers;

  try {
    const content = fs.readFileSync(activeTaskPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const nonEmptyCount = lines.filter((l) => l.trim().length > 0).length;
    if (nonEmptyCount > 40) {
      blockers.push(
        `.agents/ACTIVE_TASK.md excede el presupuesto compacto de 40 líneas (${nonEmptyCount} líneas con contenido).`
      );
    }
    const isCompleted = /Estado:\**\s*COMPLETED/i.test(content);
    const hasPendingCheckboxes = lines.some((l) => /^\s*-\s*\[\s\]/.test(l));
    if (isCompleted && hasPendingCheckboxes) {
      blockers.push(
        '.agents/ACTIVE_TASK.md está marcado como COMPLETED pero aún contiene fases pendientes (- [ ]).'
      );
    }
  } catch {
    // Ignorar error de lectura
  }

  return blockers;
}

const GRAPHIFY_OUT_DIR = 'graphify-out';
const GRAPH_JSON_FILE = 'graph.json';

function isUiToDbLink(link: { source?: string; target?: string }): boolean {
  const src = (link.source ?? '').toLowerCase();
  const tgt = (link.target ?? '').toLowerCase();
  const isUiSource = src.includes('components/') || src.includes('views/') || src.endsWith('.vue');
  const isDbTarget = tgt.includes('models.py') || tgt.includes('alembic/');
  return isUiSource && isDbTarget;
}

function inspectSingleGraphTopology(projectPath: string, gPath: string): string[] {
  if (!fs.existsSync(gPath)) return [];
  const relGraph = path.relative(projectPath, gPath);
  const blockers: string[] = [];

  try {
    const parsed = JSON.parse(fs.readFileSync(gPath, 'utf8')) as {
      links?: Array<{ source?: string; target?: string }>;
    };
    for (const link of parsed.links ?? []) {
      if (isUiToDbLink(link)) {
        blockers.push(`Violación topológica AST en ${relGraph}: ${link.source} -> ${link.target}`);
      }
    }
  } catch {
    blockers.push(`Archivo de grafo AST corrupto: ${relGraph}`);
  }

  return blockers;
}

function checkAstTopology(projectPath: string): { passed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const graphPaths = [
    path.join(projectPath, GRAPHIFY_OUT_DIR, GRAPH_JSON_FILE),
    path.join(projectPath, 'fastapi', GRAPHIFY_OUT_DIR, GRAPH_JSON_FILE),
    path.join(projectPath, 'vue3', GRAPHIFY_OUT_DIR, GRAPH_JSON_FILE),
  ];

  for (const gPath of graphPaths) {
    blockers.push(...inspectSingleGraphTopology(projectPath, gPath));
  }

  return { passed: blockers.length === 0, blockers };
}

function checkDocumentationSync(projectPath: string): { passed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const testingMd = resolveWithParentFallback(projectPath, 'TESTING.md');
  const changelogMd = resolveWithParentFallback(projectPath, 'CHANGELOG.md');

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
      blockers.push(...checkDuplicateVersionHeaders(content));
    } catch {
      blockers.push('No se pudo leer CHANGELOG.md.');
    }
  }

  blockers.push(...checkActiveTaskGovernance(projectPath));

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
  const orphanApi = checkZeroOrphanApiEndpoints(resolvedPath);
  const ormCheck = checkOrmParity(resolvedPath);
  const astTopology = checkAstTopology(resolvedPath);
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
    ...orphanApi.blockers,
    ...ormCheck.blockers,
    ...astTopology.blockers,
    ...securityBlockers,
    ...docCheck.blockers,
  ];

  const checks = {
    zero_unmerged_examples: unmerged.passed,
    zero_secrets_exposed: !secretsExposed,
    json_integrity: jsonCheck.passed,
    zero_orphan_ui_components: orphanUi.passed,
    zero_orphan_api_endpoints: orphanApi.passed,
    orm_alembic_parity: ormCheck.passed,
    ast_topology_clean: astTopology.passed,
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
