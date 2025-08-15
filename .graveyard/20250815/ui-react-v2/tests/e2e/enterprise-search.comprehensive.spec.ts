/**
 * Comprehensive Enterprise Search E2E Test
 * Tests all phases of the Splunk/Elastic-class transformation
 */

import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('Enterprise SIEM Search Platform', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the search page
    await page.goto('/ui/v2/search');
    
    // Wait for the app to be ready
    await page.waitForSelector('[data-testid="query-bar"]', { timeout: 10000 });
    await page.waitForSelector('[data-testid="result-table"]', { timeout: 5000 });
  });

  test('Phase 1-4: Complete Enterprise Stack Integration', async ({ page }) => {
    // Test Phase 1: TanStack Query + Typed Hooks
    console.log('🔧 Testing Phase 1: TanStack Query + Typed Hooks');
    
    // Should have no console errors (handled by runtime guard)
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Test query compilation (useCompile hook)
    await page.fill('[data-testid="query-input"]', 'source=nginx AND level=error');
    await page.waitForTimeout(500); // Allow debounce
    
    // Should show SQL compilation result
    await expect(page.locator('[data-testid="sql-preview"]')).toBeVisible();
    const sqlText = await page.locator('[data-testid="sql-preview"]').textContent();
    expect(sqlText).toContain('SELECT');
    
    // Test Phase 2: Virtualization
    console.log('📊 Testing Phase 2: Virtualization');
    
    // Execute search to get results
    await page.press('[data-testid="query-input"]', 'Enter');
    await page.waitForSelector('[data-testid="result-table-row"]', { timeout: 8000 });
    
    // Test virtualized table performance
    const tableRows = page.locator('[data-testid="result-table-row"]');
    const rowCount = await tableRows.count();
    expect(rowCount).toBeGreaterThan(0);
    
    // Test Phase 3: ECharts Integration
    console.log('📈 Testing Phase 3: ECharts Integration');
    
    // Timeline chart should be visible
    await expect(page.locator('[data-testid="timeline-chart"]')).toBeVisible();
    
    // Chart canvas should be rendered
    const chartCanvas = page.locator('[data-testid="timeline-chart"] canvas');
    await expect(chartCanvas).toBeVisible();
    
    // Test Phase 4: Query UX Hardening
    console.log('⚡ Testing Phase 4: Query UX Hardening');
    
    // Test debounced query (should not spam API)
    const networkRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/search/compile')) {
        networkRequests.push(request.url());
      }
    });
    
    // Fast typing should be debounced
    await page.fill('[data-testid="query-input"]', '');
    await page.type('[data-testid="query-input"]', 'fast typing test', { delay: 50 });
    await page.waitForTimeout(1000);
    
    // Should have limited compile requests due to debouncing
    expect(networkRequests.length).toBeLessThanOrEqual(3);
    
    // Test SSE toggle (if available)
    const sseToggle = page.locator('[data-testid="sse-toggle"]');
    if (await sseToggle.isVisible()) {
      await sseToggle.click();
      await expect(page.locator('[data-testid="sse-status"]')).toBeVisible();
    }
    
    // Verify no console errors during the test
    expect(consoleErrors.length).toBe(0);
  });

  test('Phase 5: Design Tokens + Accessibility', async ({ page }) => {
    console.log('🎨 Testing Phase 5: Design Tokens + Accessibility');
    
    // Inject axe for accessibility testing
    await injectAxe(page);
    
    // Test design tokens are applied
    const queryBar = page.locator('[data-testid="query-bar"]');
    const computedStyle = await queryBar.evaluate(el => getComputedStyle(el));
    
    // Should use CSS custom properties (design tokens)
    expect(computedStyle.getPropertyValue('--color-primary')).toBeTruthy();
    
    // Test focus management
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focusedElement).toBeTruthy();
    
    // Run comprehensive accessibility audit
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    });
  });

  test('Performance Regression Guards', async ({ page }) => {
    console.log('🚀 Testing Performance Regression Guards');
    
    // Measure initial page load
    const startTime = Date.now();
    await page.goto('/ui/v2/search');
    await page.waitForSelector('[data-testid="query-bar"]');
    const loadTime = Date.now() - startTime;
    
    console.log(`Page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(5000); // Should load in under 5 seconds
    
    // Test query performance
    const queryStartTime = Date.now();
    await page.fill('[data-testid="query-input"]', '*');
    await page.press('[data-testid="query-input"]', 'Enter');
    await page.waitForSelector('[data-testid="result-table-row"]', { timeout: 10000 });
    const queryTime = Date.now() - queryStartTime;
    
    console.log(`Query execution time: ${queryTime}ms`);
    expect(queryTime).toBeLessThan(10000); // Should execute in under 10 seconds
    
    // Test virtualization performance (scroll test)
    const scrollStartTime = Date.now();
    await page.mouse.wheel(0, 1000); // Scroll down
    await page.waitForTimeout(100);
    await page.mouse.wheel(0, -1000); // Scroll back up
    const scrollTime = Date.now() - scrollStartTime;
    
    console.log(`Scroll performance: ${scrollTime}ms`);
    expect(scrollTime).toBeLessThan(500); // Should be smooth scrolling
  });

  test('API Integration & Error Handling', async ({ page }) => {
    console.log('🛡️ Testing API Integration & Error Handling');
    
    // Track API responses
    const apiResponses: any[] = [];
    page.on('response', response => {
      if (response.url().includes('/api/v2/')) {
        apiResponses.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText()
        });
      }
    });
    
    // Test successful API calls
    await page.fill('[data-testid="query-input"]', 'source=test');
    await page.press('[data-testid="query-input"]', 'Enter');
    await page.waitForTimeout(2000);
    
    // Should have successful API calls
    const compileResponse = apiResponses.find(r => r.url.includes('/search/compile'));
    expect(compileResponse?.status).toBe(200);
    
    const executeResponse = apiResponses.find(r => r.url.includes('/search/execute'));
    expect(executeResponse?.status).toBe(200);
    
    // Test graceful handling of optional endpoints (404s should not crash)
    const optionalEndpoints = ['/search/grammar', '/schema/enums'];
    for (const endpoint of optionalEndpoints) {
      const response = apiResponses.find(r => r.url.includes(endpoint));
      if (response) {
        // Optional endpoints may return 404, but app should not crash
        expect([200, 404]).toContain(response.status);
      }
    }
  });

  test('Complete User Journey', async ({ page }) => {
    console.log('👤 Testing Complete User Journey');
    
    // 1. Land on search page
    await expect(page.locator('h1')).toContainText('Enterprise Search');
    
    // 2. Enter a complex query
    await page.fill('[data-testid="query-input"]', 'source=nginx AND (level=error OR level=warning) | stats count by source_ip');
    
    // 3. Execute search
    await page.press('[data-testid="query-input"]', 'Enter');
    
    // 4. Wait for results
    await page.waitForSelector('[data-testid="result-table-row"]', { timeout: 10000 });
    
    // 5. Interact with facets
    const facetItem = page.locator('[data-testid="facet-item"]').first();
    if (await facetItem.isVisible()) {
      await facetItem.click();
    }
    
    // 6. Check timeline chart
    await expect(page.locator('[data-testid="timeline-chart"]')).toBeVisible();
    
    // 7. Test saved search (if available)
    const saveButton = page.locator('[data-testid="save-search-button"]');
    if (await saveButton.isVisible()) {
      await saveButton.click();
      // Should open save dialog
      await expect(page.locator('[data-testid="save-search-dialog"]')).toBeVisible();
    }
    
    console.log('✅ Complete user journey successful');
  });
});
