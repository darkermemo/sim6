import { test, expect } from '@playwright/test'

test('react app loads and shows nav', async ({ page, baseURL }) => {
  await page.goto(baseURL || 'http://127.0.0.1:5173/ui/app/')
  await expect(page.getByText('SIEM v2')).toBeVisible()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Tenants' })).toBeVisible()
})


