// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';

export interface BoundaryRuleEntry {
  readonly kind: 'layers' | 'independence' | 'forbidden';
  readonly root?: string;
  readonly layers?: readonly string[];
  readonly modules?: readonly string[];
  readonly rules?: ReadonlyArray<{
    readonly source?: string;
    readonly forbidden?: readonly string[];
  }>;
}

const VALID_BOUNDARY_KINDS = new Set<string>(['layers', 'independence', 'forbidden']);
const BOUNDARIES_REL_PATH = path.join('.agents', 'boundaries.json');

function normRelPath(raw: string): string {
  let cleaned = raw.trim().replace(/\\/g, '/');
  while (cleaned.startsWith('./')) {
    cleaned = cleaned.slice(2);
  }
  while (cleaned.startsWith('/')) {
    cleaned = cleaned.slice(1);
  }
  while (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

function matchesPrefix(pathStr: string, prefix: string): boolean {
  const normPath = normRelPath(pathStr);
  const normPref = normRelPath(prefix);
  if (!normPath || !normPref) {
    return false;
  }
  return normPath === normPref || normPath.startsWith(`${normPref}/`);
}

function joinRootPrefix(root: string, item: string): string {
  const cleanRoot = normRelPath(root);
  const cleanItem = normRelPath(item);
  if (!cleanRoot) {
    return cleanItem;
  }
  return cleanItem ? `${cleanRoot}/${cleanItem}` : cleanRoot;
}

function extractBoundaryRuleList(parsed: unknown): BoundaryRuleEntry[] {
  let rawList: unknown[] = [];
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.kind === 'string') {
      rawList = [obj];
    } else if (Array.isArray(obj.rules_sets)) {
      rawList = obj.rules_sets;
    } else if (Array.isArray(obj.rules)) {
      rawList = obj.rules;
    } else {
      throw new Error("boundaries.json debe definir 'kind', 'rules' o 'rules_sets'.");
    }
  } else {
    throw new Error('boundaries.json debe ser objeto o arreglo JSON.');
  }

  const valid: BoundaryRuleEntry[] = [];
  for (const item of rawList) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as { kind?: unknown }).kind !== 'string' ||
      !VALID_BOUNDARY_KINDS.has((item as { kind: string }).kind)
    ) {
      throw new Error('Regla declarativa inválida o kind desconocido en .agents/boundaries.json.');
    }
    valid.push(item as BoundaryRuleEntry);
  }
  return valid;
}

export function loadProjectBoundaryRules(projectPath: string): {
  readonly rules: readonly BoundaryRuleEntry[];
  readonly error?: string;
} {
  const boundariesPath = path.join(projectPath, BOUNDARIES_REL_PATH);
  if (!fs.existsSync(boundariesPath)) {
    return { rules: [] };
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));
    return { rules: extractBoundaryRuleList(parsed) };
  } catch (err: unknown) {
    reportDebugCatchError('certifyHelpers.loadProjectBoundaryRules', err);
    return {
      rules: [],
      error: `Archivo .agents/boundaries.json inválido: ${(err as Error).message}`,
    };
  }
}

function checkLayerBoundaryRule(
  rule: BoundaryRuleEntry,
  src: string,
  tgt: string
): string | null {
  const layers = rule.layers ?? [];
  const root = rule.root ?? '';
  const prefixes = layers.map((layer) => joinRootPrefix(root, layer));
  const srcIdx = prefixes.findIndex((p) => matchesPrefix(src, p));
  const tgtIdx = prefixes.findIndex((p) => matchesPrefix(tgt, p));
  if (srcIdx !== -1 && tgtIdx !== -1 && srcIdx > tgtIdx) {
    return `Violación de capa declarativa (.agents/boundaries.json): '${src}' no puede importar '${tgt}'`;
  }
  return null;
}

function checkIndependenceBoundaryRule(
  rule: BoundaryRuleEntry,
  src: string,
  tgt: string
): string | null {
  const modules = rule.modules ?? [];
  const root = rule.root ?? '';
  const prefixes = modules.map((mod) => joinRootPrefix(root, mod));
  const srcIdx = prefixes.findIndex((p) => matchesPrefix(src, p));
  const tgtIdx = prefixes.findIndex((p) => matchesPrefix(tgt, p));
  if (srcIdx !== -1 && tgtIdx !== -1 && srcIdx !== tgtIdx) {
    return `Violación de independencia declarativa (.agents/boundaries.json): '${src}' acoplado a '${tgt}'`;
  }
  return null;
}

