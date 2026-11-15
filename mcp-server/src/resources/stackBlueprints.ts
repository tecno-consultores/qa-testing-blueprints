// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import type { ResourceLanguage } from '../types.js';
import { getActiveResourceLang } from './resourceLang.js';

export const MOBILE_APPIUM_STACK_ID = 'mobile-appium' as const;
export const MOBILE_APPIUM_README_URI = 'blueprint://mobile-appium/readme' as const;
export const MOBILE_APPIUM_README_REL_PATH = 'mobile-appium/README.md' as const;
export const MOBILE_APPIUM_README_ES_REL_PATH = 'mobile-appium/README.es.md' as const;
export const VIBE_RESCUE_STACK_ID = 'vibe-rescue' as const;
export const VIBE_RESCUE_README_URI = 'blueprint://vibe-rescue/readme' as const;
export const VIBE_RESCUE_README_REL_PATH = 'vibe-rescue/README.md' as const;
export const VIBE_RESCUE_README_ES_REL_PATH = 'vibe-rescue/README.es.md' as const;
const MARKDOWN_MIME_TYPE = 'text/markdown' as const;
const URI_PREFIX = 'blueprint://';
const URI_SUFFIX = '/readme';

export interface V2StackBlueprintDescriptor {
  readonly stack: string;
  readonly uri: string;
  readonly readmeRelPath: string;
  readonly readmeEsRelPath: string;
  readonly resource: Resource;
  readonly fallbackMarkdown: string;
  readonly fallbackMarkdownEs: string;
}

export interface StackBlueprintContentItem {
  readonly uri: string;
  readonly mimeType: string;
  readonly text: string;
}

export interface StackBlueprintResolutionResult {
  readonly stack: string;
  readonly uri: string;
  readonly mimeType: string;
  readonly text: string;
  readonly source: 'workspace' | 'embedded-fallback';
  readonly contents: StackBlueprintContentItem[];
}

export class StackBlueprintResolutionError extends Error {
  readonly target: string;

  constructor(target: string, message: string) {
    super(message);
    this.name = 'StackBlueprintResolutionError';
    this.target = target;
  }
}

const EMBEDDED_MOBILE_APPIUM_FALLBACK = [
  '# Native & Hybrid Mobile Blueprint — Appium 3 + WebdriverIO + Screenplay (QA 11X)',
  '',
  '- **Rule Zero:** Run pre-installed `appium` CLI (Android SDK / ADB, `uiautomator2` and `xcuitest` drivers, OpenJDK 21, WebdriverIO v9) and TSC inside `sinfallas/base-mobile-appium:26` as non-root (`-u "$(id -u):$(id -g)" -e HOME=/tmp`).',
  '- **Locators:** `accessibilityId` (`~id`) > `iosPredicate` / `androidUiAutomator` > ARIA roles inside `WEBVIEW_*` (raw XPath and fixed sleeps forbidden).',
  '- **Screenplay (`mobile-appium/tests/screenplay/MobileActor.ts`):** Multi-tenant RBAC, `NATIVE_APP` <-> `WEBVIEW_*` switching, validated Deep Links, biometry, and offline parity.',
  '- **Configuration (`mobile-appium/wdio.conf.ts`):** `android-uiautomator2`, `ios-xcuitest`, `hybrid-ionic`, `hybrid-rn` profiles, bounded timeouts, and `Fail-Verbose` artifacts under `/tmp`.',
  '',
].join('\n');

