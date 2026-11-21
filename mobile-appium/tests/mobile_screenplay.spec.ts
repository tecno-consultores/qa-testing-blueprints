// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  buildMobileWdioConfig,
  DEFAULT_MOBILE_ARTIFACT_DIR,
  MobileConfigValidationError,
} from '../wdio.conf.ts';
import {
  ActiveMobileContext,
  ByAccessibilityId,
  ByAndroidUiAutomator,
  ByIosPredicate,
  ByWebviewRole,
  CallMobileApi,
  CollapsedMobileGeometryError,
  HiddenMobileElementError,
  InteractWithMobile,
  MissingMobileAbilityError,
  MobileActor,
  MobileTemporalLifecycleState,
  OpenVerifiedDeepLink,
  SetMobileNetworkState,
  SimulateBiometricPrompt,
  SwitchMobileContext,
  TapAccessibilityId,
  TypeInMobileField,
  UnsafeDeepLinkError,
  VerifyOfflineSyncParity,
  VisibleMobileBounds,
  defineMobileQuestion,
  defineMobileTask,
  formatMobileLocator,
} from './screenplay/MobileActor.ts';
import type { MobileFailureDriverPort } from '../wdio.conf.ts';
import type {
  BiometricMethod,
  MobileApiClientPort,
  MobileApiRequestSpec,
  MobileApiResponsePayload,
  MobileBatchSyncEnvelope,
  MobileDriverPort,
  MobileElementBounds,
  MobileLocator,
  MobileNetworkState,
} from './screenplay/MobileActor.ts';

interface StubW3cState {
  sessionId: string;
  currentContext: string;
  availableContexts: readonly string[];
  openedUrls: string[];
  biometricEvents: Array<{ matched: boolean; method: string }>;
  closed: boolean;
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Payload JSON invalido'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function handleSessionPost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: StubW3cState,
): Promise<void> {
  const body = await readJsonBody(req);
  state.closed = false;
  sendJson(res, 200, {
    value: { sessionId: state.sessionId, capabilities: body.capabilities ?? {} },
  });
}

async function handleContextPost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: StubW3cState,
): Promise<void> {
  const body = await readJsonBody(req);
  state.currentContext = typeof body.name === 'string' ? body.name : state.currentContext;
  sendJson(res, 200, { value: null });
}

async function handleUrlPost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: StubW3cState,
): Promise<void> {
  const body = await readJsonBody(req);
  state.openedUrls.push(typeof body.url === 'string' ? body.url : '');
  sendJson(res, 200, { value: null });
}

async function handleBiometricPost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: StubW3cState,
): Promise<void> {
  const body = await readJsonBody(req);
  state.biometricEvents.push({
    matched: Boolean(body.match),
    method: typeof body.method === 'string' ? body.method : 'faceId',
  });
  sendJson(res, 200, { value: Boolean(body.match) });
}

async function handleW3cPostRoute(
  pathname: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: StubW3cState,
): Promise<boolean> {
  const postRoutes = new Map<string, () => Promise<void>>([
    ['/session', () => handleSessionPost(req, res, state)],
    [`/session/${state.sessionId}/appium/context`, () => handleContextPost(req, res, state)],
    [`/session/${state.sessionId}/url`, () => handleUrlPost(req, res, state)],
    [
      `/session/${state.sessionId}/appium/device/biometric`,
      () => handleBiometricPost(req, res, state),
    ],
  ]);
  const handler = postRoutes.get(pathname);
  if (handler === undefined) {
    return false;
  }
  await handler();
  return true;
}

function handleW3cGetRoute(
  pathname: string,
  res: http.ServerResponse,
  state: StubW3cState,
): boolean {
  if (pathname === '/status') {
    sendJson(res, 200, { value: { ready: true, message: 'Appium W3C Bridge Ready' } });
    return true;
  }
  if (pathname === `/session/${state.sessionId}/appium/contexts`) {
    sendJson(res, 200, { value: state.availableContexts });
    return true;
  }
  if (pathname === `/session/${state.sessionId}/appium/context`) {
    sendJson(res, 200, { value: state.currentContext });
    return true;
  }
  return false;
}

