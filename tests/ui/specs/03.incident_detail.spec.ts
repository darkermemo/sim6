import { test, expect } from '@playwright/test';

test('incident detail renders and resolve action updates status', async ({ page }) => {
  await page.goto('http://127.0.0.1:9999/ui/v2/incidents.html');
  await page.getByRole('button', { name: 'Refresh' }).click();
  const first = page.locator('#grid tbody tr').first();
  await first.waitFor({ state: 'visible' });
  await first.locator('a').first().click();
  await expect(page).toHaveURL(/incident.html/);
  await expect(page.getByText('Entities')).toBeVisible();
  // resolve
  await page.getByRole('button', { name: 'Resolve' }).click();
  await page.waitForTimeout(500);
  await expect(page.getByText('Status: RESOLVED')).toBeVisible();
});


