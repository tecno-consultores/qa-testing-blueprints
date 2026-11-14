// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  MOBILE_APPIUM_README_REL_PATH,
  MOBILE_APPIUM_README_URI,
  MOBILE_APPIUM_RESOURCE,
  MOBILE_APPIUM_STACK_ID,
  StackBlueprintResolutionError,
  V2_STACK_BLUEPRINTS,
  listV2StackBlueprintResources,
  readMobileAppiumBlueprint,
  readStackBlueprintResource,
} from '../src/resources/stackBlueprints.js';
import {
  DEFAULT_MOBILE_ARTIFACT_DIR,
  MobileConfigValidationError,
  buildMobileWdioConfig,
  type MobileFailureDriverPort,
} from '../../mobile-appium/wdio.conf.js';
import {
  ActiveMobileContext,
  ByAccessibilityId,
  ByAndroidUiAutomator,
  ByIosPredicate,
  ByWebviewRole,
  CallMobileApi,
  CollapsedMobileGeometryError,
  InteractWithMobile,
  MissingMobileAbilityError,
  MobileActor,
  MobileContextNotFoundError,
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
  type MobileApiClientPort,
  type MobileDriverPort,
  type MobileElementBounds,
  type MobileLocator,
  type MobileNetworkState,
} from '../../mobile-appium/tests/screenplay/MobileActor.js';

const MCP_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_PARENT = path.dirname(MCP_ROOT);
const MOUNTED_MOBILE_ROOT = '/mobile-appium/README.md';
const REAL_WORKSPACE_ROOT = fs.existsSync(path.join(REPO_PARENT, MOBILE_APPIUM_README_REL_PATH))
  ? REPO_PARENT
  : fs.existsSync(MOUNTED_MOBILE_ROOT)
    ? '/'
    : undefined;

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  delete process.env.QA_BLUEPRINTS_LOCAL_PATH;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('stackBlueprints MCP resource (T4.4)', () => {
  it('registra blueprint://mobile-appium/readme y resuelve mobile-appium/README.md real', () => {
    expect(MOBILE_APPIUM_STACK_ID).toBe('mobile-appium');
    expect(MOBILE_APPIUM_RESOURCE.uri).toBe(MOBILE_APPIUM_README_URI);
    expect(MOBILE_APPIUM_RESOURCE.mimeType).toBe('text/markdown');
    expect(V2_STACK_BLUEPRINTS['mobile-appium'].readmeRelPath).toBe(MOBILE_APPIUM_README_REL_PATH);
    expect(listV2StackBlueprintResources().map((entry) => entry.uri)).toContain(
      MOBILE_APPIUM_README_URI,
    );
    expect(listV2StackBlueprintResources().length).toBeGreaterThanOrEqual(2);

    const byAuto = readMobileAppiumBlueprint(REAL_WORKSPACE_ROOT);
    expect(byAuto.uri).toBe('blueprint://mobile-appium/readme');
    expect(byAuto.stack).toBe('mobile-appium');
    expect(byAuto.mimeType).toBe('text/markdown');
    expect(byAuto.contents).toHaveLength(1);

    if (REAL_WORKSPACE_ROOT) {
      expect(byAuto.source).toBe('workspace');
      expect(byAuto.text).toContain('Appium 2 + WebdriverIO + Screenplay');
      expect(byAuto.text).toContain('MobileActor');
      expect(byAuto.text).toContain('sinfallas/base-node-ionic:26');
    }

    const byStackName = readStackBlueprintResource('mobile-appium', REAL_WORKSPACE_ROOT);
    expect(byStackName.text).toBe(byAuto.text);
  });

  it('soporta autodetección vía cwd/QA_BLUEPRINTS_LOCAL_PATH y fallback seguro anti-symlink', () => {
    const syntheticWs = makeTempDir('qa11x-mobile-ws-');
    const readmeTarget = path.join(syntheticWs, MOBILE_APPIUM_README_REL_PATH);
    fs.mkdirSync(path.dirname(readmeTarget), { recursive: true });
    fs.writeFileSync(readmeTarget, '# Mobile Appium Synthetic Workspace\n', 'utf8');

    process.env.QA_BLUEPRINTS_LOCAL_PATH = syntheticWs;
    const fromEnv = readMobileAppiumBlueprint();
    expect(fromEnv.source).toBe('workspace');
    expect(fromEnv.text).toContain('Mobile Appium Synthetic Workspace');
    delete process.env.QA_BLUEPRINTS_LOCAL_PATH;

    const emptyWs = makeTempDir('qa11x-mobile-empty-');
    const fallbackRes = readMobileAppiumBlueprint(emptyWs);
    expect(fallbackRes.source).toBe('embedded-fallback');
    expect(fallbackRes.text).toContain('MobileActor');

    const prevCwd = process.cwd();
    try {
      process.chdir(emptyWs);
      const cwdAuto = readMobileAppiumBlueprint();
      expect(cwdAuto.uri).toBe('blueprint://mobile-appium/readme');
      expect(cwdAuto.text.length).toBeGreaterThan(50);
    } finally {
      process.chdir(prevCwd);
    }

    const outsideDir = makeTempDir('qa11x-mobile-outside-');
    const outsideSecret = path.join(outsideDir, 'leaked.md');
    fs.writeFileSync(outsideSecret, 'TOP_SECRET_LEAKED', 'utf8');
    const symlinkWs = makeTempDir('qa11x-mobile-symlink-');
    fs.mkdirSync(path.join(symlinkWs, 'mobile-appium'), { recursive: true });
    fs.symlinkSync(outsideSecret, path.join(symlinkWs, MOBILE_APPIUM_README_REL_PATH));

    const blockedSymlink = readMobileAppiumBlueprint(symlinkWs);
    expect(blockedSymlink.source).toBe('embedded-fallback');
    expect(blockedSymlink.text).not.toContain('TOP_SECRET_LEAKED');
  });

  it('rechaza URIs inválidas, stacks desconocidos e intentos de path traversal', () => {
    const invalidInputs = [
      '',
      '   ',
      'blueprint://mobile-appium/invalid',
      'blueprint://../etc/readme',
      'mobile-appium/..',
      'blueprint://%2e%2e/readme',
      'unknown-stack',
      'blueprint://unknown-stack/readme',
    ];
    for (const bad of invalidInputs) {
      expect(() => readStackBlueprintResource(bad)).toThrowError(StackBlueprintResolutionError);
    }
  });
});

