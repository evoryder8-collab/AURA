/** Timestamps are stored in UTC and shown in the practice's time zone. */
export const PRACTICE_TIME_ZONE: string =
  (import.meta.env.VITE_PRACTICE_TIMEZONE as string | undefined) ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  'UTC'

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(options)
  let value = formatters.get(key)
  if (!value) {
    value = new Intl.DateTimeFormat('en-GB', { timeZone: PRACTICE_TIME_ZONE, ...options })
    formatters.set(key, value)
  }
  return value
}

const toDate = (value: string | number | Date) => (value instanceof Date ? value : new Date(value))

export const fmtTime = (value: string | number | Date) =>
  formatter({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(toDate(value))

export const fmtDay = (value: string | number | Date) =>
  formatter({ weekday: 'short', day: 'numeric', month: 'short' }).format(toDate(value)).replace(',', '')

export const fmtDate = (value: string | number | Date) =>
  formatter({ day: 'numeric', month: 'long', year: 'numeric' }).format(toDate(value))

export const fmtShortDate = (value: string | number | Date) =>
  formatter({ day: 'numeric', month: 'short' }).format(toDate(value))

/** yyyy-mm-dd of the calendar day in the practice time zone. */
export function dayKey(value: string | number | Date) {
  const parts = formatter({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(toDate(value))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function daysBetween(from: string | number | Date, to: string | number | Date) {
  const a = Date.parse(`${dayKey(from)}T00:00:00Z`)
  const b = Date.parse(`${dayKey(to)}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** "Today", "Yesterday", "Tomorrow" or "Sun 22 Nov". */
export function relativeDay(value: string | number | Date, now: string | number | Date = Date.now()) {
  const diff = daysBetween(now, value)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return fmtDay(value)
}

/** "Yesterday · 18:40" */
export const relativeWhen = (value: string | number | Date, now: string | number | Date = Date.now()) =>
  `${relativeDay(value, now)} · ${fmtTime(value)}`

export function greeting(now: number | Date = Date.now()) {
  const hour = Number(formatter({ hour: '2-digit', hourCycle: 'h23' }).format(toDate(now)))
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export const minutesLabel = (minutes: number) => `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
