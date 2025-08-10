import { test, expect } from '@playwright/test';

test('graph form submits and nodes render', async ({ page }) => {
  await page.goto('http://127.0.0.1:9999/ui/v2/investigator/graph.html');
  await page.fill('#tenant', 'default');
  await page.fill('#minutes', '15');
  await page.fill('#seeds', '[{"type":"user","value":"alice"}]');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(500);
  // At least one circle node appears
  const nodes = page.locator('svg#graph circle');
  await expect(nodes.first()).toBeVisible();
});


