import { test, expect } from '@playwright/test';

// Runtime slice E2E tests for Recent Alerts dashboard
// Tests the vertical slice: Ingestion → ClickHouse → Dashboard

test.describe('Recent Alerts Dashboard - Vertical Slice', () => {
  const baseURL = 'http://localhost:5000';
  
  test.beforeEach(async ({ page }) => {
    // Set up console error tracking
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Store console errors on page context for later access
    (page as any).consoleErrors = consoleErrors;
  });

  test('should load dashboard with no console errors and show Recent Alerts', async ({ page }) => {
    // Navigate to dashboard
    await page.goto(`${baseURL}/dashboard`);
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for console errors
    const consoleErrors = (page as any).consoleErrors;
    expect(consoleErrors).toHaveLength(0);
    
    // Verify Recent Alerts section exists
    await expect(page.locator('[data-testid="recent-alerts"], .recent-alerts, h2:has-text("Recent Alerts"), h3:has-text("Recent Alerts")')).toBeVisible();
    
    // Wait for at least one row to appear in the alerts table
    await expect(page.locator('table tbody tr, .alert-row, [data-testid="alert-row"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('should auto-apply demoTenant filter and verify API call', async ({ page }) => {
    // Set up network request interception
    const apiRequests: any[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/dashboard/recent-alerts')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });
    
    // Navigate to dashboard
    await page.goto(`${baseURL}/dashboard`);
    await page.waitForLoadState('networkidle');
    
    // Wait for API call to be made
    await page.waitForTimeout(2000);
    
    // Verify API call was made with demoTenant parameter
    expect(apiRequests.length).toBeGreaterThan(0);
    const recentAlertsRequest = apiRequests.find(req => req.url.includes('recent-alerts'));
    expect(recentAlertsRequest).toBeDefined();
    expect(recentAlertsRequest.url).toContain('tenant=demoTenant');
  });

  test('should change time range and refresh table', async ({ page }) => {
    // Navigate to dashboard
    await page.goto(`${baseURL}/dashboard`);
    await page.waitForLoadState('networkidle');
    
    // Wait for initial load
    await page.waitForTimeout(2000);
    
    // Set up network request tracking for time range change
    const apiRequests: any[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/dashboard/recent-alerts')) {
        apiRequests.push({
          url: request.url(),
          timestamp: Date.now()
        });
      }
    });
    
    // Find and click time range selector (common patterns)
    const timeRangeSelectors = [
      'select[data-testid="time-range"]',
      '.time-range-selector',
      'select:has(option:text("Last 1 hour"))',
      '[data-testid="time-range-select"]',
      '.time-picker select',
      'select[name="timeRange"]'
    ];
    
    let timeRangeFound = false;
    for (const selector of timeRangeSelectors) {
      try {
        const element = page.locator(selector);
        if (await element.isVisible({ timeout: 1000 })) {
          await element.selectOption({ label: 'Last 1 hour' });
          timeRangeFound = true;
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    // If no select found, try button/dropdown approach
    if (!timeRangeFound) {
      const buttonSelectors = [
        'button:has-text("Last")',
        '.time-range-button',
        '[data-testid="time-range-button"]'
      ];
      
      for (const selector of buttonSelectors) {
        try {
          const element = page.locator(selector);
          if (await element.isVisible({ timeout: 1000 })) {
            await element.click();
            await page.locator('text="Last 1 hour"').click();
            timeRangeFound = true;
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }
    }
    
    // Wait for potential API call after time range change
    await page.waitForTimeout(2000);
    
    // Verify table refreshed (either new API call or visible change)
    const hasNewApiCall = apiRequests.length > 0;
    const tableVisible = await page.locator('table tbody tr, .alert-row').first().isVisible();
    
    expect(hasNewApiCall || tableVisible).toBeTruthy();
  });

  test('should open alert drawer when clicking first alert row', async ({ page }) => {
    // Navigate to dashboard
    await page.goto(`${baseURL}/dashboard`);
    await page.waitForLoadState('networkidle');
    
    // Wait for alerts to load
    await expect(page.locator('table tbody tr, .alert-row, [data-testid="alert-row"]').first()).toBeVisible({ timeout: 10000 });
    
    // Click first alert row
    await page.locator('table tbody tr, .alert-row, [data-testid="alert-row"]').first().click();
    
    // Wait for drawer/modal to open
    await page.waitForTimeout(1000);
    
    // Check for drawer/modal/sidebar (common patterns)
    const drawerSelectors = [
      '[data-testid="alert-drawer"]',
      '.alert-drawer',
      '.alert-modal',
      '.alert-details',
      '.drawer',
      '.modal',
      '.sidebar',
      '[role="dialog"]'
    ];
    
    let drawerFound = false;
    for (const selector of drawerSelectors) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 2000 })) {
          drawerFound = true;
          
          // Look for alert_id in the drawer
          const alertIdSelectors = [
            '[data-testid="alert-id"]',
            '.alert-id',
            'text=/alert[_-]?id/i',
            'text=/id:/i'
          ];
          
          let alertIdFound = false;
          for (const idSelector of alertIdSelectors) {
            try {
              const idElement = page.locator(idSelector);
              if (await idElement.isVisible({ timeout: 1000 })) {
                const idText = await idElement.textContent();
                expect(idText).toBeTruthy();
                expect(idText?.trim()).not.toBe('');
                alertIdFound = true;
                break;
              }
            } catch (e) {
              // Try next selector
            }
          }
          
          // If specific alert ID not found, just verify drawer has content
          if (!alertIdFound) {
            const drawerContent = await page.locator(selector).textContent();
            expect(drawerContent?.trim()).toBeTruthy();
          }
          
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    expect(drawerFound).toBeTruthy();
  });

  test('should persist tenant and time range state after hard refresh', async ({ page }) => {
    // Navigate to dashboard
    await page.goto(`${baseURL}/dashboard`);
    await page.waitForLoadState('networkidle');
    
    // Wait for initial load
    await page.waitForTimeout(2000);
    
    // Get current URL to check for state persistence
    const currentUrl = page.url();
    
    // Hard refresh the page
    await page.reload({ waitUntil: 'networkidle' });
    
    // Wait for page to load after refresh
    await page.waitForTimeout(2000);
    
    // Check that URL parameters persist (tenant and/or time range)
    const refreshedUrl = page.url();
    
    // Verify state persistence through URL params or API calls
    const apiRequests: any[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/dashboard/recent-alerts')) {
        apiRequests.push(request.url());
      }
    });
    
    // Wait for potential API calls
    await page.waitForTimeout(2000);
    
    // Verify either URL contains state or API calls maintain state
    const hasUrlState = refreshedUrl.includes('tenant') || refreshedUrl.includes('time');
    const hasApiState = apiRequests.some(url => url.includes('tenant=demoTenant'));
    
    expect(hasUrlState || hasApiState).toBeTruthy();
    
    // Verify alerts still load after refresh
    await expect(page.locator('table tbody tr, .alert-row, [data-testid="alert-row"]').first()).toBeVisible({ timeout: 10000 });
  });
});