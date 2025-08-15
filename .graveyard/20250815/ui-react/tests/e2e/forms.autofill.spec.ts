import { test, expect } from '@playwright/test';

test('autofill common forms', async ({ page, baseURL }) => {
  const base = baseURL ?? process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173/ui/app';
  await page.goto(base + '/search', { waitUntil: 'networkidle' });

  // inputs
  for (const sel of ['input[type="text"]', 'input[type="number"]', 'input:not([type])', 'textarea']) {
    const els = await page.$$(sel);
    for (const el of els.slice(0, 10)) {
      await el.fill('test');
    }
  }

  // radix selects (by role)
  const triggers = await page.$$('[role="combobox"], [data-state][aria-controls]');
  for (const t of triggers.slice(0, 5)) {
    try {
      await t.click({ timeout: 1000 });
      const opt = page.locator('[role="option"]').first();
      if (await opt.isVisible({ timeout: 500 })) await opt.click();
    } catch { /* ignore non-interactive */ }
  }

  // switches/checkboxes
  for (const sel of ['button[role="switch"]', 'input[type="checkbox"]']) {
    for (const el of await page.$$(sel)) {
      try { await el.click(); } catch {}
    }
  }

  // submit buttons
  const candidates = await page.$$('button:has-text("Run"), button:has-text("Search"), button:has-text("Save")');
  for (const b of candidates) { try { await b.click({ timeout: 1000 }); } catch {} }

  await expect(page).toHaveTitle(/Search|Results/i);
});
