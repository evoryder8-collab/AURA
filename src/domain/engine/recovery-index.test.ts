import { describe, expect, it } from 'vitest'

import { computeRecoveryIndex } from './recovery-index'

describe('computeRecoveryIndex', () => {
  it('applies the prototype 45/35/20 weights', () => {
    const result = computeRecoveryIndex({ pain: 4, stiffness: 5, rom: 7 })

    expect(result.score).toBe(58.5)
    expect(result.appliedWeights).toEqual({ pain: 0.45, stiffness: 0.35, rom: 0.2 })
    expect(result.includedStreams).toEqual(['pain', 'stiffness', 'rom'])
    expect(result.missingStreams).toEqual([])
  })

  it('renormalizes weights when ROM is unavailable', () => {
    const result = computeRecoveryIndex({ pain: 4, stiffness: 5 })

    expect(result.score).toBe(55.63)
    expect(result.appliedWeights).toEqual({ pain: 0.56, stiffness: 0.44, rom: 0 })
    expect(result.availableWeight).toBe(0.8)
    expect(result.missingStreams).toEqual(['rom'])
  })

  it('renormalizes a single eligible stream to the full score', () => {
    const result = computeRecoveryIndex({ rom: 6 })
    expect(result.score).toBe(60)
    expect(result.appliedWeights).toEqual({ pain: 0, stiffness: 0, rom: 1 })
  })

  it('returns an explicit unavailable result when all streams are missing', () => {
    expect(computeRecoveryIndex({})).toEqual({
      score: null,
      favourableScores: { pain: null, stiffness: null, rom: null },
      appliedWeights: { pain: 0, stiffness: 0, rom: 0 },
      availableWeight: 0,
      includedStreams: [],
      missingStreams: ['pain', 'stiffness', 'rom'],
    })
  })

  it('handles favourable-score boundaries', () => {
    expect(computeRecoveryIndex({ pain: 0, stiffness: 0, rom: 10 }).score).toBe(100)
    expect(computeRecoveryIndex({ pain: 10, stiffness: 10, rom: 0 }).score).toBe(0)
  })

  it('rejects invalid values and invalid custom weights', () => {
    expect(() => computeRecoveryIndex({ pain: 11 })).toThrow(RangeError)
    expect(() => computeRecoveryIndex({ pain: 5 }, { pain: 0, stiffness: 0, rom: 0 })).toThrow(
      RangeError,
    )
    expect(() => computeRecoveryIndex({ pain: 5 }, { pain: -1, stiffness: 1, rom: 1 })).toThrow(
      RangeError,
    )
  })
})