function checkForbiddenBoundaryRule(
  rule: BoundaryRuleEntry,
  src: string,
  tgt: string
): string | null {
  const root = rule.root ?? '';
  for (const entry of rule.rules ?? []) {
    if (!entry.source || !Array.isArray(entry.forbidden)) continue;
    const srcPref = joinRootPrefix(root, entry.source);
    if (!matchesPrefix(src, srcPref)) continue;
    for (const forb of entry.forbidden) {
      if (typeof forb === 'string' && matchesPrefix(tgt, joinRootPrefix(root, forb))) {
        return `Dependencia prohibida (.agents/boundaries.json): '${src}' -> '${tgt}'`;
      }
    }
  }
  return null;
}

export function evaluateDeclarativeBoundaryEdge(
  rules: readonly BoundaryRuleEntry[],
  srcRef: string,
  tgtRef: string,
  relGraph: string
): string[] {
  const src = normRelPath(srcRef);
  const tgt = normRelPath(tgtRef);
  if (!src || !tgt || src === tgt) {
    return [];
  }
  const blockers: string[] = [];
  for (const rule of rules) {
    let violation: string | null = null;
    if (rule.kind === 'layers') {
      violation = checkLayerBoundaryRule(rule, src, tgt);
    } else if (rule.kind === 'independence') {
      violation = checkIndependenceBoundaryRule(rule, src, tgt);
    } else if (rule.kind === 'forbidden') {
      violation = checkForbiddenBoundaryRule(rule, src, tgt);
    }
    if (violation) {
      blockers.push(`${violation} (en ${relGraph})`);
    }
  }
  return blockers;
}

// ============================================================================
// 🗺️ Paridad Completa ROADMAP.md / ROADMAP.es.md (vs verify_roadmap_consistency.py)
// ============================================================================

interface RoadmapTableRow {
  readonly hitoNum: string;
  readonly estadoRaw: string;
  readonly isCompleted: boolean;
  readonly isPending: boolean;
  readonly progresoPct: number;
}

interface RoadmapSectionStats {
  readonly hitoNum: string;
  readonly headerIcon: string;
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly calculatedPct: number;
  readonly isAllCompleted: boolean;
  readonly isAllPending: boolean;
  readonly isPartial: boolean;
}

const ROADMAP_HEADER_ICONS = new Set(['✅', '⏳', '🚧']);

function parseMilestoneNumberToken(raw: string): string | null {
  const cleaned = raw.endsWith('.') ? raw.slice(0, -1) : raw;
  const parts = cleaned.split('.');
  if (parts.length > 2) return null;
  for (const part of parts) {
    if (part.length === 0) return null;
    for (let i = 0; i < part.length; i += 1) {
      const code = part.charCodeAt(i);
      if (code < 48 || code > 57) return null;
    }
  }
  return cleaned;
}

function parseHitoLabelNumber(cellText: string): string | null {
  const tokens = cellText.trim().split(/\s+/);
  if (tokens.length !== 2) return null;
  const keyword = (tokens[0] ?? '').toLowerCase();
  if (keyword !== 'hito' && keyword !== 'milestone') return null;
  return parseMilestoneNumberToken(tokens[1] ?? '');
}

function parseRoadmapSectionHeader(
  trimmedLine: string
): { readonly icon: string; readonly hitoNum: string } | null {
  if (!trimmedLine.startsWith('## ')) return null;
  const rest = trimmedLine.slice(3).trim();
  const sepIdx = rest.search(/[:—-]/);
  if (sepIdx <= 0) return null;
  const headTokens = rest.slice(0, sepIdx).trim().split(/\s+/);
  let icon = '';
  let idx = 0;
  if (headTokens[0] && ROADMAP_HEADER_ICONS.has(headTokens[0])) {
    icon = headTokens[0];
    idx = 1;
  }
  const keyword = (headTokens[idx] ?? '').toLowerCase();
  if (keyword !== 'hito' && keyword !== 'milestone') return null;
  const hitoNum = parseMilestoneNumberToken(headTokens[idx + 1] ?? '');
  if (!hitoNum || headTokens.length !== idx + 2) return null;
  return { icon, hitoNum };
}

