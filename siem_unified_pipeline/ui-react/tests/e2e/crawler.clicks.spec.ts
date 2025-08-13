import { test, expect } from '@playwright/test';

test('crawl & click visible actions without crashing', async ({ page, baseURL }) => {
  const base = baseURL ?? process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173/ui/app';
  await page.goto(base, { waitUntil: 'networkidle' });

  // collect candidate clickables in current route
  const selectors = [
    'button:visible',
    'a:visible',
    '[role="button"]:visible',
    '[data-testid*="btn"]:visible',
    '[data-state][aria-controls]:visible', // radix triggers
  ];

  const seen = new Set<string>();
  async function clickAll() {
    for (const sel of selectors) {
      const els = await page.$$(sel);
      for (const el of els) {
        const text = (await el.textContent())?.trim() ?? '';
        const key = `${sel}:${text}:${await el.getAttribute('aria-label') ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Don't navigate away from app host
        const href = await el.getAttribute('href');
        if (href && /^https?:\/\//i.test(href)) continue;

        try {
          await el.scrollIntoViewIfNeeded();
          await Promise.allSettled([
            el.click({ timeout: 1500 }),
            page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {})
          ]);
        } catch (e) {
          throw new Error(`click failed for [${sel}] "${text}" -> ${(e as Error).message}`);
        }
      }
    }
  }

  // crawl a few key routes
  for (const path of ['/', '/search', '/alerts', '/rules']) {
    await page.goto(base + (path === '/' ? '' : path), { waitUntil: 'networkidle' });
    await clickAll();
  }

  // sanity: app shell present
  await expect(page.locator('header')).toBeVisible();
  await expect(page.locator('nav')).toBeVisible();
});
