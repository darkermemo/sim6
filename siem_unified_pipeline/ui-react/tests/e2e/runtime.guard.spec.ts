import { test, expect, request } from '@playwright/test';

test.describe('runtime guard', () => {
  test('no console errors or network 4xx/5xx on main routes', async ({ page, context, baseURL }) => {
    const base = (baseURL ?? process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173/ui/app/').replace(/\/+$/, '/');
    const routes = ['/', '/search', '/alerts', '/rules'].map(p => base + (p === '/' ? '' : p));

    const consoleErrors: string[] = [];
    page.on('pageerror', e => consoleErrors.push(String(e)));
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    const badRequests: string[] = [];
    page.on('requestfailed', r => badRequests.push(`FAILED ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
    page.on('response', resp => {
      if (resp.status() >= 400) badRequests.push(`HTTP${resp.status()} ${resp.request().method()} ${resp.url()}`);
    });

    for (const url of routes) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await expect(page).toHaveTitle(/SIEM|Search|Alerts|Rules/i);
    }

    // hit API health + a couple contract endpoints directly
    const hc = await request.newContext();
    const api = 'http://127.0.0.1:9999/api/v2';
    await expect((await hc.get(api + '/health'))).toBeOK();
    await expect((await hc.post(api + '/search/compile', { data: { tenant_id:'default', time:{last_seconds:60}, q:'message:hello' } }))).toBeOK();

    expect(consoleErrors, 'console errors').toEqual([]);
    expect(badRequests, 'network errors').toEqual([]);
  });
});
