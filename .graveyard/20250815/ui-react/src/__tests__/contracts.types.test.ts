import { describe, it, expect } from 'vitest'
import type { HealthResponse, SearchExecuteResponse, AlertsListResponse } from '@/types/api'

describe('Contract fixtures match TS types', () => {
  it('health.json matches HealthResponse', async () => {
    const j: HealthResponse = await import('../../fixtures/health.json')
    expect(j.status).toBeTypeOf('string')
  })

  it('search_compile.json has expected shape', async () => {
    const j = await import('../../fixtures/search_compile.json')
    expect(typeof j.sql).toBe('string')
  })

  it('search_execute.json matches SearchExecuteResponse', async () => {
    const j: SearchExecuteResponse = await import('../../fixtures/search_execute.json')
    expect(Array.isArray(j.data.data)).toBe(true)
  })

  it('alerts_list.json matches AlertsListResponse', async () => {
    const j: AlertsListResponse = await import('../../fixtures/alerts_list.json')
    expect(Array.isArray(j.alerts)).toBe(true)
  })
})


