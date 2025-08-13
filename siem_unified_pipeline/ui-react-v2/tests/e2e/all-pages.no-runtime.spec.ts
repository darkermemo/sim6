/**
 * All Pages - No Runtime Errors Test
 * Validates every page meets the golden standard
 */

import { test } from '@playwright/test';
import { expectPageGolden } from '../helpers/runtime';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5174/ui/v2/';

test.describe('All Pages - Runtime Validation', () => {
  test('Home page has zero runtime issues', async ({ page }) => {
    await page.goto(`${BASE_URL}`);
    await expectPageGolden(page, 'page-home');
  });

  test('Dashboard page has zero runtime issues', async ({ page }) => {
    await page.goto(`${BASE_URL}dashboard`);
    await expectPageGolden(page, 'page-dashboard', {
      allow: [
        /\/api\/v2\/dashboard\//,  // Dashboard endpoints may not exist yet
      ]
    });
  });

  test('Search page has zero runtime issues', async ({ page }) => {
    await page.goto(`${BASE_URL}search`);
    await expectPageGolden(page, 'page-search', {
      allow: [
        /\/api\/v2\/search\/grammar$/,
        /\/api\/v2\/schema\/enums$/,
      ]
    });
  });

  test('Navigation between pages has no runtime issues', async ({ page }) => {
    // Start at home
    await page.goto(`${BASE_URL}`);
    await expectPageGolden(page, 'page-home');

    // Navigate to search
    await page.getByRole('link', { name: /search/i }).click();
    await expectPageGolden(page, 'page-search', {
      allow: [/\/api\/v2\/search\/grammar$/, /\/api\/v2\/schema\/enums$/]
    });

    // Navigate to dashboard
    await page.getByRole('link', { name: /dashboard/i }).click();
    await expectPageGolden(page, 'page-dashboard', {
      allow: [/\/api\/v2\/dashboard\//]
    });

    // Back to home
    await page.getByRole('link', { name: /home/i }).click();
    await expectPageGolden(page, 'page-home');
  });
});
