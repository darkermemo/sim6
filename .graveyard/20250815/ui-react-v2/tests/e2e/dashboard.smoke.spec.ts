import { test, expect } from '@playwright/test';

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174/ui/v2/';

test.describe('Dashboard golden smoke', () => {
  test('loads KPIs + charts', async ({ page }) => {
    await page.goto(base + 'dashboard/');
    
    // KPI strip should be visible
    await expect(page.getByTestId('kpi-ingest-rows')).toBeVisible();
    
    // Main charts should be visible
    await expect(page.getByTestId('chart-ingest')).toBeVisible();
    
    // Health panel should show CH status
    await expect(page.getByTestId('health-ch')).toHaveAttribute('data-status', /ok|degraded|down/);
    
    // Recent alerts should be visible
    await expect(page.getByTestId('alerts-recent')).toBeVisible();
    
    // Test time range selector
    await page.selectOption('select:has-text("Last 1 hour")', '15m');
    
    // Wait for data to reload (loading indicator should appear and disappear)
    await expect(page.getByText('🔄 Loading...')).toBeVisible();
    await expect(page.getByText('🔄 Loading...')).toBeHidden({ timeout: 5000 });
    
    // Test tenant selector
    await page.selectOption('select:has-text("All Tenants")', 'default');
    
    // Again wait for reload
    await expect(page.getByText('🔄 Loading...')).toBeVisible();
    await expect(page.getByText('🔄 Loading...')).toBeHidden({ timeout: 5000 });
  });
});
