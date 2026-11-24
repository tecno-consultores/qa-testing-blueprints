// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SecurityFinding } from '../../types.js';
import { pickAt } from '../../utils/diagnosticFormatter.js';
import {
  HDR_CORP,
  HDR_CROSS_ORIGIN,
  HDR_SAME_ORIGIN,
  WEBMANIFEST_EXT,
  findLineNumberContaining,
  isDirectorySafe,
  isTestFilePath,
  joinSubpath,
  parseJsonObjectTextSafe,
  readTextFileSafe,
} from './shared.js';

const UI_11X_03_REF = 'W3C Manifest / Google Search >=48px / Cloudflare Edge Headers';
const UI_11X_03_OK_PRAGMA = 'ui-11x-03-ok';
const APPLE_TOUCH_REL = 'apple-touch-icon';
const FAVICON_ICO_NAME = 'favicon.ico';
const PATH_FAVICON_ICO = '/favicon.ico';

const WILDCARD_ALL_ROUTE = '/*';
const PUBLIC_DIR_NAME = 'public';

const WATCHED_EDGE_HEADERS = new Set([
  'cache-control',
  'x-robots-tag',
  HDR_CORP,
  'content-security-policy',
  'x-frame-options',
  'referrer-policy',
]);

const PUBLIC_EDGE_ASSET_PREFIXES = ['/favicons/', '/brand/', '/og/'];

interface EdgeHeaderOp {
  kind: 'detach' | 'set';
  name: string;
  value: string;
  line: number;
}

interface EdgeHeaderBlock {
  route: string;
  line: number;
  ops: EdgeHeaderOp[];
}

interface Ui11x03FindingInput {
  readonly severity: 'HIGH' | 'MEDIUM';
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly remediation: string;
}

function makeUi11x03Finding(input: Ui11x03FindingInput): SecurityFinding {
  return {
    rule_id: 'UI-11X-03',
    severity: input.severity,
    stig_owasp_ref: UI_11X_03_REF,
    file: input.file,
    line: input.line,
    message: input.message,
    remediation: input.remediation,
  };
}


function parseHtmlLinkAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /\s([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(tag)) !== null) {
    const attrName = match[1];
    if (attrName) {
      attrs[attrName.toLowerCase()] = pickAt(match, 2, pickAt(match, 3)).trim();
    }
  }
  return attrs;
}

function hasSizeToken(sizesAttr: string, expectedSize: string): boolean {
  return sizesAttr
    .toLowerCase()
    .split(/\s+/)
    .includes(expectedSize);
}

function lineAtOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function checkAppleTouchLinkTag(
  relPath: string,
  line: number,
  cleanHref: string,
  sizesAttr: string
): SecurityFinding | null {
  if (cleanHref.endsWith('.webp') || cleanHref.endsWith('.svg')) {
    return makeUi11x03Finding({
      severity: 'HIGH',
      file: relPath,
      line,
      message: `Etiqueta rel="${APPLE_TOUCH_REL}" apunta a formato no soportado por Safari/iOS (${cleanHref}).`,
      remediation: 'Generar un PNG RGB opaco de 180x180 px (sin transparencia ni .webp/.svg) y referenciarlo con sizes="180x180".',
    });
  }
  if (cleanHref.endsWith('.png') && !hasSizeToken(sizesAttr, '180x180')) {
    return makeUi11x03Finding({
      severity: 'MEDIUM',
      file: relPath,
      line,
      message: `Etiqueta rel="${APPLE_TOUCH_REL}" PNG omite el atributo recomendado sizes="180x180".`,
      remediation: 'Agregar sizes="180x180" al <link rel="apple-touch-icon"> apuntando al PNG opaco de 180x180 px.',
    });
  }
  return null;
}

interface HtmlLinkTagInput {
  readonly relPath: string;
  readonly line: number;
  readonly tag: string;
  readonly hasSiblingPublic: boolean;
  readonly hasAnyIco: boolean;
}