interface DispatchW3cInput {
  readonly method: string;
  readonly pathname: string;
  readonly req: http.IncomingMessage;
  readonly res: http.ServerResponse;
  readonly state: StubW3cState;
}

async function dispatchW3cRequest(input: DispatchW3cInput): Promise<boolean> {
  const { method, pathname, req, res, state } = input;
  if (method === 'GET') {
    return handleW3cGetRoute(pathname, res, state);
  }
  if (method === 'POST') {
    return await handleW3cPostRoute(pathname, req, res, state);
  }
  if (method === 'DELETE' && pathname === `/session/${state.sessionId}`) {
    state.closed = true;
    sendJson(res, 200, { value: null });
    return true;
  }
  return false;
}

async function handleW3cRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: StubW3cState,
): Promise<void> {
  const method = req.method ?? 'GET';
  const pathname = (req.url ?? '/').split('?')[0];
  if (await dispatchW3cRequest({ method, pathname, req, res, state })) {
    return;
  }
  sendJson(res, 404, { value: { error: 'unknown command', message: `${method} ${pathname}` } });
}

interface HttpMobileSessionHarness {
  readonly driver: MobileDriverPort;
  readonly texts: Map<string, string>;
  readonly taps: string[];
  closeSession(): Promise<void>;
  getSessionId(): string;
}

async function postJson(url: string, payload: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await response.json()) as Record<string, unknown>;
}

async function createHttpW3cDriverHarness(baseUrl: string): Promise<HttpMobileSessionHarness> {
  const sessionRes = await postJson(`${baseUrl}/session`, {
    capabilities: {
      alwaysMatch: { platformName: 'Android', 'appium:automationName': 'UiAutomator2' },
    },
  });
  const sessionId = String((sessionRes.value as { sessionId: string }).sessionId);
  const texts = new Map<string, string>([['~sync-badge', 'EN_LINEA']]);
  const taps: string[] = [];
  let networkState: MobileNetworkState = 'online';

  const boundsByKey: Record<string, MobileElementBounds> = {
    '~sync-badge': { x: 12, y: 84, width: 148, height: 36 },
    '~submit-order-btn': { x: 24, y: 610, width: 312, height: 48 },
  };

  const driver: MobileDriverPort = {
    locate(locator: MobileLocator) {
      const key = formatMobileLocator(locator);
      return {
        tap() {
          taps.push(key);
          return Promise.resolve();
        },
        typeText(value: string) {
          texts.set(key, value);
          return Promise.resolve();
        },
        readText() {
          return Promise.resolve(texts.get(key) ?? null);
        },
        isVisible() {
          const b = boundsByKey[key];
          return Promise.resolve(b ? b.width > 0 && b.height > 0 : true);
        },
        readBounds() {
          return Promise.resolve(boundsByKey[key] ?? { x: 8, y: 16, width: 120, height: 40 });
        },
      };
    },
    async getContexts() {
      const res = await fetch(`${baseUrl}/session/${sessionId}/appium/contexts`);
      const body = (await res.json()) as { value: string[] };
      return body.value;
    },
    async getCurrentContext() {
      const res = await fetch(`${baseUrl}/session/${sessionId}/appium/context`);
      const body = (await res.json()) as { value: string };
      return body.value;
    },
    async switchContext(targetContext: string) {
      await postJson(`${baseUrl}/session/${sessionId}/appium/context`, { name: targetContext });
    },
    async openDeepLink(url: string) {
      await postJson(`${baseUrl}/session/${sessionId}/url`, { url });
    },
    async authenticateBiometric(matched: boolean, method: BiometricMethod) {
      const body = await postJson(`${baseUrl}/session/${sessionId}/appium/device/biometric`, {
        match: matched,
        method,
      });
      return Boolean(body.value);
    },
    setNetworkState(state: MobileNetworkState) {
      networkState = state;
      return Promise.resolve();
    },
    getNetworkState() {
      return Promise.resolve(networkState);
    },
  };

  return {
    driver,
    texts,
    taps,
    getSessionId: () => sessionId,
    async closeSession() {
      await fetch(`${baseUrl}/session/${sessionId}`, { method: 'DELETE' });
    },
  };
}

