import { describe, expect, it } from 'vitest'
import { newerRecord, toMirror } from './mirror'

const record = (savedAt: number, photos: unknown[] = [], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 2, state: { savedAt, photos, ...extra } })

describe('demo record mirror', () => {
  it('keeps the newest record when a reload interrupted the IndexedDB write', () => {
    const indexed = record(100, [{ id: 'p1' }], { bonusCredits: [] })
    const mirror = toMirror(record(200, [{ id: 'p1' }], { bonusCredits: [{ id: 'bonus-a' }] }))
    const chosen = JSON.parse(newerRecord(indexed, mirror) ?? '{}')
    expect(chosen.state.savedAt).toBe(200)
    expect(chosen.state.bonusCredits).toEqual([{ id: 'bonus-a' }])
    expect(chosen.state.photos).toEqual([{ id: 'p1' }])
  })

  it('prefers IndexedDB when it is as new, and copes with either copy missing', () => {
    const indexed = record(300, [{ id: 'p1' }])
    expect(newerRecord(indexed, toMirror(record(300)))).toBe(indexed)
    expect(newerRecord(null, toMirror(record(1)))).not.toBeNull()
    expect(newerRecord(indexed, null)).toBe(indexed)
    expect(newerRecord(null, null)).toBeNull()
  })

  it('never copies photographs into localStorage', () => {
    expect(JSON.parse(toMirror(record(1, [{ dataUrl: 'data:image/jpeg;base64,AAAA' }]))).state.photos).toEqual([])
  })
})