function inspectHtmlLinkTag(
  input: HtmlLinkTagInput
): { findings: SecurityFinding[]; hasFavicon48: boolean } {
  const { relPath, line, tag, hasSiblingPublic, hasAnyIco } = input;
  const findings: SecurityFinding[] = [];
  const attrs = parseHtmlLinkAttributes(tag);
  const relTokens = (attrs.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const cleanHref = pickAt((attrs.href ?? '').split(/[?#]/, 1), 0).toLowerCase();
  const sizesAttr = attrs.sizes ?? '';

  if (relTokens.includes(APPLE_TOUCH_REL)) {
    const appleFinding = checkAppleTouchLinkTag(relPath, line, cleanHref, sizesAttr);
    if (appleFinding) findings.push(appleFinding);
  }

  const isFaviconLink =
    relTokens.includes('icon') &&
    (cleanHref === PATH_FAVICON_ICO || cleanHref === FAVICON_ICO_NAME || cleanHref.endsWith(PATH_FAVICON_ICO));
  if (!isFaviconLink) {
    return { findings, hasFavicon48: false };
  }

  const hasFavicon48 = hasSizeToken(sizesAttr, '48x48');
  if (hasSiblingPublic && !hasAnyIco) {
    findings.push(
      makeUi11x03Finding({
        severity: 'HIGH',
        file: relPath,
        line,
        message: `index.html referencia ${PATH_FAVICON_ICO}, pero no existe public/${FAVICON_ICO_NAME} ni ${FAVICON_ICO_NAME} en disco (HTTP 404).`,
        remediation: 'Generar public/favicon.ico multi-resolución (16x16, 32x32, 48x48) con sizes="48x48".',
      })
    );
  }
  return { findings, hasFavicon48 };
}

function hasSubprojectWebmanifest(allRelFiles: string[], appDir: string): boolean {
  const prefix = appDir === '.' ? '' : `${appDir}/`;
  return allRelFiles.some((f) => {
    const norm = f.replace(/\\/g, '/');
    return norm.startsWith(prefix) && norm.toLowerCase().endsWith(WEBMANIFEST_EXT);
  });
}

function checkSubprojectFaviconPresence(
  relPath: string,
  hasBrandSuite: boolean,
  hasPublicIco: boolean,
  hasFaviconIco48: boolean
): SecurityFinding[] {
  if (!hasBrandSuite) return [];
  if (!hasPublicIco) {
    return [
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: 1,
        message: `Suite de marca/PWA detectada sin public/${FAVICON_ICO_NAME} en disco para navegadores clásicos y Google Search (>= 48px).`,
        remediation: 'Empaquetar public/favicon.ico con tramas 16x16, 32x32 y 48x48 y declararlo en index.html con sizes="48x48".',
      }),
    ];
  }
  if (!hasFaviconIco48) {
    return [
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: 1,
        message: `index.html no declara <link rel="icon" href="${PATH_FAVICON_ICO}" sizes="48x48" /> para cumplir el requisito >= 48px de Google Search.`,
        remediation: 'Añadir <link rel="icon" href="/favicon.ico" sizes="48x48" /> en el <head> de index.html.',
      }),
    ];
  }
  return [];
}

