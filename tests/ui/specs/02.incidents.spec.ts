import { test, expect } from '@playwright/test';

test('incidents list → detail basics', async ({ page }) => {
  await page.goto('http://127.0.0.1:9999/ui/v2/incidents.html');
  await expect(page.getByText('Incidents')).toBeVisible();
  await page.getByRole('button', { name: 'Refresh' }).click();
  const first = page.locator('#grid tbody tr').first();
  await first.waitFor({ state: 'visible' });
  await first.locator('a').first().click();
  await expect(page).toHaveURL(/incident.html/);
  await expect(page.getByText('Timeline')).toBeVisible();
});


