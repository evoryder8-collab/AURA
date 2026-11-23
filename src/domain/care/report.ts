import { areaKeyLabel, parseAreaKey, surfaceOf, type AreaKey } from './regions'
import { areaSeries, latestByArea, type AreaPoint } from './observations'
import type {
  ArrivalConfirmation,
  CareObservation,
  DoctorReport,
  FunctionalGoal,
  GoalScore,
  ReportFigureView,
  RomMeasurement,
  TherapistNote,
} from './types'
import { ROM_MOVEMENTS } from './types'

/** Front, back, or both — whatever guarantees every selected area is visible. */
export function figureViews(areas: readonly AreaKey[], view: ReportFigureView): Array<'front' | 'back'> {
  if (view === 'front') return ['front']
  if (view === 'back') return ['back']
  if (view === 'paired') return ['front', 'back']
  const surfaces = new Set(
    areas.map((key) => {
      const parsed = parseAreaKey(key)
      return parsed ? surfaceOf(parsed.region, parsed.side) : 'edge'
    }),
  )
  if (surfaces.has('front') && surfaces.has('back')) return ['front', 'back']
  if (surfaces.has('back')) return ['back']
  return ['front']
}

/** Areas that the chosen views cannot show; a report with any of these is incomplete. */
export function hiddenAreas(areas: readonly AreaKey[], views: ReadonlyArray<'front' | 'back'>): AreaKey[] {
  return areas.filter((key) => {
    const parsed = parseAreaKey(key)
    if (!parsed) return true
    const surface = surfaceOf(parsed.region, parsed.side)
    return surface !== 'edge' && !views.includes(surface)
  })
}

export type ReportAreaSummary = {
  readonly area: AreaKey
  readonly label: string
  readonly latest: AreaPoint | undefined
  readonly first: AreaPoint | undefined
  readonly series: readonly AreaPoint[]
  readonly peak: number | undefined
}

export type ReportRomGroup = {
  readonly key: string
  readonly label: string
  readonly typicalDegrees: number
  readonly method: RomMeasurement['method']
  readonly side: RomMeasurement['side']
  readonly points: readonly RomMeasurement[]
}

export type ReportContent = {
  readonly report: DoctorReport
  readonly views: Array<'front' | 'back'>
  readonly areas: readonly ReportAreaSummary[]
  readonly rom: readonly ReportRomGroup[]
  readonly goals: ReadonlyArray<{ goal: FunctionalGoal; scores: readonly GoalScore[] }>
  /** Client-reported notes in range, attributed and dated. */
  readonly clientNotes: ReadonlyArray<{ observedAt: string; text: string; source: AreaPoint['source'] }>
}

const inRange = (iso: string, from: string, to: string) => {
  const value = new Date(iso).getTime()
  return value >= new Date(from).getTime() && value <= new Date(to).getTime()
}

/**
 * Collects exactly what a report may show. Therapist notes are not an input: the report
 * carries only the wording the therapist chose for it, so private notes cannot leak.
 */
export function buildReportContent(input: {
  readonly report: DoctorReport
  readonly observations: readonly CareObservation[]
  readonly confirmations: readonly ArrivalConfirmation[]
  readonly rom: readonly RomMeasurement[]
  readonly goals: readonly FunctionalGoal[]
  readonly goalScores: readonly GoalScore[]
}): ReportContent {
  const { report } = input
  const range = { from: report.dateFrom, to: report.dateTo }
  const views = figureViews(report.areas, report.view)
  const latest = latestByArea(input.observations, report.dateTo)

  const areas = report.areas.map((area) => {
    const series = areaSeries(input.observations, input.confirmations, area, range)
    return {
      area,
      label: areaKeyLabel(area),
      latest: series.at(-1) ?? latest.get(area),
      first: series[0],
      series,
      peak: series.length ? Math.max(...series.map((point) => point.pain)) : undefined,
    }
  })

  const romGroups = new Map<string, RomMeasurement[]>()
  for (const measurement of input.rom.filter((item) => inRange(item.recordedAt, report.dateFrom, report.dateTo))) {
    const key = `${measurement.movement}:${measurement.side}:${measurement.method}`
    romGroups.set(key, [...(romGroups.get(key) ?? []), measurement])
  }
  const rom = [...romGroups.entries()].map(([key, points]) => {
    const first = points[0] as RomMeasurement
    return {
      key,
      label: `${first.side === 'left' ? 'Left' : 'Right'} ${ROM_MOVEMENTS[first.movement].label.toLocaleLowerCase()}`,
      typicalDegrees: ROM_MOVEMENTS[first.movement].typicalDegrees,
      method: first.method,
      side: first.side,
      points: [...points].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
    }
  })

  const selectedAreas = new Set(report.areas)
  const goals = input.goals
    .filter((goal) => selectedAreas.has(goal.area))
    .map((goal) => ({
      goal,
      scores: input.goalScores
        .filter((score) => score.goalId === goal.id && inRange(score.recordedAt, report.dateFrom, report.dateTo))
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
    }))

  const clientNotes = input.observations
    .filter(
      (observation) =>
        observation.note &&
        observation.recordedBy.role === 'client' &&
        inRange(observation.observedAt, report.dateFrom, report.dateTo) &&
        observation.entries.some((entry) => selectedAreas.has(`${entry.region}:${entry.side}`)),
    )
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    .map((observation) => ({
      observedAt: observation.observedAt,
      text: observation.note ?? '',
      source: observation.source,
    }))

  return { report, views, areas, rom, goals, clientNotes }
}

/** Notes a therapist may pick for a report: only those written for one, newest first. */
export function reportNoteChoices(notes: readonly TherapistNote[], clientId: string): TherapistNote[] {
  return notes
    .filter((note) => note.clientId === clientId && note.visibility === 'report')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** A report can be exported only once the client agreed to this recipient and purpose. */
export function reportIsExportable(report: DoctorReport): boolean {
  return (
    report.status === 'consented' &&
    report.consent !== undefined &&
    report.consent.recipient === report.recipient &&
    report.consent.purpose === report.purpose &&
    report.consent.includesPhotos === report.includePhotos
  )
}
