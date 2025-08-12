import { test, expect } from '@playwright/test';

test.describe('Investigations filters and notes', () => {
  test('chips add/remove, save view, add note', async ({ page }) => {
    await page.goto('/dev/investigations/index.html');
    // enter tokens to form chips
    await page.getByLabel('Query').fill('hammer HAMMER');
    await page.getByRole('button', { name: 'Run' }).click();
    const chips = page.locator('#filters .chip');
    await expect(chips).toHaveCount(2);
    // remove one chip
    await chips.first().click();
    await expect(chips).toHaveCount(1);
    // save view
    await page.getByRole('button', { name: 'Save Current View' }).click();
    await page.waitForTimeout(400);
    // open latest view (click first listed)
    const firstView = page.locator('#views button').first();
    await firstView.click();
    // add a note
    await page.locator('#note').fill('investigation note');
    await page.getByRole('button', { name: 'Add Note' }).click();
    // basic presence of notes list rendered afterwards
    await page.waitForTimeout(300);
    await expect(page.locator('#notes')).toBeVisible();
  });
});


