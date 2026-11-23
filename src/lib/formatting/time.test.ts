import { describe, expect, it } from 'vitest'
import { daysBetween, minutesLabel, relativeDay } from './time'

describe('practice time formatting', () => {
  it('names nearby days plainly', () => {
    const now = '2026-11-23T12:00:00.000Z'
    expect(relativeDay('2026-11-23T08:00:00.000Z', now)).toBe('Today')
    expect(relativeDay('2026-11-22T12:00:00.000Z', now)).toBe('Yesterday')
    expect(relativeDay('2026-11-24T12:00:00.000Z', now)).toBe('Tomorrow')
    expect(daysBetween('2026-11-16T12:00:00.000Z', now)).toBe(7)
  })

  it('keeps a number with its unit', () => {
    expect(minutesLabel(12)).toBe('12 minutes')
    expect(minutesLabel(1)).toBe('1 minute')
  })
})
