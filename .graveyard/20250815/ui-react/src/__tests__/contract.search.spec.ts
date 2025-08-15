import { describe, it, expect } from 'vitest'

/**
 * Contract: search execute response has meta/data and includes common columns used by UI
 * Contract: request body shape includes tenant_id, time.last_seconds, and optional limit
 */
describe('Contract: search', () => {
  it('wire_search_execute.json contains meta and data arrays', async () => {
    const j = await import('../../fixtures/wire_search_execute.json')
    const v: any = (j as any).default || j
    expect(Array.isArray(v?.data?.meta)).toBe(true)
    expect(Array.isArray(v?.data?.data)).toBe(true)
  })

  it('meta contains UI-expected keys (tenant_id, event_timestamp, message, severity)', async () => {
    const j = await import('../../fixtures/wire_search_execute.json')
    const v: any = (j as any).default || j
    const names = new Set<string>((v?.data?.meta || []).map((m: any) => m?.name))
    ;['tenant_id', 'event_timestamp', 'message', 'severity'].forEach(k => {
      expect(names.has(k)).toBe(true)
    })
  })

  it('request body shape for compile/execute uses tenant_id + time.last_seconds', async () => {
    const compileBody = await import('../../fixtures/search_compile.json').catch(() => ({ default: {} }))
    const v: any = (compileBody as any).default || compileBody
    // This is a sample of the body the UI sends; ensure required keys exist
    // Accept both {tenant_id,time:{last_seconds}} and {search:{tenant_ids,time_range}}
    const ok = (
      typeof v?.tenant_id === 'string' && typeof v?.time?.last_seconds === 'number'
    ) || (
      Array.isArray(v?.search?.tenant_ids) && (typeof v?.search?.time_range?.last_seconds === 'number')
    )
    expect(ok).toBe(true)
  })
})
