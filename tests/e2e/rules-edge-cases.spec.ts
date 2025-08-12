import { test, expect } from '@playwright/test';

test.describe('Rules Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/rules?tenant=101');
  });

  test('rule create with missing required fields shows inline errors', async ({ page }) => {
    await page.getByRole('button', { name: /New/i }).click();
    
    // Try to save without filling required fields
    await page.getByRole('button', { name: /Save/i }).click();
    
    // Should show inline errors
    await expect(page.getByText('Rule name is required')).toBeVisible();
    await expect(page.getByText('DSL query is required')).toBeVisible();
    
    // Save button should remain disabled
    await expect(page.getByRole('button', { name: /Save/i })).toBeDisabled();
  });

  test('sigma with YAML indentation errors shows compile errors', async ({ page }) => {
    await page.getByRole('button', { name: /New/i }).click();
    
    // Switch to SIGMA
    await page.getByLabel('Type').click();
    await page.getByRole('option', { name: 'SIGMA' }).click();
    
    // Enter invalid YAML
    await page.getByLabel('SIGMA YAML *').fill(`title: Test
  logsource:
product: windows
    detection:
  selection:
    EventID: 4625`);
    
    // Click compile
    await page.getByRole('button', { name: 'Compile' }).click();
    
    // Should show error with line number
    await expect(page.getByText(/line \d+/)).toBeVisible();
    await expect(page.getByText('Compilation failed')).toBeVisible();
    
    // Save should be disabled
    await expect(page.getByRole('button', { name: /Save/i })).toBeDisabled();
  });

  test('dry-run with 0 results shows friendly empty state', async ({ page }) => {
    await page.getByText('Multiple Failed Login Attempts').click();
    await page.getByRole('tab', { name: 'Dry Run' }).click();
    
    // Mock empty response
    await page.route('**/api/v2/rules/*/dry-run', (route) => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ rows: 0, took_ms: 45, sample: [] })
      });
    });
    
    await page.getByRole('button', { name: /Run Test/i }).click();
    
    // Should show friendly message
    await expect(page.getByText('No events matched this rule')).toBeVisible();
    await expect(page.getByText('Try adjusting the query')).toBeVisible();
    
    // Should not show error state
    await expect(page.getByText('Error')).not.toBeVisible();
  });

  test('run-now while another run in progress shows locked state', async ({ page }) => {
    await page.getByText('Multiple Failed Login Attempts').click();
    
    // Mock 409 response
    await page.route('**/api/v2/rules/*/run-now', (route) => {
      route.fulfill({
        status: 409,
        body: JSON.stringify({
          error: {
            code: "CONFLICT_ERROR",
            message: "Rule execution is already in progress",
            timestamp: new Date().toISOString()
          }
        })
      });
    });
    
    await page.getByRole('button', { name: /Run Now/i }).click();
    await page.getByRole('button', { name: 'Run Now' }).last().click();
    
    // Should show in-progress message
    await expect(page.getByText('already in progress')).toBeVisible();
  });

  test('tenant switch while drawer open closes drawer', async ({ page }) => {
    // Select a rule
    await page.getByText('Multiple Failed Login Attempts').click();
    
    // Verify editor is open
    await expect(page.getByRole('heading', { name: 'Edit Rule' })).toBeVisible();
    
    // Switch tenant
    await page.getByRole('combobox').first().selectOption('102');
    
    // Editor should close
    await expect(page.getByRole('heading', { name: 'Edit Rule' })).not.toBeVisible();
    await expect(page.getByText('Select a rule to edit')).toBeVisible();
  });

  test('back button from deep link restores selection', async ({ page }) => {
    // Navigate to deep link
    await page.goto('/rules?tenant=101&q=failed#rule=rule_failed_logins&tab=compile');
    
    // Verify state
    await expect(page.getByPlaceholder('Search rules...')).toHaveValue('failed');
    await expect(page.getByRole('heading', { name: 'Edit Rule' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Compile' })).toHaveAttribute('data-state', 'active');
    
    // Navigate to another rule
    await page.getByText('Potential Data Exfiltration').click();
    
    // Go back
    await page.goBack();
    
    // Should restore previous selection
    await expect(page.getByText('Multiple Failed Login Attempts')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Compile' })).toHaveAttribute('data-state', 'active');
  });

  test('slow network shows loading skeletons without layout shift', async ({ page }) => {
    // Delay API response
    await page.route('**/api/v2/alert_rules*', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      route.continue();
    });
    
    // Navigate
    await page.goto('/rules?tenant=101');
    
    // Should show skeletons
    await expect(page.locator('.animate-pulse')).toBeVisible();
    
    // Measure container before and after load
    const containerBefore = await page.locator('.overflow-y-auto').first().boundingBox();
    
    // Wait for content
    await page.waitForSelector('text=Multiple Failed Login Attempts', { timeout: 5000 });
    
    const containerAfter = await page.locator('.overflow-y-auto').first().boundingBox();
    
    // Layout shift should be minimal (< 16px)
    if (containerBefore && containerAfter) {
      expect(Math.abs(containerBefore.y - containerAfter.y)).toBeLessThan(16);
    }
  });

  test('rate limited during list fetch shows banner and countdown', async ({ page }) => {
    // Mock 429 response
    await page.route('**/api/v2/alert_rules*', (route) => {
      route.fulfill({
        status: 429,
        headers: {
          'Retry-After': '60'
        },
        body: 'Rate limit exceeded'
      });
    });
    
    await page.goto('/rules?tenant=101');
    
    // Should show rate limit banner
    await expect(page.getByText('Rate limited. Retrying in')).toBeVisible();
    await expect(page.getByText(/\d+:\d{2}/)).toBeVisible(); // countdown timer
    
    // Should not show error state
    await expect(page.getByText('No rules found')).not.toBeVisible();
  });

  test('conflict on note add rolls back and refetches', async ({ page }) => {
    // This would be in alerts page, but showing pattern
    await page.goto('/alerts?tenant=101');
    
    // Select an alert
    await page.getByRole('row').first().click();
    
    // Mock 409 on note add
    await page.route('**/api/v2/alerts/*/notes', (route) => {
      route.fulfill({
        status: 409,
        body: JSON.stringify({
          error: {
            code: "CONFLICT_ERROR",
            message: "Alert was modified",
            timestamp: new Date().toISOString()
          }
        })
      });
    });
    
    // Try to add note
    await page.getByRole('tab', { name: 'Notes' }).click();
    await page.getByPlaceholder('Add a new note...').fill('Test note');
    await page.getByRole('button', { name: 'Add Note' }).click();
    
    // Note should not appear
    await expect(page.getByText('Test note')).not.toBeVisible();
    
    // Should show error state
    await expect(page.getByText('Failed to add note')).toBeVisible();
  });

  test('unsaved changes prompts before navigation', async ({ page }) => {
    await page.getByText('Multiple Failed Login Attempts').click();
    
    // Make a change
    await page.getByLabel('Name *').fill('Modified Rule Name');
    
    // Try to navigate away
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('unsaved changes');
      dialog.dismiss(); // Cancel navigation
    });
    
    await page.getByText('Potential Data Exfiltration').click();
    
    // Should still be on the same rule
    await expect(page.getByLabel('Name *')).toHaveValue('Modified Rule Name');
  });

  test('draft restore on rule open', async ({ page, context }) => {
    // Simulate existing draft in localStorage
    await context.addInitScript(() => {
      localStorage.setItem('rule-draft-rule_failed_logins', JSON.stringify({
        name: 'Draft Rule Name',
        description: 'Draft description',
        severity: 'CRITICAL'
      }));
    });
    
    await page.goto('/rules?tenant=101');
    
    // Handle dialog
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('Restore unsaved changes');
      dialog.accept(); // Restore draft
    });
    
    await page.getByText('Multiple Failed Login Attempts').click();
    
    // Should have draft values
    await expect(page.getByLabel('Name *')).toHaveValue('Draft Rule Name');
    await expect(page.getByLabel('Description')).toHaveValue('Draft description');
  });

  test('compile state validation before save', async ({ page }) => {
    await page.getByText('Multiple Failed Login Attempts').click();
    
    // Modify query
    await page.getByLabel('Query DSL *').fill('event_type:login AND modified:true');
    
    // Try to save without compiling
    await page.getByRole('button', { name: /Save/i }).click();
    
    // Should show alert
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('Please compile your changes');
      dialog.dismiss();
    });
    
    // Save should not proceed
    await expect(page.getByRole('button', { name: /Save/i })).toBeEnabled();
  });
});
