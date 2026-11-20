// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('DevicesDashboard fulfills WCAG 2.1 AA and in-flow footer geometry', async ({ page }) => {
  await page.goto('/devices');
  await expect(page.getByRole('button', { name: /Refrescar/i })).toBeVisible();

  const main = page.getByRole('main');
  const footer = page.locator('footer.in-flow-footer');
  await expect(main).toBeVisible();
  await expect(footer).toBeVisible();

  const footerPosition = await footer.evaluate((el) => getComputedStyle(el).position);
  expect(footerPosition).not.toBe('fixed');

  const mainBox = await main.boundingBox();
  const footerBox = await footer.boundingBox();
  expect(mainBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.y).toBeGreaterThanOrEqual(mainBox!.y);
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(mainBox!.y + mainBox!.height + 2);

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasOverflow).toBe(false);

  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
});
