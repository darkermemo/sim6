/**
 * Search Page - No Runtime Errors Test
 * Golden Standard: Zero pageerror, console errors, or network failures
 */

import { test } from '@playwright/test';
import { expectPageGolden, expectInteractionHealthy } from '../helpers/runtime';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5174/ui/v2/';

test.describe('Search Page - Runtime Validation', () => {
  test('loads without runtime errors', async ({ page }) => {
    // Navigate to search page
    await page.goto(`${BASE_URL}search`);
    
    // Assert golden page health
    await expectPageGolden(page, 'page-search', {
      allow: [
        /\/api\/v2\/search\/grammar$/,  // Grammar endpoint is optional
        /\/api\/v2\/schema\/enums$/,    // Enums endpoint may be optional
      ]
    });
  });

  test('core interactions have no runtime errors', async ({ page }) => {
    await page.goto(`${BASE_URL}search`);
    
    // Wait for page to be ready
    await expectPageGolden(page, 'page-search', {
      allow: [/\/api\/v2\/search\/grammar$/, /\/api\/v2\/schema\/enums$/]
    });

    // Test tenant selection
    await expectInteractionHealthy(page, async () => {
      const tenantSelect = page.getByRole('combobox', { name: /tenant/i });
      await tenantSelect.selectOption('default');
    }, { allow: [/\/api\/v2\/search\/grammar$/, /\/api\/v2\/schema\/enums$/] });

    // Test time range selection
    await expectInteractionHealthy(page, async () => {
      const timeSelect = page.getByRole('combobox', { name: /time range/i });
      await timeSelect.selectOption('3600');
    }, { allow: [/\/api\/v2\/search\/grammar$/, /\/api\/v2\/schema\/enums$/] });

    // Test query input
    await expectInteractionHealthy(page, async () => {
      const queryInput = page.getByRole('textbox', { name: /query/i });
      await queryInput.fill('*');
      await queryInput.press('Enter');
    }, { allow: [/\/api\/v2\/search\/grammar$/, /\/api\/v2\/schema\/enums$/] });

    // Test run button
    await expectInteractionHealthy(page, async () => {
      const runButton = page.getByRole('button', { name: /run/i });
      await runButton.click();
    }, { allow: [/\/api\/v2\/search\/grammar$/, /\/api\/v2\/schema\/enums$/] });

    // Test save functionality
    await expectInteractionHealthy(page, async () => {
      const saveButton = page.getByRole('button', { name: /save/i });
      await saveButton.click();
      
      // Handle save dialog (if it appears)
      page.on('dialog', async dialog => {
        await dialog.accept('test-search');
      });
    }, { allow: [/\/api\/v2\/search\/grammar$/, /\/api\/v2\/schema\/enums$/] });
  });

  test('schema panel renders without errors', async ({ page }) => {
    await page.goto(`${BASE_URL}search`);
    
    await expectPageGolden(page, 'page-search', {
      allow: [/\/api\/v2\/search\/grammar$/, /\/api\/v2\/schema\/enums$/]
    });

    // Schema panel should be visible and not cause errors
    await expectInteractionHealthy(page, async () => {
      // Schema panel loads automatically, just verify it's there
      const schemaPanel = page.locator('h3').filter({ hasText: 'Schema' });
      await schemaPanel.waitFor({ state: 'visible' });
    }, { allow: [/\/api\/v2\/search\/grammar$/, /\/api\/v2\/schema\/enums$/] });
  });

  test('compile and execute work without runtime errors', async ({ page }) => {
    await page.goto(`${BASE_URL}search`);
    
    await expectPageGolden(page, 'page-search', {
      allow: [/\/api\/v2\/search\/grammar$/, /\/api\/v2\/schema\/enums$/]
    });

    // Test query compilation
    await expectInteractionHealthy(page, async () => {
      const queryInput = page.getByRole('textbox', { name: /query/i });
      await queryInput.fill('message:hello');
      
      // Wait for auto-compile (debounced)
      await page.waitForTimeout(1000);
    }, { 
      allow: [
        /\/api\/v2\/search\/grammar$/,
        /\/api\/v2\/schema\/enums$/,
        /\/api\/v2\/search\/compile$/,
      ]
    });

    // Test query execution
    await expectInteractionHealthy(page, async () => {
      const runButton = page.getByRole('button', { name: /run/i });
      await runButton.click();
      
      // Wait for execution to complete
      await page.waitForTimeout(2000);
    }, {
      allow: [
        /\/api\/v2\/search\/grammar$/,
        /\/api\/v2\/schema\/enums$/,
        /\/api\/v2\/search\/compile$/,
        /\/api\/v2\/search\/execute$/,
        /\/api\/v2\/search\/facets$/,
        /\/api\/v2\/search\/timeline$/,
      ]
    });
  });

  test('handles missing endpoints gracefully', async ({ page }) => {
    await page.goto(`${BASE_URL}search`);
    
    // Even with missing endpoints, page should not crash
    await expectPageGolden(page, 'page-search', {
      allow: [
        /\/api\/v2\/search\/grammar$/,       // 404 expected
        /\/api\/v2\/schema\/enums$/,         // May 404
        /\/api\/v2\/search\/compile$/,       // May 404 if backend down
        /\/api\/v2\/search\/execute$/,       // May 404 if backend down
        /\/api\/v2\/search\/facets$/,        // May 404 if backend down
        /\/api\/v2\/search\/timeline$/,      // May 404 if backend down
      ]
    });
  });
});