const EMBEDDED_MOBILE_APPIUM_FALLBACK_ES = [
  '# Blueprint Móvil Nativo e Híbrido — Appium 3 + WebdriverIO + Screenplay (QA 11X)',
  '',
  '- **Regla Cero:** Ejecutar CLI `appium` preinstalado (Android SDK / ADB, drivers `uiautomator2` y `xcuitest`, OpenJDK 21, WebdriverIO v9) y TSC en `sinfallas/base-mobile-appium:26` como usuario no-root (`-u "$(id -u):$(id -g)" -e HOME=/tmp`).',
  '- **Localizadores:** `accessibilityId` (`~id`) > `iosPredicate` / `androidUiAutomator` > roles ARIA en `WEBVIEW_*` (prohibido XPath crudo y esperas fijas).',
  '- **Screenplay (`mobile-appium/tests/screenplay/MobileActor.ts`):** RBAC multi-tenant, conmutación `NATIVE_APP` <-> `WEBVIEW_*`, Deep Links validados, biometría y paridad offline.',
  '- **Configuración (`mobile-appium/wdio.conf.ts`):** Perfiles `android-uiautomator2`, `ios-xcuitest`, `hybrid-ionic`, `hybrid-rn`, timeouts acotados y artefactos `Fail-Verbose` bajo `/tmp`.',
  '',
].join('\n');

export const MOBILE_APPIUM_RESOURCE: Resource = {
  uri: MOBILE_APPIUM_README_URI,
  name: 'QA-11X Mobile Appium 3 & Screenplay Blueprint',
  description:
    'Operational Screenplay and WebdriverIO blueprint for native (iOS/Android) and hybrid (Ionic/Capacitor, React Native) mobile testing under Appium 3 and Rule Zero.',
  mimeType: MARKDOWN_MIME_TYPE,
};

const EMBEDDED_VIBE_RESCUE_FALLBACK = [
  '# Vibe-to-Enterprise Blueprint — QA-11X Rescue & Hardening (`vibe-rescue/`)',
  '',
  '- **Stage 1 (`VIBE-SEC-001`):** Quarantine client secrets (`VITE_*`, `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, `REACT_APP_*`) and unignored `.env` files in `.gitignore`.',
  '- **Stage 2 (`VIBE-RLS-002`):** PostgreSQL 15–17+ template `vibe-rescue/templates/rls_hardening.sql` (`NOBYPASSRLS`, `FORCE ROW LEVEL SECURITY`, `SECURITY DEFINER`, WORM `seq_num`).',
  '- **Stage 3 (`VIBE-TYPE-003` / `VIBE-ARCH-004`):** Zero `any`/`@ts-ignore`, `Idempotency-Key` on mutations, and `CC <= 5` modularization.',
  '- **Stage 4 (`VIBE-QA-005`):** Rule Zero inside non-root `sinfallas/base-python-uv:3.15` / `sinfallas/base-node-ionic:26` (`>= 95%` coverage).',
  '- **Stage 5 (`QA-GIT-GATE-01`):** `10/10` certification (`make certify`) and local commit without automatic `git push`.',
  '',
].join('\n');

const EMBEDDED_VIBE_RESCUE_FALLBACK_ES = [
  '# Blueprint Vibe-to-Enterprise — Rescate y Endurecimiento QA-11X (`vibe-rescue/`)',
  '',
  '- **Etapa 1 (`VIBE-SEC-001`):** Cuarentena de secretos cliente (`VITE_*`, `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, `REACT_APP_*`) y `.env` sin exclusión en `.gitignore`.',
  '- **Etapa 2 (`VIBE-RLS-002`):** Plantilla PostgreSQL 15–17+ `vibe-rescue/templates/rls_hardening.sql` (`NOBYPASSRLS`, `FORCE ROW LEVEL SECURITY`, `SECURITY DEFINER`, WORM `seq_num`).',
  '- **Etapa 3 (`VIBE-TYPE-003` / `VIBE-ARCH-004`):** Cero `any`/`@ts-ignore`, `Idempotency-Key` en mutaciones y modularización `CC <= 5`.',
  '- **Etapa 4 (`VIBE-QA-005`):** Regla Cero en `sinfallas/base-python-uv:3.15` / `sinfallas/base-node-ionic:26` no-root (`>= 95%` cobertura).',
  '- **Etapa 5 (`QA-GIT-GATE-01`):** Certificación `10/10` (`make certify`) y commit local sin `git push` automático.',
  '',
].join('\n');

