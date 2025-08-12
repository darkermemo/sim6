import { test, expect } from '@playwright/test';

test('health and schema endpoints', async ({ request }) => {
  const health = await request.get('/health');
  expect(health.ok()).toBeTruthy();
  const fields = await request.get('/api/v2/schema/fields');
  expect(fields.ok()).toBeTruthy();
  const enums = await request.get('/api/v2/schema/enums');
  expect(enums.ok()).toBeTruthy();
});


