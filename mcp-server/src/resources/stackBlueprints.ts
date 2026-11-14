// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';

export const MOBILE_APPIUM_STACK_ID = 'mobile-appium' as const;
export const MOBILE_APPIUM_README_URI = 'blueprint://mobile-appium/readme' as const;
export const MOBILE_APPIUM_README_REL_PATH = 'mobile-appium/README.md' as const;
const MARKDOWN_MIME_TYPE = 'text/markdown' as const;
const URI_PREFIX = 'blueprint://';
const URI_SUFFIX = '/readme';

export interface V2StackBlueprintDescriptor {
  readonly stack: string;
  readonly uri: string;
  readonly readmeRelPath: string;
  readonly resource: Resource;
  readonly fallbackMarkdown: string;
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
  '# Blueprint Móvil Nativo e Híbrido — Appium 2 + WebdriverIO + Screenplay (QA 11X)',
  '',
  '- **Regla Cero:** Ejecutar CLI `appium` preinstalado y TSC en `sinfallas/base-node-ionic:26` como usuario no-root (`-u "$(id -u):$(id -g)" -e HOME=/tmp`).',
  '- **Localizadores:** `accessibilityId` (`~id`) > `iosPredicate` / `androidUiAutomator` > roles ARIA en `WEBVIEW_*` (prohibido XPath crudo y esperas fijas).',
  '- **Screenplay (`mobile-appium/tests/screenplay/MobileActor.ts`):** RBAC multi-tenant, conmutación `NATIVE_APP` <-> `WEBVIEW_*`, Deep Links validados, biometría y paridad offline.',
  '- **Configuración (`mobile-appium/wdio.conf.ts`):** Perfiles `android-uiautomator2`, `ios-xcuitest`, `hybrid-ionic`, `hybrid-rn`, timeouts acotados y artefactos `Fail-Verbose` bajo `/tmp`.',
  '',
].join('\n');

export const MOBILE_APPIUM_RESOURCE: Resource = {
  uri: MOBILE_APPIUM_README_URI,
  name: 'QA-11X Mobile Appium 2 & Screenplay Blueprint',
  description:
    'Guía operativa y blueprint Screenplay/WebdriverIO para pruebas móviles nativas (iOS/Android) e híbridas (Ionic/Capacitor y React Native) bajo Appium 2 y Regla Cero.',
  mimeType: MARKDOWN_MIME_TYPE,
};

export const V2_STACK_BLUEPRINTS: Readonly<Record<string, V2StackBlueprintDescriptor>> =
  Object.freeze({
    [MOBILE_APPIUM_STACK_ID]: {
      stack: MOBILE_APPIUM_STACK_ID,
      uri: MOBILE_APPIUM_README_URI,
      readmeRelPath: MOBILE_APPIUM_README_REL_PATH,
      resource: MOBILE_APPIUM_RESOURCE,
      fallbackMarkdown: EMBEDDED_MOBILE_APPIUM_FALLBACK,
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

function findWorkspaceRootWithFile(relPath: string): string {
  const envRoot = process.env.QA_BLUEPRINTS_LOCAL_PATH?.trim();
  const cwd = path.resolve(process.cwd());
  const candidates = [
    ...(envRoot ? [path.resolve(envRoot)] : []),
    cwd,
    path.dirname(cwd),
    path.resolve(import.meta.dirname, '..', '..', '..'),
    '/',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, relPath))) {
      return candidate;
    }
  }
  return cwd;
}

function loadDescriptorMarkdown(
  descriptor: V2StackBlueprintDescriptor,
  workspaceRoot: string,
): { readonly source: 'workspace' | 'embedded-fallback'; readonly text: string } {
  const rootResolved = path.resolve(workspaceRoot);
  const target = path.resolve(rootResolved, descriptor.readmeRelPath);
  if (!fs.existsSync(rootResolved) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return { source: 'embedded-fallback', text: descriptor.fallbackMarkdown };
  }
  const rootReal = fs.realpathSync(rootResolved);
  const targetReal = fs.realpathSync(target);
  if (!isContainedPath(rootReal, targetReal)) {
    return { source: 'embedded-fallback', text: descriptor.fallbackMarkdown };
  }
  return { source: 'workspace', text: fs.readFileSync(targetReal, 'utf8') };
}

export function listV2StackBlueprintResources(): readonly Resource[] {
  return Object.values(V2_STACK_BLUEPRINTS).map((entry) => entry.resource);
}

export function readStackBlueprintResource(
  stackOrUri: string,
  workspaceRoot?: string,
): StackBlueprintResolutionResult {
  const descriptor = resolveDescriptor(stackOrUri);
  const effectiveRoot = workspaceRoot ?? findWorkspaceRootWithFile(descriptor.readmeRelPath);
  const { source, text } = loadDescriptorMarkdown(descriptor, effectiveRoot);
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

export function readMobileAppiumBlueprint(workspaceRoot?: string): StackBlueprintResolutionResult {
  return readStackBlueprintResource(MOBILE_APPIUM_README_URI, workspaceRoot);
}