export const VIBE_RESCUE_RESOURCE: Resource = {
  uri: VIBE_RESCUE_README_URI,
  name: 'QA-11X Vibe-to-Enterprise Rescue Blueprint',
  description:
    'Deterministic 5-stage Vibe-to-Enterprise hardening protocol (VIBE-SEC-001..VIBE-QA-005) and PostgreSQL 15-17+ RLS template for securing AI-generated prototypes.',
  mimeType: MARKDOWN_MIME_TYPE,
};

export const V2_STACK_BLUEPRINTS: Readonly<Record<string, V2StackBlueprintDescriptor>> =
  Object.freeze({
    [MOBILE_APPIUM_STACK_ID]: {
      stack: MOBILE_APPIUM_STACK_ID,
      uri: MOBILE_APPIUM_README_URI,
      readmeRelPath: MOBILE_APPIUM_README_REL_PATH,
      readmeEsRelPath: MOBILE_APPIUM_README_ES_REL_PATH,
      resource: MOBILE_APPIUM_RESOURCE,
      fallbackMarkdown: EMBEDDED_MOBILE_APPIUM_FALLBACK,
      fallbackMarkdownEs: EMBEDDED_MOBILE_APPIUM_FALLBACK_ES,
    },
    [VIBE_RESCUE_STACK_ID]: {
      stack: VIBE_RESCUE_STACK_ID,
      uri: VIBE_RESCUE_README_URI,
      readmeRelPath: VIBE_RESCUE_README_REL_PATH,
      readmeEsRelPath: VIBE_RESCUE_README_ES_REL_PATH,
      resource: VIBE_RESCUE_RESOURCE,
      fallbackMarkdown: EMBEDDED_VIBE_RESCUE_FALLBACK,
      fallbackMarkdownEs: EMBEDDED_VIBE_RESCUE_FALLBACK_ES,
    },
  });

function hasUnsafePathTokens(raw: string): boolean {
  const lowered = raw.toLowerCase();
  return (
    raw.includes('\0') ||
    raw.includes('..') ||
    raw.includes('/') ||
    raw.includes('\\') ||
    lowered.includes('%2e') ||
    lowered.includes('%2f') ||
    lowered.includes('%5c')
  );
}

function normalizeStackIdentifier(stackOrUri: string): string {
  const trimmed = stackOrUri.trim();
  if (!trimmed) {
    throw new StackBlueprintResolutionError(stackOrUri, 'Identificador de stack o URI vacío.');
  }
  let stackCandidate = trimmed;
  if (trimmed.startsWith(URI_PREFIX)) {
    if (!trimmed.endsWith(URI_SUFFIX)) {
      throw new StackBlueprintResolutionError(
        stackOrUri,
        `URI de blueprint v2 inválida: "${trimmed}". Se esperaba el formato blueprint://<stack>/readme.`,
      );
    }
    stackCandidate = trimmed.slice(URI_PREFIX.length, trimmed.length - URI_SUFFIX.length);
  }
  if (hasUnsafePathTokens(stackCandidate) || !/^[a-z0-9-]+$/.test(stackCandidate)) {
    throw new StackBlueprintResolutionError(
      stackOrUri,
      `Identificador de stack inseguro o inválido: "${stackOrUri}".`,
    );
  }
  return stackCandidate;
}

function resolveDescriptor(stackOrUri: string): V2StackBlueprintDescriptor {
  const stackId = normalizeStackIdentifier(stackOrUri);
  if (!Object.prototype.hasOwnProperty.call(V2_STACK_BLUEPRINTS, stackId)) {
    const valid = Object.keys(V2_STACK_BLUEPRINTS).join(', ');
    throw new StackBlueprintResolutionError(
      stackOrUri,
      `Blueprint v2 '${stackId}' no registrado. Opciones disponibles: ${valid}.`,
    );
  }
  return V2_STACK_BLUEPRINTS[stackId];
}

