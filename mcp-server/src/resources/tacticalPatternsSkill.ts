// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import type { ResourceLanguage } from '../types.js';
import { getActiveResourceLang } from './resourceLang.js';

export const TACTICAL_PATTERNS_SKILL_URI = 'blueprint://skills/tactical-patterns-11x' as const;
export const TACTICAL_PATTERNS_SKILL_REL_PATH =
  '.agents/skills/tactical-patterns-11x/SKILL.md' as const;
const MARKDOWN_MIME_TYPE = 'text/markdown' as const;

export const TACTICAL_PATTERNS_SKILL_RESOURCE: Resource = {
  uri: TACTICAL_PATTERNS_SKILL_URI,
  name: 'QA-11X Tactical Patterns Micro-Skill',
  description:
    'JIT tactical design patterns for complexity rescue (Radon CC <= 5, SonarJS <= 15, max-params <= 4, max-depth <= 3), offline Port/Adapter (--network none), transactional outbox/idempotency/RLS, and anti-overengineering.',
  mimeType: MARKDOWN_MIME_TYPE,
};

export interface TacticalPatternsSkillResult {
  readonly uri: string;
  readonly mimeType: string;
  readonly text: string;
  readonly source: 'workspace' | 'embedded-fallback';
  readonly contents: Array<{
    readonly uri: string;
    readonly mimeType: string;
    readonly text: string;
  }>;
}

const EMBEDDED_TACTICAL_PATTERNS_EN = [
  '# Tactical Patterns (`tactical-patterns-11x`)',
  '',
  '## 1. Complexity Gate Rescue (`Radon CC > 5` | `SonarJS > 15` | `max-params > 4` | `max-depth > 3`)',
  '- `depth > 3`: Flatten with **Guard Clauses** (early return keeping happy path at indent 0).',
  '- `>= 3` branches: Replace `if/elif/switch` chains with **Dispatch Table / Handler Map** (`dict`, `Record<K, Handler>`, PHP 8.2+ `match`).',
  '- Sequential transforms: Compose stateless steps in a **Pure Pipeline**.',
  '- **FORBIDDEN:** Splitting into `_helper_1`/`_helper_2` passing `> 4` positional params or mutating shared dicts; pass frozen DTOs (`@dataclass(frozen=True)`, TS `readonly interface`).',
  '',
  '## 2. Anti-Mock & Offline Boundary (`--network none`)',
  '- Separate domain rules (**Functional Core**) from thin persistence shells (**Imperative Shell**) running against ephemeral PG17 & KeyDB.',
  '- Use **Port & Adapter** (`Protocol`/`interface`) strictly at external network edges for deterministic offline doubles (`respx`, `nock`, `MockHandler`). Never mock SQLAlchemy/Prisma/Doctrine/audit logs.',
  '',
  '## 3. Distributed Consistency & Multi-Tenancy (STIG V6R5 / OWASP v4.2)',
  '- Co-locate DB writes and event enqueueing via **Transactional Outbox** in the same PG transaction.',
  '- Guard mutations with an **Atomic Idempotency State Machine** (`409` on payload SHA-256 mismatch) and bind PG17 RLS with a **Context-Scoped Unit of Work** (`SET LOCAL app.current_tenant_id`).',
  '',
  '## 4. Anti-Overengineering Guardrails',
  '- No single-implementation internal interfaces, no `Factory` for `< 3` variants, and no mutable `Singleton` state.',
  '',
].join('\n');

