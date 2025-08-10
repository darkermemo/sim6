import { test, expect } from '@playwright/test';

test.describe('Admin Log Sources', () => {
  test('upload→detect→normalize preview→query helper', async ({ page }) => {
    await page.goto('/dev/ui/v2/admin/log-sources.html');

    // Paste a quick Zeek HTTP sample (TSV with user agent)
    const sample = '1717939200\t10.0.0.1\t10.0.0.2\tGET\t/index.html\texample.com\t200\tMozilla/5.0';
    await page.getByLabel('Log input').fill(sample);

    // Detect
    await page.getByRole('button', { name: 'Detect' }).click();
    const ribbon = page.locator('#det-ribbon');
    await expect(ribbon).toBeVisible();

    // Preview normalize
    await page.getByRole('button', { name: 'Preview first 20' }).click();
    await expect(page.getByRole('table', { name: 'Normalized preview table' })).toBeVisible();

    // JSON helper should populate keys
    await expect(page.locator('#json-keys')).toBeVisible();
  });
});


