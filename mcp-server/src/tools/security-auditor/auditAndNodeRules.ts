// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SecurityFinding } from '../../types.js';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import { SEC_11_REF, UI_11X_02_REF, isTestFilePath } from './shared.js';

export function checkUi11x01VisualGeometry(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.vue') && !relPath.endsWith('.tsx') && !relPath.endsWith('.jsx') && !relPath.endsWith('.html')) {
    return [];
  }
  const findings: SecurityFinding[] = [];

  for (const [i, line] of lines.entries()) {
    if (line.includes('<footer') && (line.includes('fixed') || line.includes('position: fixed'))) {
      findings.push({
        rule_id: 'UI-11X-01',
        severity: 'MEDIUM',
        stig_owasp_ref: 'Refactoring UI / Spec 70 / Anti-JSDOM',
        file: relPath,
        line: i + 1,
        message: 'Footer con posición fija detectado (roba espacio vertical e infringe ergonomía in-flow).',
        remediation: 'Ubicar el <footer> en el flujo natural dentro del contenedor principal con margin-top: auto.',
      });
    }

    if (line.includes('outline-none') && !line.includes('focus-visible:') && !line.includes('outline-hidden')) {
      findings.push({
        rule_id: 'UI-11X-01',
        severity: 'MEDIUM',
        stig_owasp_ref: 'WCAG 2.1 AA (2.4.7 Focus Visible)',
        file: relPath,
        line: i + 1,
        message: 'Clase outline-none sin reemplazo focus-visible detectada (elimina indicador de foco para accesibilidad).',
        remediation: 'Utilizar focus-visible:ring-2 o outline-hidden con un indicador visual accesible.',
      });
    }

    if (line.includes('text-white/50') || line.includes('text-white/40') || line.includes('text-white/30')) {
      findings.push({
        rule_id: 'UI-11X-01',
        severity: 'MEDIUM',
        stig_owasp_ref: 'WCAG 2.1 AA (1.4.3 Contrast Minimum 4.5:1)',
        file: relPath,
        line: i + 1,
        message: 'Texto blanco translúcido con opacidad <= 50% detectado (degrada el ratio de contraste 4.5:1).',
        remediation: 'Utilizar colores sólidos con contraste garantizado como text-slate-300 o text-white/80.',
      });
    }
  }

  return findings;
}


