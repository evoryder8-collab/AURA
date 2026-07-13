import { describe, expect, it } from 'vitest'

import { computeWeightedTrend } from './trend'

describe('computeWeightedTrend', () => {
  it('sorts points and computes an exact rising trend', () => {
    const result = computeWeightedTrend([
      { value: 14, observedAt: '2026-01-03T00:00:00Z' },
      { value: 10, observedAt: '2026-01-01T00:00:00Z' },
      { value: 12, observedAt: '2026-01-02T00:00:00Z' },
    ])

    expect(result).toMatchObject({
      start: 10,
      end: 14,
      delta: 4,
      range: 4,
      slopePerDay: 2,
      direction: 'rising',
      consistency: 1,
      timeSpanDays: 2,
    })
  })

  it('uses the configured stable boundary for direction and consistency', () => {
    const result = computeWeightedTrend(
      [
        { value: 50, observedAt: '2026-01-01' },
        { value: 53, observedAt: '2026-01-02' },
        { value: 51, observedAt: '2026-01-03' },
      ],
      5,
    )
    expect(result?.direction).toBe('stable')
    expect(result?.consistency).toBe(1)
  })

  it('reports inconsistent steps', () => {
    const result = computeWeightedTrend([
      { value: 10, observedAt: '2026-01-01' },
      { value: 20, observedAt: '2026-01-02' },
      { value: 15, observedAt: '2026-01-03' },
      { value: 30, observedAt: '2026-01-04' },
    ])
    expect(result?.direction).toBe('rising')
    expect(result?.consistency).toBeCloseTo(2 / 3, 4)
  })

  it('returns null for no points and a stable result for one point', () => {
    expect(computeWeightedTrend([])).toBeNull()
    expect(computeWeightedTrend([{ value: 5, observedAt: '2026-01-01' }])).toMatchObject({
      delta: 0,
      direction: 'stable',
      consistency: 1,
    })
  })

  it('rejects invalid timestamps, values, weights, and thresholds', () => {
    expect(() => computeWeightedTrend([{ value: 1, observedAt: 'not-a-date' }])).toThrow(RangeError)
    expect(() => computeWeightedTrend([{ value: Number.NaN, observedAt: '2026-01-01' }])).toThrow(
      RangeError,
    )
    expect(() => computeWeightedTrend([{ value: 1, observedAt: '2026-01-01', weight: 0 }])).toThrow(
      RangeError,
    )
    expect(() => computeWeightedTrend([], -1)).toThrow(RangeError)
  })
})
