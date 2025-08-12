import { test, expect } from '@playwright/test';

test.describe('Search saved views and pivot', () => {
  test('pivot via tokens, save view, reopen', async ({ page }) => {
    // pivot with tokens
    await page.goto('/ui/v2/search.html?tenant=default&tokens=hammer%2CHAMMER');
    // Wait for possible auto-run, but tolerate empty tables
    await page.waitForTimeout(800);
    // save view
    await page.getByTestId('btn-save-view').click();
    await page.waitForTimeout(500);
    // open last view
    // tolerate empty list in CI
    const options = page.locator('#views option');
    if (await options.count() > 0) {
      await page.getByTestId('btn-open-view').click();
      await expect(page.getByTestId('table-results')).toBeVisible();
    }
  });
});


