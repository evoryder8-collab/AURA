import { dayKey, PRACTICE_TIME_ZONE } from '@/lib/formatting/time'

/** Calendar days in the practice time zone, so a window or tick starts at the practice's midnight, not the device's. */

const DAY_MS = 86_400_000

const zonedParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: PRACTICE_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
})

function zoneOffset(at: number) {
  const parts = Object.fromEntries(
    zonedParts
      .formatToParts(new Date(at))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', number>
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Math.floor(at / 60_000) * 60_000
}

/** UTC instant of midnight at the start of `day` (yyyy-mm-dd) in the practice time zone. */
export function practiceMidnight(day: string): string {
  const guess = Date.parse(`${day}T00:00:00Z`)
  if (!Number.isFinite(guess)) throw new RangeError('A date must look like 2026-11-23.')
  let at = guess - zoneOffset(guess)
  at = guess - zoneOffset(at)
  return new Date(at).toISOString()
}

/** yyyy-mm-dd plus `days`. */
export const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

/** Practice midnight that starts the calendar day holding `at`, moved by `days` whole days. */
export const practiceDayStart = (at: number, days = 0) => Date.parse(practiceMidnight(addDays(dayKey(at), days)))
