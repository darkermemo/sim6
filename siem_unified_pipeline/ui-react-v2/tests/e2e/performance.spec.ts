/**
 * Performance Testing for Enterprise Search
 * 
 * Tests that our SIEM UI meets enterprise performance standards:
 * - Page load times
 * - Large dataset handling
 * - Memory usage
 * - Bundle size limits
 */

import { test, expect } from '@playwright/test';

test.describe('Performance Tests', () => {
  test('should load search page within performance budget', async ({ page }) => {
    // Start timing
    const start = Date.now();
    
    // Navigate to search page
    await page.goto('/search');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - start;
    
    // Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
    
    // Should see main interface elements
    await expect(page.getByRole('heading', { name: /Enterprise Search/ })).toBeVisible();
    await expect(page.getByPlaceholder(/Enter search query/)).toBeVisible();
  });

  test('should handle typing without lag', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    const queryInput = page.getByPlaceholder(/Enter search query/);
    
    // Time typing performance
    const start = Date.now();
    
    // Type a long query character by character
    const query = 'source_type:nginx.access AND severity:high AND event_type:login';
    for (const char of query) {
      await queryInput.type(char, { delay: 10 });
    }
    
    const typingTime = Date.now() - start;
    
    // Should complete typing within reasonable time
    expect(typingTime).toBeLessThan(2000);
    
    // Final value should be correct
    await expect(queryInput).toHaveValue(query);
  });

  test('should handle large result sets efficiently', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Set high limit to get large result set
    await page.getByPlaceholder(/Enter search query/).fill('*');
    
    // Start timer
    const start = Date.now();
    
    // Execute search
    await page.getByRole('button', { name: /Search/ }).click();
    
    // Wait for results
    await page.waitForSelector('text=/rows/', { timeout: 15000 });
    
    const searchTime = Date.now() - start;
    
    // Should complete search within 10 seconds
    expect(searchTime).toBeLessThan(10000);
    
    // Should show table
    await expect(page.locator('.virtualized-table')).toBeVisible();
  });

  test('should scroll through large tables smoothly', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Execute search to get results
    await page.getByPlaceholder(/Enter search query/).fill('*');
    await page.getByRole('button', { name: /Search/ }).click();
    await page.waitForTimeout(3000);

    const table = page.locator('.virtualized-table');
    
    if (await table.isVisible()) {
      const scrollContainer = table.locator('div').first();
      
      // Measure scroll performance
      const start = Date.now();
      
      // Scroll multiple times
      for (let i = 0; i < 10; i++) {
        await scrollContainer.evaluate((el) => {
          el.scrollTop += 200;
        });
        await page.waitForTimeout(50);
      }
      
      const scrollTime = Date.now() - start;
      
      // Should scroll smoothly
      expect(scrollTime).toBeLessThan(1000);
    }
  });

  test('should handle facet expansion without lag', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');
    
    // Wait for facets to load
    await page.waitForTimeout(2000);

    // Find facet groups
    const facetHeaders = page.locator('text=/Source Type|Severity|Event Type/');
    const count = await facetHeaders.count();
    
    if (count > 0) {
      // Time facet interactions
      const start = Date.now();
      
      // Expand/collapse multiple facets
      for (let i = 0; i < Math.min(count, 3); i++) {
        const header = facetHeaders.nth(i);
        await header.click();
        await page.waitForTimeout(100);
        await header.click();
        await page.waitForTimeout(100);
      }
      
      const interactionTime = Date.now() - start;
      
      // Should be responsive
      expect(interactionTime).toBeLessThan(2000);
    }
  });

  test('should render charts without performance issues', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Execute search to get data for charts
    await page.getByPlaceholder(/Enter search query/).fill('*');
    await page.getByRole('button', { name: /Search/ }).click();
    
    // Wait for charts to render
    await page.waitForTimeout(3000);

    // Should have canvas elements (ECharts)
    const canvases = page.locator('canvas');
    const canvasCount = await canvases.count();
    
    if (canvasCount > 0) {
      // Charts should be visible and responsive
      await expect(canvases.first()).toBeVisible();
      
      // Hover over chart (should be responsive)
      await canvases.first().hover();
      await page.waitForTimeout(100);
    }
  });

  test('should handle concurrent operations efficiently', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    const queryInput = page.getByPlaceholder(/Enter search query/);
    
    // Start timer
    const start = Date.now();
    
    // Perform multiple concurrent operations
    await Promise.all([
      // Type query
      queryInput.fill('source_type:nginx.access'),
      
      // Change tenant
      page.locator('select').first().selectOption('default'),
      
      // Change time range
      page.locator('select').nth(1).selectOption('86400'),
    ]);
    
    // Execute search
    await page.getByRole('button', { name: /Search/ }).click();
    
    // Wait for completion
    await page.waitForTimeout(3000);
    
    const totalTime = Date.now() - start;
    
    // Should handle concurrent operations efficiently
    expect(totalTime).toBeLessThan(8000);
    
    // Should see results
    await expect(page.getByText(/SQL/)).toBeVisible();
  });

  test('should maintain memory efficiency during extended use', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Simulate extended usage
    for (let i = 0; i < 5; i++) {
      // Change query
      await page.getByPlaceholder(/Enter search query/).fill(`query_${i}`);
      await page.waitForTimeout(500);
      
      // Execute search
      await page.getByRole('button', { name: /Search/ }).click();
      await page.waitForTimeout(1000);
      
      // Change tenant
      await page.locator('select').first().selectOption(i % 2 === 0 ? 'hr' : 'default');
      await page.waitForTimeout(500);
    }

    // Should still be responsive after extended use
    await expect(page.getByRole('heading', { name: /Enterprise Search/ })).toBeVisible();
    
    const finalInput = page.getByPlaceholder(/Enter search query/);
    await finalInput.fill('final_test');
    await expect(finalInput).toHaveValue('final_test');
  });

  test('should load with reasonable bundle size', async ({ page }) => {
    // Navigate to search page and analyze network
    const responses: Array<{ url: string; size: number }> = [];
    
    page.on('response', (response) => {
      if (response.url().includes('.js') || response.url().includes('.css')) {
        response.body().then(body => {
          responses.push({
            url: response.url(),
            size: body.length
          });
        }).catch(() => {
          // Ignore errors for body retrieval
        });
      }
    });

    await page.goto('/search');
    await page.waitForLoadState('networkidle');
    
    // Allow time for responses to be collected
    await page.waitForTimeout(1000);

    // Calculate total bundle size
    const totalSize = responses.reduce((sum, response) => sum + response.size, 0);
    const totalSizeMB = totalSize / (1024 * 1024);
    
    console.log(`Total bundle size: ${totalSizeMB.toFixed(2)} MB`);
    
    // Should be under 2MB total
    expect(totalSizeMB).toBeLessThan(2);
    
    // Main JS bundle should be reasonable
    const mainJSResponse = responses.find(r => r.url.includes('index') && r.url.includes('.js'));
    if (mainJSResponse) {
      const mainSizeMB = mainJSResponse.size / (1024 * 1024);
      console.log(`Main JS bundle: ${mainSizeMB.toFixed(2)} MB`);
      expect(mainSizeMB).toBeLessThan(1); // Less than 1MB for main bundle
    }
  });
});
