// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('DevicesDashboard fulfills WCAG 2.1 AA and in-flow footer geometry', async ({ page }) => {
  await page.goto('/devices');
  await expect(page.getByRole('button', { name: /Refrescar/i })).toBeVisible();
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
});
