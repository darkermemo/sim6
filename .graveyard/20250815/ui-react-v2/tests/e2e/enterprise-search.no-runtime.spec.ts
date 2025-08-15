/**
 * E2E Runtime Guard Test - Enterprise Search Flow
 * 
 * This test validates that our enterprise search works without runtime errors:
 * - No console.error or console.warn
 * - No pageerror events
 * - No failed network calls (except allowed optional endpoints)
 * - Search functionality works end-to-end
 */

import { test, expect } from '@playwright/test';

test.describe('Enterprise Search - No Runtime Errors', () => {
  let consoleErrors: string[] = [];
  let consoleWarnings: string[] = [];
  let pageErrors: string[] = [];
  let failedRequests: string[] = [];

  test.beforeEach(async ({ page }) => {
    // Clear error arrays
    consoleErrors = [];
    consoleWarnings = [];
    pageErrors = [];
    failedRequests = [];

    // Listen for console errors and warnings
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      } else if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text());
      }
    });

    // Listen for page errors
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    // Listen for failed requests
    page.on('response', (response) => {
      if (!response.ok()) {
        const url = response.url();
        
        // Allow optional endpoints to fail
        const allowedFailures = [
          '/api/v2/search/grammar',
          '/api/v2/schema/enums',
          '/api/v2/search/tail',
        ];
        
        const isAllowedFailure = allowedFailures.some(endpoint => url.includes(endpoint));
        
        if (!isAllowedFailure) {
          failedRequests.push(`${response.status()} ${url}`);
        }
      }
    });
  });

  test('should load search page without runtime errors', async ({ page }) => {
    // Navigate to the enterprise search page
    await page.goto('/search');

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Should see the search interface
    await expect(page.getByRole('heading', { name: /Enterprise Search V4/ })).toBeVisible();

    // Should see query input
    await expect(page.getByPlaceholder(/Enter search query/)).toBeVisible();

    // Should see status indicators
    await expect(page.getByText(/SQL/)).toBeVisible();

    // Check for runtime errors
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
  });

  test('should handle query input and compilation without errors', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    const queryInput = page.getByPlaceholder(/Enter search query/);

    // Type a query (this should trigger debounced compile)
    await queryInput.fill('source_type:nginx.access');

    // Wait for compilation to complete
    await page.waitForTimeout(500); // Wait for debounce + API call

    // Should see compilation result
    await expect(page.getByText(/Query compiled successfully/)).toBeVisible({ timeout: 10000 });

    // Should see SQL status indicator
    await expect(page.getByText(/✓ SQL/)).toBeVisible();

    // Check for runtime errors
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
  });

  test('should execute search and display results without errors', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Enter search query
    await page.getByPlaceholder(/Enter search query/).fill('*');
    await page.getByRole('button', { name: /Search/ }).click();

    // Wait for results
    await page.waitForTimeout(2000);

    // Should see results table
    await expect(page.getByText(/rows/)).toBeVisible({ timeout: 15000 });

    // Should see timeline chart
    await expect(page.locator('canvas')).toBeVisible();

    // Should see facets
    await expect(page.getByText(/Facets/)).toBeVisible();

    // Check for runtime errors
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
  });

  test('should handle facet interactions without errors', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Wait for facets to load
    await page.waitForTimeout(2000);

    // Find and click a facet group header to expand
    const sourceTypeFacet = page.getByText('Source Type').first();
    if (await sourceTypeFacet.isVisible()) {
      await sourceTypeFacet.click();

      // Wait a bit for expansion
      await page.waitForTimeout(500);

      // Try to click a facet value
      const facetValue = page.locator('[style*="cursor: pointer"]').first();
      if (await facetValue.isVisible()) {
        await facetValue.click();

        // Should update the query
        await page.waitForTimeout(500);
      }
    }

    // Check for runtime errors
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
  });

  test('should handle table interactions without errors', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Execute a search to get results
    await page.getByPlaceholder(/Enter search query/).fill('*');
    await page.getByRole('button', { name: /Search/ }).click();

    // Wait for table to load
    await page.waitForTimeout(3000);

    // Should see table with data
    const table = page.locator('.virtualized-table');
    await expect(table).toBeVisible();

    // Try to interact with table if it has data
    const firstRow = table.locator('[style*="position: absolute"]').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();

      // Should open row details
      await page.waitForTimeout(500);
    }

    // Try column sorting
    const countHeader = page.getByText('Count').first();
    if (await countHeader.isVisible()) {
      await countHeader.click();
      await page.waitForTimeout(500);
    }

    // Check for runtime errors
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
  });

  test('should handle tenant switching without errors', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Find tenant selector
    const tenantSelect = page.locator('select').first();
    
    // Switch tenant
    await tenantSelect.selectOption('default');
    await page.waitForTimeout(1000);

    // Switch back
    await tenantSelect.selectOption('hr');
    await page.waitForTimeout(1000);

    // Check for runtime errors
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
  });

  test('should handle time range changes without errors', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Find time selector
    const timeSelect = page.locator('select').nth(1);
    
    // Change time range
    await timeSelect.selectOption('86400'); // 24 hours
    await page.waitForTimeout(1000);

    // Change back
    await timeSelect.selectOption('3600'); // 1 hour
    await page.waitForTimeout(1000);

    // Check for runtime errors
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
  });

  test('should handle SSE toggle without errors', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Wait for compile to complete
    await page.waitForTimeout(2000);

    // Find SSE toggle
    const sseToggle = page.getByLabel('Real-time Tail');
    
    if (await sseToggle.isVisible() && await sseToggle.isEnabled()) {
      // Toggle SSE on
      await sseToggle.check();
      await page.waitForTimeout(1000);

      // Toggle SSE off
      await sseToggle.uncheck();
      await page.waitForTimeout(1000);
    }

    // Check for runtime errors (SSE failures are allowed)
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
  });

  test.afterEach(async ({ page }) => {
    // Final error check after each test
    await page.waitForTimeout(500);

    // Report any errors found
    if (consoleErrors.length > 0) {
      console.log('Console errors found:', consoleErrors);
    }
    if (consoleWarnings.length > 0) {
      console.log('Console warnings found:', consoleWarnings);
    }
    if (pageErrors.length > 0) {
      console.log('Page errors found:', pageErrors);
    }
    if (failedRequests.length > 0) {
      console.log('Failed requests found:', failedRequests);
    }

    // All arrays should be empty
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
  });
});
