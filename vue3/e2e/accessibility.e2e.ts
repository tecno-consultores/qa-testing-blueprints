// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Rutas críticas de la aplicación para garantizar cobertura de accesibilidad y regresión visual
const CRITICAL_ROUTES = ['/', '/dashboard', '/login'] as const;
const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

// Tile PNG gris estático 1x1 para determinismo en mapas OSM (0 red externa)
const STATIC_OSM_TILE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA' +
  'DUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function setupDeterministicRoutes(page: Page): Promise<void> {
  await page.route('**/api/**', async (apiRoute) => {
    const json = { status: 'mocked', items: [{ id: 1, name: 'Test Entity' }] };
    await apiRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(json),
    });
  });

  await page.route('**/*tile.openstreetmap.org/**', async (tileRoute) => {
    await tileRoute.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(STATIC_OSM_TILE_BASE64, 'base64'),
    });
  });

  await page.route('**/*analytics*', (r) => r.abort());
  await page.route('**/*googletagmanager*', (r) => r.abort());
}

async function assertResponsiveAndInFlowFooter(page: Page): Promise<void> {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const overflowPx = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflowPx).toBeLessThanOrEqual(0);
    const footerPositions = await page.evaluate(() =>
      Array.from(document.querySelectorAll('footer, [role="contentinfo"]')).map(
        (el) => globalThis.getComputedStyle(el).position,
      ),
    );
    for (const pos of footerPositions) {
      expect(pos).not.toBe('fixed');
    }
  }
}

async function assertWcagForScheme(page: Page, colorScheme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe('Auditoria WCAG 2.1 AA y Regresion Visual del DOM', () => {
  for (const route of CRITICAL_ROUTES) {
    test(`Ruta "${route}" cumple WCAG 2.1 AA sin desbordamiento ni footer fijo`, async ({
      page,
    }) => {
      await setupDeterministicRoutes(page);
      await page.goto(route);
      await expect(page.locator('main, [role="main"]').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      await assertResponsiveAndInFlowFooter(page);
      await assertWcagForScheme(page, 'dark');
      await assertWcagForScheme(page, 'light');

      const snapName = `snapshot-${route.replace(/\//g, '') || 'home'}.png`;
      await expect(page).toHaveScreenshot(snapName, { fullPage: true });
    });
  }
});
