/**
 * Pure helpers behind the progress charts. Every figure on the page (headline answer,
 * chart, summary, table) is read from the series these functions return, so they agree.
 */
import { startOfDay } from 'date-fns'
import {
  areaKeyLabel,
  areaSeries,
  ROM_MOVEMENTS,
  SESSION_RESPONSE_LABEL,
  type Actor,
  type AreaKey,
  type AreaPoint,
  type ArrivalConfirmation,
  type CareObservation,
  type FollowUpResponse,
  type FunctionalGoal,
  type GoalScore,
  type ObservationSource,
  type RomMeasurement,
  type RomMethod,
  type RomMovement,
  type SessionResponse,
  type StiffnessAssessment,
} from '@/domain/care'
import type { DemoAppointment, DemoTherapist } from '@/data/demo/model'
import { dayPhrase, daysBetween, fmtDay, fmtShortDate, fmtTime } from '@/lib/formatting/time'

export const DAY_MS = 86_400_000
/** A stretch longer than this with no entry is drawn as "No entries" and never bridged. */
/** More than a week with no entry at all is drawn as a gap; a weekly rhythm is not. */
export const GAP_DAYS = 8

export type Audience = 'client' | 'therapist'

/** Each source has its own shape (and hue) so the chart reads without colour. */
export type Marker = 'circle-open' | 'diamond' | 'square' | 'triangle' | 'dot'
export type Tone = ObservationSource | 'measure' | 'index' | 'better' | 'worse' | 'same'

export const SOURCE_MARKER: Record<ObservationSource, Marker> = {
  home: 'circle-open',
  arrival: 'diamond',
  session: 'square',
  follow_up: 'triangle',
}

export const SOURCES: readonly ObservationSource[] = ['home', 'arrival', 'session', 'follow_up']

/** Keeps a figure and its unit (or a day and its month) on one line. */
export const nb = (text: string) => text.replace(/ /g, ' ')
export const outOf10 = (score: number) => `${score}/10`
export const plural = (count: number, one: string, many = `${one}s`) => nb(`${count} ${count === 1 ? one : many}`)
export const dayLabel = (at: number) => nb(fmtDay(at))
export const shortDate = (at: number) => nb(fmtShortDate(at))
export const dayAndTime = (at: number) => `${dayLabel(at)} · ${fmtTime(at)}`

/** "today", "yesterday" or "on Sun 22 Nov", for the middle of a sentence. */
export const onDay = (at: number, now: number) => nb(dayPhrase(at, now))

export const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase() + text.slice(1)

// ---------- Visits and the time window ----------

export type Visit = {
  readonly id: string
  /** Start of the band: arrival check or booked start, whichever came first. */
  readonly at: number
  readonly end: number
  readonly therapistId: string
  readonly therapistName: string
}

export function completedVisits(
  appointments: readonly DemoAppointment[],
  therapists: readonly DemoTherapist[],
  clientId: string,
): Visit[] {
  return appointments
    .filter((appointment) => appointment.clientId === clientId && appointment.status === 'completed')
    .map((appointment) => {
      const starts = Date.parse(appointment.startsAt)
      const arrived = appointment.arrival ? Date.parse(appointment.arrival.completedAt) : starts
      const finished = appointment.session?.finishedAt
        ? Date.parse(appointment.session.finishedAt)
        : starts + appointment.durationMinutes * 60_000
      return {
        id: appointment.id,
        at: Math.min(starts, arrived),
        end: Math.max(finished, starts),
        therapistId: appointment.therapistId,
        therapistName: therapists.find((item) => item.id === appointment.therapistId)?.preferredName ?? 'Therapist',
      }
    })
    .sort((a, b) => a.at - b.at)
}

export type RangeKey = 'visits' | 'days30' | 'days90' | 'all'
export const RANGE_KEYS: readonly RangeKey[] = ['visits', 'days30', 'days90', 'all']
export const VISIT_RANGE_COUNT = 6

export function rangePhrase(range: RangeKey, audience: Audience, visitCount: number) {
  switch (range) {
    case 'visits': {
      const count = Math.min(VISIT_RANGE_COUNT, visitCount)
      return count === 1 ? 'since the last visit' : `over the last ${nb(`${count} visits`)}`
    }
    case 'days30':
      return `over the last ${nb('30 days')}`
    case 'days90':
      return `over the last ${nb('90 days')}`
    case 'all':
      return audience === 'client' ? 'since I started' : 'since the first entry'
  }
}

export type TimeWindow = {
  readonly from: number
  readonly to: number
  /** True when the range reached back before anything was recorded and starts at the first entry. */
  readonly startsAtFirstEntry: boolean
}

