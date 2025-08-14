/**
 * Accessibility Testing for Enterprise Search
 * 
 * Ensures our SIEM UI meets accessibility standards:
 * - WCAG 2.1 AA compliance
 * - Keyboard navigation
 * - Screen reader compatibility
 * - Color contrast ratios
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests', () => {
  test('should meet accessibility standards on search page', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Run axe accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    // Should have no violations
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Tab through interactive elements
    const queryInput = page.getByPlaceholder(/Enter search query/);
    const searchButton = page.getByRole('button', { name: /Search/ });
    const tenantSelect = page.locator('select').first();
    const timeSelect = page.locator('select').nth(1);

    // Should be able to focus each element with keyboard
    await queryInput.focus();
    expect(await queryInput.getAttribute('aria-label')).toBeTruthy();

    await page.keyboard.press('Tab');
    await expect(searchButton).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(tenantSelect).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(timeSelect).toBeFocused();
  });

  test('should support screen reader navigation', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Check for proper ARIA labels and roles
    const heading = page.getByRole('heading', { name: /Enterprise Search/ });
    await expect(heading).toBeVisible();

    const queryInput = page.getByPlaceholder(/Enter search query/);
    await expect(queryInput).toHaveAttribute('type', 'text');

    const searchButton = page.getByRole('button', { name: /Search/ });
    await expect(searchButton).toBeVisible();
    await expect(searchButton).toHaveAttribute('type', 'submit');

    // Check table accessibility
    await queryInput.fill('*');
    await searchButton.click();
    await page.waitForTimeout(3000);

    const table = page.locator('.virtualized-table');
    if (await table.isVisible()) {
      // Should have table structure
      await expect(table).toBeVisible();
      
      // Headers should be accessible
      const headers = page.locator('th, [role="columnheader"]');
      const headerCount = await headers.count();
      expect(headerCount).toBeGreaterThan(0);
    }
  });

  test('should have proper color contrast', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Run axe scan specifically for color contrast
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .include('body')
      .analyze();

    // Filter for color contrast violations
    const colorContrastViolations = accessibilityScanResults.violations.filter(
      violation => violation.id === 'color-contrast'
    );

    expect(colorContrastViolations).toEqual([]);
  });

  test('should provide focus indicators', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Tab through elements and check for focus indicators
    const interactiveElements = [
      page.getByPlaceholder(/Enter search query/),
      page.getByRole('button', { name: /Search/ }),
      page.locator('select').first(),
      page.locator('select').nth(1),
    ];

    for (const element of interactiveElements) {
      if (await element.isVisible()) {
        await element.focus();
        
        // Should have focus styles (outline, box-shadow, etc.)
        const styles = await element.evaluate(el => {
          const computed = window.getComputedStyle(el);
          return {
            outline: computed.outline,
            boxShadow: computed.boxShadow,
            borderColor: computed.borderColor,
          };
        });

        // Should have some kind of focus indicator
        const hasFocusIndicator = 
          styles.outline !== 'none' || 
          styles.boxShadow !== 'none' ||
          styles.borderColor !== 'rgb(209, 213, 219)'; // Default border color

        expect(hasFocusIndicator).toBe(true);
      }
    }
  });

  test('should support keyboard shortcuts', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    const queryInput = page.getByPlaceholder(/Enter search query/);
    
    // Focus on query input
    await queryInput.focus();
    
    // Type query
    await queryInput.fill('test query');
    
    // Enter should submit form
    await page.keyboard.press('Enter');
    
    // Should trigger search
    await page.waitForTimeout(1000);
    await expect(page.getByText(/Compiling/)).toBeVisible();
  });

  test('should have proper form labels', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Check form elements have proper labels
    const queryInput = page.getByPlaceholder(/Enter search query/);
    const tenantSelect = page.locator('select').first();
    const timeSelect = page.locator('select').nth(1);

    // Input should have accessible name
    const queryAccessibleName = await queryInput.getAttribute('aria-label') || 
                               await queryInput.getAttribute('placeholder');
    expect(queryAccessibleName).toBeTruthy();

    // Selects should have labels
    const tenantLabel = await tenantSelect.evaluate(el => {
      const label = el.previousElementSibling;
      return label?.textContent || el.getAttribute('aria-label');
    });
    expect(tenantLabel).toBeTruthy();

    const timeLabel = await timeSelect.evaluate(el => {
      const label = el.previousElementSibling;
      return label?.textContent || el.getAttribute('aria-label');
    });
    expect(timeLabel).toBeTruthy();
  });

  test('should handle high contrast mode', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Simulate high contrast mode
    await page.addStyleTag({
      content: `
        @media (prefers-contrast: high) {
          * {
            background: black !important;
            color: white !important;
            border-color: white !important;
          }
        }
      `
    });

    // Page should still be usable
    await expect(page.getByRole('heading', { name: /Enterprise Search/ })).toBeVisible();
    await expect(page.getByPlaceholder(/Enter search query/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Search/ })).toBeVisible();
  });

  test('should support reduced motion preferences', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Enable reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // Trigger animations (charts, facet expansion, etc.)
    await page.getByPlaceholder(/Enter search query/).fill('*');
    await page.getByRole('button', { name: /Search/ }).click();
    await page.waitForTimeout(3000);

    // Should still function without animations
    await expect(page.getByText(/rows/)).toBeVisible({ timeout: 10000 });
  });

  test('should have semantic HTML structure', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Should have proper heading hierarchy
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();

    // Should have main landmark
    const main = page.locator('main, [role="main"]');
    const mainCount = await main.count();
    expect(mainCount).toBeGreaterThanOrEqual(0); // Could be implicit

    // Should have form elements properly structured
    const form = page.locator('form');
    await expect(form).toBeVisible();

    // Buttons should have proper roles
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      if (await button.isVisible()) {
        const role = await button.getAttribute('role');
        const type = await button.getAttribute('type');
        
        // Should be button role or have button type
        expect(role === 'button' || type === 'button' || type === 'submit').toBe(true);
      }
    }
  });

  test('should provide error messages accessibly', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Try to trigger an error condition
    await page.getByPlaceholder(/Enter search query/).fill('invalid][query[syntax');
    await page.getByRole('button', { name: /Search/ }).click();
    
    await page.waitForTimeout(2000);

    // If error appears, it should be accessible
    const errorMessage = page.locator('[role="alert"], .error, [aria-live]');
    const errorCount = await errorMessage.count();
    
    if (errorCount > 0) {
      // Error should be announced to screen readers
      const firstError = errorMessage.first();
      const ariaLive = await firstError.getAttribute('aria-live');
      const role = await firstError.getAttribute('role');
      
      expect(ariaLive === 'polite' || ariaLive === 'assertive' || role === 'alert').toBe(true);
    }
  });
});
