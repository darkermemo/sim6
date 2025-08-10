import { test, expect } from '@playwright/test'

test('react app loads and shows nav', async ({ page }) => {
  await page.goto('http://127.0.0.1:9999/ui/app')
  await expect(page.getByText('SIEM v2')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tenants' })).toBeVisible()
})