function checkRawSubInActorUsername(relPath: string, lines: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const rawSubPattern =
    /actor_username\s*[:=]\s*(?:claims\.get\(\s*["']sub["']\s*\)|claims\[\s*["']sub["']\s*\]|(?:token|payload|jwt_payload)\.sub\b)/;

  for (const [i, line] of lines.entries()) {
    if (line.trim().startsWith('#') || line.trim().startsWith('//')) continue;
    if (rawSubPattern.test(line)) {
      findings.push({
        rule_id: 'SEC-11',
        severity: 'HIGH',
        stig_owasp_ref: SEC_11_REF,
        file: relPath,
        line: i + 1,
        message:
          'Asignación directa de JWT "sub" (UUID crudo) a actor_username detectada en bitácora de auditoría.',
        remediation:
          'Resolver actor_username a un nombre humano legible (ej. user.username o claims.get("username")) y nunca almacenar un UUID v4 crudo como nombre visible.',
      });
    }
  }
  return findings;
}

function isDirectRealAuditFunctionTest(fullContent: string): boolean {
  const importsRealAuditFn = fullContent
    .split(/\r?\n/)
    .some(
      (line) =>
        /\bfrom[ \t]+[\w.]*audit[ \t]+import\b/.test(line) &&
        (line.includes('write_audit_log') || line.includes('writeAuditLog'))
    );
  const patchesAuditFn =
    /(?:patch|setattr)\s*\([^)]*(?:write_audit_log|writeAuditLog)/.test(fullContent) ||
    /\b(?:write_audit_log|writeAuditLog)\s*=\s*(?:AsyncMock|MagicMock|vi\.fn)/.test(fullContent);

  if (importsRealAuditFn && !patchesAuditFn) {
    return true;
  }

  return (
    (fullContent.includes('record_sha256_hash') || fullContent.includes('prev_record_hash')) &&
    !patchesAuditFn
  );
}

function checkBlindAuditMockInTests(relPath: string, lines: string[]): SecurityFinding[] {
  const fullContent = lines.join('\n');
  const mocksAudit =
    fullContent.includes('write_audit_log') || fullContent.includes('writeAuditLog');
  if (!mocksAudit) return [];

  if (isDirectRealAuditFunctionTest(fullContent)) return [];

  const hasMockReplacement =
    fullContent.includes('AsyncMock') ||
    fullContent.includes('MagicMock') ||
    fullContent.includes('vi.fn()');
  if (!hasMockReplacement) return [];

  const hasPayloadAssertion =
    fullContent.includes('assert_called') ||
    fullContent.includes('assert_awaited') ||
    fullContent.includes('call_args') ||
    fullContent.includes('toHaveBeenCalledWith');

  if (hasPayloadAssertion) return [];

  const lineIdx = lines.findIndex(
    (l) => l.includes('write_audit_log') || l.includes('writeAuditLog')
  );

  return [
    {
      rule_id: 'SEC-11',
      severity: 'HIGH',
      stig_owasp_ref: SEC_11_REF,
      file: relPath,
      line: lineIdx + 1,
      message:
        'Mock ciego sobre write_audit_log detectado sin aserciones sobre los argumentos recibidos (assert_called_once / call_args).',
      remediation:
        'Inspeccionar explícitamente los argumentos pasados a write_audit_log verificando que actor_username y resource_display_name sean legibles y no UUIDs crudos.',
    },
  ];
}

export function checkSec11AuditSemanticIntegrity(relPath: string, lines: string[]): SecurityFinding[] {
  if (
    !relPath.endsWith('.py') &&
    !relPath.endsWith('.ts') &&
    !relPath.endsWith('.js') &&
    !relPath.endsWith('.php')
  ) {
    return [];
  }
  if (isTestFilePath(relPath)) {
    return checkBlindAuditMockInTests(relPath, lines);
  }
  return checkRawSubInActorUsername(relPath, lines);
}

function checkCatchAllDomainElse(relPath: string, lines: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const catchAllPattern =
    /(?:\belse\s*\{\s*|\belse\s+)return\s+["'](?:MAINTENANCE|MANTENIMIENTO|CAÍDA|CAIDA|CRITICAL|SECURITY|SEGURIDAD)["']/i;

  for (const [i, line] of lines.entries()) {
    if (catchAllPattern.test(line)) {
      findings.push({
        rule_id: 'UI-11X-02',
        severity: 'MEDIUM',
        stig_owasp_ref: UI_11X_02_REF,
        file: relPath,
        line: i + 1,
        message:
          'Cláusula else genérica detectada devolviendo una insignia de dominio específica (ej. MAINTENANCE / MANTENIMIENTO).',
        remediation:
          'Mapear explícitamente cada categoría de evento (CAÍDA, MANTENIMIENTO, RESPALDO, SEGURIDAD, OPERACIÓN) y usar una etiqueta neutral (OPERACIÓN / INFO) en el caso por defecto.',
      });
    }
  }
  return findings;
}

function checkUncleanedSetInterval(relPath: string, lines: string[]): SecurityFinding[] {
  if (!relPath.endsWith('.vue') && !relPath.endsWith('.tsx') && !relPath.endsWith('.jsx')) {
    return [];
  }
  const fullContent = lines.join('\n');
  if (!fullContent.includes('setInterval(')) return [];
  if (fullContent.includes('clearInterval(')) return [];

  const lineIdx = lines.findIndex((l) => l.includes('setInterval('));
  return [
    {
      rule_id: 'UI-11X-02',
      severity: 'HIGH',
      stig_owasp_ref: UI_11X_02_REF,
      file: relPath,
      line: lineIdx + 1,
      message:
        'Uso de setInterval() en componente UI sin limpieza correspondiente con clearInterval() en onUnmounted / useEffect.',
      remediation:
        'Almacenar el identificador del intervalo y limpiarlo con clearInterval() dentro de onUnmounted (Vue 3) o en el retorno de useEffect (React).',
    },
  ];
}

export function checkUi11x02DualRefreshAndSemanticElse(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  if (
    !relPath.endsWith('.vue') &&
    !relPath.endsWith('.tsx') &&
    !relPath.endsWith('.jsx') &&
    !relPath.endsWith('.ts')
  ) {
    return [];
  }
  if (isTestFilePath(relPath)) return [];

  return [
    ...checkCatchAllDomainElse(relPath, lines),
    ...checkUncleanedSetInterval(relPath, lines),
  ];
}

const PACKAGE_JSON_FILENAME = 'package.json';
const ESLINTRC_JSON_FILENAME = '.eslintrc.json';

function checkSingleDirNpmrc(baseDir: string, relPrefix: string): SecurityFinding | null {
  const pkgPath = path.join(baseDir, PACKAGE_JSON_FILENAME);
  if (!fs.existsSync(pkgPath)) return null;

  const npmrcCandidates = [
    path.join(baseDir, '.npmrc'),
    path.join(baseDir, 'npmrc.example'),
    path.join(baseDir, '.npmrc.example'),
  ];

  for (const candidate of npmrcCandidates) {
    if (fs.existsSync(candidate)) {
      const content = fs.readFileSync(candidate, 'utf8');
      if (content.includes('ignore-scripts=true') || content.includes('ignore-scripts = true')) {
        return null;
      }
    }
  }

  return {
    rule_id: 'SEC-09',
    severity: 'HIGH',
    stig_owasp_ref: 'OWASP SFL / Zero-Trust NPM',
    file: relPrefix ? `${relPrefix}/.npmrc` : '.npmrc',
    line: 1,
    message: 'Proyecto Node.js carece de archivo .npmrc con directiva estricta ignore-scripts=true.',
    remediation:
      'Crear .npmrc con ignore-scripts=true para prevenir ejecución de scripts maliciosos en instalación.',
  };
}

function readJsonObjectSafe(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch (err: unknown) {
    // JSON malformado o ilegible se devuelve como null; los verificadores superiores tratan null como ausente
    reportDebugCatchError('security-auditor.readJsonObjectSafe', err);
    return null;
  }
}

function checkLegacyPnpmField(pkgObj: Record<string, unknown>, relPrefix: string): SecurityFinding | null {
  const rawPnpm = pkgObj.pnpm;
  if (!rawPnpm || typeof rawPnpm !== 'object' || Array.isArray(rawPnpm)) return null;
  if (!('onlyBuiltDependencies' in rawPnpm)) return null;
  return {
    rule_id: 'SEC-09',
    severity: 'MEDIUM',
    stig_owasp_ref: 'OWASP SFL / pnpm 12 Supply-Chain allowBuilds',
    file: relPrefix ? `${relPrefix}/${PACKAGE_JSON_FILENAME}` : PACKAGE_JSON_FILENAME,
    line: 1,
    message:
      'package.json declara pnpm.onlyBuiltDependencies (ignorado en pnpm 12+ con ERR_PNPM_IGNORED_BUILDS).',
    remediation:
      'Eliminar la clave "pnpm" de package.json y declarar el mapa booleano allowBuilds en pnpm-workspace.yaml.',
  };
}

function hasSecurityPluginV3(pkgObj: Record<string, unknown>): boolean {
  const deps: Record<string, unknown> = {
    ...((pkgObj.dependencies as Record<string, unknown> | undefined) ?? {}),
    ...((pkgObj.devDependencies as Record<string, unknown> | undefined) ?? {}),
  };
  const ver = deps['eslint-plugin-security'];
  return typeof ver === 'string' && /^(?:\^|~|>=)?3\./.test(ver.trim());
}

function checkLegacyEslintSecurityConfig(
  baseDir: string,
  pkgObj: Record<string, unknown>,
  relPrefix: string
): SecurityFinding | null {
  if (!hasSecurityPluginV3(pkgObj)) return null;
  const eslintObj = readJsonObjectSafe(path.join(baseDir, ESLINTRC_JSON_FILENAME));
  if (!eslintObj || !Array.isArray(eslintObj.extends)) return null;
  if (!eslintObj.extends.includes('plugin:security/recommended')) return null;
  return {
    rule_id: 'SEC-09',
    severity: 'MEDIUM',
    stig_owasp_ref: 'OWASP SAST / ESLint 8 + eslint-plugin-security v3',
    file: relPrefix ? `${relPrefix}/${ESLINTRC_JSON_FILENAME}` : ESLINTRC_JSON_FILENAME,
    line: 1,
    message:
      '.eslintrc.json extiende "plugin:security/recommended" (Flat Config) con eslint-plugin-security v3 en ESLint 8 clásico.',
    remediation:
      'Reemplazar "plugin:security/recommended" por "plugin:security/recommended-legacy" en .eslintrc.json.',
  };
}

function checkSec09NodeToolchainHygiene(baseDir: string, relPrefix: string): SecurityFinding[] {
  const pkgObj = readJsonObjectSafe(path.join(baseDir, PACKAGE_JSON_FILENAME));
  if (!pkgObj) return [];
  const findings: SecurityFinding[] = [];
  const legacyPnpm = checkLegacyPnpmField(pkgObj, relPrefix);
  if (legacyPnpm) findings.push(legacyPnpm);
  const legacyEslint = checkLegacyEslintSecurityConfig(baseDir, pkgObj, relPrefix);
  if (legacyEslint) findings.push(legacyEslint);
  return findings;
}

export function checkSec09Npmrc(projectPath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const rootFinding = checkSingleDirNpmrc(projectPath, '');
  if (rootFinding) findings.push(rootFinding);
  findings.push(...checkSec09NodeToolchainHygiene(projectPath, ''));

  const subDirs = ['vue3', 'react-frontend', 'node-backend', 'frontend', 'mcp-server', 'mobile-appium'];
  for (const sub of subDirs) {
    const subDir = path.join(projectPath, sub);
    const subFinding = checkSingleDirNpmrc(subDir, sub);
    if (subFinding) findings.push(subFinding);
    findings.push(...checkSec09NodeToolchainHygiene(subDir, sub));
  }
  return findings;
}

export function isNonHttpNodeCliEntry(projectPath: string, relFile: string): boolean {
  if (!relFile.endsWith('index.ts')) return false;
  try {
    const text = fs.readFileSync(path.join(projectPath, relFile), 'utf8');
    const hasCliSignal = text.startsWith('#!/usr/bin/env node') || text.includes('StdioServerTransport');
    const hasHttpSignal = /\b(?:express|fastify|Hono|createServer|NestFactory|Koa)\b/.test(text);
    return hasCliSignal && !hasHttpSignal;
  } catch {
    return false;
  }
}

export function checkSec08Oshp(projectPath: string, allRelFiles: string[]): SecurityFinding[] {
  const prodFiles = allRelFiles.filter((f) => !isTestFilePath(f));
  const hasBackendApp = prodFiles.some(
    (f) =>
      (f.endsWith('main.py') ||
        f.endsWith('app.py') ||
        f.endsWith('server.ts') ||
        f.endsWith('index.ts')) &&
      !isNonHttpNodeCliEntry(projectPath, f)
  );
  if (!hasBackendApp) return [];

  for (const relFile of prodFiles) {
    if (!relFile.endsWith('.py') && !relFile.endsWith('.ts') && !relFile.endsWith('.js')) continue;
    const fullPath = path.join(projectPath, relFile);
    try {
      const text = fs.readFileSync(fullPath, 'utf8');
      if (
        text.includes('Strict-Transport-Security') ||
        text.includes('Content-Security-Policy') ||
        text.includes('X-Content-Type-Options')
      ) {
        return [];
      }
    } catch (err: unknown) {
      // Continuar buscando cabeceras OSHP en el resto del proyecto si un archivo puntual es ilegible
      reportDebugCatchError('security-auditor.checkSec08Oshp', err);
    }
  }

  return [
    {
      rule_id: 'SEC-08',
      severity: 'MEDIUM',
      stig_owasp_ref: 'OWASP 5.4.4 / Cabeceras OSHP',
      file: 'src/',
      line: 1,
      message: 'No se detectó configuración de cabeceras de seguridad OWASP OSHP (HSTS, CSP, X-Content-Type-Options).',
      remediation: 'Incorporar middleware de seguridad inyectando HSTS, CSP estricto y X-Content-Type-Options: nosniff.',
    },
  ];
}

