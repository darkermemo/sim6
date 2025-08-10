import { test, expect } from '@playwright/test';

test.describe('Admin Tenants', () => {
  test('loads and shows live EPS, handles save error banner', async ({ page }) => {
    await page.goto('/dev/admin/tenants.html');
    await expect(page.getByRole('table', { name: 'Tenants table' })).toBeVisible();
    // Live EPS cell exists
    await expect(page.locator('td >> text=/^\d+(\.\d+)?$/').first()).toBeVisible({ timeout: 5000 });
    // Trigger banner by forcing bad request (empty payload)
    await page.evaluate(() => {
      fetch('/api/v2/admin/tenants/bad-id/limits', { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({})});
    });
    await expect(page.locator('#err')).toBeVisible({ timeout: 5000 });
  });
});