export function rangeWindow(
  range: RangeKey,
  visits: readonly Visit[],
  firstRecordAt: number | undefined,
  now: number,
): TimeWindow {
  const first = firstRecordAt === undefined ? undefined : startOfDay(firstRecordAt).getTime()
  const sixth = visits.slice(-VISIT_RANGE_COUNT)[0]
  let from: number
  if (range === 'visits' && sixth) from = startOfDay(sixth.at).getTime()
  else if (range === 'days30') from = startOfDay(now - 30 * DAY_MS).getTime()
  else if (range === 'days90') from = startOfDay(now - 90 * DAY_MS).getTime()
  else from = first ?? startOfDay(now - 30 * DAY_MS).getTime()
  const startsAtFirstEntry = first !== undefined && from < first
  return { from: startsAtFirstEntry && first !== undefined ? first : from, to: now, startsAtFirstEntry }
}

export const inWindow = (at: number, window: TimeWindow) => at >= window.from && at <= window.to

// ---------- Gaps ----------

export type Gap = { readonly from: number; readonly to: number; readonly label: string; readonly trailing?: boolean }

/**
 * Stretches inside the window longer than `GAP_DAYS` without a single entry: before the
 * first, between two, and after the last. The chart never draws a line across one.
 */
export function findGaps(times: readonly number[], window: TimeWindow, label = 'No entries'): Gap[] {
  const sorted = times.filter((at) => inWindow(at, window)).sort((a, b) => a - b)
  const limit = GAP_DAYS * DAY_MS
  const edges = [window.from, ...sorted, window.to]
  const gaps: Gap[] = []
  for (let index = 1; index < edges.length; index += 1) {
    const from = edges[index - 1] as number
    const to = edges[index] as number
    if (to - from > limit) gaps.push({ from, to, label, ...(index === edges.length - 1 ? { trailing: true } : {}) })
  }
  return gaps
}

/** Splits consecutive points into runs that a line may join: never across a gap. */
export function lineSegments<T extends { readonly at: number }>(points: readonly T[], gaps: readonly Gap[]): T[][] {
  const segments: T[][] = []
  let current: T[] = []
  for (const point of points) {
    const previous = current.at(-1)
    if (previous && gaps.some((gap) => gap.from < point.at && gap.to > previous.at)) {
      segments.push(current)
      current = []
    }
    current.push(point)
  }
  if (current.length) segments.push(current)
  return segments
}

// ---------- Pain: the headline series ----------

export type PainPoint = AreaPoint & {
  readonly key: string
  readonly at: number
  readonly recordedBy: Actor | undefined
  readonly visit: Visit | undefined
  /** "Still accurate" at a later arrival. An annotation on this point, never a second point. */
  readonly confirmations: ReadonlyArray<{ readonly at: number; readonly visit: Visit | undefined }>
}

export function painSeries(
  observations: readonly CareObservation[],
  confirmations: readonly ArrivalConfirmation[],
  area: AreaKey,
  window: TimeWindow,
  visits: readonly Visit[],
): PainPoint[] {
  const observationById = new Map(observations.map((observation) => [observation.id, observation]))
  const visitById = new Map(visits.map((visit) => [visit.id, visit]))
  const range = { from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString() }
  return areaSeries(observations, confirmations, area, range).map((point) => ({
    ...point,
    key: `${point.observationId}|${point.area}`,
    at: Date.parse(point.observedAt),
    recordedBy: observationById.get(point.observationId)?.recordedBy,
    visit: point.appointmentId ? visitById.get(point.appointmentId) : undefined,
    confirmations: confirmations
      .filter((item) => item.observationId === point.observationId && item.area === point.area)
      .map((item) => ({ at: Date.parse(item.confirmedAt), visit: visitById.get(item.appointmentId) }))
      .sort((a, b) => a.at - b.at),
  }))
}

/** The score that stood at a visit: scored at arrival or during it, or an earlier entry confirmed there. */
export function valueAtVisit(points: readonly PainPoint[], visit: Visit): PainPoint | undefined {
  const own = points.filter(
    (point) => point.visit?.id === visit.id && (point.source === 'arrival' || point.source === 'session'),
  )
  return own.at(-1) ?? points.find((point) => point.confirmations.some((item) => item.visit?.id === visit.id))
}

const SOURCE_PHRASE: Record<Audience, Record<ObservationSource, string>> = {
  client: {
    home: 'at home',
    arrival: 'when you arrived',
    session: 'during your visit',
    follow_up: 'in your next\u2011day follow\u2011up',
  },
  therapist: {
    home: 'logged at home',
    arrival: 'at the arrival check',
    session: 'during the visit',
    follow_up: 'in the next\u2011day follow\u2011up',
  },
}

