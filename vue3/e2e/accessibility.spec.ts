import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('La página principal debe cumplir con las normativas de accesibilidad (WCAG)', async ({ page }) => {
  await page.goto('/');
  
  // Escanea el DOM buscando problemas de contraste o etiquetas ARIA faltantes
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  
  expect(accessibilityScanResults.violations).toEqual([]);
});