describe('mobile-appium/wdio.conf.ts (T4.4)', () => {
  it('genera configuraciones tipadas multi-perfil con timeouts acotados y Fail-Closed', () => {
    const androidCfg = buildMobileWdioConfig();
    expect(androidCfg.profile).toBe('android-uiautomator2');
    expect(androidCfg.hostname).toBe('127.0.0.1');
    expect(androidCfg.port).toBe(4723);
    expect(androidCfg.connectionRetryTimeout).toBe(30_000);
    expect(androidCfg.connectionRetryCount).toBe(1);
    expect(androidCfg.waitforTimeout).toBe(10_000);
    expect(androidCfg.artifactDir).toBe(DEFAULT_MOBILE_ARTIFACT_DIR);
    expect(androidCfg.capabilities[0].platformName).toBe('Android');
    expect(androidCfg.capabilities[0]['appium:automationName']).toBe('UiAutomator2');
    expect(androidCfg.capabilities[0]['appium:noReset']).toBe(false);
    expect(androidCfg.capabilities[0]['appium:autoGrantPermissions']).toBe(false);

    const iosCfg = buildMobileWdioConfig({
      MOBILE_PROFILE: 'ios-xcuitest',
      APPIUM_HOST: 'appium-grid.internal',
      APPIUM_PORT: '4725',
      APPIUM_DEVICE_NAME: 'iPhone 16 Pro',
      APPIUM_PLATFORM_VERSION: '18.2',
      APPIUM_APP_PATH: '/tmp/app.ipa',
    });
    expect(iosCfg.capabilities[0].platformName).toBe('iOS');
    expect(iosCfg.capabilities[0]['appium:automationName']).toBe('XCUITest');
    expect(iosCfg.capabilities[0]['appium:isolateSimDevice']).toBe(true);
    expect(iosCfg.capabilities[0]['appium:autoAcceptAlerts']).toBe(false);
    expect(iosCfg.capabilities[0]['appium:deviceName']).toBe('iPhone 16 Pro');

    const ionicAndroid = buildMobileWdioConfig({ MOBILE_PROFILE: 'hybrid-ionic' });
    expect(ionicAndroid.capabilities[0].platformName).toBe('Android');
    expect(ionicAndroid.capabilities[0]['appium:autoWebview']).toBe(false);
    expect(ionicAndroid.capabilities[0]['appium:webviewConnectTimeout']).toBe(10_000);

    const rnIos = buildMobileWdioConfig({
      MOBILE_PROFILE: 'hybrid-rn',
      APPIUM_HYBRID_PLATFORM: 'ios',
      APPIUM_AUTO_WEBVIEW: 'true',
    });
    expect(rnIos.capabilities[0].platformName).toBe('iOS');
    expect(rnIos.capabilities[0]['appium:autoWebview']).toBe(true);

    expect(() => buildMobileWdioConfig({ APPIUM_PORT: '0' })).toThrowError(
      MobileConfigValidationError,
    );
    expect(() => buildMobileWdioConfig({ APPIUM_PORT: '65536' })).toThrowError(
      MobileConfigValidationError,
    );
    expect(() => buildMobileWdioConfig({ APPIUM_PORT: 'abc' })).toThrowError(
      MobileConfigValidationError,
    );
    expect(() => buildMobileWdioConfig({ MOBILE_PROFILE: 'windows-phone' })).toThrowError(
      MobileConfigValidationError,
    );
    expect(() => buildMobileWdioConfig({ APPIUM_HOST: 'bad host/name' })).toThrowError(
      MobileConfigValidationError,
    );
    expect(() =>
      buildMobileWdioConfig({ MOBILE_PROFILE: 'hybrid-ionic', APPIUM_HYBRID_PLATFORM: 'symbian' }),
    ).toThrowError(MobileConfigValidationError);
    expect(() =>
      buildMobileWdioConfig({ MOBILE_PROFILE: 'hybrid-rn', APPIUM_AUTO_WEBVIEW: 'maybe' }),
    ).toThrowError(MobileConfigValidationError);
    expect(() => buildMobileWdioConfig({ QA_MOBILE_ARTIFACT_DIR: '/var/log/evil' })).toThrowError(
      MobileConfigValidationError,
    );
  });

  it('ejecuta hook afterTest en modo Pass-Quiet y Fail-Verbose dentro de /tmp', async () => {
    const artifactTmp = makeTempDir('qa11x-wdio-artifacts-');
    const cfg = buildMobileWdioConfig({
      MOBILE_PROFILE: 'hybrid-ionic',
      QA_MOBILE_ARTIFACT_DIR: artifactTmp,
      APPIUM_HOST: '   ',
    });
    expect(cfg.hostname).toBe('127.0.0.1');

    const quietRes = await cfg.afterTest(
      { title: 'ok test' },
      { tenantId: 'tenant-alpha' },
      { passed: true },
    );
    expect(quietRes).toBeNull();
    expect(fs.readdirSync(artifactTmp)).toHaveLength(0);

    const fakeDriver: MobileFailureDriverPort = {
      async getPageSource() {
        return '<hierarchy><node resource-id="sync-badge" /></hierarchy>';
      },
      async takeScreenshot() {
        return Buffer.from('fake-png-bytes').toString('base64');
      },
      async getContext() {
        return 'WEBVIEW_com.sinfallas.app';
      },
    };

    const failRes = await cfg.afterTest(
      { title: 'fallo sync', fullTitle: 'Mobile Screenplay Sync Offline' },
      { tenantId: 'tenant-beta' },
      { passed: false, error: new Error('Sync mismatch') },
      fakeDriver,
    );
    expect(failRes).not.toBeNull();
    expect(failRes?.deviceProfile).toBe('hybrid-ionic');
    expect(failRes?.context).toBe('WEBVIEW_com.sinfallas.app');
    expect(failRes?.tenantId).toBe('tenant-beta');
    expect(fs.existsSync(failRes!.pageSourcePath)).toBe(true);
    expect(fs.existsSync(failRes!.screenshotPath)).toBe(true);
    expect(fs.existsSync(failRes!.metadataPath)).toBe(true);

    const allureMeta = JSON.parse(fs.readFileSync(failRes!.metadataPath, 'utf8'));
    expect(allureMeta.labels).toEqual([
      { name: 'deviceProfile', value: 'hybrid-ionic' },
      { name: 'context', value: 'WEBVIEW_com.sinfallas.app' },
      { name: 'tenantId', value: 'tenant-beta' },
    ]);

    const fallbackFail = await cfg.afterTest(
      { title: '---' },
      { activeContext: 'NATIVE_APP' },
      { passed: false, error: 'Timeout' },
    );
    expect(fallbackFail?.context).toBe('NATIVE_APP');
    expect(fallbackFail?.tenantId).toBe('unknown-tenant');
    expect(fallbackFail?.errorSummary).toBe('Timeout');

    const blankErrFail = await cfg.afterTest({ title: 'blank' }, {}, { passed: false });
    expect(blankErrFail?.errorSummary).toBe('Fallo sin detalle');
  });
});