export const sourcePhrase = (source: ObservationSource, audience: Audience) => SOURCE_PHRASE[audience][source]

export type PainAnswer = { readonly answer: string; readonly summary: string }

/** The sentence under the question, and the one-line summary, both read from `points`. */
export function painAnswer(input: {
  readonly points: readonly PainPoint[]
  readonly area: AreaKey
  readonly visits: readonly Visit[]
  readonly window: TimeWindow
  readonly phrase: string
  readonly audience: Audience
  readonly clientName: string
  readonly now: number
  /** The latest entry before the window, used only when the window itself is empty. */
  readonly earlier?: PainPoint | undefined
}): PainAnswer {
  const { points, audience, now } = input
  const areaName = lowerFirst(areaKeyLabel(input.area))
  const subject = audience === 'client' ? `Your ${areaName}` : `${input.clientName}’s ${areaName}`
  const latest = points.at(-1)
  if (!latest) {
    const before = input.earlier
      ? ` The last entry was ${outOf10(input.earlier.pain)} ${onDay(input.earlier.at, now)}.`
      : ''
    return { answer: `No ${areaName} entries ${input.phrase}.${before}`, summary: '' }
  }

  const windowVisits = input.visits.filter((visit) => inWindow(visit.at, input.window))
  const lastVisit = input.visits.at(-1)
  let atVisit: { visit: Visit; point: PainPoint } | undefined
  for (const visit of [...windowVisits].reverse()) {
    const point = valueAtVisit(points, visit)
    if (point) {
      atVisit = { visit, point }
      break
    }
  }

  const latestPart = `${outOf10(latest.pain)} ${onDay(latest.at, now)} ${sourcePhrase(latest.source, audience)}`
  let answer: string
  if (atVisit) {
    const whose = audience === 'client' ? 'your' : 'the'
    const visitPart =
      atVisit.visit.id === lastVisit?.id
        ? `at ${whose} last visit ${onDay(atVisit.visit.at, now)}`
        : `at ${whose} visit ${onDay(atVisit.visit.at, now)}`
    answer =
      atVisit.point.key === latest.key || latest.at <= atVisit.visit.at
        ? `${subject} was ${outOf10(atVisit.point.pain)} ${visitPart}.`
        : `${subject} was ${outOf10(atVisit.point.pain)} ${visitPart} and ${latestPart}.`
  } else {
    answer = `${subject} was ${latestPart}.`
  }

  const scores = points.map((point) => point.pain)
  const low = Math.min(...scores)
  const high = Math.max(...scores)
  const spread = low === high ? `all at ${outOf10(low)}` : `between ${outOf10(low)} and ${outOf10(high)}`
  return { answer, summary: `${plural(points.length, 'entry', 'entries')} ${input.phrase}, ${spread}.` }
}

/** "No entries since …" whenever the series stops before the window ends (it always ends today). */
export function endsEarly(lastAt: number | undefined, window: TimeWindow): string | null {
  if (lastAt === undefined || daysBetween(lastAt, window.to) < 1) return null
  return `No entries since ${dayLabel(lastAt)}`
}

// ---------- Therapist measures ----------

export type Measured<T> = T & { readonly at: number }

export function stiffnessSeries(
  items: readonly StiffnessAssessment[],
  area: AreaKey,
  window: TimeWindow,
): Array<Measured<StiffnessAssessment>> {
  return items
    .filter((item) => item.area === area)
    .map((item) => ({ ...item, at: Date.parse(item.recordedAt) }))
    .filter((item) => inWindow(item.at, window))
    .sort((a, b) => a.at - b.at)
}

/**
 * Visits inside the window where a visit-based measure was not taken. Drawn as a gap
 * around that visit so a line never pretends it was measured.
 */
export function unmeasuredVisits(
  visits: readonly Visit[],
  measuredVisitIds: ReadonlySet<string>,
  window: TimeWindow,
  first: number | undefined,
  last: number | undefined,
): Gap[] {
  if (first === undefined || last === undefined) return []
  return visits
    .filter((visit) => inWindow(visit.at, window) && visit.at > first && visit.at < last && !measuredVisitIds.has(visit.id))
    .map((visit) => ({ from: visit.at - DAY_MS / 2, to: visit.end + DAY_MS / 2, label: 'Not measured' }))
}

const MOVEMENT_ORDER = Object.keys(ROM_MOVEMENTS) as RomMovement[]
const METHOD_ORDER: readonly RomMethod[] = ['goniometer', 'visual_estimate']