function assertWdioProfileMatrix(tmpArtifacts: string): void {
  const profiles = [
    'android-uiautomator2',
    'ios-xcuitest',
    'hybrid-ionic',
    'hybrid-rn',
  ] as const;
  for (const profile of profiles) {
    const cfg = buildMobileWdioConfig({
      MOBILE_PROFILE: profile,
      QA_MOBILE_ARTIFACT_DIR: tmpArtifacts,
      APPIUM_HOST: '127.0.0.1',
      APPIUM_PORT: '4723',
    });
    assert.equal(cfg.port, 4723);
    assert.equal(cfg.capabilities.length, 1);
  }

  const defaultCfg = buildMobileWdioConfig({});
  assert.equal(defaultCfg.artifactDir, DEFAULT_MOBILE_ARTIFACT_DIR);
  assert.deepEqual(defaultCfg.specs, ['./tests/**/*.spec.ts']);
  assert.deepEqual(defaultCfg.exclude, ['./tests/mobile_screenplay.spec.ts']);
  assert.equal(defaultCfg.framework, 'mocha');
  assert.deepEqual(defaultCfg.reporters, ['spec']);

  const aliasCfg = buildMobileWdioConfig({ QA_MOBILE_ARTIFACTS_DIR: tmpArtifacts });
  assert.equal(aliasCfg.artifactDir, tmpArtifacts);

  assert.throws(
    () => buildMobileWdioConfig({ QA_MOBILE_ARTIFACT_DIR: '/var/log/mobile' }),
    MobileConfigValidationError,
  );
  assert.throws(
    () => buildMobileWdioConfig({ MOBILE_PROFILE: 'unsupported-driver' }),
    MobileConfigValidationError,
  );
}

async function assertFailVerboseArtifacts(tmpArtifacts: string): Promise<void> {
  const failCfg = buildMobileWdioConfig({ QA_MOBILE_ARTIFACT_DIR: tmpArtifacts });
  const artifact = await failCfg.afterTest?.(
    { title: '--rechaza biometrico expirado--', parent: 'MobileAuth' },
    { tenantId: 'tenant-fieldops', activeContext: 'WEBVIEW_com.sinfallas.fieldops' },
    { passed: false, error: new Error('Biometric prompt rejected') },
    {
      getContext: () => Promise.resolve('WEBVIEW_com.sinfallas.fieldops'),
      getPageSource: () => Promise.resolve('<hierarchy><node text="Reintentar"/></hierarchy>'),
      takeScreenshot: () => Promise.resolve('YmFzZTY0'),
    },
  );
  assert.ok(artifact);
  assert.equal(artifact.context, 'WEBVIEW_com.sinfallas.fieldops');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  assert.equal(fs.existsSync(artifact.metadataPath), true);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  assert.equal(fs.existsSync(artifact.pageSourcePath), true);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  assert.equal(fs.existsSync(artifact.screenshotPath), true);

  const partialArtifact = await failCfg.afterTest?.(
    { title: 'resiliente si XML tree falla', parent: 'MobileAuth' },
    { tenantId: 'tenant-fieldops', activeContext: 'NATIVE_APP' },
    { passed: false, error: new Error('WebView crashed') },
    {
      getContext: () => Promise.resolve('NATIVE_APP'),
      getPageSource: () => Promise.reject(new Error('DOM unavailable')),
      takeScreenshot: () => Promise.resolve('YmFzZTY0'),
    },
  );
  assert.ok(partialArtifact);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  assert.match(fs.readFileSync(partialArtifact.pageSourcePath, 'utf-8'), /capture_failed/);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  assert.equal(fs.existsSync(partialArtifact.screenshotPath), true);
}

