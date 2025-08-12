import { test, expect } from '@playwright/test';

test.describe('Health Check', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to load
    await expect(page).toHaveTitle(/SIEM/);
    
    // Check for basic navigation or shell elements
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display navigation', async ({ page }) => {
    await page.goto('/');
    
    // Look for common navigation patterns
    // This is a basic smoke test - adjust selectors based on your AppShell
    const navigation = page.locator('nav, [role="navigation"], header');
    await expect(navigation.first()).toBeVisible();
  });
});
