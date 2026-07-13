import { describe, expect, it } from 'vitest'

import {
  normalizeFunctionalAbility,
  normalizePain,
  normalizeRom,
  normalizeStiffness,
} from './normalization'

describe('score normalization', () => {
  it('maps adverse-score boundaries into favourable scores', () => {
    expect(normalizePain(0)).toBe(100)
    expect(normalizePain(10)).toBe(0)
    expect(normalizeStiffness(0)).toBe(100)
    expect(normalizeStiffness(10)).toBe(0)
  })

  it('maps ROM and functional ability boundaries directly', () => {
    expect(normalizeRom(0)).toBe(0)
    expect(normalizeRom(10)).toBe(100)
    expect(normalizeFunctionalAbility(0)).toBe(0)
    expect(normalizeFunctionalAbility(10)).toBe(100)
  })

  it('preserves decimals without premature rounding', () => {
    expect(normalizePain(4.25)).toBe(57.5)
    expect(normalizeRom(6.75)).toBe(67.5)
  })

  it.each([-1, 10.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid score %s',
    (score) => {
      expect(() => normalizePain(score)).toThrow(RangeError)
      expect(() => normalizeStiffness(score)).toThrow(RangeError)
      expect(() => normalizeRom(score)).toThrow(RangeError)
      expect(() => normalizeFunctionalAbility(score)).toThrow(RangeError)
    },
  )
})
