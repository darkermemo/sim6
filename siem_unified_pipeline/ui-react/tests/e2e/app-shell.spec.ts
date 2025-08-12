import { test, expect } from '@playwright/test';

test.describe('App Shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ui/app/');
  });

  test('navigates between pages', async ({ page }) => {
    // Should redirect to search by default
    await expect(page).toHaveURL(/\/search$/);
    
    // Navigate to alerts
    await page.getByRole('link', { name: 'Alerts' }).click();
    await expect(page).toHaveURL(/\/alerts$/);
    await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible();
    
    // Navigate to health
    await page.getByRole('link', { name: 'Health' }).click();
    await expect(page).toHaveURL(/\/health$/);
  });

  test('displays health status pills', async ({ page }) => {
    // Check ClickHouse status
    await expect(page.getByText('ClickHouse')).toBeVisible();
    
    // Check Redis status
    await expect(page.getByText('Redis')).toBeVisible();
    
    // At least one status badge should be visible
    const statusBadges = page.locator('text=OK');
    await expect(statusBadges.first()).toBeVisible();
  });

  test('theme toggle works', async ({ page }) => {
    // Click theme toggle button
    const themeToggle = page.getByRole('button', { name: 'Toggle theme' });
    await themeToggle.click();
    
    // Check if dark class is added to html element
    await expect(page.locator('html')).toHaveClass(/dark/);
    
    // Toggle back
    await themeToggle.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});
