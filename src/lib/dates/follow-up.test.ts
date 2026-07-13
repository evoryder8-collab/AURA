import { describe, expect, it } from 'vitest'

import { getFollowUpDueStatus, getNextDayFollowUpDueAt } from './follow-up'

describe('next-day follow-up timing', () => {
  it('schedules the next practice-local day and stores it in UTC', () => {
    expect(getNextDayFollowUpDueAt('2026-07-13T18:00:00.000Z', 'Europe/Zurich')).toBe(
      '2026-07-14T07:00:00.000Z',
    )
  })

  it('accounts for winter time and daylight-saving transitions', () => {
    expect(getNextDayFollowUpDueAt('2026-01-13T18:00:00.000Z', 'Europe/Zurich')).toBe(
      '2026-01-14T08:00:00.000Z',
    )
    expect(getNextDayFollowUpDueAt('2026-03-28T18:00:00.000Z', 'Europe/Zurich')).toBe(
      '2026-03-29T07:00:00.000Z',
    )
  })

  it('supports a configurable local due hour', () => {
    expect(getNextDayFollowUpDueAt('2026-07-13T18:00:00.000Z', 'Europe/Zurich', 14)).toBe(
      '2026-07-14T12:00:00.000Z',
    )
  })

  it('rejects invalid timestamps, time zones, and hours', () => {
    expect(() => getNextDayFollowUpDueAt('invalid', 'Europe/Zurich')).toThrow(RangeError)
    expect(() => getNextDayFollowUpDueAt('2026-01-01', 'Not/A_Timezone')).toThrow(RangeError)
    expect(() => getNextDayFollowUpDueAt('2026-01-01', 'Europe/Zurich', 24)).toThrow(RangeError)
  })
})

describe('follow-up due status', () => {
  it('distinguishes not due, due, and completed states', () => {
    const dueAt = '2026-07-14T07:00:00.000Z'
    expect(getFollowUpDueStatus(dueAt, null, '2026-07-14T06:59:59.999Z')).toBe('not_due')
    expect(getFollowUpDueStatus(dueAt, null, dueAt)).toBe('due')
    expect(
      getFollowUpDueStatus(dueAt, '2026-07-14T08:00:00.000Z', '2026-07-14T09:00:00.000Z'),
    ).toBe('completed')
  })

  it('does not interpret a missing response as a negative response', () => {
    expect(getFollowUpDueStatus('2026-07-14T07:00:00.000Z', null, '2026-07-20T07:00:00.000Z')).toBe(
      'due',
    )
  })
})