const EMBEDDED_TACTICAL_PATTERNS_ES = [
  '# Patrones Tácticos 11X (`tactical-patterns-11x`)',
  '',
  '> **Activación JIT (`[DIRECTIVE-11X]`):** Aplica estos patrones antes de refactorizar cuando fallen `C901`, `PLR0911`, `PLR0913`, `max-params`, `max-depth` o `sonarjs/cognitive-complexity`.',
  '',
  '## 1. Rescate de Complejidad (`Radon CC <= 5` | `SonarJS <= 15` | `max-params <= 4` | `max-depth <= 3`)',
  '- `depth > 3`: Aplana con **Cláusulas de Guarda** (retorno temprano dejando la ruta principal sin anidamiento).',
  '- `>= 3` ramas por estado/tipo: Sustituye `if/elif/switch` por **Tabla de Despacho** (`dict`, `Record<K, Handler>`, PHP `match`).',
  '- Flujos secuenciales: Compón transformaciones puras (**Pure Pipeline**).',
  '- **PROHIBIDO:** Fragmentar en `_helper_1`/`_helper_2` pasando `> 4` parámetros posicionales o mutando diccionarios; agrupa en DTOs inmutables (`@dataclass(frozen=True)`, `readonly interface`).',
  '',
  '## 2. Frontera Anti-Mock y Pruebas Offline (`--network none`)',
  '- Separa lógica pura (**Functional Core**) de persistencia real (**Imperative Shell** con PG17/KeyDB efímeros).',
  '- Usa **Puerto/Adaptador** solo en fronteras HTTP/hardware externas (`respx`, `nock`, `MockHandler`); jamás ocultes ORM o `write_audit_log` tras mocks.',
  '',
  '## 3. Consistencia, Idempotencia y Multi-Tenancy (STIG V6R5 / OWASP v4.2)',
  '- Usa **Outbox Transaccional** en la misma transacción PG, máquina de **Idempotencia Atómica** (`409` si cambia SHA-256) y **Unit of Work RLS** (`SET LOCAL app.current_tenant_id`).',
  '',
  '## 4. Guardrails Anti-Sobreingeniería',
  '- Prohibidas interfaces de 1 sola implementación interna, `Factory` con `< 3` variantes o `Singleton` mutable.',
  '',
].join('\n');

const ES_WORKSPACE_BANNER = [
  '# Patrones Tácticos 11X (`tactical-patterns-11x`) — Guía Operativa ES',
  '',
  '> **Nota Bilingüe:** Las reglas normativas se consumen en inglés de alta densidad por eficiencia de tokens; consulta este recurso ante fallos `[DIRECTIVE-11X]` para aplicar Cláusulas de Guarda, Tablas de Despacho, DTOs inmutables (`<= 4` parámetros), Pipelines y Puertos Offline.',
  '',
].join('\n');

function isContainedPath(rootDir: string, candidatePath: string): boolean {
  const rel = path.relative(rootDir, candidatePath);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function tryReadContainedSkillFile(candidateRoot: string): string | null {
  const resolvedRoot = path.resolve(candidateRoot);
  const candidateFile = path.resolve(resolvedRoot, TACTICAL_PATTERNS_SKILL_REL_PATH);
  if (!fs.existsSync(candidateFile)) {
    return null;
  }
  const realRoot = fs.realpathSync(resolvedRoot);
  const realFile = fs.realpathSync(candidateFile);
  if (!isContainedPath(realRoot, realFile) || !fs.statSync(realFile).isFile()) {
    return null;
  }
  return fs.readFileSync(realFile, 'utf8');
}

function loadTacticalPatternsMarkdown(workspaceRoot?: string): {
  readonly source: 'workspace' | 'embedded-fallback';
  readonly markdown: string;
} {
  if (workspaceRoot) {
    const explicit = tryReadContainedSkillFile(workspaceRoot);
    return explicit !== null
      ? { source: 'workspace', markdown: explicit }
      : { source: 'embedded-fallback', markdown: '' };
  }

  const envRoot = process.env.QA_BLUEPRINTS_LOCAL_PATH?.trim();
  const candidates = [
    ...(envRoot ? [envRoot] : []),
    process.cwd(),
    path.dirname(process.cwd()),
    path.resolve(import.meta.dirname, '..', '..', '..'),
  ];
  for (const candidate of candidates) {
    const content = tryReadContainedSkillFile(candidate);
    if (content !== null) {
      return { source: 'workspace', markdown: content };
    }
  }
  return { source: 'embedded-fallback', markdown: '' };
}

export function readTacticalPatternsSkillResource(
  workspaceRoot?: string,
  lang?: ResourceLanguage
): TacticalPatternsSkillResult {
  const resolvedLang = getActiveResourceLang(undefined, lang);
  const loaded = loadTacticalPatternsMarkdown(workspaceRoot);
  let text: string;
  if (loaded.source === 'workspace') {
    text = resolvedLang === 'es' ? `${ES_WORKSPACE_BANNER}${loaded.markdown}` : loaded.markdown;
  } else {
    text =
      resolvedLang === 'es' ? EMBEDDED_TACTICAL_PATTERNS_ES : EMBEDDED_TACTICAL_PATTERNS_EN;
  }
  return {
    uri: TACTICAL_PATTERNS_SKILL_URI,
    mimeType: MARKDOWN_MIME_TYPE,
    text,
    source: loaded.source,
    contents: [
      {
        uri: TACTICAL_PATTERNS_SKILL_URI,
        mimeType: MARKDOWN_MIME_TYPE,
        text,
      },
    ],
  };
}