async function assertGlobalBrowserDiagnosticFallback(tmpArtifacts: string): Promise<void> {
  const failCfg = buildMobileWdioConfig({ QA_MOBILE_ARTIFACT_DIR: tmpArtifacts });
  const globalHolder = globalThis as { browser?: MobileFailureDriverPort };
  const previousBrowser = globalHolder.browser;
  globalHolder.browser = {
    getContext: () => Promise.resolve('WEBVIEW_com.sinfallas.global'),
    getPageSource: () => Promise.resolve('<hierarchy><node text="Global"/></hierarchy>'),
    takeScreenshot: () => Promise.resolve('YmFzZTY0'),
  };
  try {
    const globalArtifact = await failCfg.afterTest?.(
      { title: 'resuelve driver desde globalThis.browser', parent: 'MobileAuth' },
      { tenantId: 'tenant-fieldops' },
      { passed: false, error: 'Global browser fallback' },
    );
    assert.ok(globalArtifact);
    assert.equal(globalArtifact.context, 'WEBVIEW_com.sinfallas.global');
  } finally {
    globalHolder.browser = previousBrowser;
  }
}

async function assertRbacActorOutcomes(
  actor: MobileActor,
  harness: HttpMobileSessionHarness,
  stubState: StubW3cState,
  apiLog: MobileApiRequestSpec[],
): Promise<void> {
  assert.equal(await actor.asks(ActiveMobileContext()), 'WEBVIEW_com.sinfallas.fieldops');
  assert.equal(actor.recall<boolean>('bioOk'), true);
  assert.equal(actor.recall<number>('syncHttpStatus'), 201);
  assert.equal(stubState.openedUrls.at(-1), 'sinfallas://app.sinfallas.local/orders/42');
  const lastBio = stubState.biometricEvents.at(-1);
  assert.equal(lastBio !== undefined && lastBio.matched, true);
  assert.equal(harness.taps.includes('~submit-order-btn'), true);
  const firstHeaders = apiLog[0]?.headers;
  assert.ok(firstHeaders);
  assert.equal(firstHeaders['X-Tenant-ID'], 'tenant-fieldops');
  assert.ok(firstHeaders['Idempotency-Key']);
}

async function assertRbacActorWorkflow(
  harness: HttpMobileSessionHarness,
  stubState: StubW3cState,
  apiLog: MobileApiRequestSpec[],
  apiClient: MobileApiClientPort,
): Promise<MobileActor> {
  const actor = MobileActor.named('TecnicoCampo', {
    role: 'operator',
    tenantId: 'tenant-fieldops',
    platform: 'android',
    hybridShell: 'ionic-capacitor',
    permissions: ['workorders:sync'],
  });
  assert.throws(() => actor.abilityTo(CallMobileApi), MissingMobileAbilityError);
  assert.equal(actor.hasPermission('workorders:sync'), true);
  actor.whoCan(InteractWithMobile.using(harness.driver), CallMobileApi.using(apiClient));

  await actor.attemptsTo(
    SwitchMobileContext('WEBVIEW_com.sinfallas.fieldops'),
    TypeInMobileField(ByWebviewRole('textbox', 'Nota'), 'Inspección nodo edge-07'),
    TapAccessibilityId('~submit-order-btn'),
    OpenVerifiedDeepLink('sinfallas://app.sinfallas.local/orders/42'),
    SimulateBiometricPrompt({ matched: true, method: 'fingerprint', memoryKey: 'bioOk' }),
    SetMobileNetworkState('offline'),
    SetMobileNetworkState('online'),
    defineMobileTask('Sincronizar orden en BFF', async (a) => {
      const res = await a.abilityTo(CallMobileApi).request(a, {
        method: 'POST',
        path: '/api/v1/mobile/workorders/42/sync',
        body: { note: 'edge-07' },
      });
      a.remember('syncHttpStatus', res.status);
    }),
  );

  await assertRbacActorOutcomes(actor, harness, stubState, apiLog);
  return actor;
}

