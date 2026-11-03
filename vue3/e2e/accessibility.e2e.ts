// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Rutas críticas de la aplicación para garantizar cobertura de accesibilidad y regresión visual
const CRITICAL_ROUTES = ['/', '/dashboard', '/login'];

// Tile PNG gris estático 1x1 para determinismo absoluto en mapas Leaflet/OpenStreetMap (0 red externa)
const STATIC_OSM_TILE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test.describe('Auditoría Estricta de Accesibilidad (WCAG 2.1 AA) y Regresión Visual del DOM', () => {
  for (const route of CRITICAL_ROUTES) {
    test(`La ruta "${route}" debe cumplir con WCAG 2.1 AA (0 violaciones) y mantener el diseño pixel-perfect`, async ({
      page,
    }) => {
      // 1. Intercepción Determinista de la API
      await page.route('**/api/**', async (apiRoute) => {
        const json = { status: 'mocked', items: [{ id: 1, name: 'Test Entity' }] };
        await apiRoute.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(json),
        });
      });

      // 2. Intercepción Determinista de Tiles de Mapas (OpenStreetMap)
      await page.route('**/*tile.openstreetmap.org/**', async (tileRoute) => {
        await tileRoute.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from(STATIC_OSM_TILE_BASE64, 'base64'),
        });
      });

      // 3. Bloqueo de telemetría o recursos externos que introducen ruido
      await page.route('**/*analytics*', (r) => r.abort());
      await page.route('**/*googletagmanager*', (r) => r.abort());

      // 4. Navegación y estabilización de fuentes/DOM
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);

      // 5. Auditoría de Accesibilidad (Axe Core - WCAG 2.0 y 2.1 Niveles A y AA)
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);

      // 6. Regresión Visual Determinista (Snapshot Testing)
      await expect(page).toHaveScreenshot(`snapshot-${route.replace(/\//g, '') || 'home'}.png`, {
        fullPage: true,
      });
    });
  }
});
