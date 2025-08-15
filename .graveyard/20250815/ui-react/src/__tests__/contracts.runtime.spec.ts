import { test, expect } from '@playwright/test'

test.describe('Contract smoke against live API', () => {
  const base = process.env.BASE_URL || 'http://127.0.0.1:9999'

  test('health endpoint has status', async ({ request }) => {
    const res = await request.get(`${base}/api/v2/health`)
    expect(res.ok()).toBeTruthy()
    const j = await res.json()
    expect(typeof j.status).toBe('string')
  })

  test('search compile returns sql', async ({ request }) => {
    const res = await request.post(`${base}/api/v2/search/compile`, {
      data: { tenant_id: 'default', time: { last_seconds: 60 }, q: '*' },
    })
    expect(res.ok()).toBeTruthy()
    const j = await res.json()
    expect(typeof j.sql).toBe('string')
  })
})


