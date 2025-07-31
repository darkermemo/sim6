import { test, expect } from '@playwright/test';
import Ajv from 'ajv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../schemas/api-v1-alerts-get.json'), 'utf-8'));

test.use({ 
  baseURL: process.env.API_BASE,
  trace: 'retain-on-failure'
});

test('GET /api/v1/alerts returns 200', async ({ request }) => {
  const res = await request.get('/api/v1/alerts', {
    headers: { Authorization: `Bearer ${process.env.QA_TOKEN}` }
  });
  expect(res.ok()).toBeTruthy();
  expect(res.status()).toBe(200);

  const body = await res.json();
  const ajv = new Ajv();
  expect(ajv.validate(schema, body)).toBe(true);

  test.info().annotations.push({ type: 'rt', description: `${res.headers()['x-response-time'] || 'N/A'}ms` });
});
