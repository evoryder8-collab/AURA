import { describe, expect, it } from 'vitest'
import type { DemoAppointment } from '@/data/demo/model'
import {
  addDays,
  availableStarts,
  bookingDays,
  formatDayKey,
  overlaps,
  serviceName,
  startOfWeek,
  weekdayOf,
  zonedParts,
  zonedTimeToUtc,
} from './slots'

const ZURICH = 'Europe/Zurich'
const NEW_YORK = 'America/New_York'
const weekdays = [1, 2, 3, 4, 5]
const busy = (startsAt: string, durationMinutes: number, status: DemoAppointment['status'] = 'confirmed') => ({
  startsAt,
  durationMinutes,
  status,
})
// Monday 23 Nov 2026, 07:00 in Zurich.
const mondayMorning = Date.parse('2026-11-23T06:00:00.000Z')

describe('overlaps', () => {
  it('treats touching visits as free and any shared minute as a clash', () => {
    expect(overlaps(0, 60, 60, 120)).toBe(false)
    expect(overlaps(0, 61, 60, 120)).toBe(true)
    expect(overlaps(30, 40, 0, 120)).toBe(true)
  })
})

describe('practice time zone', () => {
  it('reads the local day and time of an instant', () => {
    expect(zonedParts('2026-11-23T23:30:00.000Z', ZURICH)).toMatchObject({ dayKey: '2026-11-24', minutes: 30 })
    expect(zonedParts('2026-11-23T23:30:00.000Z', NEW_YORK)).toMatchObject({ dayKey: '2026-11-23', minutes: 18 * 60 + 30 })
  })

  it('turns local wall-clock time into UTC on both sides of a clock change', () => {
    expect(new Date(zonedTimeToUtc('2026-11-24', 9 * 60, ZURICH)).toISOString()).toBe('2026-11-24T08:00:00.000Z')
    expect(new Date(zonedTimeToUtc('2026-07-14', 9 * 60, ZURICH)).toISOString()).toBe('2026-07-14T07:00:00.000Z')
    expect(new Date(zonedTimeToUtc('2026-11-24', 9 * 60, NEW_YORK)).toISOString()).toBe('2026-11-24T14:00:00.000Z')
  })

  it('walks calendar days and weeks without drifting', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(weekdayOf('2026-11-23')).toBe(1)
    expect(startOfWeek('2026-11-29')).toBe('2026-11-23')
    expect(startOfWeek('2026-11-23')).toBe('2026-11-23')
    expect(formatDayKey('2026-11-24')).toBe('Tue 24 Nov')
  })
})

describe('bookingDays', () => {
  it('offers only working days in the next 14 days, starting today', () => {
    const days = bookingDays({ now: mondayMorning, workingDays: weekdays, timeZone: ZURICH })
    expect(days[0]).toBe('2026-11-23')
    expect(days).toHaveLength(10)
    expect(days.some((key) => [0, 6].includes(weekdayOf(key)))).toBe(false)
    expect(days.at(-1)).toBe('2026-12-04')
  })

  it('counts "today" in the practice time zone, not the device clock', () => {
    // 23:30 UTC Sunday is already Monday in Zurich but still Sunday in New York.
    const sundayNight = Date.parse('2026-11-22T23:30:00.000Z')
    expect(bookingDays({ now: sundayNight, workingDays: weekdays, timeZone: ZURICH })[0]).toBe('2026-11-23')
    expect(bookingDays({ now: sundayNight, workingDays: [0, ...weekdays], timeZone: NEW_YORK })[0]).toBe('2026-11-22')
  })
})

describe('availableStarts', () => {
  const base = { dayKey: '2026-11-24', now: mondayMorning, timeZone: ZURICH, workingDays: weekdays }

  it('steps every 30 minutes from 09:00 and finishes every visit by 18:00', () => {
    const sixty = availableStarts({ ...base, durationMinutes: 60, busy: [] })
    expect(sixty).toHaveLength(17)
    expect(sixty[0]).toBe('2026-11-24T08:00:00.000Z') // 09:00 in Zurich
    expect(sixty.at(-1)).toBe('2026-11-24T16:00:00.000Z') // 17:00, ends 18:00
    const ninety = availableStarts({ ...base, durationMinutes: 90, busy: [] })
    expect(ninety.at(-1)).toBe('2026-11-24T15:30:00.000Z') // 16:30, ends 18:00
  })

  it('leaves out every start that would overlap a booked visit', () => {
    // 10:00–11:30 local is booked.
    const starts = availableStarts({ ...base, durationMinutes: 60, busy: [busy('2026-11-24T09:00:00.000Z', 90)] })
    expect(starts).not.toContain('2026-11-24T08:30:00.000Z') // 09:30 would run into 10:00
    expect(starts).not.toContain('2026-11-24T09:00:00.000Z')
    expect(starts).not.toContain('2026-11-24T10:00:00.000Z') // 11:00 is still inside
    expect(starts).toContain('2026-11-24T08:00:00.000Z') // 09:00–10:00 touches but does not overlap
    expect(starts).toContain('2026-11-24T10:30:00.000Z') // 11:30 is free again
  })

  it('ignores cancelled and declined visits', () => {
    const starts = availableStarts({
      ...base,
      durationMinutes: 60,
      busy: [busy('2026-11-24T09:00:00.000Z', 60, 'cancelled'), busy('2026-11-24T09:00:00.000Z', 60, 'declined')],
    })
    expect(starts).toContain('2026-11-24T09:00:00.000Z')
  })

  it('never offers a time that has already passed today', () => {
    const middayToday = Date.parse('2026-11-24T11:10:00.000Z') // 12:10 in Zurich
    const starts = availableStarts({ ...base, now: middayToday, durationMinutes: 60, busy: [] })
    expect(starts[0]).toBe('2026-11-24T11:30:00.000Z') // 12:30
  })

  it('offers nothing on a day the therapist does not work', () => {
    expect(availableStarts({ ...base, dayKey: '2026-11-29', durationMinutes: 60, busy: [] })).toEqual([])
  })

  it('keeps 09:00 local in a different practice time zone', () => {
    const starts = availableStarts({ ...base, timeZone: NEW_YORK, durationMinutes: 60, busy: [] })
    expect(starts[0]).toBe('2026-11-24T14:00:00.000Z')
  })
})

describe('serviceName', () => {
  it('prints the length once', () => {
    expect(serviceName('Deep restorative massage · 90 min')).toBe('Deep restorative massage')
    expect(serviceName('Therapeutic massage')).toBe('Therapeutic massage')
  })
})
