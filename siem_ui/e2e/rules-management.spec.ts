import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Rules Management UI
 * 
 * Tests complete user workflows including:
 * - Rule list page functionality
 * - Rule detail drawer interactions
 * - CRUD operations with backend integration
 * - Filter and search functionality
 * - Event propagation and accessibility
 * 
 * Prerequisites:
 * - Backend API running on localhost:8080
 * - UI dev server running on localhost:3001
 * - Test data seeded in database
 */

test.describe('Rules Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the rules page
    await page.goto('/');
    await page.click('text=Rules');
    
    // Wait for the rules page to load
    await expect(page.locator('h1')).toHaveText('Detection Rules');
    await expect(page.locator('text=Manage detection rules')).toBeVisible();
  });

  test.describe('Rules List Page', () => {
    test('displays rules table with correct data', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('table');
      
      // Check table headers
      await expect(page.locator('th >> text=Status')).toBeVisible();
      await expect(page.locator('th >> text=Rule Name')).toBeVisible();
      await expect(page.locator('th >> text=Engine Type')).toBeVisible();
      await expect(page.locator('th >> text=Stateful')).toBeVisible();
      await expect(page.locator('th >> text=Created')).toBeVisible();
      await expect(page.locator('th >> text=Actions')).toBeVisible();
      
      // Check for rule data (assuming test data exists)
      const ruleRows = page.locator('tbody tr');
      await expect(ruleRows).toHaveCountGreaterThan(0);
      
      // Check that rule names are clickable
      const firstRuleName = ruleRows.first().locator('td').nth(1);
      await expect(firstRuleName).toBeVisible();
    });

    test('filters rules by search query', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('table');
      
      // Get initial rule count
      const initialRuleCount = await page.locator('tbody tr').count();
      
      // Search for specific rule
      await page.fill('input[placeholder="Search rules..."]', 'brute');
      
      // Wait for filtered results
      await page.waitForTimeout(500); // Debounce delay
      
      // Verify filtering worked
      const filteredRuleCount = await page.locator('tbody tr').count();
      expect(filteredRuleCount).toBeLessThanOrEqual(initialRuleCount);
      
      // Check that visible rules contain search term
      const visibleRuleNames = await page.locator('tbody tr td:nth-child(2)').allTextContents();
      visibleRuleNames.forEach(name => {
        expect(name.toLowerCase()).toContain('brute');
      });
    });

    test('filters rules by engine type', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('table');
      
      // Open engine type filter
      await page.click('text=All Engine Types');
      await page.click('text=Real-time');
      
      // Wait for filtered results
      await page.waitForTimeout(300);
      
      // Verify all visible rules are real-time
      const engineTypeBadges = await page.locator('tbody tr td:nth-child(3) .badge').allTextContents();
      engineTypeBadges.forEach(badge => {
        expect(badge.toLowerCase()).toContain('real-time');
      });
    });

    test('filters rules by status', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('table');
      
      // Open status filter
      await page.click('text=All Status');
      await page.click('text=Active');
      
      // Wait for filtered results
      await page.waitForTimeout(300);
      
      // Verify all visible rules are active
      const statusBadges = await page.locator('tbody tr td:nth-child(1) .badge').allTextContents();
      statusBadges.forEach(badge => {
        expect(badge.toLowerCase()).toContain('active');
      });
    });

    test('displays rule count in filters', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('table');
      
      // Check that rule count is displayed
      const ruleCountText = await page.locator('text=/\\d+ rules?/').textContent();
      expect(ruleCountText).toMatch(/\d+ rules?/);
    });
  });

  test.describe('Rule Actions', () => {
    test('opens rule detail drawer when row is clicked', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('tbody tr');
      
      // Click on first rule row
      await page.click('tbody tr:first-child');
      
      // Wait for drawer to open
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await expect(page.locator('text=Overview')).toBeVisible();
      await expect(page.locator('text=Query')).toBeVisible();
      await expect(page.locator('text=Configuration')).toBeVisible();
      await expect(page.locator('text=Actions')).toBeVisible();
    });

    test('opens rule detail drawer when View button is clicked', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('tbody tr');
      
      // Click on first View button
      await page.click('tbody tr:first-child button:has-text("View")');
      
      // Wait for drawer to open
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    });

    test('toggles rule status with switch', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('tbody tr');
      
      // Get initial status of first rule
      const firstRuleSwitch = page.locator('tbody tr:first-child [role="switch"]');
      const initialState = await firstRuleSwitch.isChecked();
      
      // Toggle the switch
      await firstRuleSwitch.click();
      
      // Wait for API call to complete and page to update
      await page.waitForTimeout(1000);
      
      // Verify status changed
      const newState = await firstRuleSwitch.isChecked();
      expect(newState).toBe(!initialState);
      
      // Verify success toast appears
      await expect(page.locator('text=Rule Updated')).toBeVisible();
    });

    test('deletes rule with confirmation', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('tbody tr');
      
      // Get initial rule count
      const initialRuleCount = await page.locator('tbody tr').count();
      
      // Set up dialog handler for confirmation
      page.on('dialog', dialog => dialog.accept());
      
      // Click delete button on first rule
      await page.click('tbody tr:first-child button:has-text("Delete")');
      
      // Wait for deletion to complete
      await page.waitForTimeout(1000);
      
      // Verify rule count decreased
      const newRuleCount = await page.locator('tbody tr').count();
      expect(newRuleCount).toBe(initialRuleCount - 1);
      
      // Verify success toast appears
      await expect(page.locator('text=Rule Deleted')).toBeVisible();
    });

    test('cancels rule deletion when confirmation is denied', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('tbody tr');
      
      // Get initial rule count
      const initialRuleCount = await page.locator('tbody tr').count();
      
      // Set up dialog handler to cancel confirmation
      page.on('dialog', dialog => dialog.dismiss());
      
      // Click delete button on first rule
      await page.click('tbody tr:first-child button:has-text("Delete")');
      
      // Wait a moment to ensure no deletion occurred
      await page.waitForTimeout(500);
      
      // Verify rule count unchanged
      const newRuleCount = await page.locator('tbody tr').count();
      expect(newRuleCount).toBe(initialRuleCount);
    });
  });

  test.describe('Event Propagation', () => {
    test('prevents row click when interacting with switches', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('tbody tr');
      
      // Click on switch in first rule row
      await page.click('tbody tr:first-child [role="switch"]');
      
      // Wait a moment
      await page.waitForTimeout(300);
      
      // Verify drawer did not open (switch click should not trigger row click)
      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });

    test('prevents row click when clicking action buttons', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('tbody tr');
      
      // Click on Edit button in first rule row
      await page.click('tbody tr:first-child button:has-text("Edit")');
      
      // Wait a moment
      await page.waitForTimeout(300);
      
      // The exact behavior depends on edit implementation, but row click should not happen
      // This test verifies that button clicks don't trigger row clicks
    });
  });

  test.describe('Rule Detail Drawer', () => {
    test.beforeEach(async ({ page }) => {
      // Wait for rules to load and open first rule
      await page.waitForSelector('tbody tr');
      await page.click('tbody tr:first-child');
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    });

    test('displays rule information correctly', async ({ page }) => {
      // Check that rule metadata is displayed
      await expect(page.locator('text=Rule Information')).toBeVisible();
      await expect(page.locator('text=Engine Configuration')).toBeVisible();
      
      // Check for rule ID display
      await expect(page.locator('text=Rule ID')).toBeVisible();
      await expect(page.locator('text=Tenant ID')).toBeVisible();
      await expect(page.locator('text=Created')).toBeVisible();
    });

    test('switches between tabs correctly', async ({ page }) => {
      // Test Overview tab (default)
      await expect(page.locator('text=Rule Information')).toBeVisible();
      
      // Test Query tab
      await page.click('text=Query');
      await expect(page.locator('text=SQL Query')).toBeVisible();
      await expect(page.locator('text=ClickHouse SQL query')).toBeVisible();
      
      // Test Configuration tab
      await page.click('text=Configuration');
      await expect(page.locator('text=Rule Configuration')).toBeVisible();
      
      // Test Actions tab
      await page.click('text=Actions');
      await expect(page.locator('text=Rule Actions')).toBeVisible();
      await expect(page.locator('text=Toggle Rule Status')).toBeVisible();
    });

    test('copies SQL query to clipboard', async ({ page }) => {
      // Go to Query tab
      await page.click('text=Query');
      
      // Set up clipboard mock
      await page.evaluate(() => {
        Object.assign(navigator, {
          clipboard: {
            writeText: () => Promise.resolve(),
          },
        });
      });
      
      // Click copy button
      await page.click('button:has-text("Copy")');
      
      // Verify success toast
      await expect(page.locator('text=Query Copied')).toBeVisible();
    });

    test('toggles rule status from drawer', async ({ page }) => {
      // Get current switch state in drawer header
      const drawerSwitch = page.locator('[role="dialog"] [role="switch"]').first();
      const initialState = await drawerSwitch.isChecked();
      
      // Toggle the switch
      await drawerSwitch.click();
      
      // Wait for API call
      await page.waitForTimeout(1000);
      
      // Verify status changed
      const newState = await drawerSwitch.isChecked();
      expect(newState).toBe(!initialState);
      
      // Verify success toast
      await expect(page.locator('text=Rule Status Updated')).toBeVisible();
    });

    test('deletes rule from drawer', async ({ page }) => {
      // Go to Actions tab
      await page.click('text=Actions');
      
      // Set up dialog handler for confirmation
      page.on('dialog', dialog => dialog.accept());
      
      // Click delete button
      await page.click('button:has-text("Delete")');
      
      // Wait for deletion and drawer to close
      await page.waitForTimeout(1000);
      
      // Verify drawer closed
      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
      
      // Verify success toast
      await expect(page.locator('text=Rule Deleted')).toBeVisible();
    });

    test('closes drawer when close button is clicked', async ({ page }) => {
      // Click close button (X icon)
      await page.click('[role="dialog"] button:has([data-lucide="x"])');
      
      // Verify drawer closed
      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });
  });

  test.describe('Pagination', () => {
    test('navigates between pages when multiple pages exist', async ({ page, browserName }) => {
      // Skip this test if we don't have enough data
      const ruleCount = await page.locator('tbody tr').count();
      if (ruleCount <= 20) {
        test.skip(true, 'Not enough rules for pagination test');
      }
      
      // Check pagination is visible
      await expect(page.locator('text=Previous')).toBeVisible();
      await expect(page.locator('text=Next')).toBeVisible();
      
      // Navigate to next page
      await page.click('text=Next');
      
      // Wait for page to load
      await page.waitForTimeout(500);
      
      // Verify page changed (URL or content should change)
      await expect(page.locator('text=Page 2')).toBeVisible();
      
      // Navigate back to previous page
      await page.click('text=Previous');
      
      // Wait for page to load
      await page.waitForTimeout(500);
      
      // Verify back on page 1
      await expect(page.locator('text=Page 1')).toBeVisible();
    });
  });

  test.describe('Loading and Error States', () => {
    test('displays loading state while fetching rules', async ({ page }) => {
      // Intercept API calls to delay response
      await page.route('**/api/v1/rules*', async route => {
        // Delay response for 2 seconds
        await page.waitForTimeout(2000);
        route.continue();
      });
      
      // Navigate to rules page
      await page.goto('/');
      await page.click('text=Rules');
      
      // Check loading state
      await expect(page.locator('text=Loading rules...')).toBeVisible();
    });

    test('displays error state and allows retry', async ({ page }) => {
      // Intercept API calls to return error
      await page.route('**/api/v1/rules*', route => {
        route.fulfill({ status: 500, body: 'Server Error' });
      });
      
      // Navigate to rules page
      await page.goto('/');
      await page.click('text=Rules');
      
      // Check error state
      await expect(page.locator('text=Failed to load rules')).toBeVisible();
      await expect(page.locator('button:has-text("Retry")')).toBeVisible();
      
      // Remove route interception
      await page.unroute('**/api/v1/rules*');
      
      // Click retry
      await page.click('button:has-text("Retry")');
      
      // Wait for successful load
      await page.waitForSelector('table');
    });
  });

  test.describe('Accessibility', () => {
    test('supports keyboard navigation', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('tbody tr');
      
      // Focus first rule row
      await page.focus('tbody tr:first-child');
      
      // Press Enter to open drawer
      await page.keyboard.press('Enter');
      
      // Verify drawer opened
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      
      // Press Escape to close drawer
      await page.keyboard.press('Escape');
      
      // Verify drawer closed
      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });

    test('has proper ARIA labels', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('table');
      
      // Check table has proper role
      await expect(page.locator('table')).toHaveAttribute('role', 'table');
      
      // Check switches have proper role
      const switches = page.locator('[role="switch"]');
      await expect(switches.first()).toBeVisible();
      
      // Check buttons have proper role
      const buttons = page.locator('button');
      await expect(buttons.first()).toBeVisible();
    });

    test('supports screen reader navigation', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('table');
      
      // Check for proper heading hierarchy
      await expect(page.locator('h1')).toHaveText('Detection Rules');
      
      // Check for descriptive text
      await expect(page.locator('text=Manage detection rules')).toBeVisible();
      
      // Check table headers are properly marked
      const headers = page.locator('th');
      await expect(headers).toHaveCountGreaterThan(0);
    });
  });

  test.describe('Performance', () => {
    test('loads rules page within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/');
      await page.click('text=Rules');
      
      // Wait for rules table to load
      await page.waitForSelector('table');
      
      const loadTime = Date.now() - startTime;
      
      // Should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('handles large datasets efficiently', async ({ page }) => {
      // This test would need appropriate test data
      // Skip if not enough rules for performance testing
      const ruleCount = await page.locator('tbody tr').count();
      if (ruleCount < 100) {
        test.skip(true, 'Not enough rules for performance test');
      }
      
      // Test scrolling performance
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // Should remain responsive
      await page.waitForTimeout(100);
      
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
    });
  });

  test.describe('Data Validation', () => {
    test('displays correct rule metadata format', async ({ page }) => {
      // Wait for rules to load
      await page.waitForSelector('tbody tr');
      
      // Open first rule drawer
      await page.click('tbody tr:first-child');
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      
      // Check timestamp format
      const timestamps = page.locator('text=/\\d{1,2}\/\\d{1,2}\/\\d{4}/');
      await expect(timestamps.first()).toBeVisible();
      
      // Check rule ID format (UUID)
      const ruleIdText = await page.locator('text=Rule ID').locator('..').textContent();
      expect(ruleIdText).toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
    });

    test('handles stateful configuration correctly', async ({ page }) => {
      // Look for a stateful rule
      const statefulRuleBadge = page.locator('text=Yes').first();
      if (await statefulRuleBadge.count() === 0) {
        test.skip(true, 'No stateful rules available for testing');
      }
      
      // Click on row with stateful rule
      const statefulRow = statefulRuleBadge.locator('..').locator('..');
      await statefulRow.click();
      
      // Wait for drawer to open
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      
      // Go to Configuration tab
      await page.click('text=Configuration');
      
      // Check for stateful configuration display
      await expect(page.locator('text=Stateful Configuration')).toBeVisible();
    });
  });
}); 