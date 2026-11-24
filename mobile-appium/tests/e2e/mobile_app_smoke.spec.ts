// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

/**
 * Suite E2E Mocha ejecutable por `wdio run wdio.conf.ts` usando el patron Screenplay 11X.
 * Cero selectores XPath crudos, cero esperas fijas (waitForTimeout/sleep), CC <= 5.
 */

import assert from 'node:assert/strict';
import {
  ActiveMobileContext,
  ByAccessibilityId,
  ByWebviewRole,
  InteractWithMobile,
  MobileActor,
  SwitchMobileContext,
  TapAccessibilityId,
  VisibleMobileBounds,
  formatMobileLocator,
} from '../screenplay/MobileActor.ts';
import type {
  MobileDriverPort,
  MobileElementBounds,
  MobileElementPort,
  MobileLocator,
  MobileNetworkState,
} from '../screenplay/MobileActor.ts';

declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => Promise<void> | void): void;

interface WdioRect {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

interface WdioElementLike {
  click(): Promise<void>;
  setValue(value: string): Promise<void>;
  getText(): Promise<string>;
  isDisplayed(): Promise<boolean>;
  getLocation?(): Promise<{ readonly x: number; readonly y: number }>;
  getSize?(): Promise<{ readonly width: number; readonly height: number }>;
  getRect?(): Promise<WdioRect>;
}

interface WdioBrowserLike {
  $(selector: string): Promise<WdioElementLike>;
  getContexts?(): Promise<readonly string[]>;
  getContext?(): Promise<string>;
  switchContext?(context: string): Promise<void>;
  url?(targetUrl: string): Promise<void>;
}

function escapeCssAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function toWdioSelector(locator: MobileLocator): string {
  if (locator.strategy === 'accessibilityId') {
    return `~${locator.value}`;
  }
  if (locator.strategy === 'iosPredicate') {
    return `-ios predicate string:${locator.value}`;
  }
  if (locator.strategy === 'androidUiAutomator') {
    return `-android uiautomator:${locator.value}`;
  }
  if (locator.name !== undefined && locator.name.length > 0) {
    return `aria/${locator.name}`;
  }
  return `[role="${escapeCssAttr(locator.role)}"]`;
}

async function readLegacyWdioBounds(el: WdioElementLike): Promise<MobileElementBounds> {
  const [loc, size] = await Promise.all([
    el.getLocation ? el.getLocation() : Promise.resolve({ x: 0, y: 0 }),
    el.getSize ? el.getSize() : Promise.resolve({ width: 0, height: 0 }),
  ]);
  return { x: loc.x, y: loc.y, width: size.width, height: size.height };
}

function normalizeWdioRect(rect: WdioRect): MobileElementBounds {
  return {
    x: rect.x ?? 0,
    y: rect.y ?? 0,
    width: rect.width ?? 0,
    height: rect.height ?? 0,
  };
}

async function readWdioBounds(el: WdioElementLike): Promise<MobileElementBounds> {
  if (el.getRect === undefined) {
    return await readLegacyWdioBounds(el);
  }
  return normalizeWdioRect(await el.getRect());
}

function createWdioElementPort(browser: WdioBrowserLike, selector: string): MobileElementPort {
  return {
    async tap(): Promise<void> {
      const el = await browser.$(selector);
      await el.click();
    },
    async typeText(value: string): Promise<void> {
      const el = await browser.$(selector);
      await el.setValue(value);
    },
    async readText(): Promise<string | null> {
      const el = await browser.$(selector);
      return await el.getText();
    },
    async isVisible(): Promise<boolean> {
      const el = await browser.$(selector);
      return await el.isDisplayed();
    },
    async readBounds(): Promise<MobileElementBounds> {
      const el = await browser.$(selector);
      return await readWdioBounds(el);
    },
  };
}

function createWdioDriverPort(browser: WdioBrowserLike): MobileDriverPort {
  let networkState: MobileNetworkState = 'online';
  return {
    locate(locator: MobileLocator): MobileElementPort {
      return createWdioElementPort(browser, toWdioSelector(locator));
    },
    async getContexts(): Promise<readonly string[]> {
      return browser.getContexts ? await browser.getContexts() : ['NATIVE_APP'];
    },
    async getCurrentContext(): Promise<string> {
      return browser.getContext ? await browser.getContext() : 'NATIVE_APP';
    },
    async switchContext(targetContext: string): Promise<void> {
      if (browser.switchContext !== undefined) {
        await browser.switchContext(targetContext);
      }
    },
    async openDeepLink(url: string): Promise<void> {
      if (browser.url !== undefined) {
        await browser.url(url);
      }
    },
    authenticateBiometric(matched: boolean): Promise<boolean> {
      return Promise.resolve(matched);
    },
    setNetworkState(state: MobileNetworkState): Promise<void> {
      networkState = state;
      return Promise.resolve();
    },
    getNetworkState(): Promise<MobileNetworkState> {
      return Promise.resolve(networkState);
    },
  };
}

function resolveActiveWdioBrowser(): WdioBrowserLike {
  const active = (globalThis as { readonly browser?: WdioBrowserLike }).browser;
  assert.ok(active, 'Sesión WebdriverIO (globalThis.browser) no inicializada.');
  return active;
}

describe('QA 11X Mobile Appium E2E Smoke (Screenplay W3C)', () => {
  it('verifica contexto activo, geometría anti-colapso y tap semántico en sesión W3C', async () => {
    const activeBrowser = resolveActiveWdioBrowser();
    const actor = MobileActor.named('OperadorMovilE2E', {
      role: 'operator',
      tenantId: 'tenant-fieldops',
      platform: 'android',
      hybridShell: 'ionic-capacitor',
      permissions: ['workorders:sync'],
    }).whoCan(InteractWithMobile.using(createWdioDriverPort(activeBrowser)));

    const contexts = await actor.abilityTo(InteractWithMobile).getCurrentContext();
    assert.ok(contexts.length > 0);
    await actor.attemptsTo(SwitchMobileContext('NATIVE_APP'));
    assert.equal(await actor.asks(ActiveMobileContext()), 'NATIVE_APP');

    const syncButton = ByAccessibilityId('btn-sync-tenant');
    const bounds = await actor.asks(VisibleMobileBounds(syncButton));
    assert.ok(bounds.width > 0 && bounds.height > 0);
    await actor.attemptsTo(TapAccessibilityId(syncButton));
    assert.equal(
      formatMobileLocator(ByWebviewRole('button', 'Sincronizar')),
      'role=button[name="Sincronizar"]',
    );
  });
});