function checkHtmlFaviconAndAppleTouchLinks(
  projectPath: string,
  relPath: string,
  allRelFiles: string[]
): SecurityFinding[] {
  const normRel = relPath.replace(/\\/g, '/');
  if (normRel !== 'index.html' && !normRel.endsWith('/index.html')) return [];
  if (isTestFilePath(normRel)) return [];

  const content = readTextFileSafe(path.join(projectPath, relPath));
  if (!content || content.includes(UI_11X_03_OK_PRAGMA)) return [];

  const appDir = path.posix.dirname(normRel);
  const publicDir = path.join(projectPath, joinSubpath(appDir, PUBLIC_DIR_NAME));
  const hasSiblingPublic = isDirectorySafe(publicDir);
  const hasPublicIco = fs.existsSync(path.join(publicDir, FAVICON_ICO_NAME));
  const hasAnyIco = hasPublicIco || fs.existsSync(path.join(projectPath, joinSubpath(appDir, FAVICON_ICO_NAME)));

  const findings: SecurityFinding[] = [];
  let hasFaviconIco48 = false;
  const linkRe = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(content)) !== null) {
    const inspected = inspectHtmlLinkTag({
      relPath,
      line: lineAtOffset(content, match.index),
      tag: match[0],
      hasSiblingPublic,
      hasAnyIco,
    });
    findings.push(...inspected.findings);
    if (inspected.hasFavicon48) hasFaviconIco48 = true;
  }

  const hasBrandSuite =
    isDirectorySafe(path.join(publicDir, 'favicons')) || hasSubprojectWebmanifest(allRelFiles, appDir);
  findings.push(...checkSubprojectFaviconPresence(relPath, hasBrandSuite, hasPublicIco, hasFaviconIco48));
  return findings;
}

interface ManifestIconSummary {
  hasWebp: boolean;
  hasCombinedPurpose: boolean;
  hasPng192: boolean;
  hasPng512: boolean;
}

function readLowerIconField(icon: Record<string, unknown>, key: string): string {
  const val = icon[key];
  return typeof val === 'string' ? val.toLowerCase() : '';
}

function inspectManifestIconEntry(entry: unknown, summary: ManifestIconSummary): void {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
  const icon = entry as Record<string, unknown>;
  const rawSrc = readLowerIconField(icon, 'src');
  const cleanSrc = rawSrc ? pickAt(rawSrc.split(/[?#]/, 1), 0) : '';
  const mimeType = readLowerIconField(icon, 'type');
  const purposeTokens = readLowerIconField(icon, 'purpose').split(/\s+/).filter(Boolean);
  const sizesAttr = typeof icon.sizes === 'string' ? icon.sizes : '';

  if (cleanSrc.endsWith('.webp') || mimeType === 'image/webp') summary.hasWebp = true;
  if (purposeTokens.includes('any') && purposeTokens.includes('maskable')) summary.hasCombinedPurpose = true;

  const isPng = cleanSrc.endsWith('.png') || mimeType === 'image/png';
  if (isPng && hasSizeToken(sizesAttr, '192x192')) summary.hasPng192 = true;
  if (isPng && hasSizeToken(sizesAttr, '512x512')) summary.hasPng512 = true;
}

function checkWebAppManifestIcons(projectPath: string, relPath: string): SecurityFinding[] {
  const normRel = relPath.replace(/\\/g, '/');
  const isManifest =
    normRel.toLowerCase().endsWith(WEBMANIFEST_EXT) || /(?:^|\/)public\/manifest\.json$/i.test(normRel);
  if (!isManifest || isTestFilePath(normRel)) return [];

  const rawText = readTextFileSafe(path.join(projectPath, relPath));
  if (!rawText || rawText.includes(UI_11X_03_OK_PRAGMA)) return [];

  const doc = parseJsonObjectTextSafe(rawText);
  if (!doc || !Array.isArray(doc.icons)) return [];

  const summary: ManifestIconSummary = {
    hasWebp: false,
    hasCombinedPurpose: false,
    hasPng192: false,
    hasPng512: false,
  };
  for (const entry of doc.icons) {
    inspectManifestIconEntry(entry, summary);
  }

  const findings: SecurityFinding[] = [];
  if (summary.hasWebp) {
    findings.push(
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: findLineNumberContaining(rawText, '.webp'),
        message: 'Manifiesto PWA declara iconos .webp en lugar de PNG opacos multiplataforma.',
        remediation: 'Reemplazar iconos .webp por icon-192.png (192x192) e icon-512.png (512x512) en formato image/png.',
      })
    );
  }
  if (summary.hasCombinedPurpose) {
    findings.push(
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: findLineNumberContaining(rawText, 'maskable'),
        message: 'Manifiesto PWA combina "any maskable" en una misma entrada (riesgo de recorte en lanzadores).',
        remediation: 'Separar en objetos distintos las entradas con "purpose": "any" y "purpose": "maskable".',
      })
    );
  }
  if (!summary.hasPng192 || !summary.hasPng512) {
    findings.push(
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: findLineNumberContaining(rawText, '"icons"'),
        message: 'Manifiesto PWA carece de ambos iconos image/png requeridos (192x192 y 512x512).',
        remediation: 'Incluir entradas image/png explícitas para 192x192 y 512x512 en site.webmanifest.',
      })
    );
  }
  return findings;
}

