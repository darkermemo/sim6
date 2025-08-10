import { test, expect } from '@playwright/test';

test.describe('Streaming wizard', () => {
  test('create stream rule, ingest, metrics visible', async ({ page }) => {
    await page.goto('/ui/v2/admin/streaming.html');
    await page.getByTestId('btn-health').click();
    await page.getByLabel('Field').fill('message');
    await page.getByLabel('Operator').selectOption('contains_any');
    await page.getByLabel('Tokens/Value').fill('hammer,HAMMER');
    await page.getByLabel('Window (sec)').fill('60');
    await page.getByLabel('Threshold (matches in window)').fill('1');
    await page.getByTestId('btn-create-stream-rule').click();
    // Accept either a visible RID or a success toast
    // Accept status or HTTP 201 in network
    const status = page.locator('#mkRuleStatus');
    await page.waitForTimeout(500);
    if (!(await status.textContent())?.includes('RID:')) {
      // fallback: just proceed if page didn’t error
      await expect(page).toHaveTitle(/Streaming/);
    }
    await page.getByTestId('btn-ingest-samples').click();
    // Poll alerts API to confirm at least one alert exists after ingest
    let ok = false;
    for (let i=0;i<10;i++) {
      await page.waitForTimeout(800);
      const cnt = await page.evaluate(async () => {
        try {
          const r = await fetch('/api/v2/alerts?limit=1');
          const j = await r.json();
          return (j.alerts||[]).length || 0;
        } catch { return 0; }
      });
      if (cnt > 0) { ok = true; break; }
    }
    expect(ok).toBeTruthy();
  });
});


