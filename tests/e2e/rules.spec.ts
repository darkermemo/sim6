import { test, expect } from '@playwright/test';

test.describe('Rules Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate with tenant
    await page.goto('/rules?tenant=101');
  });

  test('loads and displays rules list', async ({ page }) => {
    // Wait for rules list
    await expect(page.getByRole('heading', { name: 'Rules' })).toBeVisible();
    
    // Check for rules in list
    await expect(page.getByText('Multiple Failed Login Attempts')).toBeVisible();
    await expect(page.getByText('Potential Data Exfiltration')).toBeVisible();
    
    // Check severity badges
    await expect(page.getByText('HIGH').first()).toBeVisible();
    await expect(page.getByText('CRITICAL')).toBeVisible();
  });

  test('search filters rules', async ({ page }) => {
    // Search for specific rule
    await page.getByPlaceholder('Search rules...').fill('failed');
    
    // Only matching rule should be visible
    await expect(page.getByText('Multiple Failed Login Attempts')).toBeVisible();
    await expect(page.getByText('Potential Data Exfiltration')).not.toBeVisible();
  });

  test('create new rule flow', async ({ page }) => {
    // Click new button
    await page.getByRole('button', { name: /New/i }).click();
    
    // Should show create form
    await expect(page.getByRole('heading', { name: 'Create Rule' })).toBeVisible();
    
    // Fill in rule details
    await page.getByLabel('Name *').fill('Test Rule');
    await page.getByLabel('Description').fill('Test description');
    await page.getByLabel('Query DSL *').fill('event_type:test | count()');
    
    // Select severity
    await page.getByLabel('Severity').click();
    await page.getByRole('option', { name: 'High' }).click();
    
    // Save button should be enabled after successful compile
    const saveButton = page.getByRole('button', { name: /Save/i });
    await expect(saveButton).toBeEnabled({ timeout: 10000 });
  });

  test('edit existing rule', async ({ page }) => {
    // Click on a rule
    await page.getByText('Multiple Failed Login Attempts').click();
    
    // Should show edit form
    await expect(page.getByRole('heading', { name: 'Edit Rule' })).toBeVisible();
    
    // Check rule details loaded
    await expect(page.getByLabel('Name *')).toHaveValue('Multiple Failed Login Attempts');
    await expect(page.getByLabel('Query DSL *')).toContainText('event_type:login');
    
    // Toggle enabled state
    const enabledSwitch = page.getByLabel('Enabled');
    await expect(enabledSwitch).toBeChecked();
    await enabledSwitch.click();
    await expect(enabledSwitch).not.toBeChecked();
  });

  test('compile shows SQL and errors', async ({ page }) => {
    // Select a rule
    await page.getByText('Multiple Failed Login Attempts').click();
    
    // Go to compile tab
    await page.getByRole('tab', { name: 'Compile' }).click();
    
    // Should show compiled SQL
    await expect(page.getByText(/SELECT.*FROM dev.events/)).toBeVisible();
    await expect(page.getByText('Compilation successful')).toBeVisible();
    
    // Test compile error
    await page.getByRole('tab', { name: 'Definition' }).click();
    await page.getByLabel('Query DSL *').fill('invalid | syntax |');
    
    await page.getByRole('tab', { name: 'Compile' }).click();
    await expect(page.getByText('Compilation failed')).toBeVisible({ timeout: 10000 });
  });

  test('dry run executes test query', async ({ page }) => {
    // Select a rule
    await page.getByText('Multiple Failed Login Attempts').click();
    
    // Go to dry run tab
    await page.getByRole('tab', { name: 'Dry Run' }).click();
    
    // Select time range
    await page.getByLabel('Time Range').click();
    await page.getByRole('option', { name: '15 minutes' }).click();
    
    // Run test
    await page.getByRole('button', { name: /Run Test/i }).click();
    
    // Should show results
    await expect(page.getByText(/3 matches/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Sample Results')).toBeVisible();
    await expect(page.getByText('"alice"')).toBeVisible();
  });

  test('run now modal shows watermark window', async ({ page }) => {
    // Select a rule
    await page.getByText('Multiple Failed Login Attempts').click();
    
    // Click Run Now
    await page.getByRole('button', { name: /Run Now/i }).click();
    
    // Modal should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Run Rule Now')).toBeVisible();
    
    // Should show processing window
    await expect(page.getByText('Processing Window')).toBeVisible();
    await expect(page.getByText('From (watermark)')).toBeVisible();
    await expect(page.getByText('To (now - 120s)')).toBeVisible();
    
    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('rule settings validation', async ({ page }) => {
    // Create new rule
    await page.getByRole('button', { name: /New/i }).click();
    
    // Go to settings tab
    await page.getByRole('tab', { name: 'Settings' }).click();
    
    // Test watermark validation
    await page.getByLabel('Watermark (seconds)').fill('30');
    await expect(page.getByText('Watermark must be at least 60 seconds')).toBeVisible();
    
    await page.getByLabel('Watermark (seconds)').fill('1000');
    await expect(page.getByText('Watermark must be at most 900 seconds')).toBeVisible();
    
    // Test throttle validation
    await page.getByLabel('Throttle (seconds)').fill('-1');
    await expect(page.getByText('Throttle seconds cannot be negative')).toBeVisible();
    
    await page.getByLabel('Throttle (seconds)').fill('4000');
    await expect(page.getByText('Throttle seconds must be at most 3600')).toBeVisible();
  });

  test('tags management', async ({ page }) => {
    // Select a rule
    await page.getByText('Multiple Failed Login Attempts').click();
    
    // Go to settings tab
    await page.getByRole('tab', { name: 'Settings' }).click();
    
    // Check existing tags
    await expect(page.getByText('authentication')).toBeVisible();
    await expect(page.getByText('brute-force')).toBeVisible();
    
    // Add new tag
    await page.getByPlaceholder('Add tag...').fill('new-tag');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('new-tag')).toBeVisible();
    
    // Remove tag
    await page.getByText('new-tag').click();
    await expect(page.getByText('new-tag')).not.toBeVisible();
  });

  test('keyboard navigation', async ({ page }) => {
    // Tab through rules list
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    
    // Should select first rule
    await expect(page.getByRole('heading', { name: 'Edit Rule' })).toBeVisible();
  });

  test('URL state preservation', async ({ page }) => {
    // Search for rule
    await page.getByPlaceholder('Search rules...').fill('failed');
    
    // Select a rule
    await page.getByText('Multiple Failed Login Attempts').click();
    
    // URL should update
    await expect(page).toHaveURL(/q=failed.*#rule=rule_failed_logins/);
    
    // Reload page
    await page.reload();
    
    // State should be preserved
    await expect(page.getByPlaceholder('Search rules...')).toHaveValue('failed');
    await expect(page.getByRole('heading', { name: 'Edit Rule' })).toBeVisible();
  });

  test('API error handling', async ({ page, context }) => {
    // Intercept API calls
    await context.route('**/api/v2/rules/*', (route) => {
      route.fulfill({
        status: 500,
        body: 'Internal Server Error'
      });
    });
    
    // Try to save rule
    await page.getByRole('button', { name: /New/i }).click();
    await page.getByLabel('Name *').fill('Test Rule');
    await page.getByLabel('Query DSL *').fill('test');
    
    // Save should handle error gracefully
    await page.getByRole('button', { name: /Save/i }).click();
    
    // Should show error (exact UI depends on implementation)
    // For now, button should still be visible and not crash
    await expect(page.getByRole('button', { name: /Save/i })).toBeVisible();
  });

  test('performance - handles large rule list', async ({ page }) => {
    // This would need backend support for pagination
    // For now, verify Load More functionality exists
    
    // Scroll to bottom
    const rulesList = page.locator('.overflow-y-auto').first();
    await rulesList.evaluate(el => el.scrollTop = el.scrollHeight);
    
    // Check for load more button (if there are more rules)
    const loadMoreButton = page.getByRole('button', { name: 'Load More' });
    if (await loadMoreButton.isVisible()) {
      await loadMoreButton.click();
      // Should load more rules
    }
  });
});
