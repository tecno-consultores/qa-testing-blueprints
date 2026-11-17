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
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function handleW3cPostRoute(
  pathname: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: StubW3cState,
): Promise<boolean> {
  const body = await readJsonBody(req);
  if (pathname === '/session') {
    state.closed = false;
    sendJson(res, 200, { value: { sessionId: state.sessionId, capabilities: body.capabilities ?? {} } });
    return true;
  }
  if (pathname === `/session/${state.sessionId}/appium/context`) {
    state.currentContext = String(body.name ?? state.currentContext);
    sendJson(res, 200, { value: null });
    return true;
  }
  if (pathname === `/session/${state.sessionId}/url`) {
    state.openedUrls.push(String(body.url ?? ''));
    sendJson(res, 200, { value: null });
    return true;
  }
  if (pathname === `/session/${state.sessionId}/appium/device/biometric`) {
    state.biometricEvents.push({
      matched: Boolean(body.match),
      method: String(body.method ?? 'faceId'),
    });
    sendJson(res, 200, { value: Boolean(body.match) });
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
  if (method === 'GET' && pathname === '/status') {
    sendJson(res, 200, { value: { ready: true, message: 'Appium W3C Bridge Ready' } });
    return;
  }
  if (method === 'GET' && pathname === `/session/${state.sessionId}/appium/contexts`) {
    sendJson(res, 200, { value: state.availableContexts });
    return;
  }
  if (method === 'GET' && pathname === `/session/${state.sessionId}/appium/context`) {
    sendJson(res, 200, { value: state.currentContext });
    return;
  }
  if (method === 'POST' && (await handleW3cPostRoute(pathname, req, res, state))) {
    return;
  }
  if (method === 'DELETE' && pathname === `/session/${state.sessionId}`) {
    state.closed = true;
    sendJson(res, 200, { value: null });
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
    capabilities: { alwaysMatch: { platformName: 'Android', 'appium:automationName': 'UiAutomator2' } },
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
        async tap() {
          taps.push(key);
        },
        async typeText(value: string) {
          texts.set(key, value);
        },
        async readText() {
          return texts.get(key) ?? null;
        },
        async isVisible() {
          const b = boundsByKey[key];
          return (b?.width ?? 100) > 0 && (b?.height ?? 40) > 0;
        },
        async readBounds() {
          return boundsByKey[key] ?? { x: 8, y: 16, width: 120, height: 40 };
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
    async setNetworkState(state: MobileNetworkState) {
      networkState = state;
    },
    async getNetworkState() {
      return networkState;
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

describe('QA 11X Mobile Appium Screenplay & WDIO Contract', () => {
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

  it('construye los 4 perfiles WDIO v9 y emite diagnóstico Fail-Verbose bajo /tmp', async () => {
    const tmpArtifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-11x-mobile-spec-'));
    try {
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

      const failCfg = buildMobileWdioConfig({ QA_MOBILE_ARTIFACT_DIR: tmpArtifacts });
      const artifact = await failCfg.afterTest?.(
        { title: 'rechaza biometrico expirado', parent: 'MobileAuth' },
        { tenantId: 'tenant-fieldops', activeContext: 'WEBVIEW_com.sinfallas.fieldops' },
        { passed: false, error: new Error('Biometric prompt rejected') },
        {
          getContext: async () => 'WEBVIEW_com.sinfallas.fieldops',
          getPageSource: async () => '<hierarchy><node text="Reintentar"/></hierarchy>',
          takeScreenshot: async () => 'YmFzZTY0',
        },
      );
      assert.ok(artifact);
      assert.equal(artifact.context, 'WEBVIEW_com.sinfallas.fieldops');
      assert.equal(fs.existsSync(artifact.metadataPath), true);
      assert.equal(fs.existsSync(artifact.pageSourcePath), true);
      assert.equal(fs.existsSync(artifact.screenshotPath), true);

      const partialArtifact = await failCfg.afterTest?.(
        { title: 'resiliente si XML tree falla', parent: 'MobileAuth' },
        { tenantId: 'tenant-fieldops', activeContext: 'NATIVE_APP' },
        { passed: false, error: new Error('WebView crashed') },
        {
          getContext: async () => 'NATIVE_APP',
          getPageSource: async () => {
            throw new Error('DOM unavailable');
          },
          takeScreenshot: async () => 'YmFzZTY0',
        },
      );
      assert.ok(partialArtifact);
      assert.match(fs.readFileSync(partialArtifact.pageSourcePath, 'utf-8'), /capture_failed/);
      assert.equal(fs.existsSync(partialArtifact.screenshotPath), true);

      const globalHolder = globalThis as { browser?: MobileFailureDriverPort };
      const previousBrowser = globalHolder.browser;
      globalHolder.browser = {
        getContext: async () => 'WEBVIEW_com.sinfallas.global',
        getPageSource: async () => '<hierarchy><node text="Global"/></hierarchy>',
        takeScreenshot: async () => 'YmFzZTY0',
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
        if (previousBrowser === undefined) {
          delete globalHolder.browser;
        } else {
          globalHolder.browser = previousBrowser;
        }
      }
    } finally {
      fs.rmSync(tmpArtifacts, { recursive: true, force: true });
    }
  });

  it('ejecuta Screenplay RBAC sobre puente HTTP W3C real, Deep Links seguros, biometría y Anti-Silo/Batch/Temporal', async () => {
    const statusRes = await fetch(`${baseUrl}/status`);
    assert.equal(statusRes.status, 200);

    const harness = await createHttpW3cDriverHarness(baseUrl);
    const apiLog: MobileApiRequestSpec[] = [];
    const apiClient: MobileApiClientPort = {
      async send<T = unknown>(spec: MobileApiRequestSpec): Promise<MobileApiResponsePayload<T>> {
        apiLog.push(spec);
        if (spec.method === 'POST') {
          return { status: 201, data: { status: 'EN_LINEA' } as T };
        }
        return { status: 200, data: { syncStatus: 'EN_LINEA' } as T };
      },
    };

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

    assert.equal(await actor.asks(ActiveMobileContext()), 'WEBVIEW_com.sinfallas.fieldops');
    assert.equal(actor.recall<boolean>('bioOk'), true);
    assert.equal(actor.recall<number>('syncHttpStatus'), 201);
    assert.equal(stubState.openedUrls.at(-1), 'sinfallas://app.sinfallas.local/orders/42');
    assert.equal(stubState.biometricEvents.at(-1)?.matched, true);
    assert.equal(harness.taps.includes('~submit-order-btn'), true);
    assert.ok(apiLog[0]?.headers?.['Idempotency-Key']);
    assert.equal(apiLog[0]?.headers?.['X-Tenant-ID'], 'tenant-fieldops');

    const bounds = await actor.asks(VisibleMobileBounds(ByAccessibilityId('submit-order-btn')));
    assert.ok(bounds.width > 0 && bounds.height > 0);
    assert.equal(formatMobileLocator(ByIosPredicate('name == "sync"')), 'iosPredicate:name == "sync"');
    assert.equal(
      formatMobileLocator(ByAndroidUiAutomator('new UiSelector().text("Sync")')),
      'androidUiAutomator:new UiSelector().text("Sync")',
    );

    await assert.rejects(
      () => actor.attemptsTo(OpenVerifiedDeepLink('javascript:alert(1)')),
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

    const failClosedActor = MobileActor.named('FailClosedGuard', { tenantId: 'tenant-fieldops' }).whoCan(
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
        return { ...base, isVisible: async () => false };
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
        return { ...base, isVisible: async () => true, readBounds: async () => ({ x: 0, y: 0, width: 0, height: 0 }) };
      },
    };
    const collapsedActor = MobileActor.named('CollapsedGuard', { tenantId: 'tenant-fieldops' }).whoCan(
      InteractWithMobile.using(collapsedDriver),
    );
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

    await harness.closeSession();
    assert.equal(stubState.closed, true);
  });
});
