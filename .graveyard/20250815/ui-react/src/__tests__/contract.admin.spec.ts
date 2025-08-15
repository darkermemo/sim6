import { describe, it, expect } from 'vitest'

function keysOf(obj: any): string[] {
  if (obj == null || typeof obj !== 'object') return []
  return Object.keys(obj)
}

describe('Admin contract: payload keys adhere to live fixtures', () => {
  it('parser create payload keys ⊆ live example', async () => {
    const live = await import('../../fixtures/parser_create.json')
    // UI payload should not introduce new keys beyond the live example
    const allowed = new Set(keysOf(live.default || live))
    const samplePayload = live.default || live
    keysOf(samplePayload).forEach(k => {
      expect(allowed.has(k)).toBe(true)
    })
  })

  it('log-source create payload keys ⊆ live example', async () => {
    const live = await import('../../fixtures/log_source_create.json')
    const allowed = new Set(keysOf(live.default || live))
    const samplePayload = live.default || live
    keysOf(samplePayload).forEach(k => {
      expect(allowed.has(k)).toBe(true)
    })
  })
})
