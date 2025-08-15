import { test, expect } from '@playwright/test';

test.describe('Search Workspace', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.goto(`${baseURL || 'http://127.0.0.1:5173/ui/app'}/search`);
  });

  test('requires tenant selection before search', async ({ page }) => {
    // Check that search is disabled without tenant
    const runButton = page.getByRole('button', { name: 'Run Search' });
    await expect(runButton).toBeDisabled();
    
    // Check helper message
    await expect(page.getByText('Choose a tenant from the top bar')).toBeVisible();
  });

  test('enables search after tenant selection', async ({ page }) => {
    // Select a tenant
    await page.selectOption('select:has-text("Tenant")', '101');
    
    // Check that search is now enabled
    const runButton = page.getByRole('button', { name: 'Run Search' });
    await expect(runButton).toBeEnabled();
  });

  test('updates URL with search parameters', async ({ page }) => {
    // Select tenant
    await page.selectOption('select:has-text("Tenant")', '101');
    
    // Select time range
    await page.selectOption('select:has-text("Last")', '24h');
    
    // Enter search query
    const queryInput = page.getByPlaceholder('Enter your search query');
    await queryInput.fill('user:alice');
    
    // Check URL contains parameters
    await expect(page).toHaveURL(/tenant=101/);
    await expect(page).toHaveURL(/range=24h/);
    await expect(page).toHaveURL(/q=user%3Aalice/);
  });

  test('shows compile drawer with SQL preview', async ({ page }) => {
    // Select tenant and enter query
    await page.selectOption('select:has-text("Tenant")', '101');
    await page.getByPlaceholder('Enter your search query').fill('failed login');
    
    // Click compile
    await page.getByRole('button', { name: 'Compile' }).click();
    
    // Check SQL preview drawer appears
    await expect(page.getByText('SQL Preview')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  test('executes search and shows results', async ({ page }) => {
    // Mock the search API
    await page.route('**/api/v2/search/execute', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          meta: { took_ms: 123, row_count: 2 },
          data: [
            {
              event_timestamp: '2024-01-01T12:00:00Z',
              source: 'auth-service',
              message: 'Failed login attempt',
              user: 'alice',
              src_ip: '192.168.1.100'
            },
            {
              event_timestamp: '2024-01-01T12:01:00Z',
              source: 'auth-service',
              message: 'Failed login attempt',
              user: 'alice',
              src_ip: '192.168.1.100'
            }
          ]
        })
      });
    });

    // Select tenant and run search
    await page.selectOption('select:has-text("Tenant")', '101');
    await page.getByRole('button', { name: 'Run Search' }).click();
    
    // Check results appear
    await expect(page.getByText('2 results')).toBeVisible();
    await expect(page.getByText('123ms')).toBeVisible();
    await expect(page.getByText('Failed login attempt')).toBeVisible();
  });

  test('facet click updates query and re-runs search', async ({ page }) => {
    // Mock search and facets APIs
    await page.route('**/api/v2/search/execute', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          meta: { took_ms: 100, row_count: 10 },
          data: Array(10).fill(null).map((_, i) => ({
            event_timestamp: new Date().toISOString(),
            source: 'test-source',
            message: `Event ${i}`,
            user: i % 2 === 0 ? 'alice' : 'bob'
          }))
        })
      });
    });

    await page.route('**/api/v2/search/facets', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: [
            { value: 'alice', count: 5 },
            { value: 'bob', count: 5 }
          ]
        })
      });
    });

    // Run initial search
    await page.selectOption('select:has-text("Tenant")', '101');
    await page.getByRole('button', { name: 'Run Search' }).click();
    
    // Wait for facets to load
    await expect(page.getByText('Users')).toBeVisible();
    
    // Click on alice facet
    await page.getByRole('button', { name: 'alice 5' }).click();
    
    // Check query was updated
    const queryInput = page.getByPlaceholder('Enter your search query');
    await expect(queryInput).toHaveValue('user:"alice"');
  });

  test('column chooser updates visible columns', async ({ page }) => {
    // Mock search API with results
    await page.route('**/api/v2/search/execute', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          meta: { took_ms: 50, row_count: 1 },
          data: [{
            event_timestamp: new Date().toISOString(),
            source: 'test',
            message: 'Test event',
            user: 'alice',
            src_ip: '192.168.1.1',
            dst_ip: '10.0.0.1',
            host: 'server-1',
            severity: 'high'
          }]
        })
      });
    });

    // Run search
    await page.selectOption('select:has-text("Tenant")', '101');
    await page.getByRole('button', { name: 'Run Search' }).click();
    
    // Open column chooser
    await page.getByRole('button', { name: 'Columns' }).click();
    
    // Check severity column checkbox
    await page.getByLabel('severity').check();
    
    // Verify severity column header appears
    await expect(page.getByText('SEVERITY')).toBeVisible();
  });

  test('handles search errors gracefully', async ({ page }) => {
    // Mock error response
    await page.route('**/api/v2/search/execute', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Invalid query syntax'
        })
      });
    });

    // Try to run search
    await page.selectOption('select:has-text("Tenant")', '101');
    await page.getByRole('button', { name: 'Run Search' }).click();
    
    // Check error state appears
    await expect(page.getByText('Search Error')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
  });

  test('shows loading state during search', async ({ page }) => {
    // Mock slow search
    await page.route('**/api/v2/search/execute', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          meta: { took_ms: 1000, row_count: 0 },
          data: []
        })
      });
    });

    // Start search
    await page.selectOption('select:has-text("Tenant")', '101');
    const runButton = page.getByRole('button', { name: 'Run Search' });
    await runButton.click();
    
    // Check button shows loading state
    await expect(runButton).toBeDisabled();
  });
});