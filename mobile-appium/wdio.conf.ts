// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

/**
 * Configuracion tipada WebdriverIO + Appium 3 W3C para mobile-appium (Estandar QA-11X).
 * Cero dependencias externas, 0 any, CC <= 5, Fail-Closed y diagnostico Pass-Quiet / Fail-Verbose.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type MobileProfileName =
  | 'android-uiautomator2'
  | 'ios-xcuitest'
  | 'hybrid-ionic'
  | 'hybrid-rn';

export type MobilePlatformName = 'Android' | 'iOS';
export type MobileHybridPlatformEnv = 'android' | 'ios';

export const DEFAULT_MOBILE_PROFILE: MobileProfileName = 'android-uiautomator2';
export const DEFAULT_APPIUM_HOST = '127.0.0.1';
export const DEFAULT_APPIUM_PORT = 4723;
export const DEFAULT_CONNECTION_RETRY_TIMEOUT_MS = 30_000;
export const DEFAULT_CONNECTION_RETRY_COUNT = 1;
export const DEFAULT_WAITFOR_TIMEOUT_MS = 10_000;
export const DEFAULT_NEW_COMMAND_TIMEOUT_S = 60;
export const DEFAULT_WEBVIEW_CONNECT_TIMEOUT_MS = 10_000;
export const DEFAULT_MOBILE_ARTIFACT_DIR = '/tmp/qa-11x-mobile-artifacts';

const SUPPORTED_PROFILES: ReadonlySet<string> = new Set<MobileProfileName>([
  'android-uiautomator2',
  'ios-xcuitest',
  'hybrid-ionic',
  'hybrid-rn',
]);

export class MobileConfigValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`[mobile-appium:${field}] ${message}`);
    this.name = 'MobileConfigValidationError';
    this.field = field;
  }
}

export interface W3cAppiumCapabilities {
  readonly platformName: MobilePlatformName;
  readonly 'appium:automationName': 'UiAutomator2' | 'XCUITest';
  readonly 'appium:noReset': boolean;
  readonly 'appium:newCommandTimeout': number;
  readonly 'appium:deviceName'?: string;
  readonly 'appium:platformVersion'?: string;
  readonly 'appium:app'?: string;
  readonly 'appium:autoGrantPermissions'?: boolean;
  readonly 'appium:autoAcceptAlerts'?: boolean;
  readonly 'appium:isolateSimDevice'?: boolean;
  readonly 'appium:autoWebview'?: boolean;
  readonly 'appium:webviewConnectTimeout'?: number;
}

export interface MobileFailureTestContext {
  readonly title: string;
  readonly fullTitle?: string;
  readonly parent?: string;
}

export interface MobileFailureContextState {
  readonly tenantId?: string;
  readonly activeContext?: string;
}

export interface MobileFailureResult {
  readonly passed: boolean;
  readonly error?: string | { readonly message?: string };
}

export interface MobileFailureDriverPort {
  getPageSource(): Promise<string>;
  takeScreenshot(): Promise<string>;
  getContext?(): Promise<string>;
}

export interface AllureMobileDiagnosticArtifact {
  readonly status: 'failed';
  readonly testTitle: string;
  readonly deviceProfile: MobileProfileName;
  readonly context: string;
  readonly tenantId: string;
  readonly pageSourcePath: string;
  readonly screenshotPath: string;
  readonly metadataPath: string;
  readonly errorSummary: string;
}

export interface MobileWdioConfig {
  readonly profile: MobileProfileName;
  readonly hostname: string;
  readonly port: number;
  readonly path: string;
  readonly runner: 'local';
  readonly specs: readonly string[];
  readonly exclude: readonly string[];
  readonly framework: 'mocha';
  readonly reporters: readonly string[];
  readonly maxInstances: number;
  readonly logLevel: 'error';
  readonly waitforTimeout: number;
  readonly connectionRetryTimeout: number;
  readonly connectionRetryCount: number;
  readonly artifactDir: string;
  readonly capabilities: readonly W3cAppiumCapabilities[];
  afterTest(
    test: MobileFailureTestContext,
    context: MobileFailureContextState,
    result: MobileFailureResult,
    driver?: MobileFailureDriverPort,
  ): Promise<AllureMobileDiagnosticArtifact | null>;
}

function readTrimmed(env: Readonly<Record<string, string | undefined>>, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveProfile(env: Readonly<Record<string, string | undefined>>): MobileProfileName {
  const raw = readTrimmed(env, 'MOBILE_PROFILE') ?? DEFAULT_MOBILE_PROFILE;
  if (!SUPPORTED_PROFILES.has(raw)) {
    throw new MobileConfigValidationError(
      'MOBILE_PROFILE',
      `Perfil no soportado "${raw}". Opciones: android-uiautomator2, ios-xcuitest, hybrid-ionic, hybrid-rn.`,
    );
  }
  return raw as MobileProfileName;
}

function resolveHostname(env: Readonly<Record<string, string | undefined>>): string {
  const raw = readTrimmed(env, 'APPIUM_HOST') ?? DEFAULT_APPIUM_HOST;
  if (/[\s/\\]/.test(raw)) {
    throw new MobileConfigValidationError('APPIUM_HOST', `Hostname invalido: "${raw}".`);
  }
  return raw;
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  field: string,
  minValue: number,
  maxValue: number,
): number {
  if (raw === undefined) {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    throw new MobileConfigValidationError(field, `Valor entero requerido; recibido "${raw}".`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minValue || parsed > maxValue) {
    throw new MobileConfigValidationError(
      field,
      `Valor ${parsed} fuera de rango permitido [${minValue}..${maxValue}].`,
    );
  }
  return parsed;
}

function isUnderDir(baseDir: string, candidate: string): boolean {
  const rel = path.relative(baseDir, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveArtifactDir(env: Readonly<Record<string, string | undefined>>): string {
  const raw =
    readTrimmed(env, 'QA_MOBILE_ARTIFACT_DIR') ??
    readTrimmed(env, 'QA_MOBILE_ARTIFACTS_DIR') ??
    DEFAULT_MOBILE_ARTIFACT_DIR;
  const resolved = path.resolve(raw);
  const tmpRoots = [path.resolve('/tmp'), path.resolve(os.tmpdir())];
  if (!tmpRoots.some((root) => isUnderDir(root, resolved))) {
    throw new MobileConfigValidationError(
      'QA_MOBILE_ARTIFACT_DIR',
      `Directorio de artefactos debe residir bajo /tmp o os.tmpdir(); recibido "${resolved}".`,
    );
  }
  return resolved;
}

function resolveHybridPlatform(
  env: Readonly<Record<string, string | undefined>>,
): MobileHybridPlatformEnv {
  const raw = (readTrimmed(env, 'APPIUM_HYBRID_PLATFORM') ?? 'android').toLowerCase();
  if (raw === 'android' || raw === 'ios') {
    return raw;
  }
  throw new MobileConfigValidationError(
    'APPIUM_HYBRID_PLATFORM',
    `Plataforma hibrida invalida "${raw}". Use "android" o "ios".`,
  );
}

function resolveAutoWebviewFlag(env: Readonly<Record<string, string | undefined>>): boolean {
  const raw = (readTrimmed(env, 'APPIUM_AUTO_WEBVIEW') ?? 'false').toLowerCase();
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new MobileConfigValidationError(
    'APPIUM_AUTO_WEBVIEW',
    `Booleano invalido "${raw}". Use "true" o "false".`,
  );
}

function applyOptionalAppCapabilities(
  env: Readonly<Record<string, string | undefined>>,
  base: W3cAppiumCapabilities,
): W3cAppiumCapabilities {
  const deviceName = readTrimmed(env, 'APPIUM_DEVICE_NAME');
  const platformVersion = readTrimmed(env, 'APPIUM_PLATFORM_VERSION');
  const appPath = readTrimmed(env, 'APPIUM_APP_PATH');
  return {
    ...base,
    ...(deviceName !== undefined ? { 'appium:deviceName': deviceName } : {}),
    ...(platformVersion !== undefined ? { 'appium:platformVersion': platformVersion } : {}),
    ...(appPath !== undefined ? { 'appium:app': appPath } : {}),
  };
}

function buildAndroidCapabilities(
  env: Readonly<Record<string, string | undefined>>,
  newCommandTimeout: number,
): W3cAppiumCapabilities {
  return applyOptionalAppCapabilities(env, {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:noReset': false,
    'appium:autoGrantPermissions': false,
    'appium:newCommandTimeout': newCommandTimeout,
  });
}

function buildIosCapabilities(
  env: Readonly<Record<string, string | undefined>>,
  newCommandTimeout: number,
): W3cAppiumCapabilities {
  return applyOptionalAppCapabilities(env, {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:noReset': false,
    'appium:autoAcceptAlerts': false,
    'appium:isolateSimDevice': true,
    'appium:newCommandTimeout': newCommandTimeout,
  });
}

function buildHybridCapabilities(
  env: Readonly<Record<string, string | undefined>>,
  newCommandTimeout: number,
): W3cAppiumCapabilities {
  const target = resolveHybridPlatform(env);
  const autoWebview = resolveAutoWebviewFlag(env);
  const base =
    target === 'ios'
      ? buildIosCapabilities(env, newCommandTimeout)
      : buildAndroidCapabilities(env, newCommandTimeout);
  return {
    ...base,
    'appium:autoWebview': autoWebview,
    'appium:webviewConnectTimeout': DEFAULT_WEBVIEW_CONNECT_TIMEOUT_MS,
  };
}

function buildCapabilitiesForProfile(
  profile: MobileProfileName,
  env: Readonly<Record<string, string | undefined>>,
  newCommandTimeout: number,
): readonly W3cAppiumCapabilities[] {
  if (profile === 'android-uiautomator2') {
    return [buildAndroidCapabilities(env, newCommandTimeout)];
  }
  if (profile === 'ios-xcuitest') {
    return [buildIosCapabilities(env, newCommandTimeout)];
  }
  return [buildHybridCapabilities(env, newCommandTimeout)];
}

function sanitizeSlug(rawTitle: string): string {
  const cleaned = rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned.length > 0 ? cleaned : 'mobile-test-failure';
}

function extractErrorSummary(error: MobileFailureResult['error']): string {
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }
  if (error !== undefined && typeof error === 'object' && typeof error.message === 'string') {
    return error.message.trim() || 'Fallo sin detalle';
  }
  return 'Fallo sin detalle';
}

let diagnosticSequence = 0;

async function safeCaptureContext(
  driver: MobileFailureDriverPort | undefined,
  context: MobileFailureContextState,
): Promise<string> {
  if (driver?.getContext !== undefined) {
    try {
      return await driver.getContext();
    } catch {
      return context.activeContext ?? 'UNKNOWN_CONTEXT';
    }
  }
  return context.activeContext ?? 'UNKNOWN_CONTEXT';
}

async function safeCaptureTreeAndShot(
  driver: MobileFailureDriverPort | undefined,
): Promise<{ readonly xmlTree: string; readonly screenshotBase64: string }> {
  if (driver === undefined) {
    return {
      xmlTree: '<hierarchy status="unavailable" />',
      screenshotBase64: '',
    };
  }
  const [treeResult, shotResult] = await Promise.allSettled([
    driver.getPageSource(),
    driver.takeScreenshot(),
  ]);
  const xmlTree =
    treeResult.status === 'fulfilled'
      ? treeResult.value
      : '<hierarchy status="capture_failed" />';
  const screenshotBase64 =
    shotResult.status === 'fulfilled' ? shotResult.value : '';
  return { xmlTree, screenshotBase64 };
}

function writeFailureDiagnosticFiles(
  artifactDir: string,
  slug: string,
  xmlTree: string,
  screenshotBase64: string,
  payload: Omit<AllureMobileDiagnosticArtifact, 'pageSourcePath' | 'screenshotPath' | 'metadataPath'>,
): AllureMobileDiagnosticArtifact {
  fs.mkdirSync(artifactDir, { recursive: true });
  diagnosticSequence = (diagnosticSequence + 1) % 1_000_000;
  const baseName = `${slug}-${Date.now()}-${diagnosticSequence}`;
  const pageSourcePath = path.join(artifactDir, `${baseName}.xml`);
  const metadataPath = path.join(artifactDir, `${baseName}.allure.json`);
  const hasShot = screenshotBase64.trim().length > 0;
  const screenshotPath = hasShot ? path.join(artifactDir, `${baseName}.png`) : '';

  fs.writeFileSync(pageSourcePath, xmlTree, 'utf8');
  if (hasShot) {
    fs.writeFileSync(screenshotPath, Buffer.from(screenshotBase64, 'base64'));
  }

  const artifact: AllureMobileDiagnosticArtifact = {
    ...payload,
    pageSourcePath,
    screenshotPath,
    metadataPath,
  };
  const attachments = [{ name: 'mobile-xml-tree', source: pageSourcePath, type: 'application/xml' }];
  if (hasShot) {
    attachments.push({ name: 'mobile-screenshot', source: screenshotPath, type: 'image/png' });
  }
  const allureEnvelope = {
    name: payload.testTitle,
    status: 'failed',
    statusDetails: { message: payload.errorSummary },
    labels: [
      { name: 'deviceProfile', value: payload.deviceProfile },
      { name: 'context', value: payload.context },
      { name: 'tenantId', value: payload.tenantId },
    ],
    attachments,
  };
  fs.writeFileSync(metadataPath, JSON.stringify(allureEnvelope, null, 2), 'utf8');
  return artifact;
}

export function buildMobileWdioConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): MobileWdioConfig {
  const profile = resolveProfile(env);
  const hostname = resolveHostname(env);
  const port = parsePositiveInt(readTrimmed(env, 'APPIUM_PORT'), DEFAULT_APPIUM_PORT, 'APPIUM_PORT', 1, 65_535);
  const waitforTimeout = parsePositiveInt(
    readTrimmed(env, 'WDIO_WAITFOR_TIMEOUT_MS'),
    DEFAULT_WAITFOR_TIMEOUT_MS,
    'WDIO_WAITFOR_TIMEOUT_MS',
    500,
    120_000,
  );
  const connectionRetryTimeout = parsePositiveInt(
    readTrimmed(env, 'WDIO_CONNECTION_RETRY_TIMEOUT_MS'),
    DEFAULT_CONNECTION_RETRY_TIMEOUT_MS,
    'WDIO_CONNECTION_RETRY_TIMEOUT_MS',
    1_000,
    180_000,
  );
  const connectionRetryCount = parsePositiveInt(
    readTrimmed(env, 'WDIO_CONNECTION_RETRY_COUNT'),
    DEFAULT_CONNECTION_RETRY_COUNT,
    'WDIO_CONNECTION_RETRY_COUNT',
    0,
    5,
  );
  const newCommandTimeout = parsePositiveInt(
    readTrimmed(env, 'APPIUM_NEW_COMMAND_TIMEOUT_S'),
    DEFAULT_NEW_COMMAND_TIMEOUT_S,
    'APPIUM_NEW_COMMAND_TIMEOUT_S',
    5,
    300,
  );
  const artifactDir = resolveArtifactDir(env);

  return {
    profile,
    hostname,
    port,
    path: '/',
    runner: 'local',
    specs: ['./tests/**/*.spec.ts'],
    exclude: ['./tests/mobile_screenplay.spec.ts'],
    framework: 'mocha',
    reporters: ['spec'],
    maxInstances: 1,
    logLevel: 'error',
    waitforTimeout,
    connectionRetryTimeout,
    connectionRetryCount,
    artifactDir,
    capabilities: buildCapabilitiesForProfile(profile, env, newCommandTimeout),
    async afterTest(
      test: MobileFailureTestContext,
      context: MobileFailureContextState,
      result: MobileFailureResult,
      driver?: MobileFailureDriverPort,
    ): Promise<AllureMobileDiagnosticArtifact | null> {
      if (result.passed) {
        return null;
      }
      const resolvedDriver =
        driver ?? (globalThis as { readonly browser?: MobileFailureDriverPort }).browser;
      const [activeContext, capture] = await Promise.all([
        safeCaptureContext(resolvedDriver, context),
        safeCaptureTreeAndShot(resolvedDriver),
      ]);
      return writeFailureDiagnosticFiles(
        artifactDir,
        sanitizeSlug(test.fullTitle ?? test.title),
        capture.xmlTree,
        capture.screenshotBase64,
        {
          status: 'failed',
          testTitle: test.fullTitle ?? test.title,
          deviceProfile: profile,
          context: activeContext,
          tenantId: context.tenantId ?? 'unknown-tenant',
          errorSummary: extractErrorSummary(result.error),
        },
      );
    },
  };
}

export const config: MobileWdioConfig = buildMobileWdioConfig(process.env);
export default config;
