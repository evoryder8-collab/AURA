export type FollowUpDueStatus = 'not_due' | 'due' | 'completed'

interface DateTimeParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

function timestamp(value: string | Date, label: string): number {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new RangeError(`${label} must be a valid timestamp.`)
  }
  return parsed
}

function zonedParts(value: number, timeZone: string): DateTimeParts {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
  } catch {
    throw new RangeError('Practice time zone must be a valid IANA time zone.')
  }
  const parts = new Map(
    formatter
      .formatToParts(new Date(value))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  const result = {
    year: parts.get('year'),
    month: parts.get('month'),
    day: parts.get('day'),
    hour: parts.get('hour'),
    minute: parts.get('minute'),
    second: parts.get('second'),
  }
  if (Object.values(result).some((part) => part == null || !Number.isFinite(part))) {
    throw new RangeError('Unable to resolve the practice-local date and time.')
  }
  return result as DateTimeParts
}

function comparableUtc(parts: DateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}

function localDateTimeToUtc(parts: DateTimeParts, timeZone: string): number {
  const targetComparable = comparableUtc(parts)
  let guess = targetComparable

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(guess, timeZone)
    const correction = targetComparable - comparableUtc(actual)
    if (correction === 0) return guess
    guess += correction
  }

  const actual = zonedParts(guess, timeZone)
  if (comparableUtc(actual) !== targetComparable) {
    throw new RangeError('The configured local follow-up time does not exist in this time zone.')
  }
  return guess
}

export function getNextDayFollowUpDueAt(
  completedAt: string | Date,
  practiceTimeZone: string,
  dueHour = 9,
): string {
  if (!Number.isSafeInteger(dueHour) || dueHour < 0 || dueHour > 23) {
    throw new RangeError('Follow-up due hour must be an integer from 0 through 23.')
  }
  const completed = timestamp(completedAt, 'Completion time')
  const completedLocal = zonedParts(completed, practiceTimeZone)
  const nextLocalDate = new Date(
    Date.UTC(completedLocal.year, completedLocal.month - 1, completedLocal.day + 1),
  )
  const target: DateTimeParts = {
    year: nextLocalDate.getUTCFullYear(),
    month: nextLocalDate.getUTCMonth() + 1,
    day: nextLocalDate.getUTCDate(),
    hour: dueHour,
    minute: 0,
    second: 0,
  }
  return new Date(localDateTimeToUtc(target, practiceTimeZone)).toISOString()
}

export function getFollowUpDueStatus(
  dueAt: string | Date,
  respondedAt: string | Date | null,
  now: string | Date = new Date(),
): FollowUpDueStatus {
  const due = timestamp(dueAt, 'Follow-up due time')
  const current = timestamp(now, 'Current time')
  if (respondedAt != null) {
    timestamp(respondedAt, 'Follow-up response time')
    return 'completed'
  }
  return current >= due ? 'due' : 'not_due'
}
