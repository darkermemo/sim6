/**
 * Playwright Runtime Validation Helpers
 * Enforce zero runtime errors standard for golden pages
 */

import { expect, Page } from '@playwright/test';

export interface RuntimeCheckOptions {
  /** Regex patterns for allowed network failures (e.g., optional endpoints) */
  allow?: RegExp[];
  /** Timeout for waiting for app-ready marker */
  timeout?: number;
  /** Allow console warnings (default: false) */
  allowWarnings?: boolean;
}

export interface RuntimeIssue {
  type: 'pageerror' | 'console' | 'network';
  message: string;
  url?: string;
  status?: number;
  timestamp: number;
}

/**
 * Assert that a page has zero runtime issues
 * This is the golden standard - pages must pass this to be considered healthy
 */
export async function expectPageHealthy(page: Page, opts: RuntimeCheckOptions = {}): Promise<void> {
  const { allow = [], timeout = 10000, allowWarnings = false } = opts;
  
  const errors: string[] = [];
  const networkFailures: string[] = [];

  // Listen for pageerrors (uncaught exceptions)
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  // Listen for console errors and warnings
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    
    if (type === 'error') {
      errors.push(`console.error: ${text}`);
    } else if (type === 'warning' && !allowWarnings) {
      errors.push(`console.warn: ${text}`);
    }
  });

  // Listen for network failures
  page.on('response', (response) => {
    const url = response.url();
    const status = response.status();
    
    if (status >= 400) {
      const isAllowed = allow.some(regex => regex.test(url));
      if (!isAllowed) {
        networkFailures.push(`${status} ${url}`);
      }
    }
  });

  // Wait for app to be ready
  try {
    await page.waitForSelector('[data-app-ready="1"]', { 
      state: 'attached', 
      timeout 
    });
  } catch (error) {
    errors.push(`App ready timeout: data-app-ready="1" not found within ${timeout}ms`);
  }

  // Check runtime guard issues
  try {
    const runtimeIssues = await page.evaluate(() => {
      return window.__rt?.getIssues() || [];
    });

    for (const issue of runtimeIssues) {
      if (issue.type === 'network' && issue.url) {
        const isAllowed = allow.some(regex => regex.test(issue.url!));
        if (!isAllowed) {
          errors.push(`runtime.${issue.type}: ${issue.message} (${issue.url}, ${issue.status})`);
        }
      } else if (issue.type === 'console') {
        if (issue.message.startsWith('WARN:') && allowWarnings) {
          // Skip warnings if allowed
        } else {
          errors.push(`runtime.${issue.type}: ${issue.message}`);
        }
      } else {
        errors.push(`runtime.${issue.type}: ${issue.message}`);
      }
    }
  } catch (error) {
    // Runtime guard might not be available - that's okay
    console.warn('Runtime guard not available:', error);
  }

  // Assert no errors
  const allIssues = [...errors, ...networkFailures];
  if (allIssues.length > 0) {
    throw new Error(
      `Page has runtime issues:\n${allIssues.map((issue, i) => `  ${i + 1}. ${issue}`).join('\n')}`
    );
  }
}

/**
 * Clear runtime issues from the runtime guard
 * Useful for testing interactions in isolation
 */
export async function clearRuntimeIssues(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__rt?.clearIssues();
  });
}

/**
 * Get current runtime issues for debugging
 */
export async function getRuntimeIssues(page: Page): Promise<RuntimeIssue[]> {
  return await page.evaluate(() => {
    return window.__rt?.getIssues() || [];
  });
}

/**
 * Assert page loads without errors and is interactive
 * This is a comprehensive health check for golden pages
 */
export async function expectPageGolden(
  page: Page, 
  pageTestId: string,
  opts: RuntimeCheckOptions = {}
): Promise<void> {
  // Check for error boundary (should not be present)
  const errorBoundary = page.locator('[data-testid="error-boundary"]');
  await expect(errorBoundary).toHaveCount(0);

  // Check page loaded correctly
  const pageElement = page.locator(`[data-testid="${pageTestId}"]`);
  await expect(pageElement).toBeVisible();

  // Check runtime health
  await expectPageHealthy(page, opts);
}

/**
 * Test critical page interactions without runtime errors
 */
export async function expectInteractionHealthy(
  page: Page,
  interaction: () => Promise<void>,
  opts: RuntimeCheckOptions = {}
): Promise<void> {
  // Clear any existing issues
  await clearRuntimeIssues(page);
  
  // Perform interaction
  await interaction();
  
  // Check no new runtime issues
  await expectPageHealthy(page, opts);
}
