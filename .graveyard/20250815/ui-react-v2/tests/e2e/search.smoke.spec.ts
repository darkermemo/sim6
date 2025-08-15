import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174/ui/v2/';

test.describe('Search golden smoke', () => {
  test('loads, compiles, executes, renders rows/meta', async ({ page }) => {
    await page.goto(BASE);
    
    // Navigate to Search
    await page.getByRole('link', { name: 'Search', exact: true }).click();

    // Set tenant
    await page.getByRole('combobox', { name: /tenant/i }).selectOption('default');

    // Set time (last 10m)
    await page.getByRole('combobox', { name: /time range/i }).selectOption('600');

    // Enter query and compile (debounced)
    const q = page.getByRole('textbox', { name: /query/i });
    await q.fill('message:hello');
    await page.waitForTimeout(400); // debounce

    // Compile result shows SQL
    await expect(page.getByTestId('compile-sql')).toContainText('SELECT');

    // Run
    await page.getByRole('button', { name: /run/i }).click();

    // Table + meta present (even if empty)
    await expect(page.getByTestId('result-meta')).toContainText(/rows/i);
    await expect(page.getByTestId('result-table')).toBeVisible();

    // Facets fetch (severity)
    await expect(page.getByTestId('facet-severity')).toBeVisible();

    // Timeline renders buckets
    await expect(page.getByTestId('timeline')).toBeVisible();

    // Toggle tail (header contract only)
    await page.getByRole('switch', { name: /live tail/i }).click();
    await expect(page.getByTestId('tail-status')).toContainText(/connected|connecting/i);
  });
});
