import { describe, expect, it } from 'vitest'

import {
  computeFunctionalGoalDelta,
  isFunctionalGoalUpdateDue,
  selectFunctionalGoalForCheckIn,
  validateFunctionalGoalScore,
  type FunctionalGoalCandidate,
} from './functional-goals'

const now = '2026-07-13T12:00:00Z'

function goal(overrides: Partial<FunctionalGoalCandidate> = {}): FunctionalGoalCandidate {
  return {
    id: 'goal-1',
    status: 'active',
    importance: 3,
    createdAt: '2026-07-01T12:00:00Z',
    lastRecordedAt: null,
    ...overrides,
  }
}

describe('functional goal helpers', () => {
  it('validates the inclusive 0–10 score boundary', () => {
    expect(validateFunctionalGoalScore(0)).toBe(0)
    expect(validateFunctionalGoalScore(10)).toBe(10)
    expect(() => validateFunctionalGoalScore(10.1)).toThrow(RangeError)
  })

  it('marks active goals due at the configured interval', () => {
    expect(isFunctionalGoalUpdateDue(goal(), now)).toBe(true)
    expect(isFunctionalGoalUpdateDue(goal({ lastRecordedAt: '2026-07-10T12:00:00Z' }), now)).toBe(
      false,
    )
    expect(isFunctionalGoalUpdateDue(goal({ status: 'paused' }), now)).toBe(false)
  })

  it('selects one due goal, preferring the longest overdue then importance', () => {
    const result = selectFunctionalGoalForCheckIn(
      [
        goal({ id: 'newer', lastRecordedAt: '2026-07-03T12:00:00Z', importance: 5 }),
        goal({ id: 'older', lastRecordedAt: '2026-07-01T12:00:00Z', importance: 1 }),
      ],
      now,
    )
    expect(result?.id).toBe('older')
  })

  it('does not interpret a missing update as a negative change', () => {
    expect(computeFunctionalGoalDelta(5, null)).toBeNull()
    expect(computeFunctionalGoalDelta(undefined, 5)).toBeNull()
    expect(computeFunctionalGoalDelta(4, 7)).toBe(3)
  })
})
