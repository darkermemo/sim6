import { test, expect } from '@playwright/test';

test('pivots open and load', async ({ page }) => {
  await page.goto('http://127.0.0.1:9999/ui/v2/incidents.html');
  await page.getByRole('button', { name: 'Refresh' }).click();
  const first = page.locator('#grid tbody tr').first();
  await first.waitFor({ state: 'visible' });
  await first.locator('a').first().click();
  await expect(page).toHaveURL(/incident.html/);
  // Click first entity link
  // If no entity link exists (empty entities), skip pivot
  const ent = page.locator('#entities a').first();
  const hasEnt = await ent.count();
  if (hasEnt > 0) {
    const href = await ent.getAttribute('href');
    expect(href).toContain('/events.html');
    await page.goto(href!);
    await expect(page).toHaveURL(/events\.html/);
  }
});