async function assertParityBatchAndTemporal(actor: MobileActor): Promise<void> {
  const bounds = await actor.asks(VisibleMobileBounds(ByAccessibilityId('submit-order-btn')));
  assert.ok(bounds.width > 0 && bounds.height > 0);
  assert.equal(
    formatMobileLocator(ByIosPredicate('name == "sync"')),
    'iosPredicate:name == "sync"',
  );
  assert.equal(
    formatMobileLocator(ByAndroidUiAutomator('new UiSelector().text("Sync")')),
    'androidUiAutomator:new UiSelector().text("Sync")',
  );

  const unsafeScriptUrl = `${'javas'}cript:alert(1)`;
  await assert.rejects(
    () => actor.attemptsTo(OpenVerifiedDeepLink(unsafeScriptUrl)),
    UnsafeDeepLinkError,
  );

  const parity = await actor.asks(
    VerifyOfflineSyncParity(
      ByAccessibilityId('sync-badge'),
      '/api/v1/mobile/workorders/42',
      (d: unknown) => String((d as { syncStatus: string }).syncStatus),
    ),
  );
  assert.equal(parity.inSync, true);
  assert.equal(parity.networkState, 'online');

  const batchSummary = actor.abilityTo(CallMobileApi).inspectBatchSync({
    status: 200,
    data: {
      results: [
        { id: 'wo-1', status: 'ok' },
        { id: 'wo-2', status: 'conflict' },
      ],
    } satisfies MobileBatchSyncEnvelope,
  });
  assert.equal(batchSummary.allSucceeded, false);
  assert.deepEqual(batchSummary.failedIds, ['wo-2']);

  assert.equal(
    await actor.asks(MobileTemporalLifecycleState({ startsAtMs: 100, endsAtMs: 200, nowMs: 50 })),
    'pending',
  );
  assert.equal(
    await actor.asks(MobileTemporalLifecycleState({ startsAtMs: 100, endsAtMs: 200, nowMs: 150 })),
    'active',
  );
  assert.equal(
    await actor.asks(
      MobileTemporalLifecycleState({ startsAtMs: 100, endsAtMs: 200, nowMs: 150, cancelled: true }),
    ),
    'expired',
  );
}

async function assertFailClosedVisibilityAndAbilityGuards(
  harness: HttpMobileSessionHarness,
  actor: MobileActor,
): Promise<void> {
  const failClosedActor = MobileActor.named('FailClosedGuard', {
    tenantId: 'tenant-fieldops',
  }).whoCan(
    InteractWithMobile.using(harness.driver, { allowedSchemes: ['https'], allowedHosts: [] }),
  );
  await assert.rejects(
    () => failClosedActor.attemptsTo(OpenVerifiedDeepLink('https://app.sinfallas.local/orders/1')),
    UnsafeDeepLinkError,
  );

  const hiddenDriver: MobileDriverPort = {
    ...harness.driver,
    locate(locator) {
      const base = harness.driver.locate(locator);
      return { ...base, isVisible: () => Promise.resolve(false) };
    },
  };
  const hiddenActor = MobileActor.named('HiddenGuard', { tenantId: 'tenant-fieldops' }).whoCan(
    InteractWithMobile.using(hiddenDriver),
  );
  await assert.rejects(
    () => hiddenActor.attemptsTo(TapAccessibilityId('~submit-order-btn')),
    HiddenMobileElementError,
  );
  await assert.rejects(
    () => hiddenActor.asks(VisibleMobileBounds(ByAccessibilityId('submit-order-btn'))),
    HiddenMobileElementError,
  );

  const collapsedDriver: MobileDriverPort = {
    ...harness.driver,
    locate(locator) {
      const base = harness.driver.locate(locator);
      return {
        ...base,
        isVisible: () => Promise.resolve(true),
        readBounds: () => Promise.resolve({ x: 0, y: 0, width: 0, height: 0 }),
      };
    },
  };
  const collapsedActor = MobileActor.named('CollapsedGuard', {
    tenantId: 'tenant-fieldops',
  }).whoCan(InteractWithMobile.using(collapsedDriver));
  await assert.rejects(
    () => collapsedActor.asks(VisibleMobileBounds(ByAccessibilityId('submit-order-btn'))),
    CollapsedMobileGeometryError,
  );

  const stepCount = await actor.asks(
    defineMobileQuestion('Contar pasos registrados del actor', (a) => a.getRecordedSteps().length),
  );
  assert.ok(stepCount > 0);

  class RenamedRuntimeAbility {
    static readonly abilityName = 'StableMobileAbilityKey';
    readonly abilityName = 'different-instance-name';
  }
  const abilityActor = MobileActor.named('AbilityKeyGuard', { tenantId: 'tenant-fieldops' }).whoCan(
    new RenamedRuntimeAbility(),
  );
  assert.ok(abilityActor.abilityTo(RenamedRuntimeAbility) instanceof RenamedRuntimeAbility);
}

