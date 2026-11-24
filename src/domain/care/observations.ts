import {
  areaKey,
  expandSide,
  getRegion,
  type AnatomicalSide,
  type AreaKey,
  type ChosenSide,
  type RegionId,
} from './regions'
import type {
  ArrivalConfirmation,
  CareObservation,
  ObservationSource,
  PainEntry,
} from './types'

/**
 * More than a week with no entry at all is a gap in the record. Charts and the doctor report
 * both draw it as a gap and never bridge it; a weekly rhythm of visits is not a gap.
 */
export const GAP_DAYS = 8

/** The one gap rule every chart, sparkline and report sentence uses: more than GAP_DAYS × 24 hours apart. */
export const isGap = (from: number, to: number) => to - from > GAP_DAYS * 86_400_000

export type PainSelection = { readonly region: RegionId; readonly side: ChosenSide; readonly pain: number }

export function assertPainScore(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    throw new RangeError('A pain score must be a whole number from 0 to 10.')
  }
  return value
}

/**
 * Turns what a person picked into stored entries. "Both" becomes one entry per side,
 * so a left-shoulder chart always contains every left-shoulder score.
 */
export function painEntriesFromSelections(selections: readonly PainSelection[]): PainEntry[] {
  const byArea = new Map<AreaKey, PainEntry>()
  for (const selection of selections) {
    assertPainScore(selection.pain)
    for (const side of expandSide(selection.region, selection.side)) {
      byArea.set(areaKey(selection.region, side), {
        region: selection.region,
        side,
        pain: selection.pain,
      })
    }
  }
  return [...byArea.values()]
}

/** "Still accurate" at a later arrival: when, and for which visit. */
export type PointConfirmation = { readonly at: string; readonly appointmentId: string }

/** One plotted score for one area. Confirmations annotate it; they never duplicate it. */
export type AreaPoint = {
  readonly observationId: string
  readonly area: AreaKey
  readonly region: RegionId
  readonly side: AnatomicalSide
  readonly pain: number
  readonly observedAt: string
  readonly recordedAt: string
  readonly source: ObservationSource
  readonly appointmentId?: string
  readonly note?: string
  readonly confirmedAt: readonly PointConfirmation[]
}

const time = (iso: string) => new Date(iso).getTime()

export function compareObservations(a: CareObservation, b: CareObservation): number {
  return time(a.observedAt) - time(b.observedAt) || time(a.recordedAt) - time(b.recordedAt)
}

export function areaPoints(
  observations: readonly CareObservation[],
  confirmations: readonly ArrivalConfirmation[] = [],
): AreaPoint[] {
  const confirmationsByPoint = new Map<string, PointConfirmation[]>()
  for (const confirmation of [...confirmations].sort((a, b) => time(a.confirmedAt) - time(b.confirmedAt))) {
    const key = `${confirmation.observationId}|${confirmation.area}`
    confirmationsByPoint.set(key, [
      ...(confirmationsByPoint.get(key) ?? []),
      { at: confirmation.confirmedAt, appointmentId: confirmation.appointmentId },
    ])
  }
  return [...observations].sort(compareObservations).flatMap((observation) =>
    observation.entries.map((entry) => {
      const area = areaKey(entry.region, entry.side)
      return {
        observationId: observation.id,
        area,
        region: entry.region,
        side: entry.side,
        pain: entry.pain,
        observedAt: observation.observedAt,
        recordedAt: observation.recordedAt,
        source: observation.source,
        ...(observation.appointmentId ? { appointmentId: observation.appointmentId } : {}),
        ...(observation.note ? { note: observation.note } : {}),
        confirmedAt: confirmationsByPoint.get(`${observation.id}|${area}`) ?? [],
      }
    }),
  )
}

export function areaSeries(
  observations: readonly CareObservation[],
  confirmations: readonly ArrivalConfirmation[],
  area: AreaKey,
  range?: { from?: string; to?: string },
): AreaPoint[] {
  const from = range?.from ? time(range.from) : -Infinity
  const to = range?.to ? time(range.to) : Infinity
  return areaPoints(observations, confirmations).filter(
    (point) => point.area === area && time(point.observedAt) >= from && time(point.observedAt) <= to,
  )
}

/**
 * When the client last stood by this score: the moment it was recorded, or a later
 * "still accurate" at arrival up to `asOf`. The score and its own date never change.
 */
export function lastReportedAt(point: AreaPoint, asOf = Infinity): number {
  return Math.max(time(point.observedAt), ...point.confirmedAt.map((item) => time(item.at)).filter((at) => at <= asOf))
}

