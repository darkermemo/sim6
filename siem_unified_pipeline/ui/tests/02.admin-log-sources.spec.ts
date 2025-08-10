import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:9999';

test.describe('Admin / Log Sources', () => {
  test('detect → normalize → JSON helper → dry-run', async ({ page }) => {
    // Open page
    await page.goto(`${BASE}/dev/admin/log-sources.html`);
    await expect(page.getByTestId('sample-input')).toBeVisible();

    // Paste a Zeek HTTP-ish line
    const sample = '1723572000\t10.0.0.1\t10.0.0.2\tGET\t/\texample.com\t200\tMozilla';
    await page.getByTestId('sample-input').fill(sample);

    // Detect
    const [det] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/api/v2/parse/detect') && r.status() === 200),
      page.getByTestId('detect-btn').click()
    ]);
    const detJson = await det.json();
    expect(detJson.vendor).toBeTruthy();

    // Normalize
    const [norm] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/api/v2/parse/normalize') && r.status() === 200),
      page.getByTestId('normalize-btn').click()
    ]);
    const normJson = await norm.json();
    expect(normJson.records.length).toBeGreaterThan(0);
    await expect(page.getByTestId('coverage-pill')).toBeVisible();
    await expect(page.getByTestId('preview-table')).toBeVisible();

    // Insert JSON helper
    const query = page.getByTestId('query');
    await query.fill('{"op":"jsoneq","args":["metadata.http.user_agent","Mozilla"]}');
    await expect(query).toHaveValue(/metadata\.http\.user_agent/);

    // Dry-run (estimate)
    const [dry] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/v2/search/estimate') && r.status() === 200),
      page.getByTestId('dryrun-btn').click()
    ]);
    const dryJson = await dry.json();
    expect(dryJson.estimated_rows).toBeGreaterThanOrEqual(0);
  });
});


