import { describe, expect, it } from 'vitest'

import { computeConfidence } from './confidence'

const completeEvidence = {
  pointCount: 6,
  timeSpanDays: 28,
  completeness: 1,
  trendConsistency: 1,
  comparableMethodRatio: 1,
  contextualEventCount: 0,
  retrospectiveRatio: 0,
} as const

describe('computeConfidence', () => {
  it('returns high confidence for complete, consistent, comparable data', () => {
    expect(computeConfidence(completeEvidence)).toMatchObject({
      score: 100,
      level: 'high',
    })
  })

  it('keeps sparse evidence low confidence', () => {
    const result = computeConfidence({
      ...completeEvidence,
      pointCount: 1,
      timeSpanDays: 0,
      completeness: 1 / 3,
      trendConsistency: 0,
    })
    expect(result.level).toBe('low')
    expect(result.score).toBeLessThan(50)
  })

  it('penalizes contextual events and retrospective entries transparently', () => {
    const withoutPenalties = computeConfidence(completeEvidence)
    const withPenalties = computeConfidence({
      ...completeEvidence,
      contextualEventCount: 1,
      retrospectiveRatio: 0.5,
    })
    expect(withPenalties.score).toBe(withoutPenalties.score - 10)
    expect(withPenalties.factors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'contextual_events', contribution: -5 }),
        expect.objectContaining({ key: 'retrospective_entries', contribution: -5 }),
      ]),
    )
  })

  it('penalizes missing streams and incompatible methods', () => {
    const result = computeConfidence({
      ...completeEvidence,
      completeness: 1 / 3,
      comparableMethodRatio: 0.5,
    })
    expect(result.score).toBeLessThan(completeEvidence.pointCount * 20)
    expect(result.score).toBeCloseTo(78.33, 2)
  })

  it('clamps ratio inputs but rejects nonsensical counts', () => {
    expect(
      computeConfidence({
        ...completeEvidence,
        completeness: 4,
        trendConsistency: -2,
      }).score,
    ).toBe(75)
    expect(() => computeConfidence({ ...completeEvidence, pointCount: -1 })).toThrow(RangeError)
  })
})