function parseRoadmapTableLine(clean: string): RoadmapTableRow | null {
  if (!clean.startsWith('|')) return null;
  const rawCells = clean.split('|').slice(1);
  const cells = clean.endsWith('|') ? rawCells.slice(0, -1) : rawCells;
  if (cells.length < 3) return null;
  const hitoCell = (cells[0] ?? '').replace(/\*/g, '').trim();
  const hitoNum = parseHitoLabelNumber(hitoCell);
  if (!hitoNum) return null;
  const estadoRaw = (cells[cells.length - 2] ?? '').trim();
  const estadoLow = estadoRaw.toLowerCase();
  const pctStr = (cells[cells.length - 1] ?? '').trim().replace(/[`%]/g, '').trim();
  const pctParsed = Number.parseFloat(pctStr);
  return {
    hitoNum,
    estadoRaw,
    isCompleted:
      estadoLow.includes('completado') ||
      estadoLow.includes('completed') ||
      estadoLow === 'done' ||
      estadoRaw.includes('✅'),
    isPending:
      estadoLow.includes('pendiente') || estadoLow.includes('pending') || estadoRaw.includes('⏳'),
    progresoPct: Number.isFinite(pctParsed) ? Math.trunc(pctParsed) : -1,
  };
}

function parseRoadmapTableRows(content: string): RoadmapTableRow[] {
  const rows: RoadmapTableRow[] = [];
  for (const line of content.split(/\r?\n/)) {
    const row = parseRoadmapTableLine(line.trim());
    if (row) rows.push(row);
  }
  return rows;
}

function buildSectionStats(
  hitoNum: string,
  headerIcon: string,
  lines: readonly string[]
): RoadmapSectionStats {
  let totalTasks = 0;
  let completedTasks = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^-\s*\[x\]/i.test(trimmed)) {
      totalTasks += 1;
      completedTasks += 1;
    } else if (/^-\s*\[\s*\]/.test(trimmed)) {
      totalTasks += 1;
    }
  }
  const calculatedPct = totalTasks > 0 ? Math.trunc((completedTasks / totalTasks) * 100) : 0;
  return {
    hitoNum,
    headerIcon,
    totalTasks,
    completedTasks,
    calculatedPct,
    isAllCompleted: totalTasks > 0 && completedTasks === totalTasks,
    isAllPending: totalTasks > 0 && completedTasks === 0,
    isPartial: totalTasks > 0 && completedTasks > 0 && completedTasks < totalTasks,
  };
}

function parseRoadmapSections(content: string): Map<string, RoadmapSectionStats> {
  const sections = new Map<string, RoadmapSectionStats>();
  let currentNum: string | null = null;
  let currentIcon = '';
  let currentLines: string[] = [];

  const flush = (): void => {
    if (currentNum !== null) {
      sections.set(currentNum, buildSectionStats(currentNum, currentIcon, currentLines));
    }
  };

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    const header = parseRoadmapSectionHeader(trimmed);
    if (header) {
      flush();
      currentIcon = header.icon;
      currentNum = header.hitoNum;
      currentLines = [];
    } else if (currentNum !== null && trimmed.startsWith('## ') && !trimmed.startsWith('## ---')) {
      flush();
      currentNum = null;
      currentLines = [];
    } else if (currentNum !== null) {
      currentLines.push(line);
    }
  }
  flush();
  return sections;
}

function validateCompletedRoadmapRow(
  row: RoadmapTableRow,
  sec: RoadmapSectionStats,
  label: string
): string[] {
  const errors: string[] = [];
  if (!row.isCompleted || row.progresoPct !== 100) {
    errors.push(
      `${label}: Milestone/Hito ${row.hitoNum} tiene ${sec.completedTasks}/${sec.totalTasks} tareas [x] pero la tabla indica '${row.estadoRaw} | ${row.progresoPct}%'.`
    );
  }
  if (sec.headerIcon && sec.headerIcon !== '✅') {
    errors.push(`${label}: Milestone/Hito ${row.hitoNum} completado tiene icono '${sec.headerIcon}' en vez de '✅'.`);
  }
  return errors;
}

function validatePendingRoadmapRow(
  row: RoadmapTableRow,
  sec: RoadmapSectionStats,
  label: string
): string[] {
  const errors: string[] = [];
  if (!row.isPending || row.progresoPct !== 0) {
    errors.push(
      `${label}: Milestone/Hito ${row.hitoNum} tiene 0/${sec.totalTasks} tareas completadas pero la tabla indica '${row.estadoRaw} | ${row.progresoPct}%'.`
    );
  }
  if (sec.headerIcon && sec.headerIcon !== '⏳') {
    errors.push(`${label}: Milestone/Hito ${row.hitoNum} pendiente tiene icono '${sec.headerIcon}' en vez de '⏳'.`);
  }
  return errors;
}

function validatePartialRoadmapRow(
  row: RoadmapTableRow,
  sec: RoadmapSectionStats,
  label: string
): string[] {
  const errors: string[] = [];
  if (row.isCompleted || row.progresoPct === 100) {
    errors.push(`${label} declara Milestone/Hito ${row.hitoNum} al 100% pero contiene tareas pendientes (- [ ]).`);
  } else if (row.isPending || row.progresoPct === 0) {
    errors.push(
      `${label}: Milestone/Hito ${row.hitoNum} figura Pendiente/0% pero ya tiene ${sec.completedTasks}/${sec.totalTasks} tareas [x].`
    );
  } else if (row.progresoPct > 0 && row.progresoPct < 100 && Math.abs(row.progresoPct - sec.calculatedPct) > 1) {
    errors.push(
      `${label}: Milestone/Hito ${row.hitoNum} indica ${row.progresoPct}% en tabla pero equivale a ${sec.calculatedPct}%.`
    );
  }
  if (sec.headerIcon === '✅' || sec.headerIcon === '⏳') {
    errors.push(`${label}: Milestone/Hito ${row.hitoNum} en progreso tiene icono '${sec.headerIcon}' en vez de '🚧'.`);
  }
  return errors;
}

function validateRoadmapRowAgainstSection(
  row: RoadmapTableRow,
  sec: RoadmapSectionStats,
  label: string
): string[] {
  if (sec.totalTasks === 0) return [];
  if (sec.isAllCompleted) return validateCompletedRoadmapRow(row, sec, label);
  if (sec.isAllPending) return validatePendingRoadmapRow(row, sec, label);
  return validatePartialRoadmapRow(row, sec, label);
}

export function validateSingleRoadmapFile(roadmapPath: string, label: string): string[] {
  if (!fs.existsSync(roadmapPath)) return [];
  const content = fs.readFileSync(roadmapPath, 'utf8');
  const tableRows = parseRoadmapTableRows(content);
  const sections = parseRoadmapSections(content);
  const errors: string[] = [];

  if (tableRows.length === 0) {
    for (const orphanNum of Array.from(sections.keys()).sort((a, b) => a.localeCompare(b))) {
      errors.push(`${label}: Hito huérfano ${orphanNum} en cuerpo sin fila en tabla de resumen.`);
    }
    return errors;
  }

  const tableIds = new Set<string>();
  for (const row of tableRows) {
    tableIds.add(row.hitoNum);
    const sec = sections.get(row.hitoNum);
    if (!sec) {
      errors.push(`${label}: Hito/Milestone ${row.hitoNum} figura en tabla pero carece de sección en cuerpo.`);
      continue;
    }
    errors.push(...validateRoadmapRowAgainstSection(row, sec, label));
  }
  for (const orphanNum of Array.from(sections.keys()).sort((a, b) => a.localeCompare(b))) {
    if (!tableIds.has(orphanNum)) {
      errors.push(`${label}: Hito huérfano ${orphanNum} en cuerpo sin fila en tabla de resumen.`);
    }
  }
  return errors;
}

export function validateBilingualRoadmapFiles(enPath: string, esPath: string): string[] {
  if (!fs.existsSync(enPath) || !fs.existsSync(esPath)) return [];
  const enRows = parseRoadmapTableRows(fs.readFileSync(enPath, 'utf8'));
  const esRows = parseRoadmapTableRows(fs.readFileSync(esPath, 'utf8'));
  if (enRows.length === 0 && esRows.length === 0) return [];
  const enMap = new Map(enRows.map((r) => [r.hitoNum, r]));
  const esMap = new Map(esRows.map((r) => [r.hitoNum, r]));
  const errors: string[] = [];
  const missingEs = Array.from(enMap.keys()).filter((k) => !esMap.has(k));
  const missingEn = Array.from(esMap.keys()).filter((k) => !enMap.has(k));
  if (missingEs.length > 0 || missingEn.length > 0) {
    errors.push(`Desfase bilingüe ROADMAP.md vs ROADMAP.es.md (faltan ES=${missingEs.join(',')}, EN=${missingEn.join(',')}).`);
  }
  for (const [num, enItem] of enMap.entries()) {
    const esItem = esMap.get(num);
    if (esItem && (enItem.progresoPct !== esItem.progresoPct || enItem.isCompleted !== esItem.isCompleted)) {
      errors.push(
        `Desfase bilingüe en Hito/Milestone ${num}: ROADMAP.md (${enItem.progresoPct}%) != ROADMAP.es.md (${esItem.progresoPct}%).`
      );
    }
  }
  return errors;
}