/** Latest score per area observed at or before `asOf`, annotated with its confirmations. */
export function latestByArea(
  observations: readonly CareObservation[],
  asOf?: string,
  confirmations: readonly ArrivalConfirmation[] = [],
): Map<AreaKey, AreaPoint> {
  const limit = asOf ? time(asOf) : Infinity
  const latest = new Map<AreaKey, AreaPoint>()
  for (const point of areaPoints(observations, confirmations)) {
    if (time(point.observedAt) <= limit) latest.set(point.area, point)
  }
  return latest
}

/** Areas the client has ever recorded, most recently reported first. */
export function recordedAreas(observations: readonly CareObservation[]): AreaKey[] {
  return [...latestByArea(observations).values()]
    .sort((a, b) => time(b.observedAt) - time(a.observedAt))
    .map((point) => point.area)
}

/**
 * What changed since the client's previous visit: every home, follow-up or arrival
 * observation observed after `since` and before `until`, newest first. An arrival update
 * is the newest word on an area, so it leads, as it does on the body figure.
 */
export function updatesBetween(
  observations: readonly CareObservation[],
  since: string | undefined,
  until: string,
): CareObservation[] {
  const start = since ? time(since) : -Infinity
  const end = time(until)
  return observations
    .filter(
      (observation) =>
        (observation.source === 'home' || observation.source === 'follow_up' || observation.source === 'arrival') &&
        time(observation.observedAt) > start &&
        time(observation.observedAt) <= end,
    )
    .sort((a, b) => compareObservations(b, a))
}

export const ARRIVAL_LOOKBACK_DAYS = 30
const PREVIOUS_VISIT_MARGIN_MS = 12 * 3_600_000

/**
 * The areas a client is asked to confirm or update at arrival: the latest report for every
 * area mentioned or confirmed at or since the previous visit (or in the last 30 days for a
 * first visit). An area nobody mentioned at the last visit is treated as settled, so arrival
 * stays short.
 */
export function areasToReview(
  observations: readonly CareObservation[],
  appointmentStartsAt: string,
  previousVisitAt?: string,
  confirmations: readonly ArrivalConfirmation[] = [],
): AreaPoint[] {
  const windowStart = previousVisitAt
    ? time(previousVisitAt) - PREVIOUS_VISIT_MARGIN_MS
    : time(appointmentStartsAt) - ARRIVAL_LOOKBACK_DAYS * 86_400_000
  return [...latestByArea(observations, appointmentStartsAt, confirmations).values()]
    .filter((point) => lastReportedAt(point, time(appointmentStartsAt)) >= windowStart)
    .sort((a, b) => b.pain - a.pain || time(b.observedAt) - time(a.observedAt))
}

export type SessionPointStatus = 'confirmed' | 'updated' | 'new' | 'unconfirmed'

export type SessionPainPoint = AreaPoint & { readonly status: SessionPointStatus }

/**
 * The scores standing at a visit. After arrival intake they are exactly what the client
 * confirmed or updated; before it, the latest reports with their original dates. A 0/10 is a
 * real score and stays: the Recovery Index counts it, and only screens that show discomfort hide it.
 */
export function sessionPainPoints(input: {
  readonly observations: readonly CareObservation[]
  readonly confirmations: readonly ArrivalConfirmation[]
  readonly appointmentId: string
  readonly appointmentStartsAt: string
  readonly arrivalCompleted: boolean
  readonly previousVisitAt?: string
}): SessionPainPoint[] {
  const { observations, confirmations, appointmentId } = input
  if (!input.arrivalCompleted) {
    return areasToReview(observations, input.appointmentStartsAt, input.previousVisitAt, confirmations).map(
      (point) => ({ ...point, status: 'unconfirmed' as const }),
    )
  }

  const points = areaPoints(observations, confirmations)
  const arrival = observations.find(
    (observation) => observation.appointmentId === appointmentId && observation.source === 'arrival',
  )
  const earlierAreas = new Set(
    points
      .filter((point) => point.observationId !== arrival?.id && time(point.observedAt) <= time(input.appointmentStartsAt))
      .map((point) => point.area),
  )
  const result = new Map<AreaKey, SessionPainPoint>()
  for (const confirmation of confirmations.filter((item) => item.appointmentId === appointmentId)) {
    const point = points.find(
      (item) => item.observationId === confirmation.observationId && item.area === confirmation.area,
    )
    if (point) result.set(point.area, { ...point, status: 'confirmed' })
  }
  for (const point of points.filter((item) => item.observationId === arrival?.id)) {
    result.set(point.area, { ...point, status: earlierAreas.has(point.area) ? 'updated' : 'new' })
  }
  return [...result.values()].sort((a, b) => b.pain - a.pain)
}

/** Groups a list of areas by whether they are seen from the front, the back or both. */
export function areaSurface(region: RegionId) {
  return getRegion(region).surface
}
