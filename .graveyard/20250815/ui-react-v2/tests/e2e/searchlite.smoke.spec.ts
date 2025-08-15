import { test, expect } from '@playwright/test';
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5174/ui/v2/';

test('search lite loads + compile/execute no runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  
  // Allow expected API errors (422 for invalid queries, 404 for missing resources)
  const allowedErrors = [
    /422.*Unprocessable Entity/,
    /404.*Not Found/,
    /Failed to load resource.*422/,
    /Failed to load resource.*404/
  ];

  await page.goto(BASE + 'search', { waitUntil: 'networkidle' });
  
  // Wait for React to load and render
  await page.waitForSelector('[data-testid="page-search"]', { timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();

  await page.getByLabel(/tenant/i).selectOption('default');
  await page.getByRole('textbox').fill('message:"hello"');

  await page.getByRole('button', { name: /compile/i }).click();
  await expect(page.getByText(/SQL \(server-generated\)/i)).toBeVisible();

  await page.getByRole('button', { name: /run/i }).click();
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();

  // Filter out expected API errors and check for actual runtime errors
  const runtimeErrors = errors.filter(error => 
    !allowedErrors.some(pattern => pattern.test(error))
  );
  expect(runtimeErrors).toEqual([]);
});
