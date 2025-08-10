import { test, expect } from '@playwright/test';

test.describe('Alerts drawer and actions', () => {
  test('open detail, ack/close, add note', async ({ page }) => {
    await page.goto('/ui/v2/alerts.html');
    await page.getByTestId('btn-load-alerts').click();
    const table = page.getByTestId('table-alerts');
    await expect(table).toBeVisible();
    // open first alert
    const firstLink = table.locator('tbody tr a.open').first();
    await firstLink.click();
    await expect(page.locator('#drawer')).toBeVisible();
    // add a note
    await page.locator('#d_note').fill('note from e2e');
    await page.locator('#d_add').click();
    await expect(page.getByTestId('toast')).toContainText('Note');
    // close drawer
    await page.locator('#d_close').click();
    await expect(page.locator('#drawer')).toBeHidden();
  });
});


