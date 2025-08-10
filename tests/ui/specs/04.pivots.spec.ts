import { test, expect } from '@playwright/test';

test('pivots open and load', async ({ page }) => {
  await page.goto('http://127.0.0.1:9999/ui/v2/incidents.html');
  await page.getByRole('button', { name: 'Refresh' }).click();
  const first = page.locator('#grid tbody tr').first();
  await first.waitFor({ state: 'visible' });
  await first.locator('a').first().click();
  await expect(page).toHaveURL(/incident.html/);
  // Click first entity link
  const ent = page.locator('#entities a').first();
  const [newPage] = await Promise.all([
    page.waitForEvent('popup'),
    ent.click()
  ]);
  await newPage.waitForLoadState('domcontentloaded');
  expect((await newPage.title()).length).toBeGreaterThan(0);
  await newPage.close();
});


