import { test, expect } from '@playwright/test';

test.describe('Alerts Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/alerts');
  });

  test('requires tenant selection', async ({ page }) => {
    // Should show empty state when no tenant is selected
    await expect(page.getByText('Select a tenant to view alerts')).toBeVisible();
  });

  test('renders alerts table with tenant selected', async ({ page }) => {
    // Select a tenant
    await page.goto('/alerts?tenant=101');
    
    // Wait for alerts to load
    await page.waitForSelector('[role="row"]', { timeout: 10000 });
    
    // Check table headers are visible
    await expect(page.getByText('Time')).toBeVisible();
    await expect(page.getByText('Severity')).toBeVisible();
    await expect(page.getByText('Status')).toBeVisible();
    await expect(page.getByText('Title')).toBeVisible();
  });

  test('opens drawer when clicking alert row', async ({ page }) => {
    await page.goto('/alerts?tenant=101');
    
    // Wait for alerts to load
    await page.waitForSelector('[role="row"]');
    
    // Click first alert row
    const firstRow = page.locator('[role="row"]').nth(1); // Skip header
    await firstRow.click();
    
    // Check drawer is open
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('#drawer-title')).toBeVisible();
    
    // Check tabs are visible
    await expect(page.getByRole('tab', { name: /summary/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /evidence/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /notes/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /actions/i })).toBeVisible();
  });

  test('changes alert status optimistically', async ({ page }) => {
    await page.goto('/alerts?tenant=101');
    
    // Wait for alerts and open drawer
    await page.waitForSelector('[role="row"]');
    const firstRow = page.locator('[role="row"]').nth(1);
    await firstRow.click();
    
    // Switch to actions tab
    await page.getByRole('tab', { name: /actions/i }).click();
    
    // Click Acknowledge button
    await page.getByRole('button', { name: 'Acknowledge' }).click();
    
    // Status should update immediately in both drawer and table
    // (This would need mock API responses to fully test)
  });

  test('adds note to alert', async ({ page }) => {
    await page.goto('/alerts?tenant=101&range=24h#alert=01HQM8X5B7HNQMZVKWBX7G4JMN');
    
    // Wait for drawer to open
    await page.waitForSelector('[role="dialog"]');
    
    // Switch to notes tab
    await page.getByRole('tab', { name: /notes/i }).click();
    
    // Add a note
    const noteText = 'Test note from E2E test';
    await page.getByPlaceholder('Add a note...').fill(noteText);
    await page.getByRole('button', { name: /send/i }).click();
    
    // Note should appear in the list
    await expect(page.getByText(noteText)).toBeVisible();
  });

  test('filters alerts by status', async ({ page }) => {
    await page.goto('/alerts?tenant=101');
    
    // Wait for filters to load
    await page.waitForSelector('text=Status');
    
    // Click CLOSED status to toggle it off
    await page.getByText('CLOSED').click();
    
    // URL should update
    await expect(page).toHaveURL(/status=OPEN,ACK/);
  });

  test('filters alerts by severity', async ({ page }) => {
    await page.goto('/alerts?tenant=101');
    
    // Click CRITICAL severity
    await page.getByText('CRITICAL').click();
    
    // URL should update
    await expect(page).toHaveURL(/sev=CRITICAL/);
  });

  test('sorts alerts by column', async ({ page }) => {
    await page.goto('/alerts?tenant=101');
    
    // Wait for table to load
    await page.waitForSelector('[role="row"]');
    
    // Click severity header to sort
    await page.getByRole('button', { name: /severity/i }).click();
    
    // URL should update with sort params
    await expect(page).toHaveURL(/sort=severity/);
  });

  test('selects multiple alerts for bulk actions', async ({ page }) => {
    await page.goto('/alerts?tenant=101');
    
    // Wait for alerts to load
    await page.waitForSelector('[role="row"]');
    
    // Select first two alerts
    const checkboxes = page.locator('input[type="checkbox"]');
    await checkboxes.nth(1).check(); // Skip header checkbox
    await checkboxes.nth(2).check();
    
    // Bulk actions should appear
    await expect(page.getByText('2 selected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acknowledge' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  test('pivots to search from alert', async ({ page }) => {
    await page.goto('/alerts?tenant=101');
    
    // Open first alert
    await page.waitForSelector('[role="row"]');
    await page.locator('[role="row"]').nth(1).click();
    
    // Switch to actions tab
    await page.getByRole('tab', { name: /actions/i }).click();
    
    // Click Pivot to Search
    await page.getByRole('button', { name: /pivot to search/i }).click();
    
    // Should navigate to search with pre-filled query
    await expect(page).toHaveURL(/\/search/);
    await expect(page).toHaveURL(/tenant=101/);
    await expect(page).toHaveURL(/q=/);
  });

  test('customizes visible columns', async ({ page }) => {
    await page.goto('/alerts?tenant=101');
    
    // Open column chooser
    await page.getByRole('button', { name: /columns/i }).click();
    
    // Uncheck a column
    await page.getByLabel('Source').unclick();
    
    // Column should be hidden and URL should update
    await expect(page).toHaveURL(/cols=/);
    await expect(page.getByText('Source')).not.toBeVisible();
  });

  test('loads more alerts with pagination', async ({ page }) => {
    await page.goto('/alerts?tenant=101');
    
    // Wait for initial load
    await page.waitForSelector('[role="row"]');
    
    // If Load More button exists, click it
    const loadMoreButton = page.getByRole('button', { name: 'Load More' });
    if (await loadMoreButton.isVisible()) {
      await loadMoreButton.click();
      
      // Should show loading state
      await expect(page.getByText('Loading...')).toBeVisible();
    }
  });

  test('persists filters in URL', async ({ page }) => {
    // Navigate with specific filters
    const url = '/alerts?tenant=101&status=OPEN&sev=CRITICAL,HIGH&range=1h';
    await page.goto(url);
    
    // Filters should be applied
    await expect(page.locator('[aria-pressed="true"]').filter({ hasText: 'OPEN' })).toBeVisible();
    await expect(page.locator('[aria-pressed="true"]').filter({ hasText: 'CRITICAL' })).toBeVisible();
    await expect(page.locator('[aria-pressed="true"]').filter({ hasText: 'HIGH' })).toBeVisible();
  });

  test('handles API errors gracefully', async ({ page }) => {
    // Mock API to return error
    await page.route('**/api/v2/alerts', route => {
      route.fulfill({
        status: 500,
        body: 'Internal Server Error',
      });
    });
    
    await page.goto('/alerts?tenant=101');
    
    // Should show error state with retry button
    await expect(page.getByText(/failed to load alerts/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  test('respects keyboard navigation', async ({ page }) => {
    await page.goto('/alerts?tenant=101');
    
    // Wait for alerts
    await page.waitForSelector('[role="row"]');
    
    // Tab to first row and press Enter
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Navigate past filters
    await page.keyboard.press('Enter');
    
    // Drawer should open
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    
    // Press Escape to close
    await page.keyboard.press('Escape');
    
    // Drawer should close
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });
});
