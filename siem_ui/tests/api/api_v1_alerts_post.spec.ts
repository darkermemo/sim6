import { test, expect } from '@playwright/test';
import Ajv from 'ajv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../schemas/api-v1-alerts-post.json'), 'utf-8'));

test.use({ 
  baseURL: process.env.API_BASE,
  trace: 'retain-on-failure'
});

test('POST /api/v1/alerts returns 201', async ({ request }) => {
  const payload = {
  "title": "Test Alert",
  "severity": "high",
  "description": "Test alert description"
};
  
  const res = await request.post('/api/v1/alerts', {
    headers: { Authorization: `Bearer ${process.env.QA_TOKEN}` },
    data: payload
  });
  expect(res.ok()).toBeTruthy();
  expect(res.status()).toBe(201);

  const body = await res.json();
  const ajv = new Ajv();
  expect(ajv.validate(schema, body)).toBe(true);

  test.info().annotations.push({ type: 'rt', description: `${res.headers()['x-response-time'] || 'N/A'}ms` });
});