export type RomGroup = {
  readonly key: string
  readonly movement: RomMovement
  readonly side: RomMeasurement['side']
  readonly method: RomMethod
  readonly typicalDegrees: number
  readonly points: ReadonlyArray<Measured<RomMeasurement>>
}

/** Only like with like: one group per movement, side and method. Methods are never mixed. */
export function romGroups(items: readonly RomMeasurement[], window: TimeWindow): RomGroup[] {
  const groups = new Map<string, Array<Measured<RomMeasurement>>>()
  for (const item of items) {
    const at = Date.parse(item.recordedAt)
    if (!inWindow(at, window)) continue
    const key = `${item.movement}|${item.side}|${item.method}`
    groups.set(key, [...(groups.get(key) ?? []), { ...item, at }])
  }
  return [...groups.entries()]
    .map(([key, points]) => {
      const sample = points[0] as RomMeasurement
      return {
        key,
        movement: sample.movement,
        side: sample.side,
        method: sample.method,
        typicalDegrees: ROM_MOVEMENTS[sample.movement].typicalDegrees,
        points: points.sort((a, b) => a.at - b.at),
      }
    })
    .sort(
      (a, b) =>
        MOVEMENT_ORDER.indexOf(a.movement) - MOVEMENT_ORDER.indexOf(b.movement) ||
        a.side.localeCompare(b.side) ||
        METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method),
    )
}

export function romTitle(group: Pick<RomGroup, 'movement' | 'side'>) {
  const label = ROM_MOVEMENTS[group.movement].label
  return `${label}, ${group.side}`
}

// ---------- Client goals and the day after ----------

export type GoalSeries = { readonly goal: FunctionalGoal; readonly scores: ReadonlyArray<Measured<GoalScore>> }

/** Goals for the chosen area first, then the rest; active goals before paused or achieved ones. */
export function goalSeries(
  goals: readonly FunctionalGoal[],
  scores: readonly GoalScore[],
  clientId: string,
  area: AreaKey | undefined,
  window: TimeWindow,
): GoalSeries[] {
  const rank = (goal: FunctionalGoal) => (goal.area === area ? 0 : 2) + (goal.status === 'active' ? 0 : 1)
  return goals
    .filter((goal) => goal.clientId === clientId)
    .sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt))
    .map((goal) => ({
      goal,
      scores: scores
        .filter((score) => score.goalId === goal.id && score.clientId === clientId)
        .map((score) => ({ ...score, at: Date.parse(score.recordedAt) }))
        .filter((score) => inWindow(score.at, window))
        .sort((a, b) => a.at - b.at),
    }))
}

export type DayAfter = { readonly visit: Visit; readonly response: Measured<FollowUpResponse> | undefined }

/** One row per visit in the window, with the next-day reply when there was one. */
export function dayAfterSeries(
  followUps: readonly FollowUpResponse[],
  visits: readonly Visit[],
  window: TimeWindow,
): DayAfter[] {
  return visits
    .filter((visit) => inWindow(visit.at, window))
    .map((visit) => {
      const response = followUps
        .filter((item) => item.appointmentId === visit.id)
        .sort((a, b) => a.respondedAt.localeCompare(b.respondedAt))
        .at(-1)
      return { visit, response: response ? { ...response, at: Date.parse(response.respondedAt) } : undefined }
    })
}

export const responseLabel = (response: SessionResponse) => SESSION_RESPONSE_LABEL[`${response}`]
export const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0')

export function dayAfterSummary(rows: readonly DayAfter[], audience: Audience) {
  const replied = rows.filter((row) => row.response)
  if (!rows.length) return 'No visits in this period.'
  if (!replied.length) return `No next-day replies for ${plural(rows.length, 'visit')} in this period.`
  const counts = new Map<SessionResponse, number>()
  for (const row of replied) {
    const value = row.response?.response
    if (value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const parts = ([2, 1, 0, -1, -2] as const)
    .filter((value) => counts.has(value))
    .map((value) => `${lowerFirst(responseLabel(value))} ${plural(counts.get(value) ?? 0, 'time')}`)
  const who = audience === 'client' ? 'You replied' : 'Replied'
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]
  return `${who} the day after ${replied.length} of ${plural(rows.length, 'visit')}: ${list}.`
}

/** Range summary for a 0–10 or degree series: count, spread and the latest value. */
export function measureSummary(values: readonly number[], format: (value: number) => string, what: string) {
  if (!values.length) return ''
  const low = Math.min(...values)
  const high = Math.max(...values)
  const latest = values.at(-1) as number
  const spread = low === high ? `all at ${format(low)}` : `between ${format(low)} and ${format(high)}`
  return `${what} ${plural(values.length, 'time')}, ${spread}; ${format(latest)} most recently.`
}
