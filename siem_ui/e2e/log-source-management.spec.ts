import { test, expect } from '@playwright/test';

test.describe('Log Source Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application and ensure we're authenticated
    await page.goto('/');
    
    // Wait for authentication to complete
    await page.waitForSelector('[data-testid="authenticated-indicator"]', { timeout: 10000 });
    
    // Navigate to Log Sources tab
    await page.click('button:has-text("Log Sources")');
    await page.waitForURL(/.*log-sources.*/);
  });

  test.describe('Page Loading and Navigation', () => {
    test('loads log source management page successfully', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Log Source Management');
      await expect(page.locator('text=Configure and manage SIEM log source ingestion points')).toBeVisible();
    });

    test('displays navigation tabs correctly', async ({ page }) => {
      await expect(page.locator('button:has-text("Dashboard")')).toBeVisible();
      await expect(page.locator('button:has-text("Rules")')).toBeVisible();
      await expect(page.locator('button:has-text("Log Sources")')).toBeVisible();
      
      // Verify current tab is highlighted
      await expect(page.locator('button:has-text("Log Sources")')).toHaveClass(/bg-blue-100/);
    });

    test('displays main interface elements', async ({ page }) => {
      // Header elements
      await expect(page.locator('button:has-text("Add Log Source")')).toBeVisible();
      
      // Search and filters
      await expect(page.locator('input[placeholder*="Search by name or IP"]')).toBeVisible();
      await expect(page.locator('select')).toBeVisible();
      
      // Table headers
      await expect(page.locator('th:has-text("Source")')).toBeVisible();
      await expect(page.locator('th:has-text("Type")')).toBeVisible();
      await expect(page.locator('th:has-text("IP Address")')).toBeVisible();
      await expect(page.locator('th:has-text("Created")')).toBeVisible();
      await expect(page.locator('th:has-text("Actions")')).toBeVisible();
    });
  });

  test.describe('Log Source Creation', () => {
    test('creates a new log source successfully', async ({ page }) => {
      // Click Add Log Source button
      await page.click('button:has-text("Add Log Source")');
      
      // Wait for drawer to open
      await expect(page.locator('[data-testid="sheet"]')).toBeVisible();
      await expect(page.locator('h2:has-text("Add New Log Source")')).toBeVisible();
      
      // Fill out the form
      await page.fill('input[id="source_name"]', 'Test Web Server');
      await page.selectOption('select', 'Apache');
      await page.fill('input[id="source_ip"]', '192.168.1.100');
      
      // Verify form validation feedback
      await expect(page.locator('[data-testid="source-type-badge"]')).toContainText('Apache');
      
      // Submit the form
      await page.click('button:has-text("Create Log Source")');
      
      // Wait for success toast (if implemented)
      await expect(page.locator('.toast, [data-testid="toast"]')).toContainText('Log Source Created');
      
      // Verify the drawer closes
      await expect(page.locator('[data-testid="sheet"]')).not.toBeVisible();
      
      // Verify the new log source appears in the table
      await expect(page.locator('table tr:has-text("Test Web Server")')).toBeVisible();
      await expect(page.locator('table tr:has-text("192.168.1.100")')).toBeVisible();
    });

    test('validates form fields correctly', async ({ page }) => {
      await page.click('button:has-text("Add Log Source")');
      await expect(page.locator('[data-testid="sheet"]')).toBeVisible();
      
      // Try to submit empty form
      await page.click('button:has-text("Create Log Source")');
      
      // Check for validation errors
      await expect(page.locator('text=Source name is required')).toBeVisible();
      await expect(page.locator('text=IP address is required')).toBeVisible();
      
      // Test source name validation
      await page.fill('input[id="source_name"]', 'ab'); // Too short
      await page.click('button:has-text("Create Log Source")');
      await expect(page.locator('text=Source name must be at least 3 characters')).toBeVisible();
      
      // Test IP validation
      await page.fill('input[id="source_name"]', 'Valid Server Name');
      await page.fill('input[id="source_ip"]', '192.168.1'); // Invalid IP
      await page.click('button:has-text("Create Log Source")');
      await expect(page.locator('text=Please enter a valid IP address')).toBeVisible();
      
      // Fix validation errors
      await page.fill('input[id="source_ip"]', '192.168.1.100');
      
      // Form should now be valid
      await expect(page.locator('button:has-text("Create Log Source")')).not.toBeDisabled();
    });

    test('handles different source types correctly', async ({ page }) => {
      await page.click('button:has-text("Add Log Source")');
      
      const sourceTypes = ['Syslog', 'JSON', 'Windows', 'Apache', 'Nginx'];
      
      for (const sourceType of sourceTypes) {
        await page.selectOption('select', sourceType);
        
        // Verify badge updates
        await expect(page.locator('[data-testid="source-type-badge"]')).toContainText(sourceType);
        
        // Verify it's a valid option
        await expect(page.locator(`select option[value="${sourceType}"]`)).toBeVisible();
      }
    });

    test('cancels form creation', async ({ page }) => {
      await page.click('button:has-text("Add Log Source")');
      await expect(page.locator('[data-testid="sheet"]')).toBeVisible();
      
      // Fill some data
      await page.fill('input[id="source_name"]', 'Test Server');
      
      // Cancel
      await page.click('button:has-text("Cancel")');
      
      // Verify drawer closes without saving
      await expect(page.locator('[data-testid="sheet"]')).not.toBeVisible();
      await expect(page.locator('table tr:has-text("Test Server")')).not.toBeVisible();
    });
  });

  test.describe('Log Source Management', () => {
    test.beforeEach(async ({ page }) => {
      // Create a test log source for management tests
      await page.click('button:has-text("Add Log Source")');
      await page.fill('input[id="source_name"]', 'Management Test Server');
      await page.selectOption('select', 'Syslog');
      await page.fill('input[id="source_ip"]', '192.168.1.200');
      await page.click('button:has-text("Create Log Source")');
      
      // Wait for creation to complete
      await page.waitForSelector('table tr:has-text("Management Test Server")');
    });

    test('views log source details', async ({ page }) => {
      // Click on the log source row
      await page.click('table tr:has-text("Management Test Server")');
      
      // Verify detail drawer opens in view mode
      await expect(page.locator('[data-testid="sheet"]')).toBeVisible();
      await expect(page.locator('h2:has-text("Log Source Details")')).toBeVisible();
      
      // Verify form is populated and disabled
      await expect(page.locator('input[id="source_name"]')).toHaveValue('Management Test Server');
      await expect(page.locator('input[id="source_name"]')).toBeDisabled();
      await expect(page.locator('input[id="source_ip"]')).toHaveValue('192.168.1.200');
      await expect(page.locator('input[id="source_ip"]')).toBeDisabled();
      
      // Verify additional info is displayed
      await expect(page.locator('text=Configuration Active')).toBeVisible();
      await expect(page.locator('text=Source ID:')).toBeVisible();
      
      // Close with close button
      await page.click('button:has-text("Close")');
      await expect(page.locator('[data-testid="sheet"]')).not.toBeVisible();
    });

    test('deletes log source with confirmation', async ({ page }) => {
      // Find and click delete button for the test server
      const serverRow = page.locator('table tr:has-text("Management Test Server")');
      await serverRow.locator('button[data-testid="delete-button"], button:has([data-testid="trash-icon"])').click();
      
      // Handle confirmation dialog
      page.on('dialog', async dialog => {
        expect(dialog.message()).toContain('Management Test Server');
        expect(dialog.message()).toContain('This action cannot be undone');
        await dialog.accept();
      });
      
      // Wait for deletion to complete
      await page.waitForSelector('table tr:has-text("Management Test Server")', { state: 'detached' });
      
      // Verify success toast
      await expect(page.locator('.toast, [data-testid="toast"]')).toContainText('Log Source Deleted');
    });

    test('cancels deletion when confirmation is declined', async ({ page }) => {
      const serverRow = page.locator('table tr:has-text("Management Test Server")');
      await serverRow.locator('button[data-testid="delete-button"], button:has([data-testid="trash-icon"])').click();
      
      // Decline confirmation
      page.on('dialog', async dialog => {
        await dialog.dismiss();
      });
      
      // Verify the log source still exists
      await expect(page.locator('table tr:has-text("Management Test Server")')).toBeVisible();
    });
  });

  test.describe('Search and Filtering', () => {
    test.beforeEach(async ({ page }) => {
      // Create multiple test log sources for filtering tests
      const testSources = [
        { name: 'Web Server 1', type: 'Apache', ip: '192.168.1.10' },
        { name: 'Database Server', type: 'JSON', ip: '192.168.1.20' },
        { name: 'File Server', type: 'Windows', ip: '192.168.1.30' },
        { name: 'Web Server 2', type: 'Nginx', ip: '192.168.1.40' },
      ];

      for (const source of testSources) {
        await page.click('button:has-text("Add Log Source")');
        await page.fill('input[id="source_name"]', source.name);
        await page.selectOption('select', source.type);
        await page.fill('input[id="source_ip"]', source.ip);
        await page.click('button:has-text("Create Log Source")');
        await page.waitForSelector(`table tr:has-text("${source.name}")`);
      }
    });

    test('searches log sources by name', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="Search by name or IP"]');
      
      // Search for "Web"
      await searchInput.fill('Web');
      
      // Should show both web servers
      await expect(page.locator('table tr:has-text("Web Server 1")')).toBeVisible();
      await expect(page.locator('table tr:has-text("Web Server 2")')).toBeVisible();
      
      // Should not show other servers
      await expect(page.locator('table tr:has-text("Database Server")')).not.toBeVisible();
      await expect(page.locator('table tr:has-text("File Server")')).not.toBeVisible();
      
      // Verify results count updates
      await expect(page.locator('text=2 of 4 sources')).toBeVisible();
    });

    test('searches log sources by IP address', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="Search by name or IP"]');
      
      // Search for specific IP
      await searchInput.fill('192.168.1.20');
      
      // Should show only the database server
      await expect(page.locator('table tr:has-text("Database Server")')).toBeVisible();
      await expect(page.locator('table tr:has-text("Web Server 1")')).not.toBeVisible();
      
      await expect(page.locator('text=1 of 4 sources')).toBeVisible();
    });

    test('filters log sources by type', async ({ page }) => {
      const typeFilter = page.locator('select').first();
      
      // Filter by Apache
      await typeFilter.selectOption('Apache');
      
      // Should show only Apache servers
      await expect(page.locator('table tr:has-text("Web Server 1")')).toBeVisible();
      await expect(page.locator('table tr:has-text("Database Server")')).not.toBeVisible();
      await expect(page.locator('table tr:has-text("File Server")')).not.toBeVisible();
      await expect(page.locator('table tr:has-text("Web Server 2")')).not.toBeVisible();
      
      // Reset filter
      await typeFilter.selectOption('all');
      
      // Should show all sources again
      await expect(page.locator('table tr:has-text("Web Server 1")')).toBeVisible();
      await expect(page.locator('table tr:has-text("Database Server")')).toBeVisible();
    });

    test('combines search and filter', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="Search by name or IP"]');
      const typeFilter = page.locator('select').first();
      
      // Search for "Server" and filter by Windows
      await searchInput.fill('Server');
      await typeFilter.selectOption('Windows');
      
      // Should show only File Server
      await expect(page.locator('table tr:has-text("File Server")')).toBeVisible();
      await expect(page.locator('table tr:has-text("Database Server")')).not.toBeVisible();
      await expect(page.locator('table tr:has-text("Web Server 1")')).not.toBeVisible();
      
      await expect(page.locator('text=1 of 4 sources')).toBeVisible();
    });

    test('shows empty state for no search results', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="Search by name or IP"]');
      
      // Search for something that doesn't exist
      await searchInput.fill('NonexistentServer');
      
      // Should show empty state message
      await expect(page.locator('text=No log sources match your current filters')).toBeVisible();
      await expect(page.locator('text=0 of 4 sources')).toBeVisible();
    });

    test('clears search and shows all results', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="Search by name or IP"]');
      
      // Search for something specific
      await searchInput.fill('Database');
      await expect(page.locator('text=1 of 4 sources')).toBeVisible();
      
      // Clear search
      await searchInput.fill('');
      
      // Should show all sources again
      await expect(page.locator('text=4 of 4 sources')).toBeVisible();
      await expect(page.locator('table tr:has-text("Web Server 1")')).toBeVisible();
      await expect(page.locator('table tr:has-text("Database Server")')).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('handles network errors gracefully', async ({ page }) => {
      // Simulate network failure by blocking requests
      await page.route('**/api/v1/log_sources', route => route.abort());
      
      // Reload page to trigger API call
      await page.reload();
      
      // Should show error state
      await expect(page.locator('text=Error Loading Log Sources')).toBeVisible();
      await expect(page.locator('button:has-text("Retry")')).toBeVisible();
      
      // Unblock requests
      await page.unroute('**/api/v1/log_sources');
      
      // Retry should work
      await page.click('button:has-text("Retry")');
      await expect(page.locator('h1:has-text("Log Source Management")')).toBeVisible();
    });

    test('handles permission errors', async ({ page }) => {
      // Simulate 403 permission error
      await page.route('**/api/v1/log_sources', route => 
        route.fulfill({ status: 403, body: JSON.stringify({ error: 'Forbidden' }) })
      );
      
      await page.reload();
      
      // Should show permission error
      await expect(page.locator('text=You need Admin privileges to manage log sources')).toBeVisible();
    });

    test('handles creation errors', async ({ page }) => {
      // Simulate server error for creation
      await page.route('**/api/v1/log_sources', route => {
        if (route.request().method() === 'POST') {
          route.fulfill({ 
            status: 409, 
            body: JSON.stringify({ error: 'A log source with this IP address already exists' })
          });
        } else {
          route.continue();
        }
      });
      
      // Try to create a log source
      await page.click('button:has-text("Add Log Source")');
      await page.fill('input[id="source_name"]', 'Duplicate Server');
      await page.fill('input[id="source_ip"]', '192.168.1.100');
      await page.click('button:has-text("Create Log Source")');
      
      // Should show error toast
      await expect(page.locator('.toast, [data-testid="toast"]')).toContainText('Error Creating Log Source');
    });
  });

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Main elements should still be visible
      await expect(page.locator('h1:has-text("Log Source Management")')).toBeVisible();
      await expect(page.locator('button:has-text("Add Log Source")')).toBeVisible();
      
      // Mobile filter toggle should be visible
      await expect(page.locator('button[data-testid="mobile-filter-toggle"]')).toBeVisible();
      
      // Table should be horizontally scrollable
      await expect(page.locator('table')).toBeVisible();
    });

    test('mobile filters work correctly', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Open mobile filters
      await page.click('button[data-testid="mobile-filter-toggle"]');
      
      // Filter sheet should open
      await expect(page.locator('[data-testid="filter-sheet"]')).toBeVisible();
      
      // Should contain filter controls
      await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
      await expect(page.locator('select')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('has proper keyboard navigation', async ({ page }) => {
      // Tab through main elements
      await page.keyboard.press('Tab'); // Add button
      await expect(page.locator('button:has-text("Add Log Source")')).toBeFocused();
      
      await page.keyboard.press('Tab'); // Search input
      await expect(page.locator('input[placeholder*="Search"]')).toBeFocused();
      
      await page.keyboard.press('Tab'); // Type filter
      await expect(page.locator('select')).toBeFocused();
    });

    test('has proper ARIA labels and roles', async ({ page }) => {
      // Check for main landmark roles
      await expect(page.locator('table')).toHaveAttribute('role', 'table');
      await expect(page.locator('button:has-text("Add Log Source")')).toHaveAttribute('type', 'button');
      
      // Check search has proper label
      const searchInput = page.locator('input[placeholder*="Search"]');
      await expect(searchInput).toHaveAttribute('aria-label', /search/i);
    });

    test('supports screen reader announcements', async ({ page }) => {
      // Create a log source to test announcements
      await page.click('button:has-text("Add Log Source")');
      await page.fill('input[id="source_name"]', 'Accessibility Test');
      await page.fill('input[id="source_ip"]', '192.168.1.250');
      await page.click('button:has-text("Create Log Source")');
      
      // Verify success message is announced
      await expect(page.locator('[role="status"], [aria-live="polite"]')).toContainText('Log Source Created');
    });
  });
}); 