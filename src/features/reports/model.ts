import {
  OBSERVATION_SOURCE_LABEL,
  ROM_METHOD_LABEL,
  figureViews,
  hiddenAreas,
  type AreaKey,
  type AreaPoint,
  type DoctorReport,
  type ObservationSource,
  type ReportContent,
  type ReportSection,
  type RomMeasurement,
} from '@/domain/care'
import { addDays, practiceMidnight } from '@/lib/dates/practice'
import { dayKey, PRACTICE_TIME_ZONE } from '@/lib/formatting/time'

/**
 * Everything the preview and the PDF print, computed once from `buildReportContent()`.
 * Both renderers read only this, so a number on screen and in the file cannot disagree.
 */

const DAY = 86_400_000
import { GAP_DAYS } from '@/domain/care'
export { GAP_DAYS }

const formatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: PRACTICE_TIME_ZONE, ...options })
const dayMonthYear = formatter({ day: 'numeric', month: 'short', year: 'numeric' })
const dayMonth = formatter({ day: 'numeric', month: 'short' })
const longDate = formatter({ day: 'numeric', month: 'long', year: 'numeric' })
const yearOnly = formatter({ year: 'numeric' })

/** "23 Nov 2026" */
export const fmtMed = (iso: string) => dayMonthYear.format(new Date(iso))
/** "23 Nov" */
export const fmtDayMonth = (iso: string) => dayMonth.format(new Date(iso))
/** "23 November 2026" */
export const fmtLong = (iso: string) => longDate.format(new Date(iso))

/** "12 Oct – 23 Nov 2026", or with both years when the period crosses one. */
export function fmtPeriod(from: string, to: string) {
  const sameYear = yearOnly.format(new Date(from)) === yearOnly.format(new Date(to))
  return `${sameYear ? fmtDayMonth(from) : fmtMed(from)} – ${fmtMed(to)}`
}

/** yyyy-mm-dd of `iso` in the practice time zone, for date inputs. */
export const practiceDay = (iso: string) => dayKey(iso)

const time = (iso: string) => new Date(iso).getTime()

/** Whole calendar days from `a` to `b`; a daylight-saving hour never tips a two-week gap over. */
export const daysApart = (a: string, b: string) => Math.round((time(b) - time(a)) / DAY)

export type RangePreset = 'visits' | 'months' | 'custom'

/** Report period for a preset; `visitStarts` are the client's completed visits, any order. */
export function presetRange(
  preset: Exclude<RangePreset, 'custom'>,
  visitStarts: readonly string[],
  now: Date,
): { dateFrom: string; dateTo: string } {
  const dateTo = now.toISOString()
  if (preset === 'visits') {
    const recent = [...visitStarts].filter((at) => time(at) <= now.getTime()).sort().slice(-6)
    const first = recent[0]
    if (first) return { dateFrom: practiceMidnight(practiceDay(first)), dateTo }
  }
  const threeMonths = new Date(now)
  threeMonths.setMonth(threeMonths.getMonth() - 3)
  return { dateFrom: practiceMidnight(practiceDay(threeMonths.toISOString())), dateTo }
}

/** Custom period from two date inputs: the whole of both days, never past `now`. */
export function customRange(fromDay: string, toDay: string, now: Date) {
  const dateFrom = practiceMidnight(fromDay)
  const endOfDay = time(practiceMidnight(addDays(toDay, 1))) - 1
  return { dateFrom, dateTo: new Date(Math.min(endOfDay, now.getTime())).toISOString() }
}

export const SECTION_LABEL: Record<ReportSection, string> = {
  bodyMap: 'Body map',
  painTrend: 'Pain over time',
  rangeOfMotion: 'Range of motion',
  goals: 'Everyday goals',
  visits: 'Visits',
  photos: 'Photographs',
}

export const SOURCE_SHORT: Record<ObservationSource, string> = {
  home: 'at home',
  arrival: 'arrival check',
  session: 'treatment visit',
  follow_up: 'next-day follow-up',
}

const ROLE_WORDS = new Set(['family', 'doctor', 'gp', 'general', 'physician', 'physiotherapist', 'physio', 'osteopath', 'chiropractor', 'specialist', 'consultant', 'nurse', 'orthopaedic', 'orthopedic', 'sports', 'surgeon', 'rheumatologist', 'neurologist', 'practitioner'])

