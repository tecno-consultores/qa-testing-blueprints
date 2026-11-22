// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

export type SectionPruneDecision = 'prune' | 'hybrid_keep' | 'domain_keep';

const LOCAL_DOMAIN_SIGNAL_PATTERNS: readonly RegExp[] = [
  /(?:^|[\s(`'"])(?:backend|frontend|apps|packages|services|modules|src|migrations|alembic|prisma)\/[a-z0-9_.-]+/i,
  /(?:^|[\s`'"])\/api\/v\d+\/[a-z0-9_./-]+/i,
  /\blocalhost:\d{4,5}\b/i,
  /\bdocker-compose\.(?!qa\.yml\b)[a-z0-9_-]+\.ya?ml\b/i,
  /\bpnpm\s+--filter\s+[a-z0-9_@/-]+/i,
  /\bpytest\s+-k\s+["']?[a-z0-9_-]+/i,
];

export function hasLocalDomainSignals(sectionText: string): boolean {
  return LOCAL_DOMAIN_SIGNAL_PATTERNS.some((pattern) => pattern.test(sectionText));
}

export interface SectionClassificationInput {
  readonly sectionText: string;
  readonly isCanonicalFile: boolean;
  readonly isPromoted: (text: string) => boolean;
  readonly isCanonical: (text: string) => boolean;
}

export function classifySectionForPruning(input: SectionClassificationInput): SectionPruneDecision {
  const { sectionText, isCanonicalFile, isPromoted, isCanonical } = input;
  const matchesGlobal = isPromoted(sectionText) || (isCanonicalFile && isCanonical(sectionText));
  if (!matchesGlobal) {
    return 'domain_keep';
  }
  return hasLocalDomainSignals(sectionText) ? 'hybrid_keep' : 'prune';
}

function buildSectionSignature(sectionText: string): string | null {
  const lines = sectionText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const heading = lines.find((line) => /^#{1,4}\s+/.test(line));
  if (!heading) {
    return null;
  }
  const normalizedHeading = heading.replace(/^#+\s+/, '').toLowerCase();
  const normalizedBody = lines.join(' ').replace(/\s+/g, ' ').toLowerCase();
  return `${normalizedHeading}::${normalizedBody}`;
}

export function dedupeRepeatedHeadings(sections: readonly string[]): {
  kept: string[];
  removedCount: number;
} {
  const seen = new Set<string>();
  const kept: string[] = [];
  let removedCount = 0;
  for (const section of sections) {
    const sig = buildSectionSignature(section);
    if (sig !== null && seen.has(sig)) {
      removedCount++;
      continue;
    }
    if (sig !== null) {
      seen.add(sig);
    }
    kept.push(section);
  }
  return { kept, removedCount };
}