function createFakeMobileHarness() {
  let activeContext = 'NATIVE_APP';
  let networkState: MobileNetworkState = 'online';
  const contexts = ['NATIVE_APP', 'WEBVIEW_com.sinfallas.app'];
  const openedLinks: string[] = [];
  const textValues: Record<string, string> = {
    '~sync-status-badge': 'SYNCED_OK',
    'role=button[name="Sincronizar"]': 'Sincronizar',
  };
  const boundsMap: Record<string, MobileElementBounds> = {
    '~sync-status-badge': { x: 10, y: 20, width: 140, height: 42 },
    '~collapsed-widget': { x: 0, y: 0, width: 0, height: 0 },
  };
  const tapped: string[] = [];
  const apiLog: Array<{ method: string; path: string; headers: Record<string, string> }> = [];

  const driver: MobileDriverPort = {
    locate(locator: MobileLocator) {
      const key = formatMobileLocator(locator);
      return {
        async tap() {
          tapped.push(key);
        },
        async typeText(value: string) {
          textValues[key] = value;
        },
        async readText() {
          return textValues[key] ?? null;
        },
        async isVisible() {
          const b = boundsMap[key] ?? { width: 100, height: 40 };
          return b.width > 0 && b.height > 0;
        },
        async readBounds() {
          return boundsMap[key] ?? { width: 100, height: 40 };
        },
      };
    },
    async getContexts() {
      return contexts;
    },
    async getCurrentContext() {
      return activeContext;
    },
    async switchContext(target: string) {
      activeContext = target;
    },
    async openDeepLink(url: string) {
      openedLinks.push(url);
    },
    async authenticateBiometric(matched: boolean) {
      return matched;
    },
    async setNetworkState(state: MobileNetworkState) {
      networkState = state;
    },
    async getNetworkState() {
      return networkState;
    },
  };

  const apiClient: MobileApiClientPort = {
    async send<T = unknown>(spec) {
      apiLog.push({
        method: spec.method,
        path: spec.path,
        headers: (spec.headers ?? {}) as Record<string, string>,
      });
      return {
        status: 200,
        data: { badge: 'SYNCED_OK' } as T,
      };
    },
  };

  return { driver, apiClient, textValues, tapped, openedLinks, apiLog };
}

