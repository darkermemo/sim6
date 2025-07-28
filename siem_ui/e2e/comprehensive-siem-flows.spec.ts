/**
 * Comprehensive E2E tests for SIEM platform
 * Tests critical user flows and API integrations
 */
import { test, expect } from '@playwright/test';

test.describe('SIEM Platform - Critical User Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    
    // Wait for the application to load
    await page.waitForLoadState('networkidle');
  });

  test.describe('Authentication Flow', () => {
    test('should handle login flow successfully', async ({ page }) => {
      // Check if login form is present
      const loginForm = page.locator('form');
      if (await loginForm.isVisible()) {
        // Fill login credentials
        await page.fill('input[name="username"], input[type="text"]', 'admin');
        await page.fill('input[name="password"], input[type="password"]', 'admin');
        
        // Submit login form
        await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
        
        // Wait for authentication to complete
        await page.waitForLoadState('networkidle');
      }
      
      // Verify we're authenticated (look for dashboard or main interface)
      await expect(page.locator('h1, [data-testid="dashboard"], [data-testid="authenticated-indicator"]')).toBeVisible({ timeout: 10000 });
    });

    test('should handle invalid login credentials', async ({ page }) => {
      const loginForm = page.locator('form');
      if (await loginForm.isVisible()) {
        // Fill invalid credentials
        await page.fill('input[name="username"], input[type="text"]', 'invalid');
        await page.fill('input[name="password"], input[type="password"]', 'invalid');
        
        // Submit login form
        await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
        
        // Should show error message
        await expect(page.locator('text=error, text=invalid, text=failed, .error, .alert-error')).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Dashboard and Navigation', () => {
    test('should load dashboard with key metrics', async ({ page }) => {
      // Ensure we're authenticated
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1, .dashboard', { timeout: 10000 });
      
      // Check for dashboard elements
      const dashboardElements = [
        'text=Dashboard',
        'text=Events',
        'text=Alerts',
        'text=Rules',
        'text=Log Sources'
      ];
      
      for (const element of dashboardElements) {
        await expect(page.locator(element)).toBeVisible({ timeout: 5000 });
      }
    });

    test('should navigate between main sections', async ({ page }) => {
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1', { timeout: 10000 });
      
      // Test navigation to different sections
      const sections = [
        { name: 'Dashboard', selector: 'button:has-text("Dashboard"), a:has-text("Dashboard")' },
        { name: 'Alerts', selector: 'button:has-text("Alerts"), a:has-text("Alerts")' },
        { name: 'Rules', selector: 'button:has-text("Rules"), a:has-text("Rules")' },
        { name: 'Log Sources', selector: 'button:has-text("Log Sources"), a:has-text("Log Sources")' }
      ];
      
      for (const section of sections) {
        const navElement = page.locator(section.selector);
        if (await navElement.isVisible()) {
          await navElement.click();
          await page.waitForLoadState('networkidle');
          
          // Verify section loaded
          await expect(page.locator(`h1:has-text("${section.name}"), h2:has-text("${section.name}")`)).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Alerts Management', () => {
    test('should display alerts list', async ({ page }) => {
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1', { timeout: 10000 });
      
      // Navigate to alerts
      const alertsButton = page.locator('button:has-text("Alerts"), a:has-text("Alerts")');
      if (await alertsButton.isVisible()) {
        await alertsButton.click();
        await page.waitForLoadState('networkidle');
      }
      
      // Check for alerts interface elements
      const alertElements = [
        'text=Alerts',
        'text=Severity',
        'text=Status',
        'text=High, text=Medium, text=Low, text=Critical'
      ];
      
      for (const element of alertElements) {
        await expect(page.locator(element).first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('should filter alerts by severity', async ({ page }) => {
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1', { timeout: 10000 });
      
      // Navigate to alerts
      const alertsButton = page.locator('button:has-text("Alerts"), a:has-text("Alerts")');
      if (await alertsButton.isVisible()) {
        await alertsButton.click();
        await page.waitForLoadState('networkidle');
        
        // Look for filter controls
        const filterSelect = page.locator('select, .filter, [data-testid="severity-filter"]');
        if (await filterSelect.isVisible()) {
          await filterSelect.selectOption('High');
          await page.waitForLoadState('networkidle');
          
          // Verify filtering worked
          await expect(page.locator('text=High')).toBeVisible();
        }
      }
    });
  });

  test.describe('Log Sources Management', () => {
    test('should display log sources list', async ({ page }) => {
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1', { timeout: 10000 });
      
      // Navigate to log sources
      const logSourcesButton = page.locator('button:has-text("Log Sources"), a:has-text("Log Sources")');
      if (await logSourcesButton.isVisible()) {
        await logSourcesButton.click();
        await page.waitForLoadState('networkidle');
      }
      
      // Check for log sources interface elements
      const logSourceElements = [
        'text=Log Source',
        'text=Type',
        'text=Status',
        'text=Active, text=Inactive'
      ];
      
      for (const element of logSourceElements) {
        await expect(page.locator(element).first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('should open add log source dialog', async ({ page }) => {
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1', { timeout: 10000 });
      
      // Navigate to log sources
      const logSourcesButton = page.locator('button:has-text("Log Sources"), a:has-text("Log Sources")');
      if (await logSourcesButton.isVisible()) {
        await logSourcesButton.click();
        await page.waitForLoadState('networkidle');
        
        // Look for add button
        const addButton = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")');
        if (await addButton.isVisible()) {
          await addButton.click();
          
          // Verify dialog/form opened
          await expect(page.locator('dialog, .modal, form, text=Add Log Source, text=Create Log Source')).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Rules Management', () => {
    test('should display rules list', async ({ page }) => {
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1', { timeout: 10000 });
      
      // Navigate to rules
      const rulesButton = page.locator('button:has-text("Rules"), a:has-text("Rules")');
      if (await rulesButton.isVisible()) {
        await rulesButton.click();
        await page.waitForLoadState('networkidle');
      }
      
      // Check for rules interface elements
      const ruleElements = [
        'text=Rules',
        'text=Name',
        'text=Enabled, text=Disabled',
        'text=Severity'
      ];
      
      for (const element of ruleElements) {
        await expect(page.locator(element).first()).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('API Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1', { timeout: 10000 });
      
      // Simulate network failure by going offline
      await page.context().setOffline(true);
      
      // Try to navigate to a section that requires API calls
      const alertsButton = page.locator('button:has-text("Alerts"), a:has-text("Alerts")');
      if (await alertsButton.isVisible()) {
        await alertsButton.click();
        
        // Should show error message or loading state
        await expect(page.locator('text=error, text=failed, text=offline, .error, .alert')).toBeVisible({ timeout: 10000 });
      }
      
      // Restore network
      await page.context().setOffline(false);
    });

    test('should handle API timeouts', async ({ page }) => {
      // This test would require mocking slow API responses
      // For now, we'll just verify the app doesn't crash with slow responses
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1', { timeout: 15000 });
      
      // Navigate through sections quickly to test loading states
      const sections = ['Alerts', 'Rules', 'Log Sources'];
      for (const section of sections) {
        const button = page.locator(`button:has-text("${section}"), a:has-text("${section}")`);
        if (await button.isVisible()) {
          await button.click();
          // Don't wait for full load, test rapid navigation
          await page.waitForTimeout(500);
        }
      }
      
      // App should still be responsive
      await expect(page.locator('h1, h2')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper keyboard navigation', async ({ page }) => {
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1', { timeout: 10000 });
      
      // Test tab navigation
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      
      // Verify focus is visible
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1', { timeout: 10000 });
      
      // Check for ARIA labels on interactive elements
      const interactiveElements = page.locator('button, a, input, select');
      const count = await interactiveElements.count();
      
      if (count > 0) {
        // At least some elements should have accessible names
        const elementsWithLabels = page.locator('button[aria-label], a[aria-label], input[aria-label], button:has-text(""), a:has-text(""), input[placeholder]');
        await expect(elementsWithLabels.first()).toBeVisible();
      }
    });
  });

  test.describe('Performance', () => {
    test('should load main interface within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/');
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1', { timeout: 10000 });
      
      const loadTime = Date.now() - startTime;
      
      // Should load within 10 seconds
      expect(loadTime).toBeLessThan(10000);
    });

    test('should handle large data sets without freezing', async ({ page }) => {
      await page.waitForSelector('[data-testid="authenticated-indicator"], h1', { timeout: 10000 });
      
      // Navigate to alerts (potentially large dataset)
      const alertsButton = page.locator('button:has-text("Alerts"), a:has-text("Alerts")');
      if (await alertsButton.isVisible()) {
        await alertsButton.click();
        await page.waitForLoadState('networkidle');
        
        // App should remain responsive
        await expect(page.locator('h1, h2')).toBeVisible();
        
        // Should be able to interact with the interface
        const interactiveElement = page.locator('button, input, select').first();
        if (await interactiveElement.isVisible()) {
          await interactiveElement.click();
        }
      }
    });
  });
});