function parseIndentedHeaderOp(trimmed: string, line: number): EdgeHeaderOp | null {
  if (trimmed.startsWith('!')) {
    const detachedName = trimmed.slice(1).trim().toLowerCase();
    return /^[a-z0-9-]+$/.test(detachedName)
      ? { kind: 'detach', name: detachedName, value: '', line }
      : null;
  }
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx <= 0) return null;
  const headerName = trimmed.slice(0, colonIdx).trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(headerName)) return null;
  return {
    kind: 'set',
    name: headerName,
    value: trimmed.slice(colonIdx + 1).trim().toLowerCase(),
    line,
  };
}

function parseEdgeHeadersBlocks(lines: string[]): EdgeHeaderBlock[] {
  const blocks: EdgeHeaderBlock[] = [];
  let current: EdgeHeaderBlock | null = null;

  for (const [i, raw] of lines.entries()) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = { route: trimmed, line: i + 1, ops: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    const op = parseIndentedHeaderOp(trimmed, i + 1);
    if (op) current.ops.push(op);
  }
  return blocks;
}

function collectGlobalWatchedHeaders(blocks: EdgeHeaderBlock[]): Map<string, string> {
  const globalHeaders = new Map<string, string>();
  for (const block of blocks) {
    if (block.route !== WILDCARD_ALL_ROUTE) continue;
    for (const op of block.ops) {
      if (op.kind === 'set' && WATCHED_EDGE_HEADERS.has(op.name)) {
        globalHeaders.set(op.name, op.value);
      }
    }
  }
  return globalHeaders;
}

function isPublicAssetEdgeRoute(route: string): boolean {
  return route === PATH_FAVICON_ICO || PUBLIC_EDGE_ASSET_PREFIXES.some((prefix) => route.startsWith(prefix));
}

function inspectSingleEdgeHeaderBlock(
  relPath: string,
  block: EdgeHeaderBlock,
  globalWatched: Map<string, string>
): SecurityFinding[] {
  if (block.route === WILDCARD_ALL_ROUTE) return [];
  const findings: SecurityFinding[] = [];
  const detached = new Set<string>();
  let corpSetCrossOrigin = false;

  for (const op of block.ops) {
    if (op.kind === 'detach') {
      detached.add(op.name);
      continue;
    }
    if (op.name === HDR_CORP && op.value === HDR_CROSS_ORIGIN) corpSetCrossOrigin = true;
    if (globalWatched.has(op.name) && !detached.has(op.name)) {
      findings.push(
        makeUi11x03Finding({
          severity: 'HIGH',
          file: relPath,
          line: op.line,
          message: `Bloque "${block.route}" en _headers redefine "${op.name}" sin desacoplamiento previo "! ${op.name}" (concatenación aditiva desde /*).`,
          remediation: `Anteponer "! ${op.name}" dentro del bloque "${block.route}" antes de emitir el nuevo valor.`,
        })
      );
    }
  }

  if (globalWatched.get(HDR_CORP) === HDR_SAME_ORIGIN && isPublicAssetEdgeRoute(block.route) && !corpSetCrossOrigin) {
    findings.push(
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: block.line,
        message: `La regla global /* fija ${HDR_CORP}: ${HDR_SAME_ORIGIN}, pero "${block.route}" no habilita "${HDR_CROSS_ORIGIN}" para rastreadores y previsualizaciones OG.`,
        remediation: `Desacoplar con "! Cross-Origin-Resource-Policy" y fijar "Cross-Origin-Resource-Policy: cross-origin" en "${block.route}".`,
      })
    );
  }
  return findings;
}