async function assertRejectingDriverDiagnostics(): Promise<void> {
  const tmpArtifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-11x-mobile-sec-'));
  try {
    const cfg = buildMobileWdioConfig({ QA_MOBILE_ARTIFACT_DIR: tmpArtifacts });
    const rejectingDriver: MobileFailureDriverPort = {
      getPageSource: () => Promise.resolve('<hierarchy />'),
      takeScreenshot: () => Promise.reject(new Error('screenshot failed')),
      getContext: () => Promise.reject(new Error('context unavailable')),
    };
    const firstDiag = await cfg.afterTest?.(
      { title: 'context-err' },
      { tenantId: 't-1' },
      { passed: false, error: 'boom' },
      rejectingDriver,
    );
    const secondDiag = await cfg.afterTest?.(
      { title: 'context-err' },
      { tenantId: 't-1', activeContext: 'NATIVE_APP' },
      { passed: false, error: 'boom-2' },
      rejectingDriver,
    );
    const blankContextDiag = await cfg.afterTest?.(
      { title: 'context-blank' },
      { tenantId: 't-1', activeContext: 'NATIVE_APP' },
      { passed: false, error: 'boom-3' },
      {
        getPageSource: () => Promise.resolve('<hierarchy />'),
        takeScreenshot: () => Promise.resolve(''),
        getContext: () => Promise.resolve('   '),
      },
    );
    assert.ok(firstDiag);
    assert.ok(secondDiag);
    assert.ok(blankContextDiag);
    assert.equal(firstDiag.context, 'UNKNOWN_CONTEXT');
    assert.equal(secondDiag.context, 'NATIVE_APP');
    assert.equal(blankContextDiag.context, 'NATIVE_APP');
    assert.equal(firstDiag.screenshotPath, '');
    assert.notEqual(firstDiag.pageSourcePath, secondDiag.pageSourcePath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const allureJson = JSON.parse(fs.readFileSync(firstDiag.metadataPath, 'utf-8')) as {
      attachments: Array<{ name: string }>;
    };
    assert.deepEqual(
      allureJson.attachments.map((a) => a.name),
      ['mobile-xml-tree'],
    );
  } finally {
    fs.rmSync(tmpArtifacts, { recursive: true, force: true });
  }
}

async function assertWdioConfigValidationAndEmptyErrors(): Promise<void> {
  assert.throws(
    () => buildMobileWdioConfig({ APPIUM_HOST: 'bad host' }),
    MobileConfigValidationError,
  );
  assert.throws(() => buildMobileWdioConfig({ APPIUM_PORT: 'abc' }), MobileConfigValidationError);
  assert.throws(() => buildMobileWdioConfig({ APPIUM_PORT: '99999' }), MobileConfigValidationError);
  assert.throws(
    () =>
      buildMobileWdioConfig({
        MOBILE_PROFILE: 'hybrid-ionic',
        APPIUM_HYBRID_PLATFORM: 'symbian',
      }),
    MobileConfigValidationError,
  );
  assert.throws(
    () => buildMobileWdioConfig({ MOBILE_PROFILE: 'hybrid-rn', APPIUM_AUTO_WEBVIEW: 'maybe' }),
    MobileConfigValidationError,
  );
  const rnIosCfg = buildMobileWdioConfig({
    MOBILE_PROFILE: 'hybrid-rn',
    APPIUM_HYBRID_PLATFORM: 'ios',
    APPIUM_AUTO_WEBVIEW: 'true',
    APPIUM_DEVICE_NAME: 'iPhone 16',
    APPIUM_PLATFORM_VERSION: '18.2',
    APPIUM_APP_PATH: path.join(os.tmpdir(), 'app.ipa'),
  });
  assert.equal(rnIosCfg.capabilities[0]?.platformName, 'iOS');
  assert.equal(rnIosCfg.capabilities[0]?.['appium:autoWebview'], true);

  const passRes = await rnIosCfg.afterTest?.({ title: 'ok' }, {}, { passed: true });
  assert.equal(passRes, null);
  const noDriverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-11x-mobile-nodrv-'));
  try {
    const noDrvCfg = buildMobileWdioConfig({ QA_MOBILE_ARTIFACT_DIR: noDriverDir });
    const noDrvRes = await noDrvCfg.afterTest?.({ title: 'empty-err' }, {}, { passed: false });
    assert.ok(noDrvRes);
    assert.equal(noDrvRes.errorSummary, 'Fallo sin detalle');
    assert.equal(noDrvRes.context, 'UNKNOWN_CONTEXT');
  } finally {
    fs.rmSync(noDriverDir, { recursive: true, force: true });
  }
}

function createGuardActor(
  calls: MobileApiRequestSpec[],
  onReadBounds: () => void,
): MobileActor {
  const guardDriver: MobileDriverPort = {
    locate: () => ({
      tap: () => Promise.resolve(),
      typeText: () => Promise.resolve(),
      readText: () => Promise.resolve('ok'),
      isVisible: () => Promise.resolve(true),
      readBounds: () => {
        onReadBounds();
        return Promise.resolve({ x: 1, y: 2, width: 100, height: 40 });
      },
    }),
    getContexts: () => Promise.resolve(['NATIVE_APP']),
    getCurrentContext: () => Promise.resolve('NATIVE_APP'),
    switchContext: () => Promise.resolve(),
    openDeepLink: () => Promise.resolve(),
    authenticateBiometric: () => Promise.resolve(true),
    setNetworkState: () => Promise.resolve(),
    getNetworkState: () => Promise.resolve('online'),
  };
  return MobileActor.named('SecGuard', {
    role: 'operator',
    tenantId: 'tenant-sec',
    platform: 'android',
  }).whoCan(
    InteractWithMobile.using(guardDriver),
    CallMobileApi.using({
      send<T = unknown>(spec: MobileApiRequestSpec): Promise<MobileApiResponsePayload<T>> {
        calls.push(spec);
        return Promise.resolve({ status: 200, data: {} as T });
      },
    }),
  );
}

async function assertHeaderSpoofAndIdempotency(
  actor: MobileActor,
  calls: MobileApiRequestSpec[],
): Promise<void> {
  await actor.abilityTo(CallMobileApi).request(actor, {
    method: 'POST',
    path: '/api/v1/sync',
    headers: {
      'x-tenant-id': 'spoofed-tenant',
      'idempotency-key': 'caller-idem-1234',
      'X-Custom': '1',
    },
  });
  const firstHeaders = calls[0]?.headers ?? {};
  assert.equal(firstHeaders['X-Tenant-ID'], 'tenant-sec');
  assert.equal(firstHeaders['x-tenant-id'], undefined);
  assert.equal(firstHeaders['idempotency-key'], 'caller-idem-1234');
  assert.equal(firstHeaders['Idempotency-Key'], undefined);
  assert.equal(firstHeaders['X-Custom'], '1');

  await actor.abilityTo(CallMobileApi).request(actor, {
    method: 'PUT',
    path: '/api/v1/item',
    idempotencyKey: 'explicit-idem-99',
    headers: { 'idempotency-key': 'old-idem' },
  });
  const secondHeaders = calls[1]?.headers ?? {};
  assert.equal(secondHeaders['Idempotency-Key'], 'explicit-idem-99');
  assert.equal(secondHeaders['idempotency-key'], undefined);
}

async function assertSecurityAndHeaderGuards(): Promise<void> {
  assert.throws(() => ByAccessibilityId('~//android.widget.Button'), /XPath/);
  assert.throws(() => ByAccessibilityId('(//android.widget.Button)[1]'), /XPath/);
  assert.throws(() => ByAccessibilityId('   '), /vacio/);
  assert.throws(() => MobileActor.named('   ', { tenantId: 'tenant-sec' }), Error);
  assert.throws(() => ByIosPredicate('   '), /vacio/);
  assert.throws(() => ByAndroidUiAutomator('   '), /vacio/);
  assert.throws(() => ByWebviewRole('   '), /vacio/);
  assert.equal(formatMobileLocator(ByWebviewRole('button')), 'role=button');

  const calls: MobileApiRequestSpec[] = [];
  let readBoundsCount = 0;
  const actor = createGuardActor(calls, () => {
    readBoundsCount += 1;
  });

  await assert.rejects(
    () => actor.attemptsTo(OpenVerifiedDeepLink('https://evil.com@app.sinfallas.local/orders')),
    UnsafeDeepLinkError,
  );
  const bounds = await actor.asks(VisibleMobileBounds(ByAccessibilityId('btn-bounds')));
  assert.equal(bounds.width, 100);
  assert.equal(readBoundsCount, 1);

  const ftpSchemeUrl = `${'f'}tp://app.sinfallas.local/file`;
  await assert.rejects(
    () => actor.attemptsTo(OpenVerifiedDeepLink(ftpSchemeUrl)),
    UnsafeDeepLinkError,
  );
  await assert.rejects(
    () => actor.attemptsTo(OpenVerifiedDeepLink('not a valid :// url')),
    UnsafeDeepLinkError,
  );
  await assertHeaderSpoofAndIdempotency(actor, calls);
}

void describe('QA 11X Mobile Appium Screenplay & WDIO Contract', () => {
  const stubState: StubW3cState = {
    sessionId: 'wdio-mobile-11x',
    currentContext: 'NATIVE_APP',
    availableContexts: ['NATIVE_APP', 'WEBVIEW_com.sinfallas.fieldops'],
    openedUrls: [],
    biometricEvents: [],
    closed: false,
  };
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    server = http.createServer((req, res) => {
      void handleW3cRequest(req, res, stubState);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  void it(
    'construye los 4 perfiles WDIO v9 y emite diagnóstico Fail-Verbose bajo /tmp',
    async () => {
      const tmpArtifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-11x-mobile-spec-'));
      try {
        assertWdioProfileMatrix(tmpArtifacts);
        await assertFailVerboseArtifacts(tmpArtifacts);
        await assertGlobalBrowserDiagnosticFallback(tmpArtifacts);
      } finally {
        fs.rmSync(tmpArtifacts, { recursive: true, force: true });
      }
    },
  );

  void it(
    'ejecuta Screenplay RBAC sobre puente HTTP W3C real, Deep Links, biometría y Anti-Silo',
    async () => {
      const statusRes = await fetch(`${baseUrl}/status`);
      assert.equal(statusRes.status, 200);

      const harness = await createHttpW3cDriverHarness(baseUrl);
      const apiLog: MobileApiRequestSpec[] = [];
      const apiClient: MobileApiClientPort = {
        send<T = unknown>(spec: MobileApiRequestSpec): Promise<MobileApiResponsePayload<T>> {
          apiLog.push(spec);
          const isPost = spec.method === 'POST';
          return Promise.resolve({
            status: isPost ? 201 : 200,
            data: (isPost ? { status: 'EN_LINEA' } : { syncStatus: 'EN_LINEA' }) as T,
          });
        },
      };

      const actor = await assertRbacActorWorkflow(harness, stubState, apiLog, apiClient);
      await assertParityBatchAndTemporal(actor);
      await assertFailClosedVisibilityAndAbilityGuards(harness, actor);
      await harness.closeSession();
      assert.equal(stubState.closed, true);
    },
  );

  void it(
    'bloquea bypass ~XPath, (//xpath), userinfo en Deep Link, cabeceras y fallos WDIO',
    async () => {
      await assertRejectingDriverDiagnostics();
      await assertSecurityAndHeaderGuards();
      await assertWdioConfigValidationAndEmptyErrors();
    },
  );
});
