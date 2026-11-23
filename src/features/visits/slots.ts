import type { AppointmentStatus, DemoAppointment } from '@/data/demo/model'

/** Opening hours in the practice time zone, as minutes after midnight. A visit must finish by closing. */
export const OPENING_MINUTES = 9 * 60
export const CLOSING_MINUTES = 18 * 60
export const SLOT_STEP_MINUTES = 30
export const BOOKING_WINDOW_DAYS = 14

export type Service = { readonly minutes: 60 | 75 | 90; readonly name: string; readonly detail: string }

export const SERVICES: readonly Service[] = [
  { minutes: 60, name: 'Therapeutic massage', detail: 'Time for one or two areas' },
  { minutes: 75, name: 'Longer massage', detail: 'Room for neck, shoulders and back' },
  { minutes: 90, name: 'Deep restorative massage', detail: 'Unhurried, whole-body time' },
]

/** Older records carry the length in the name ("Deep restorative · 90 min"); the length is printed once, on its own. */
export const serviceName = (sessionType: string) => sessionType.replace(/\s*·\s*\d+\s*min$/, '')

/** Statuses that no longer hold a place in anyone's day. */
const RELEASED: ReadonlySet<AppointmentStatus> = new Set(['cancelled', 'declined'])
export const holdsTime = (appointment: Pick<DemoAppointment, 'status'>) => !RELEASED.has(appointment.status)

export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd

export type ZonedParts = {
  readonly year: number
  readonly month: number
  readonly day: number
  /** yyyy-mm-dd of the calendar day in the given time zone. */
  readonly dayKey: string
  /** Minutes after local midnight. */
  readonly minutes: number
}

const partFormatters = new Map<string, Intl.DateTimeFormat>()

export function zonedParts(at: number | string, timeZone: string): ZonedParts {
  let format = partFormatters.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    partFormatters.set(timeZone, format)
  }
  const parts = format.formatToParts(new Date(at))
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  const [year, month, day] = [get('year'), get('month'), get('day')]
  return {
    year,
    month,
    day,
    dayKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    minutes: get('hour') * 60 + get('minute'),
  }
}

const splitKey = (dayKey: string) => {
  const [year = 1970, month = 1, day = 1] = dayKey.split('-').map(Number)
  return { year, month, day }
}

/**
 * The UTC instant of a local wall-clock time in the practice time zone.
 * shortcut: a time inside a daylight-saving gap resolves to the nearest real instant; opening hours never fall in one.
 */
export function zonedTimeToUtc(dayKey: string, minutes: number, timeZone: string): number {
  const { year, month, day } = splitKey(dayKey)
  const target = Date.UTC(year, month - 1, day, 0, minutes)
  let guess = target
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const seen = zonedParts(guess, timeZone)
    const correction = target - Date.UTC(seen.year, seen.month - 1, seen.day, 0, seen.minutes)
    if (correction === 0) break
    guess += correction
  }
  return guess
}

export function addDays(dayKey: string, days: number) {
  const { year, month, day } = splitKey(dayKey)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday, matching `workingDays`. */
export const weekdayOf = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`).getUTCDay()

/** Monday of the week that holds this day. */
export const startOfWeek = (dayKey: string) => addDays(dayKey, -((weekdayOf(dayKey) + 6) % 7))

/** A calendar day printed on its own ("Tue 24 Nov"); a day key has no time zone left to apply. */
export function formatDayKey(dayKey: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options })
    .format(new Date(`${dayKey}T12:00:00Z`))
    .replace(',', '')
}

/** The therapist's working days from today through the booking window. */
export function bookingDays(input: {
  now: number
  workingDays: readonly number[]
  timeZone: string
  days?: number
}): string[] {
  const today = zonedParts(input.now, input.timeZone).dayKey
  return Array.from({ length: input.days ?? BOOKING_WINDOW_DAYS }, (_, offset) => addDays(today, offset)).filter((key) =>
    input.workingDays.includes(weekdayOf(key)),
  )
}

/**
 * Start times on one practice day, every 30 minutes from opening, that finish by closing,
 * start after `now` and overlap none of the `busy` visits still holding time.
 */
export function availableStarts(input: {
  dayKey: string
  durationMinutes: number
  busy: ReadonlyArray<Pick<DemoAppointment, 'startsAt' | 'durationMinutes' | 'status'>>
  now: number
  timeZone: string
  workingDays: readonly number[]
}): string[] {
  if (!input.workingDays.includes(weekdayOf(input.dayKey))) return []
  const taken = input.busy.filter(holdsTime).map((appointment) => {
    const start = new Date(appointment.startsAt).getTime()
    return [start, start + appointment.durationMinutes * 60_000] as const
  })
  const starts: string[] = []
  for (let minutes = OPENING_MINUTES; minutes + input.durationMinutes <= CLOSING_MINUTES; minutes += SLOT_STEP_MINUTES) {
    const start = zonedTimeToUtc(input.dayKey, minutes, input.timeZone)
    const end = start + input.durationMinutes * 60_000
    if (start <= input.now) continue
    if (taken.some(([busyStart, busyEnd]) => overlaps(start, end, busyStart, busyEnd))) continue
    starts.push(new Date(start).toISOString())
  }
  return starts
}