function checkCloudflareHeadersDetachment(projectPath: string, relPath: string): SecurityFinding[] {
  const normRel = relPath.replace(/\\/g, '/');
  if (!/(?:^|\/)_headers$/.test(normRel) || isTestFilePath(normRel)) return [];

  const rawText = readTextFileSafe(path.join(projectPath, relPath));
  if (!rawText || rawText.includes(UI_11X_03_OK_PRAGMA)) return [];

  const blocks = parseEdgeHeadersBlocks(rawText.split(/\r?\n/));
  const globalWatched = collectGlobalWatchedHeaders(blocks);
  if (globalWatched.size === 0) return [];

  const findings: SecurityFinding[] = [];
  for (const block of blocks) {
    findings.push(...inspectSingleEdgeHeaderBlock(relPath, block, globalWatched));
  }
  return findings;
}

function extractRoutePatterns(doc: Record<string, unknown>, key: string): string[] {
  const raw = doc[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

function isInvalidPagesRoutePattern(pattern: string): boolean {
  const starIdx = pattern.indexOf('*');
  return starIdx !== -1 && (starIdx !== pattern.length - 1 || pattern.indexOf('*', starIdx + 1) !== -1);
}

function checkCloudflareRoutesJson(projectPath: string, relPath: string): SecurityFinding[] {
  const normRel = relPath.replace(/\\/g, '/');
  if (!/(?:^|\/)_routes\.json$/.test(normRel) || isTestFilePath(normRel)) return [];

  const rawText = readTextFileSafe(path.join(projectPath, relPath));
  if (!rawText || rawText.includes(UI_11X_03_OK_PRAGMA)) return [];

  const doc = parseJsonObjectTextSafe(rawText);
  if (!doc) return [];

  const includePatterns = extractRoutePatterns(doc, 'include');
  const excludePatterns = extractRoutePatterns(doc, 'exclude');
  const findings: SecurityFinding[] = [];

  for (const pattern of [...includePatterns, ...excludePatterns]) {
    if (isInvalidPagesRoutePattern(pattern)) {
      findings.push(
        makeUi11x03Finding({
          severity: 'HIGH',
          file: relPath,
          line: findLineNumberContaining(rawText, pattern),
          message: `Comodín inválido "${pattern}" en _routes.json (Cloudflare Pages v1 solo admite "*" como sufijo final).`,
          remediation: 'Reemplazar comodines de sufijo o intermedios (ej. /*.ico) por rutas exactas como "/favicon.ico" o prefijos "/favicons/*".',
        })
      );
    }
  }

  if (includePatterns.includes(WILDCARD_ALL_ROUTE) && Array.isArray(doc.exclude) && !excludePatterns.includes(PATH_FAVICON_ICO)) {
    findings.push(
      makeUi11x03Finding({
        severity: 'MEDIUM',
        file: relPath,
        line: findLineNumberContaining(rawText, '"exclude"'),
        message: `_routes.json incluye "${WILDCARD_ALL_ROUTE}" sin excluir explícitamente "${PATH_FAVICON_ICO}" en exclude.`,
        remediation: 'Agregar "/favicon.ico" al arreglo exclude de _routes.json para evitar invocar Workers innecesariamente.',
      })
    );
  }
  return findings;
}

export function checkUi11x03FaviconPwaAndEdgeHeaders(
  projectPath: string,
  allRelFiles: string[]
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const relPath of allRelFiles) {
    findings.push(
      ...checkHtmlFaviconAndAppleTouchLinks(projectPath, relPath, allRelFiles),
      ...checkWebAppManifestIcons(projectPath, relPath),
      ...checkCloudflareHeadersDetachment(projectPath, relPath),
      ...checkCloudflareRoutesJson(projectPath, relPath)
    );
  }
  return findings;
}