/** "Family doctor" reads "my family doctor" in a sentence; a name such as "Dr Lena Brandt" stays as typed. */
export function recipientInSentence(recipient: string, article: 'my' | 'your' | 'the') {
  const text = recipient.trim()
  const word = text.split(/\s+/)[0] ?? ''
  if (!ROLE_WORDS.has(word.toLocaleLowerCase())) return text
  // An abbreviation such as "GP" keeps its capitals.
  const acronym = word.length > 1 && word === word.toLocaleUpperCase()
  return `${article} ${acronym ? text : text.charAt(0).toLocaleLowerCase() + text.slice(1)}`
}

export const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase() + text.slice(1)
export const upperFirst = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1)
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const names = (list: readonly string[]) =>
  list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`

function extremeOf(values: readonly number[], latest: number, kind: 'highest' | 'lowest') {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return ''
  const target = kind === 'highest' ? max : min
  if (latest !== target) return ''
  const ties = values.filter((value) => value === target).length
  return ties === 1 ? `, the ${kind} in this period` : `, equal to the ${kind} in this period`
}

/** "…, the highest in this period" when the latest value is an extreme; nothing otherwise. */
function latestRemark(values: readonly number[], latest: number) {
  return extremeOf(values, latest, 'highest') || extremeOf(values, latest, 'lowest')
}

// ---------------------------------------------------------------- inputs and view

export type ReportVisit = {
  readonly id: string
  readonly startsAt: string
  /** When arrival was completed; a confirmation at that moment belongs to this visit. */
  readonly arrivalAt?: string
  readonly therapistId: string
}

export type ReportNoteAttribution = {
  readonly authorName: string
  readonly writtenAt: string
  readonly editedBy?: { readonly name: string; readonly at: string }
}

export type ReportPhoto = { readonly id: string; readonly capturedAt: string; readonly view: string; readonly src: string }

export type ReportInputs = {
  readonly content: ReportContent
  readonly client: { readonly name: string; readonly dateOfBirth?: string }
  readonly preparedBy: { readonly name: string; readonly title: string }
  readonly therapistNames: Readonly<Record<string, string>>
  readonly visits: readonly ReportVisit[]
  readonly note?: ReportNoteAttribution
  /** Only photos the report may show: included by the therapist and in the period. */
  readonly photos: readonly ReportPhoto[]
}

export type SeriesPoint = {
  readonly at: string
  readonly value: number
  readonly source: ObservationSource | 'measured'
}

export type ReportChart = {
  readonly key: string
  readonly title: string
  /** Who recorded it, e.g. "Client-reported" or "Measured by Pratana Halstrick (goniometer)". */
  readonly attribution: string
  readonly unit: '/10' | '°'
  readonly yMax: number
  readonly points: readonly SeriesPoint[]
  readonly reference?: { readonly value: number; readonly label: string }
  readonly summary: string
  /** Plain statements about stretches without records, e.g. "No scores since 2 Nov". */
  readonly gaps: readonly string[]
}

export type FigureMarker = {
  readonly area: AreaKey
  readonly label: string
  readonly pain: number
  readonly observedAt: string
}

export type ReportFigure = {
  readonly view: 'front' | 'back'
  readonly markers: readonly FigureMarker[]
  readonly caption: string
}

export type AreaRow = {
  readonly area: AreaKey
  readonly label: string
  readonly latest: string
  readonly latestPain: number | null
  readonly recorded: string
  readonly range: string
  readonly count: number
  readonly trend: string
}

export type Quote = { readonly text: string; readonly attribution: string }

export type VisitTable = {
  readonly columns: readonly string[]
  readonly rows: ReadonlyArray<{ readonly date: string; readonly therapist: string; readonly cells: readonly string[] }>
  readonly summary: string
  readonly footnotes: readonly string[]
}

export type ReportView = {
  readonly range: { readonly from: string; readonly to: string }
  readonly clientName: string
  readonly clientBorn: string | null
  readonly preparedBy: string
  readonly preparedByTitle: string
  readonly preparedOn: string
  readonly recipient: string
  readonly purpose: string
  readonly recommendation: string
  readonly period: string
  readonly periodDetail: string
  readonly areas: readonly AreaRow[]
  readonly therapistNote: Quote | null
  readonly recentWords: readonly Quote[]
  readonly earlierWords: readonly Quote[]
  readonly figures: readonly ReportFigure[] | null
  readonly hidden: readonly string[]
  readonly painCharts: readonly ReportChart[] | null
  readonly romCharts: readonly ReportChart[] | null
  readonly goalCharts: readonly ReportChart[] | null
  readonly visits: VisitTable | null
  readonly photos: readonly { readonly src: string; readonly caption: string }[] | null
  readonly consent: string | null
  readonly about: readonly string[]
}

const RECENT_WORDS = 3

function gapStatements(points: readonly SeriesPoint[], from: string, to: string, noun: string): string[] {
  if (!points.length) return [`No ${noun} were recorded in this period.`]
  const out: string[] = []
  const first = points[0] as SeriesPoint
  if (daysApart(from, first.at) > GAP_DAYS) out.push(`No ${noun} were recorded before ${fmtDayMonth(first.at)}.`)
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1] as SeriesPoint
    const current = points[index] as SeriesPoint
    if (daysApart(previous.at, current.at) > GAP_DAYS) {
      out.push(`No ${noun} were recorded between ${fmtDayMonth(previous.at)} and ${fmtDayMonth(current.at)}.`)
    }
  }
  const last = points.at(-1) as SeriesPoint
  if (daysApart(last.at, to) > GAP_DAYS) out.push(`No ${noun} have been recorded since ${fmtDayMonth(last.at)}.`)
  return out
}

const SOURCE_PHRASE: Record<ObservationSource, [string, string]> = {
  home: ['logged at home', 'logged at home'],
  arrival: ['at an arrival check', 'at arrival checks'],
  session: ['during a treatment visit', 'during treatment visits'],
  follow_up: ['at a next-day follow-up', 'at next-day follow-ups'],
}

/** "4 logged at home, 5 at arrival checks and 6 at next-day follow-ups" */
function sourceCounts(points: ReadonlyArray<{ readonly source: ObservationSource }>) {
  const counts = new Map<ObservationSource, number>()
  for (const point of points) counts.set(point.source, (counts.get(point.source) ?? 0) + 1)
  return names(
    (['home', 'arrival', 'session', 'follow_up'] as const)
      .filter((source) => counts.has(source))
      .map((source) => {
        const count = counts.get(source) ?? 0
        return `${count} ${SOURCE_PHRASE[source][count === 1 ? 0 : 1]}`
      }),
  )
}

export function painTrendSentence(label: string, series: readonly AreaPoint[], latestBefore?: AreaPoint): string {
  const lower = lowerFirst(label)
  const latest = series.at(-1)
  if (!latest) {
    return latestBefore
      ? `No ${lower} score was recorded in this period; the last one, ${latestBefore.pain}/10, was recorded on ${fmtMed(latestBefore.observedAt)}.`
      : `No ${lower} score has been recorded.`
  }
  if (series.length === 1) return `One ${lower} score was recorded in this period: ${latest.pain}/10 on ${fmtMed(latest.observedAt)}.`
  const values = series.map((point) => point.pain)
  const first = series[0] as AreaPoint
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = min === max ? `were all ${min}/10` : `ranged from ${min} to ${max} out of 10`
  return `${label}: ${series.length} scores from ${fmtDayMonth(first.observedAt)} to ${fmtMed(latest.observedAt)} ${spread}; the first was ${first.pain}/10 and the latest ${latest.pain}/10${latestRemark(values, latest.pain)}.`
}

function painChart(area: ReportContent['areas'][number], from: string, to: string): ReportChart {
  const points = area.series.map((point) => ({ at: point.observedAt, value: point.pain, source: point.source }))
  const counts = sourceCounts(area.series)
  const summary = area.series.length
    ? `${painTrendSentence(area.label, area.series)} Of these, ${counts}.`
    : painTrendSentence(area.label, area.series, area.latest)
  return {
    key: `pain-${area.area}`,
    title: `${area.label} — pain`,
    attribution: 'Client-reported, 0 = no pain, 10 = worst imaginable',
    unit: '/10',
    yMax: 10,
    points,
    summary,
    gaps: area.series.length ? gapStatements(points, from, to, 'scores') : [],
  }
}

function romChart(group: ReportContent['rom'][number], therapistNames: Readonly<Record<string, string>>, from: string, to: string): ReportChart {
  const values = group.points.map((point) => point.degrees)
  const first = group.points[0] as RomMeasurement
  const latest = group.points.at(-1) as RomMeasurement
  const min = Math.min(...values)
  const max = Math.max(...values)
  const by = names([...new Set(group.points.map((point) => therapistNames[point.therapistId] ?? 'a therapist'))])
  const method = ROM_METHOD_LABEL[group.method].toLocaleLowerCase()
  const spread = values.length === 1 ? `${latest.degrees}°` : min === max ? `${min}° each time` : `between ${min}° and ${max}°`
  const summary =
    values.length === 1
      ? `${group.label} was measured once, ${latest.degrees}° on ${fmtMed(latest.recordedAt)}. A typical range is about ${group.typicalDegrees}°.`
      : `${group.label} was measured ${values.length} times from ${fmtDayMonth(first.recordedAt)} to ${fmtMed(latest.recordedAt)}, ${spread}; the latest was ${latest.degrees}°${latestRemark(values, latest.degrees)}. A typical range is about ${group.typicalDegrees}°.`
  const points = group.points.map((point) => ({ at: point.recordedAt, value: point.degrees, source: 'measured' as const }))
  const top = Math.max(group.typicalDegrees, max)
  return {
    key: `rom-${group.key}`,
    title: group.label,
    attribution: `Measured by ${by} (${method})`,
    unit: '°',
    yMax: Math.ceil((top * 1.1) / 20) * 20,
    points,
    reference: { value: group.typicalDegrees, label: `Typical about ${group.typicalDegrees}°` },
    summary,
    gaps: gapStatements(points, from, to, 'measurements'),
  }
}

function goalChart(entry: ReportContent['goals'][number], from: string, to: string): ReportChart {
  const { goal, scores } = entry
  const values = scores.map((score) => score.score)
  const latest = scores.at(-1)
  const first = scores[0]
  const summary = !latest || !first
    ? `“${goal.wording}” was not rated in this period.`
    : scores.length === 1
      ? `“${goal.wording}” was rated once for ease: ${latest.score}/10 on ${fmtMed(latest.recordedAt)} (10 = easy).`
      : `“${goal.wording}” was rated ${scores.length} times for ease (10 = easy) from ${fmtDayMonth(first.recordedAt)} to ${fmtMed(latest.recordedAt)}, ${Math.min(...values) === Math.max(...values) ? `${values[0]}/10 each time` : `from ${Math.min(...values)} to ${Math.max(...values)} out of 10`}; the latest was ${latest.score}/10${latestRemark(values, latest.score)}. Of these, ${sourceCounts(scores)}.`
  const points = scores.map((score) => ({ at: score.recordedAt, value: score.score, source: score.source }))
  return {
    key: `goal-${goal.id}`,
    title: `Goal: ${goal.wording}`,
    attribution: 'Client-reported ease, 0 = not possible today, 10 = easy',
    unit: '/10',
    yMax: 10,
    points,
    summary,
    gaps: scores.length ? gapStatements(points, from, to, 'ratings') : [],
  }
}

/** Where a score confirmed at arrival first came from, for the visit table's footnote. */
const CONFIRMED_SOURCE: Record<ObservationSource, string> = {
  home: 'logged at home',
  arrival: 'given at an earlier arrival check',
  session: 'recorded during an earlier visit',
  follow_up: 'given in a next-day follow-up',
}

function visitTable(inputs: ReportInputs): VisitTable {
  const { content } = inputs
  const { dateFrom, dateTo } = content.report
  const visits = inputs.visits
    .filter((visit) => time(visit.startsAt) >= time(dateFrom) && time(visit.startsAt) <= time(dateTo))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const confirmedSources = new Set<ObservationSource>()
  let missing = false
  const arrivalValues = new Map<AreaKey, number[]>()
  const rows = visits.map((visit) => {
    const cells = content.areas.flatMap((area) => {
      const arrival =
        area.series.find((point) => point.appointmentId === visit.id && point.source === 'arrival') ??
        area.series.find((point) => point.confirmedAt.some((item) => item.appointmentId === visit.id))
      const next = area.series.find((point) => point.appointmentId === visit.id && point.source === 'follow_up')
      if (arrival) arrivalValues.set(area.area, [...(arrivalValues.get(area.area) ?? []), arrival.pain])
      const isConfirmed = arrival !== undefined && arrival.appointmentId !== visit.id
      if (isConfirmed) confirmedSources.add(arrival.source)
      missing ||= !arrival || !next
      return [arrival ? `${arrival.pain}/10${isConfirmed ? ' (confirmed)' : ''}` : '—', next ? `${next.pain}/10` : '—']
    })
    return { date: fmtMed(visit.startsAt), therapist: inputs.therapistNames[visit.therapistId] ?? 'Therapist', cells }
  })
  const therapists = [...new Set(visits.map((visit) => inputs.therapistNames[visit.therapistId] ?? 'Therapist'))]
  const atArrival = content.areas
    .map((area) => {
      const values = arrivalValues.get(area.area) ?? []
      if (!values.length) return null
      const min = Math.min(...values)
      const max = Math.max(...values)
      const all = values.length === visits.length ? `at all ${plural(visits.length, 'visit', 'visits')}` : `at ${values.length} of ${plural(visits.length, 'visit', 'visits')}`
      return `${area.label} at arrival: ${min === max ? `${min}/10` : `${min}–${max}/10`} ${all}.`
    })
    .filter(Boolean)
  const summary = visits.length
    ? `${plural(visits.length, 'visit', 'visits')} in this period with ${therapists.length === 1 ? therapists[0] : `${therapists.length} therapists (${names(therapists)})`}. ${atArrival.join(' ')}`.trim()
    : 'No visits in this period.'
  return {
    columns: content.areas.flatMap((area) => [`${area.label} · arrival`, `${area.label} · next day`]),
    rows,
    summary,
    footnotes: [
      ...(confirmedSources.size
        ? [
            `Confirmed: at arrival the client confirmed that an earlier score, ${names(
              (['home', 'follow_up', 'arrival', 'session'] as const)
                .filter((source) => confirmedSources.has(source))
                .map((source) => CONFIRMED_SOURCE[source]),
            )}, still applied.`,
          ]
        : []),
      ...(missing ? ['— no score was recorded for that area at that point.'] : []),
    ],
  }
}

export function buildReportView(inputs: ReportInputs): ReportView {
  const { content } = inputs
  const { report } = content
  const sections = new Set(report.sections)
  const from = report.dateFrom
  const to = report.dateTo
  const visitsInRange = inputs.visits.filter((visit) => time(visit.startsAt) >= time(from) && time(visit.startsAt) <= time(to))
  const therapistsInRange = new Set(visitsInRange.map((visit) => visit.therapistId))

  const areas: AreaRow[] = content.areas.map((area) => {
    const latest = area.series.at(-1) ?? area.latest
    const values = area.series.map((point) => point.pain)
    return {
      area: area.area,
      label: area.label,
      latest: latest ? `${latest.pain}/10` : 'Not recorded',
      latestPain: latest?.pain ?? null,
      recorded: latest ? `${fmtMed(latest.observedAt)}, ${SOURCE_SHORT[latest.source]}` : '—',
      range: values.length ? (Math.min(...values) === Math.max(...values) ? `${values[0]}/10` : `${Math.min(...values)}–${Math.max(...values)}/10`) : '—',
      count: area.series.length,
      trend: painTrendSentence(area.label, area.series, area.latest),
    }
  })

  const words = [...content.clientNotes].reverse().map((note) => ({
    text: note.text,
    attribution: `Client-reported · ${OBSERVATION_SOURCE_LABEL[note.source]}, ${fmtMed(note.observedAt)}`,
  }))

  const views = figureViews(report.areas, report.view)
  const figures = sections.has('bodyMap')
    ? views.map((view) => {
        // An area on the body's edge (a shoulder, a hip) is seen, and marked, from both sides.
        const markers = content.areas
          .filter((area) => !hiddenAreas([area.area], [view]).length)
          .flatMap((area) => {
            const latest = area.series.at(-1) ?? area.latest
            return latest ? [{ area: area.area, label: area.label, pain: latest.pain, observedAt: latest.observedAt }] : []
          })
        const dates = markers.map((marker) => marker.observedAt).sort()
        const viewName = view === 'front' ? 'Front view' : 'Back view'
        const first = dates[0]
        const last = dates.at(-1)
        const caption = !first || !last
          ? `${viewName} · no selected area is seen from this side`
          : `${viewName} · latest scores, recorded ${fmtMed(first) === fmtMed(last) ? fmtMed(last) : fmtPeriod(first, last)}`
        return { view, markers, caption }
      })
    : null

  const note = report.noteText.trim()
  const attribution = inputs.note
    ? `Therapist observation — ${inputs.note.authorName}, ${fmtMed(inputs.note.writtenAt)}${inputs.note.editedBy ? `; wording edited for this report by ${inputs.note.editedBy.name}, ${fmtMed(inputs.note.editedBy.at)}` : ''}`
    : `Therapist observation — ${inputs.preparedBy.name}, ${fmtMed(report.updatedAt)}`

  const consent = report.consent
    ? `${inputs.client.name} agreed on ${fmtLong(report.consent.consentedAt)} to share this report with ${recipientInSentence(report.consent.recipient, 'the')} for ${lowerFirst(report.consent.purpose)}. Photographs ${report.consent.includesPhotos ? 'are' : 'are not'} included.`
    : null

  return {
    range: { from, to },
    clientName: inputs.client.name,
    clientBorn: inputs.client.dateOfBirth ? fmtLong(`${inputs.client.dateOfBirth}T12:00:00Z`) : null,
    preparedBy: inputs.preparedBy.name,
    preparedByTitle: inputs.preparedBy.title,
    preparedOn: fmtLong(report.updatedAt),
    recipient: report.recipient,
    purpose: upperFirst(report.purpose),
    recommendation: report.recommendation.trim(),
    period: fmtPeriod(from, to),
    periodDetail: `${plural(visitsInRange.length, 'visit', 'visits')}${therapistsInRange.size > 1 ? ` with ${therapistsInRange.size} therapists` : ''}`,
    areas,
    therapistNote: note ? { text: note, attribution } : null,
    recentWords: words.slice(0, RECENT_WORDS),
    earlierWords: words.slice(RECENT_WORDS),
    figures,
    hidden: hiddenAreas(report.areas, views).map((area) => content.areas.find((item) => item.area === area)?.label ?? area),
    painCharts: sections.has('painTrend') ? content.areas.map((area) => painChart(area, from, to)) : null,
    romCharts: sections.has('rangeOfMotion') ? content.rom.map((group) => romChart(group, inputs.therapistNames, from, to)) : null,
    goalCharts: sections.has('goals') ? content.goals.map((entry) => goalChart(entry, from, to)) : null,
    visits: sections.has('visits') ? visitTable(inputs) : null,
    photos:
      report.includePhotos && sections.has('photos')
        ? inputs.photos.map((photo) => ({ src: photo.src, caption: `${upperFirst(photo.view)} view · taken ${fmtMed(photo.capturedAt)}` }))
        : null,
    consent,
    about: [
      'Pain and ease scores are reported by the client. Pain: 0 = no pain, 10 = worst imaginable. Ease: 0 = not possible today, 10 = easy.',
      'Range of motion was measured by the therapist at visits; the method is named with each chart.',
      'Massage therapists do not diagnose. This report records what was reported, measured and observed; its meaning requires professional judgment.',
    ],
  }
}

/** Whether a draft is complete enough to ask the client; each problem is a plain sentence. */
export function reportProblems(report: Pick<DoctorReport, 'recipient' | 'purpose' | 'areas' | 'noteText' | 'recommendation' | 'view'>): string[] {
  const problems: string[] = []
  if (!report.recipient.trim()) problems.push('Say who the report is for.')
  if (!report.purpose.trim()) problems.push('Say what the report is for.')
  if (!report.areas.length) problems.push('Choose at least one area.')
  if (!report.noteText.trim()) problems.push('Add the note that goes in the report.')
  if (!report.recommendation.trim()) problems.push('Add your recommendation.')
  const hidden = hiddenAreas(report.areas, figureViews(report.areas, report.view))
  if (hidden.length) problems.push('Choose a figure view that shows every selected area.')
  return problems
}

/** No name or health detail in the file name: it ends up in download folders and mail attachments. */
export const reportFileName = (report: Pick<DoctorReport, 'updatedAt'>) => `aura-report-${practiceDay(report.updatedAt)}.pdf`

/** Plain-language list of what the document contains, from the same view the document prints. */
export function sharedItems(view: ReportView): string[] {
  const items = view.areas.map((area) => `Your ${lowerFirst(area.label)} scores in this period (${area.count}) and how they changed`)
  if (view.figures) items.push('A body map with your latest score for each area')
  if (view.painCharts) items.push('A chart of your pain scores over time')
  if (view.romCharts?.length) items.push('Range of motion your therapists measured at visits')
  for (const chart of view.goalCharts ?? []) items.push(`How easy your goal felt: “${chart.title.replace(/^Goal: /, '')}”`)
  if (view.visits) items.push('Your visit dates and who saw you')
  if (view.therapistNote) items.push('A therapist’s observation, written for this report')
  const words = view.recentWords.length + view.earlierWords.length
  if (words) items.push(`${plural(words, 'thing', 'things')} you wrote when you logged how you felt`)
  return items
}
