export const DEFAULT_BONUS_CARE_THRESHOLD_MINUTES = 3

export interface BonusCareSuggestion {
  readonly calculatedMinutes: number
  readonly thresholdMinutes: number
  readonly thresholdMet: boolean
  readonly suggestedConfirmationMinutes: number
}

function assertMinutes(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative.`)
  }
}

export function calculateBonusCareMinutes(actualMinutes: number, bookedMinutes: number): number {
  assertMinutes(actualMinutes, 'Actual minutes')
  assertMinutes(bookedMinutes, 'Booked minutes')
  return Math.max(actualMinutes - bookedMinutes, 0)
}

export const computeBonusCareMinutes = calculateBonusCareMinutes

export function suggestBonusCareMinutes(
  actualMinutes: number,
  bookedMinutes: number,
  thresholdMinutes = DEFAULT_BONUS_CARE_THRESHOLD_MINUTES,
): BonusCareSuggestion {
  assertMinutes(thresholdMinutes, 'Bonus Care threshold')
  const calculatedMinutes = calculateBonusCareMinutes(actualMinutes, bookedMinutes)
  const thresholdMet = calculatedMinutes >= thresholdMinutes
  return {
    calculatedMinutes,
    thresholdMinutes,
    thresholdMet,
    suggestedConfirmationMinutes: thresholdMet ? calculatedMinutes : 0,
  }
}

export function validateConfirmedBonusCareMinutes(value: number): number {
  assertMinutes(value, 'Confirmed Bonus Care minutes')
  return value
}

export function sumConfirmedBonusCareMinutes(
  values: readonly (number | null | undefined)[],
): number {
  return values.reduce<number>((total, value) => {
    if (value == null) return total
    return total + validateConfirmedBonusCareMinutes(value)
  }, 0)
}
