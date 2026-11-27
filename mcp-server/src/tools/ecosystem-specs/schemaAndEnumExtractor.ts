// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import { collectProjectSourceFiles, isSafeRegularFile } from './projectDiscovery.js';
import {
  UTF8_ENCODING,
  type DiscoveredProject,
  type DomainEnumSymbol,
  type DomainModelField,
  type DomainModelRelation,
  type DomainModelSymbol,
} from './types.js';

const PY_EXTS: ReadonlySet<string> = new Set(['.py']);
const TS_EXTS: ReadonlySet<string> = new Set(['.ts', '.tsx', '.mts']);
const PHP_EXTS: ReadonlySet<string> = new Set(['.php']);
const PRISMA_EXTS: ReadonlySet<string> = new Set(['.prisma']);

const MAX_BLOCK_LINES = 60;
const PY_TABLENAME_RE = /^__tablename__\s*=\s*['"]([^'"]+)['"]/;
const PY_FIELD_LHS_RE = /^([a-z_][a-z0-9_]*)\s*:\s*([^#\r\n]{1,120})$/;
const PY_FK_RE = /ForeignKey\(\s*['"]([^'"]+)['"]/;
const PY_REL_RE = /^([a-z_][a-z0-9_]*)\s*:\s*[^=\r\n]{0,80}=\s*relationship\(\s*['"]?([A-Z]\w*)['"]?/;
const PY_REL_SIMPLE_RE = /^([a-z_][a-z0-9_]*)\s*=\s*relationship\(\s*['"]?([A-Z]\w*)['"]?/;
const PY_ENUM_CLASS_RE = /^class\s+([A-Z]\w*)\s*\([^)\r\n]{0,80}\b(?:Enum|IntEnum|StrEnum)\b[^)\r\n]{0,40}\)/;
const PY_ENUM_MEMBER_RE = /^([A-Z][A-Z0-9_]*)\s*=\s*(['"][^'"]{1,80}['"]|\d+)/;

const TS_ENUM_HEAD_RE = /^enum\s+([A-Z]\w*)\s*\{/;
const TS_UNION_NAME_RE = /^type\s+([A-Z]\w*)$/;
const TS_FIELD_RE = /^([a-zA-Z_]\w*)(\??)\s*:\s*([^;,\r\n}]{1,120})/;
const TS_ZOD_FIELD_RE = /^([a-zA-Z_]\w*)\s*:\s*z\.([a-zA-Z0-9_().'"[\],\s-]{1,120})/;
const IDENT_HEAD_RE = /^([A-Za-z_]\w*)$/;

const PHP_ENUM_HEAD_RE = /^enum\s+([A-Z]\w*)\b/;
const PHP_TABLE_RE = /^(?:protected|public)\s+\$table\s*=\s*['"]([^'"]+)['"]/;
const PHP_FILLABLE_ITEM_RE = /['"]([a-zA-Z_]\w*)['"]/g;
const PHP_REL_CALL_RE = /\$this->(belongsTo|hasMany|belongsToMany|hasOne)\(\s*([A-Z]\w*)::class/;

const PRISMA_MODEL_RE = /^model\s+([A-Z]\w*)\s*\{/;
const PRISMA_ENUM_RE = /^enum\s+([A-Z]\w*)\s*\{/;
const PRISMA_FIELD_RE = /^([a-zA-Z_]\w*)\s+([A-Za-z_]\w*(?:\[\])?\??)(?:\s|$)/;
const QUOTED_LITERAL_RE = /['"]([^'"]+)['"]/g;

function readLinesSafe(fullPath: string): string[] {
  try {
    return isSafeRegularFile(fullPath) ? fs.readFileSync(fullPath, UTF8_ENCODING).split(/\r?\n/) : [];
  } catch (err: unknown) {
    reportDebugCatchError(`schemaAndEnumExtractor.readLinesSafe(${fullPath})`, err);
    return [];
  }
}

function getIndent(line: string): number {
  let idx = 0;
  while (idx < line.length && (line[idx] === ' ' || line[idx] === '\t')) idx += 1;
  return idx;
}

function extractPythonConstraint(rhs: string | undefined): string | undefined {
  if (!rhs) return undefined;
  const trimmed = rhs.trim();
  if (trimmed.includes('Field(') || trimmed.includes('mapped_column(') || trimmed.includes('Column(')) {
    return trimmed.slice(0, 80);
  }
  return undefined;
}

function isPythonFieldRequired(typeRaw: string, rhs: string | undefined): boolean {
  if (typeRaw.includes('Optional[') || typeRaw.includes('| None') || typeRaw.includes('None |')) {
    return false;
  }
  if (!rhs) return true;
  const trimmed = rhs.trim();
  if (trimmed === 'None' || trimmed.includes('default=')) return false;
  if (trimmed.startsWith('Field(') && !trimmed.includes('default') && !trimmed.includes('...')) {
    return true;
  }
  return trimmed.startsWith('Field(') || trimmed.startsWith('mapped_column(') || trimmed.startsWith('Column(');
}

interface ParsedModelBody {
  tableName?: string;
  readonly fields: DomainModelField[];
  readonly relations: DomainModelRelation[];
}

function recordPythonField(trimmed: string, acc: ParsedModelBody): void {
  const eqIdx = trimmed.indexOf('=');
  const lhs = (eqIdx >= 0 ? trimmed.slice(0, eqIdx) : trimmed).trim();
  const rhsRaw = eqIdx >= 0 ? trimmed.slice(eqIdx + 1).split('#')[0]?.trim() : undefined;
  const field = PY_FIELD_LHS_RE.exec(lhs);
  if (!field?.[1] || !field[2]) return;
  const typeStr = field[2].trim();
  const rhs = rhsRaw && rhsRaw.length > 0 ? rhsRaw : undefined;
  const fk = rhs ? PY_FK_RE.exec(rhs) : null;
  if (fk?.[1]) {
    acc.relations.push({ kind: 'references', target: fk[1], field: field[1] });
  }
  const constraint = extractPythonConstraint(rhs);
  acc.fields.push({
    name: field[1],
    type: typeStr,
    required: isPythonFieldRequired(typeStr, rhs),
    ...(constraint ? { constraints: constraint } : {}),
  });
}

function applyPythonModelLine(trimmed: string, acc: ParsedModelBody): void {
  const tbl = PY_TABLENAME_RE.exec(trimmed);
  if (tbl?.[1]) {
    acc.tableName = tbl[1];
    return;
  }
  const rel = PY_REL_RE.exec(trimmed) ?? PY_REL_SIMPLE_RE.exec(trimmed);
  if (rel?.[1] && rel[2]) {
    acc.relations.push({ kind: trimmed.includes('list[') ? 'has_many' : 'belongs_to', target: rel[2], field: rel[1] });
    return;
  }
  recordPythonField(trimmed, acc);
}

export function extractPythonModelBody(
  lines: readonly string[],
  classLineIdx: number
): ParsedModelBody {
  const baseIndent = getIndent(lines[classLineIdx] ?? '');
  const acc: ParsedModelBody = { fields: [], relations: [] };
  const limit = Math.min(lines.length, classLineIdx + MAX_BLOCK_LINES);

  for (let i = classLineIdx + 1; i < limit; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('"""') || trimmed.startsWith("'''")) continue;
    if (getIndent(line) <= baseIndent) break;
    if (trimmed.startsWith('def ') || trimmed.startsWith('async def ') || trimmed.startsWith('model_config')) continue;
    applyPythonModelLine(trimmed, acc);
  }
  return acc;
}

function parseTsFieldLine(trimmed: string, isZod: boolean): DomainModelField | null {
  if (isZod) {
    const m = TS_ZOD_FIELD_RE.exec(trimmed);
    if (!m?.[1] || !m[2]) return null;
    const typeExpr = m[2].replace(/,\s*$/, '').trim();
    return {
      name: m[1],
      type: typeExpr,
      required: !typeExpr.includes('.optional(') && !typeExpr.includes('.nullish('),
    };
  }
  const body = trimmed.startsWith('readonly ') ? trimmed.slice(9).trimStart() : trimmed;
  const m = TS_FIELD_RE.exec(body);
  if (!m?.[1] || !m[3] || m[1].startsWith('constructor')) return null;
  const cleanType = m[3].trim();
  return {
    name: m[1],
    type: cleanType,
    required: m[2] !== '?' && !cleanType.includes('undefined'),
  };
}

function countBraceDelta(line: string): { readonly delta: number; readonly hasOpen: boolean } {
  let delta = 0;
  let hasOpen = false;
  for (const ch of line) {
    if (ch === '{') {
      delta += 1;
      hasOpen = true;
    } else if (ch === '}') {
      delta -= 1;
    }
  }
  return { delta, hasOpen };
}

function extractTsBraceBlockFields(
  lines: readonly string[],
  startLineIdx: number,
  isZod: boolean
): DomainModelField[] {
  const fields: DomainModelField[] = [];
  let depth = 0;
  let opened = false;
  const limit = Math.min(lines.length, startLineIdx + MAX_BLOCK_LINES);

  for (let i = startLineIdx; i < limit; i += 1) {
    const line = lines[i] ?? '';
    const braces = countBraceDelta(line);
    depth += braces.delta;
    if (braces.hasOpen) opened = true;
    if (i > startLineIdx && depth >= 1) {
      const parsed = parseTsFieldLine(line.trimStart(), isZod);
      if (parsed) fields.push(parsed);
    }
    if (opened && depth <= 0) break;
  }
  return fields;
}

function mapPhpRelationKind(methodName: string): DomainModelRelation['kind'] {
  if (methodName === 'belongsToMany') return 'many_to_many';
  if (methodName === 'hasMany') return 'has_many';
  return 'belongs_to';
}

function collectPhpFillableLine(line: string, fields: DomainModelField[]): void {
  PHP_FILLABLE_ITEM_RE.lastIndex = 0;
  let m = PHP_FILLABLE_ITEM_RE.exec(line);
  while (m !== null) {
    if (m[1]) fields.push({ name: m[1], type: 'mixed', required: true });
    m = PHP_FILLABLE_ITEM_RE.exec(line);
  }
}

function extractPhpModelBody(lines: readonly string[], startLineIdx: number): ParsedModelBody {
  const acc: ParsedModelBody = { fields: [], relations: [] };
  let inFillable = false;
  const limit = Math.min(lines.length, startLineIdx + MAX_BLOCK_LINES);

  for (let i = startLineIdx + 1; i < limit; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();
    const tbl = PHP_TABLE_RE.exec(trimmed);
    if (tbl?.[1]) acc.tableName = tbl[1];
    if (line.includes('$fillable')) inFillable = true;
    if (inFillable) {
      collectPhpFillableLine(line, acc.fields);
      if (line.includes('];')) inFillable = false;
    }
    const rel = PHP_REL_CALL_RE.exec(line);
    if (rel?.[1] && rel[2]) {
      acc.relations.push({ kind: mapPhpRelationKind(rel[1]), target: rel[2] });
    }
  }
  return acc;
}

function extractPythonEnumValues(lines: readonly string[], headIdx: number): string[] {
  const baseIndent = getIndent(lines[headIdx] ?? '');
  const values: string[] = [];
  for (let j = headIdx + 1; j < Math.min(lines.length, headIdx + MAX_BLOCK_LINES); j += 1) {
    const ln = lines[j] ?? '';
    const trimmed = ln.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (getIndent(ln) <= baseIndent) break;
    const member = PY_ENUM_MEMBER_RE.exec(trimmed);
    if (member?.[2]) values.push(member[2].replace(/^['"]|['"]$/g, ''));
  }
  return values;
}

function extractPythonEnumsFromFile(
  projectSlug: string,
  relFile: string,
  lines: readonly string[]
): DomainEnumSymbol[] {
  const enums: DomainEnumSymbol[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = PY_ENUM_CLASS_RE.exec((lines[i] ?? '').trimStart());
    if (!match?.[1]) continue;
    const values = extractPythonEnumValues(lines, i);
    if (values.length > 0) {
      enums.push({ project_slug: projectSlug, name: match[1], values, file: relFile, line: i + 1 });
    }
  }
  return enums;
}

function extractQuotedLiterals(raw: string): string[] {
  const out: string[] = [];
  QUOTED_LITERAL_RE.lastIndex = 0;
  let m = QUOTED_LITERAL_RE.exec(raw);
  while (m !== null) {
    if (m[1]) out.push(m[1]);
    m = QUOTED_LITERAL_RE.exec(raw);
  }
  return out;
}

function parseEnumAssignmentValue(rawLine: string): string | null {
  const cleaned = rawLine.trim().replace(/[,;]\s*$/, '');
  if (!cleaned) return null;
  const eqIdx = cleaned.indexOf('=');
  if (eqIdx < 0) {
    return IDENT_HEAD_RE.test(cleaned) ? cleaned : null;
  }
  const key = cleaned.slice(0, eqIdx).trim();
  if (!IDENT_HEAD_RE.test(key)) return null;
  const val = cleaned.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
  return val || key;
}

function extractTsEnumMembers(lines: readonly string[], headIdx: number): string[] {
  const values: string[] = [];
  for (let j = headIdx + 1; j < Math.min(lines.length, headIdx + MAX_BLOCK_LINES); j += 1) {
    const ln = lines[j] ?? '';
    if (ln.includes('}')) break;
    const val = parseEnumAssignmentValue(ln);
    if (val) values.push(val);
  }
  return values;
}

function parseTsUnionEnumLine(trimmed: string): { readonly name: string; readonly values: string[] } | null {
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 0) return null;
  const nameMatch = TS_UNION_NAME_RE.exec(trimmed.slice(0, eqIdx).trim());
  const rhs = trimmed.slice(eqIdx + 1);
  if (!nameMatch?.[1] || !rhs.includes('|')) return null;
  const vals = extractQuotedLiterals(rhs);
  return vals.length >= 2 ? { name: nameMatch[1], values: vals } : null;
}

function extractTsEnumsFromFile(
  projectSlug: string,
  relFile: string,
  lines: readonly string[]
): DomainEnumSymbol[] {
  const enums: DomainEnumSymbol[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const rawTrimmed = (lines[i] ?? '').trimStart();
    const trimmed = rawTrimmed.startsWith('export ') ? rawTrimmed.slice(7).trimStart() : rawTrimmed;
    const unionParsed = parseTsUnionEnumLine(trimmed);
    if (unionParsed) {
      enums.push({ project_slug: projectSlug, name: unionParsed.name, values: unionParsed.values, file: relFile, line: i + 1 });
      continue;
    }
    const enumHead = TS_ENUM_HEAD_RE.exec(trimmed);
    if (!enumHead?.[1]) continue;
    const values = extractTsEnumMembers(lines, i);
    if (values.length > 0) {
      enums.push({ project_slug: projectSlug, name: enumHead[1], values, file: relFile, line: i + 1 });
    }
  }
  return enums;
}

function extractPhpEnumCases(lines: readonly string[], headIdx: number): string[] {
  const values: string[] = [];
  for (let j = headIdx + 1; j < Math.min(lines.length, headIdx + MAX_BLOCK_LINES); j += 1) {
    const trimmed = (lines[j] ?? '').trim();
    if (trimmed === '}') break;
    if (!trimmed.startsWith('case ')) continue;
    const val = parseEnumAssignmentValue(trimmed.slice(5));
    if (val) values.push(val);
  }
  return values;
}

function extractPhpEnumsFromFile(
  projectSlug: string,
  relFile: string,
  lines: readonly string[]
): DomainEnumSymbol[] {
  const enums: DomainEnumSymbol[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trimStart();
    const head = line.includes('{') ? PHP_ENUM_HEAD_RE.exec(line) : null;
    if (!head?.[1]) continue;
    const values = extractPhpEnumCases(lines, i);
    if (values.length > 0) {
      enums.push({ project_slug: projectSlug, name: head[1], values, file: relFile, line: i + 1 });
    }
  }
  return enums;
}

function parsePrismaModelBlock(
  lines: readonly string[],
  headIdx: number
): { readonly fields: DomainModelField[]; readonly relations: DomainModelRelation[] } {
  const fields: DomainModelField[] = [];
  const relations: DomainModelRelation[] = [];
  for (let j = headIdx + 1; j < Math.min(lines.length, headIdx + MAX_BLOCK_LINES); j += 1) {
    const ln = (lines[j] ?? '').trim();
    if (ln === '}') break;
    if (!ln || ln.startsWith('//') || ln.startsWith('@@')) continue;
    const fm = PRISMA_FIELD_RE.exec(ln);
    if (!fm?.[1] || !fm[2]) continue;
    const isOpt = fm[2].endsWith('?');
    const cleanType = fm[2].replace(/\?$/, '');
    fields.push({ name: fm[1], type: cleanType, required: !isOpt });
    if (ln.includes('@relation(')) {
      relations.push({
        kind: cleanType.endsWith('[]') ? 'has_many' : 'belongs_to',
        target: cleanType.replace('[]', ''),
        field: fm[1],
      });
    }
  }
  return { fields, relations };
}

function parsePrismaEnumValues(lines: readonly string[], headIdx: number): string[] {
  const values: string[] = [];
  for (let j = headIdx + 1; j < Math.min(lines.length, headIdx + MAX_BLOCK_LINES); j += 1) {
    const ln = (lines[j] ?? '').trim();
    if (ln === '}') break;
    if (/^[A-Za-z_]\w*$/.test(ln)) values.push(ln);
  }
  return values;
}

function scanPrismaFile(
  projectSlug: string,
  relFile: string,
  lines: readonly string[],
  out: { models: DomainModelSymbol[]; enums: DomainEnumSymbol[] }
): void {
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? '').trimStart();
    const mHead = PRISMA_MODEL_RE.exec(trimmed);
    if (mHead?.[1]) {
      const body = parsePrismaModelBlock(lines, i);
      out.models.push({
        project_slug: projectSlug,
        name: mHead[1],
        kind: 'prisma-model',
        file: relFile,
        line: i + 1,
        fields: body.fields,
        ...(body.relations.length > 0 ? { relations: body.relations } : {}),
      });
      continue;
    }
    const eHead = PRISMA_ENUM_RE.exec(trimmed);
    if (eHead?.[1]) {
      const values = parsePrismaEnumValues(lines, i);
      if (values.length > 0) {
        out.enums.push({ project_slug: projectSlug, name: eHead[1], values, file: relFile, line: i + 1 });
      }
    }
  }
}

function extractPrismaArtifacts(
  project: DiscoveredProject
): { readonly models: DomainModelSymbol[]; readonly enums: DomainEnumSymbol[] } {
  const out = { models: [] as DomainModelSymbol[], enums: [] as DomainEnumSymbol[] };
  for (const relFile of collectProjectSourceFiles(project.absPath, PRISMA_EXTS, false)) {
    scanPrismaFile(project.slug, relFile, readLinesSafe(path.join(project.absPath, relFile)), out);
  }
  return out;
}

function applyParsedBodyToModel(model: DomainModelSymbol, body: ParsedModelBody): DomainModelSymbol {
  return {
    ...model,
    ...(body.tableName ? { table_name: body.tableName } : {}),
    ...(body.fields.length > 0 ? { fields: body.fields } : {}),
    ...(body.relations.length > 0 ? { relations: body.relations } : {}),
  };
}

function enrichSingleModel(
  projectAbs: string,
  model: DomainModelSymbol,
  fileLinesCache: Map<string, string[]>
): DomainModelSymbol {
  if (model.fields && model.fields.length > 0) return model;
  let lines = fileLinesCache.get(model.file);
  if (!lines) {
    lines = readLinesSafe(path.join(projectAbs, model.file));
    fileLinesCache.set(model.file, lines);
  }
  const lineIdx = Math.max(0, model.line - 1);
  if (model.kind === 'python-model' || model.kind === 'dataclass') {
    return applyParsedBodyToModel(model, extractPythonModelBody(lines, lineIdx));
  }
  if (model.kind === 'ts-type-or-schema') {
    const isZod = (lines[lineIdx] ?? '').includes('z.object(');
    const fields = extractTsBraceBlockFields(lines, lineIdx, isZod);
    return fields.length > 0 ? { ...model, fields } : model;
  }
  if (model.kind === 'php-model') {
    return applyParsedBodyToModel(model, extractPhpModelBody(lines, lineIdx));
  }
  return model;
}

export function extractSchemasAndEnums(
  project: DiscoveredProject,
  baseModels: readonly DomainModelSymbol[]
): {
  readonly models: DomainModelSymbol[];
  readonly enums: DomainEnumSymbol[];
} {
  const fileLinesCache = new Map<string, string[]>();
  const enriched = baseModels.map((m) => enrichSingleModel(project.absPath, m, fileLinesCache));
  const enums: DomainEnumSymbol[] = [];

  for (const relFile of collectProjectSourceFiles(project.absPath, PY_EXTS, false)) {
    enums.push(...extractPythonEnumsFromFile(project.slug, relFile, readLinesSafe(path.join(project.absPath, relFile))));
  }
  for (const relFile of collectProjectSourceFiles(project.absPath, TS_EXTS, false)) {
    enums.push(...extractTsEnumsFromFile(project.slug, relFile, readLinesSafe(path.join(project.absPath, relFile))));
  }
  for (const relFile of collectProjectSourceFiles(project.absPath, PHP_EXTS, false)) {
    enums.push(...extractPhpEnumsFromFile(project.slug, relFile, readLinesSafe(path.join(project.absPath, relFile))));
  }

  const prisma = extractPrismaArtifacts(project);
  return {
    models: [...enriched, ...prisma.models],
    enums: [...enums, ...prisma.enums],
  };
}
