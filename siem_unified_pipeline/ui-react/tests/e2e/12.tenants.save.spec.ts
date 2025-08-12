import { test, expect } from '@playwright/test';

test.describe('Admin Tenants save persists', () => {
  test('edit limits and persist', async ({ page, request }) => {
    const base = process.env.BASE_URL || 'http://127.0.0.1:9999';
    // fetch current limits via API to compute new values
    const res = await request.get(`${base}/api/v2/admin/tenants/default/limits`);
    const before = await res.json();
    const newEps = (before.eps_limit || 50) + 1;
    const newBurst = Math.max(newEps, (before.burst_limit || newEps+1));
    const newRet = (before.retention_days || 30);

    await page.goto('/ui/v2/admin/tenants.html');
    // Use lower v2 table editor
    const row = page.locator('#rows tr').filter({ hasText: 'default' });
    // If the list is not yet loaded, click refresh
    await page.getByText('Tenants').first().waitFor();
    // Fill fields
    await row.locator('input[data-k="eps_limit"]').fill(String(newEps));
    await row.locator('input[data-k="burst_limit"]').fill(String(newBurst));
    await row.locator('input[data-k="retention_days"]').fill(String(newRet));
    await row.getByRole('button', { name: 'Save' }).click();
    // Verify persisted by API
    await page.waitForTimeout(500);
    const res2 = await request.get(`${base}/api/v2/admin/tenants/default/limits`);
    const after = await res2.json();
    expect(after.eps_limit).toBe(newEps);
    expect(after.burst_limit).toBe(newBurst);
    expect(after.retention_days).toBe(newRet);
  });
});