describe('mobile-appium/tests/screenplay/MobileActor.ts (T4.4)', () => {
  it('valida identidad, habilidades faltantes, localizadores seguros y geometría anti-0x0', () => {
    expect(() => MobileActor.named('', { tenantId: 't1' })).toThrow();
    expect(() => MobileActor.named('Ana', { tenantId: '   ' })).toThrow();

    const actor = MobileActor.named('OperadorMovil', {
      role: 'operator',
      tenantId: 'tenant-ionic-01',
      platform: 'android',
      hybridShell: 'ionic-capacitor',
      permissions: ['mobile:sync'],
    });
    expect(actor.hasPermission('mobile:sync')).toBe(true);
    expect(actor.hasPermission('mobile:admin')).toBe(false);
    expect(() => actor.abilityTo(InteractWithMobile)).toThrowError(MissingMobileAbilityError);

    expect(formatMobileLocator(ByAccessibilityId('~login-btn'))).toBe('~login-btn');
    expect(formatMobileLocator(ByIosPredicate('label == "Entrar"'))).toBe(
      'iosPredicate:label == "Entrar"',
    );
    expect(formatMobileLocator(ByAndroidUiAutomator('new UiSelector().text("Entrar")'))).toContain(
      'androidUiAutomator:',
    );
    expect(formatMobileLocator(ByWebviewRole('button'))).toBe('role=button');
    expect(formatMobileLocator(ByWebviewRole('textbox', 'Usuario'))).toBe(
      'role=textbox[name="Usuario"]',
    );

    expect(() => ByAccessibilityId('~')).toThrow();
    expect(() => ByAccessibilityId('')).toThrow();
    expect(() => ByAccessibilityId('//div/button')).toThrow();
    expect(() => ByIosPredicate('xpath=//XCUIElementTypeButton')).toThrow();
    expect(() => ByAndroidUiAutomator('/hierarchy/node[1]')).toThrow();
  });

  it('ejecuta flujo híbrido completo NATIVE_APP <-> WEBVIEW, deep links, biometría, 3 fases y paridad offline', async () => {
    const harness = createFakeMobileHarness();
    const actor = MobileActor.named('InspectorMovil', {
      role: 'operator',
      tenantId: 'tenant-alpha',
      platform: 'ios',
      hybridShell: 'ionic-capacitor',
      permissions: ['mobile:biometric', 'mobile:sync'],
    }).whoCan(
      InteractWithMobile.using(harness.driver),
      CallMobileApi.using(harness.apiClient),
    );

    await expect(
      actor.attemptsTo(TapAccessibilityId('collapsed-widget')),
    ).rejects.toThrowError(CollapsedMobileGeometryError);

    const bounds = await actor.asks(VisibleMobileBounds(ByAccessibilityId('sync-status-badge')));
    expect(bounds).toEqual({ x: 10, y: 20, width: 140, height: 42 });

    await actor.attemptsTo(
      SimulateBiometricPrompt({ matched: true, method: 'faceId', memoryKey: 'bioOk' }),
      OpenVerifiedDeepLink('sinfallas://app.sinfallas.local/orders/42'),
      SwitchMobileContext('WEBVIEW_com.sinfallas.app'),
      TypeInMobileField(ByWebviewRole('textbox', 'Nota'), 'Offline queue payload'),
      TapAccessibilityId(ByWebviewRole('button', 'Sincronizar')),
      SetMobileNetworkState('offline'),
    );
    expect(actor.recall<boolean>('bioOk')).toBe(true);
    expect(harness.openedLinks).toEqual(['sinfallas://app.sinfallas.local/orders/42']);
    expect(await actor.asks(ActiveMobileContext())).toBe('WEBVIEW_com.sinfallas.app');

    // Intento de sincronización mientras está offline y recuperación online con Idempotency-Key
    await actor.attemptsTo(
      SetMobileNetworkState('online'),
      SwitchMobileContext('NATIVE_APP'),
      defineMobileTask('Sincronizar cola local', async (a) => {
        const res = await a.abilityTo(CallMobileApi).request(a, {
          method: 'POST',
          path: '/api/v1/mobile/sync',
          body: { pending: 2 },
        });
        a.remember('syncHttpStatus', res.status);
      }),
    );

    expect(actor.recall<number>('syncHttpStatus')).toBe(200);
    const postHeaders = harness.apiLog[0].headers;
    expect(postHeaders['X-Tenant-ID']).toBe('tenant-alpha');
    expect(postHeaders['X-Mobile-Platform']).toBe('ios');
    expect(postHeaders['Idempotency-Key']).toBeTruthy();

    const batchMixed = actor.abilityTo(CallMobileApi).inspectBatchSync({
      status: 200,
      data: {
        results: [
          { id: 'item-1', status: 'succeeded' },
          { id: 'item-2', status: 'failed' },
        ],
      },
    });
    expect(batchMixed.allSucceeded).toBe(false);
    expect(batchMixed.failedIds).toEqual(['item-2']);

    const parity = await actor.asks(
      VerifyOfflineSyncParity(
        ByAccessibilityId('sync-status-badge'),
        '/api/v1/mobile/sync-status',
        (d) => String((d as { badge: string }).badge),
      ),
    );
    expect(parity.inSync).toBe(true);
    expect(parity.networkState).toBe('online');

    await expect(
      actor.attemptsTo(SwitchMobileContext('WEBVIEW_inexistente')),
    ).rejects.toThrowError(MobileContextNotFoundError);

    for (const unsafeLink of [
      '',
      'not a valid uri',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'custom://app.sinfallas.local/steal',
      'https://evil.attacker.example/callback',
    ]) {
      await expect(
        actor.attemptsTo(OpenVerifiedDeepLink(unsafeLink)),
      ).rejects.toThrowError(UnsafeDeepLinkError);
    }

    expect(await actor.asks(MobileTemporalLifecycleState({ startsAtMs: 100, endsAtMs: 200, nowMs: 50 }))).toBe(
      'pending',
    );
    expect(await actor.asks(MobileTemporalLifecycleState({ startsAtMs: 100, endsAtMs: 200, nowMs: 150 }))).toBe(
      'active',
    );
    expect(await actor.asks(MobileTemporalLifecycleState({ startsAtMs: 100, endsAtMs: 200, nowMs: 250 }))).toBe(
      'expired',
    );
    expect(
      await actor.asks(MobileTemporalLifecycleState({ startsAtMs: 100, endsAtMs: 200, nowMs: 150, cancelled: true })),
    ).toBe('expired');
    await expect(
      actor.asks(MobileTemporalLifecycleState({ startsAtMs: 200, endsAtMs: 100, nowMs: 150 })),
    ).rejects.toThrowError(RangeError);

    const customQ = await actor.asks(defineMobileQuestion('Contar pasos', (a) => a.getRecordedSteps().length));
    expect(customQ).toBeGreaterThan(5);
    expect(Object.isFrozen(actor.getRecordedSteps())).toBe(true);
  });
});