function isContainedPath(rootDir: string, candidatePath: string): boolean {
  const rel = path.relative(rootDir, candidatePath);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function findWorkspaceRootWithFile(primaryRelPath: string, fallbackRelPath?: string): string {
  const envRoot = process.env.QA_BLUEPRINTS_LOCAL_PATH?.trim();
  const cwd = path.resolve(process.cwd());
  const candidates = [
    ...(envRoot ? [path.resolve(envRoot)] : []),
    cwd,
    path.dirname(cwd),
    path.resolve(import.meta.dirname, '..', '..', '..'),
    '/',
  ];
  for (const relPath of fallbackRelPath ? [primaryRelPath, fallbackRelPath] : [primaryRelPath]) {
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, relPath))) {
        return candidate;
      }
    }
  }
  return cwd;
}

const SOURCE_EMBEDDED_FALLBACK = 'embedded-fallback' as const;
const SOURCE_WORKSPACE = 'workspace' as const;

function loadDescriptorMarkdown(
  descriptor: V2StackBlueprintDescriptor,
  workspaceRoot: string,
  lang: ResourceLanguage,
): { readonly source: typeof SOURCE_WORKSPACE | typeof SOURCE_EMBEDDED_FALLBACK; readonly text: string } {
  const fallback = lang === 'es' ? descriptor.fallbackMarkdownEs : descriptor.fallbackMarkdown;
  const candidateRelPaths =
    lang === 'es'
      ? [descriptor.readmeEsRelPath, descriptor.readmeRelPath]
      : [descriptor.readmeRelPath];
  const rootResolved = path.resolve(workspaceRoot);
  if (!fs.existsSync(rootResolved)) {
    return { source: SOURCE_EMBEDDED_FALLBACK, text: fallback };
  }
  const rootReal = fs.realpathSync(rootResolved);
  for (const relPath of candidateRelPaths) {
    const target = path.resolve(rootResolved, relPath);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      continue;
    }
    const targetReal = fs.realpathSync(target);
    if (!isContainedPath(rootReal, targetReal)) {
      return { source: SOURCE_EMBEDDED_FALLBACK, text: fallback };
    }
    return { source: SOURCE_WORKSPACE, text: fs.readFileSync(targetReal, 'utf8') };
  }
  return { source: SOURCE_EMBEDDED_FALLBACK, text: fallback };
}

export function listV2StackBlueprintResources(): readonly Resource[] {
  return Object.values(V2_STACK_BLUEPRINTS).map((entry) => entry.resource);
}

export function readStackBlueprintResource(
  stackOrUri: string,
  workspaceRoot?: string,
  lang?: ResourceLanguage,
): StackBlueprintResolutionResult {
  const effectiveLang = getActiveResourceLang(undefined, lang);
  const descriptor = resolveDescriptor(stackOrUri);
  const effectiveRoot =
    workspaceRoot ??
    (effectiveLang === 'es'
      ? findWorkspaceRootWithFile(descriptor.readmeEsRelPath, descriptor.readmeRelPath)
      : findWorkspaceRootWithFile(descriptor.readmeRelPath));
  const { source, text } = loadDescriptorMarkdown(descriptor, effectiveRoot, effectiveLang);
  return {
    stack: descriptor.stack,
    uri: descriptor.uri,
    mimeType: MARKDOWN_MIME_TYPE,
    text,
    source,
    contents: [
      {
        uri: descriptor.uri,
        mimeType: MARKDOWN_MIME_TYPE,
        text,
      },
    ],
  };
}

export function readMobileAppiumBlueprint(
  workspaceRoot?: string,
  lang?: ResourceLanguage,
): StackBlueprintResolutionResult {
  return readStackBlueprintResource(MOBILE_APPIUM_README_URI, workspaceRoot, lang);
}

export function readVibeRescueBlueprint(
  workspaceRoot?: string,
  lang?: ResourceLanguage,
): StackBlueprintResolutionResult {
  return readStackBlueprintResource(VIBE_RESCUE_README_URI, workspaceRoot, lang);
}
