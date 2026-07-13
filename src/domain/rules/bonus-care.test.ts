import { describe, expect, it } from 'vitest'

import {
  calculateBonusCareMinutes,
  suggestBonusCareMinutes,
  sumConfirmedBonusCareMinutes,
  validateConfirmedBonusCareMinutes,
} from './bonus-care'

describe('Bonus Care Minutes', () => {
  it('calculates only time beyond the booking', () => {
    expect(calculateBonusCareMinutes(68, 60)).toBe(8)
    expect(calculateBonusCareMinutes(60, 60)).toBe(0)
    expect(calculateBonusCareMinutes(52, 60)).toBe(0)
  })

  it('applies the default three-minute suggestion threshold inclusively', () => {
    expect(suggestBonusCareMinutes(62, 60)).toMatchObject({
      calculatedMinutes: 2,
      thresholdMet: false,
      suggestedConfirmationMinutes: 0,
    })
    expect(suggestBonusCareMinutes(63, 60)).toMatchObject({
      calculatedMinutes: 3,
      thresholdMet: true,
      suggestedConfirmationMinutes: 3,
    })
  })

  it('supports a configurable threshold and therapist-edited confirmation', () => {
    expect(suggestBonusCareMinutes(64, 60, 5).suggestedConfirmationMinutes).toBe(0)
    expect(validateConfirmedBonusCareMinutes(2.5)).toBe(2.5)
  })

  it('sums only confirmed non-missing values', () => {
    expect(sumConfirmedBonusCareMinutes([3, null, 4, undefined, 2.5])).toBe(9.5)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'never accepts or exposes invalid negative/non-finite minutes: %s',
    (minutes) => {
      expect(() => calculateBonusCareMinutes(minutes, 60)).toThrow(RangeError)
      expect(() => validateConfirmedBonusCareMinutes(minutes)).toThrow(RangeError)
    },
  )
})
