import { test, expect, Page } from '@playwright/test';

/**
 * Comprehensive runtime error detection test suite
 * Catches JavaScript errors, console warnings, and UI failures across all pages
 */

const ROUTES_TO_TEST = [
  { path: '/', name: 'Dashboard' },
  { path: '/alerts', name: 'Alerts' },
  { path: '/rules', name: 'Rules' },
  { path: '/assets', name: 'Assets' },
  { path: '/cases', name: 'Cases' },
  { path: '/search', name: 'Search' },
  { path: '/settings', name: 'Settings' },
  { path: '/admin', name: 'Admin' }
];

/**
 * Collects all console errors and warnings from the page
 */
class ErrorCollector {
  private errors: string[] = [];
  private warnings: string[] = [];
  private page: Page;

  constructor(page: Page) {
    this.page = page;
    this.setupListeners();
  }

  private setupListeners() {
    // Catch JavaScript runtime errors
    this.page.on('pageerror', (error) => {
      this.errors.push(`Page Error: ${error.message}`);
    });

    // Catch console errors and warnings
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.errors.push(`Console Error: ${msg.text()}`);
      } else if (msg.type() === 'warning') {
        this.warnings.push(`Console Warning: ${msg.text()}`);
      }
    });

    // Catch unhandled promise rejections
    this.page.on('requestfailed', (request) => {
      this.errors.push(`Request Failed: ${request.url()} - ${request.failure()?.errorText}`);
    });
  }

  getErrors(): string[] {
    return this.errors;
  }

  getWarnings(): string[] {
    return this.warnings;
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  reset() {
    this.errors = [];
    this.warnings = [];
  }
}

test.describe('Runtime Error Detection', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication to avoid login redirects
    await page.addInitScript(() => {
      localStorage.setItem('siem-auth-store', JSON.stringify({
        state: {
          accessToken: 'mock-token',
          refreshToken: 'mock-refresh',
          tenantId: 'mock-tenant',
          isAuthenticated: true
        }
      }));
    });
  });

  // Test each route for runtime errors
  for (const route of ROUTES_TO_TEST) {
    test(`${route.name} page loads without runtime errors`, async ({ page }) => {
      const errorCollector = new ErrorCollector(page);
      
      try {
        await page.goto(`http://localhost:3000${route.path}`, {
          waitUntil: 'networkidle',
          timeout: 10000
        });

        // Wait for React components to fully render
        await page.waitForTimeout(2000);

        // Check for basic page structure
        const body = await page.locator('body');
        await expect(body).toBeVisible();

        // Verify no JavaScript errors occurred
        const errors = errorCollector.getErrors();
        if (errors.length > 0) {
          console.error(`Errors found on ${route.name} page:`, errors);
          throw new Error(`Runtime errors detected on ${route.name}: ${errors.join(', ')}`);
        }

        // Log warnings but don't fail the test
        const warnings = errorCollector.getWarnings();
        if (warnings.length > 0) {
          console.warn(`Warnings on ${route.name} page:`, warnings);
        }

      } catch (error) {
        throw new Error(`Failed to load ${route.name} page: ${error}`);
      }
    });
  }

  test('Dashboard components render with mock data', async ({ page }) => {
    const errorCollector = new ErrorCollector(page);
    
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    
    // Check for key dashboard elements
    await expect(page.locator('[data-testid="dashboard-stats"], .grid')).toBeVisible();
    await expect(page.locator('text=Recent Alerts, text=Alerts')).toBeVisible();
    
    // Verify no errors during component rendering
    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('Alerts page handles empty and malformed data', async ({ page }) => {
    const errorCollector = new ErrorCollector(page);
    
    // Mock API responses with edge cases
    await page.route('**/api/alerts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          alerts: [
            // Valid alert
            {
              id: '1',
              name: 'Test Alert',
              severity: 'high',
              source_ip: '192.168.1.1',
              dest_ip: '10.0.0.1',
              timestamp: new Date().toISOString(),
              status: 'open',
              user: 'test-user'
            },
            // Alert with missing fields
            {
              id: '2',
              name: 'Incomplete Alert',
              severity: 'medium'
              // Missing source_ip, dest_ip, etc.
            },
            // Alert with null values
            {
              id: '3',
              name: null,
              severity: 'low',
              source_ip: null,
              dest_ip: undefined,
              timestamp: null,
              status: 'closed',
              user: null
            }
          ]
        })
      });
    });
    
    await page.goto('http://localhost:3000/alerts', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Verify page still renders despite malformed data
    await expect(page.locator('text=Alerts, [data-testid="alerts-table"]')).toBeVisible();
    
    // Should handle errors gracefully without crashing
    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('Interactive elements work without errors', async ({ page }) => {
    const errorCollector = new ErrorCollector(page);
    
    await page.goto('http://localhost:3000/rules', { waitUntil: 'networkidle' });
    
    // Test button clicks
    const editButtons = page.locator('button:has-text("Edit")');
    if (await editButtons.count() > 0) {
      await editButtons.first().click();
      await page.waitForTimeout(1000);
    }
    
    // Test toggle switches
    const toggles = page.locator('input[type="checkbox"], button[role="switch"]');
    if (await toggles.count() > 0) {
      await toggles.first().click();
      await page.waitForTimeout(1000);
    }
    
    // Verify no errors from interactions
    expect(errorCollector.getErrors()).toEqual([]);
  });

  test('API error handling works correctly', async ({ page }) => {
    const errorCollector = new ErrorCollector(page);
    
    // Mock failed API responses
    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });
    
    await page.goto('http://localhost:3000/alerts', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    // Should show error state, not crash
    const errorElements = page.locator('text=Error, text=Failed, text=Something went wrong');
    const hasErrorUI = await errorElements.count() > 0;
    
    // Either show error UI or handle gracefully without JS errors
    if (!hasErrorUI) {
      expect(errorCollector.getErrors()).toEqual([]);
    }
  });

  test('Navigation between pages works without errors', async ({ page }) => {
    const errorCollector = new ErrorCollector(page);
    
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    
    // Navigate through main routes
    for (const route of ROUTES_TO_TEST.slice(1, 4)) { // Test first few routes
      const navLink = page.locator(`a[href="${route.path}"], button:has-text("${route.name}")`).first();
      
      if (await navLink.isVisible()) {
        await navLink.click();
        await page.waitForTimeout(1500);
        
        // Verify navigation worked
        expect(page.url()).toContain(route.path);
      }
    }
    
    // No errors during navigation
    expect(errorCollector.getErrors()).toEqual([]);
  });
});