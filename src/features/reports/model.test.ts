import { describe, expect, it } from 'vitest'
import type { DoctorReport } from '@/domain/care'
import { createDemoState, DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { chartLayout, figureLayout, projectToImage, type BodyFrame } from './geometry'
import { reportInputs } from './inputs'
import {
  buildReportView,
  customRange,
  painTrendSentence,
  practiceDay,
  presetRange,
  recipientInSentence,
  reportFileName,
  reportProblems,
  type ReportChart,
} from './model'

const NOW = new Date('2026-11-23T15:00:00.000Z')
const front: BodyFrame = { src: 'front.png', width: 640, height: 1400, left: -0.43, right: 0.43, top: 1.81, bottom: -0.09 }
const back: BodyFrame = { ...front, src: 'back.png', left: 0.43, right: -0.43 }

function miraReport(patch: Partial<DoctorReport> = {}): { state: ReturnType<typeof createDemoState>; report: DoctorReport } {
  const state = createDemoState(NOW)
  const visits = state.appointments.filter((item) => item.clientId === DEMO_CLIENT_IDS.mira && item.status === 'completed')
  const note = state.notes.find((item) => item.id === 'note-mira-report-1')!
  return {
    state,
    report: {
      id: 'r1',
      clientId: DEMO_CLIENT_IDS.mira,
      preparedBy: DEMO_THERAPIST_IDS.sora,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      status: 'draft',
      recipient: 'Family doctor',
      purpose: 'a review of the persistent left shoulder pain',
      ...presetRange('visits', visits.map((item) => item.startsAt), NOW),
      areas: ['shoulder:left'],
      sections: ['bodyMap', 'painTrend', 'rangeOfMotion', 'goals', 'visits'],
      view: 'auto',
      noteId: note.id,
      noteText: note.body,
      recommendation: 'I recommend discussing the persistent left shoulder pain with your doctor.',
      includePhotos: false,
      ...patch,
    },
  }
}

describe('report view', () => {
  it('derives every number from one series, so the table, chart and sentences agree', () => {
    const { state, report } = miraReport()
    const view = buildReportView(reportInputs(state, report))
    const row = view.areas[0]!
    const chart = view.painCharts![0]!
    expect(row.count).toBe(chart.points.length)
    const values = chart.points.map((point) => point.value)
    expect(row.range).toBe(`${Math.min(...values)}–${Math.max(...values)}/10`)
    expect(row.latest).toBe(`${chart.points.at(-1)!.value}/10`)
    expect(view.figures![0]!.markers[0]!.pain).toBe(chart.points.at(-1)!.value)
    // The therapist's note says 5–6/10 at each of the last six visits; the visit table must agree.
    expect(view.visits!.summary).toContain('Left shoulder at arrival: 5–6/10 at all 6 visits.')
    expect(view.romCharts!.find((item) => item.title === 'Left neck rotation')!.summary).toContain('between 52° and 60°')
  })

  it('credits the note to its author and says when the wording was edited for the report', () => {
    const { state, report } = miraReport()
    expect(buildReportView(reportInputs(state, report)).therapistNote!.attribution).toMatch(/^Therapist observation — Pratana Halstrick, /)
    const edited = buildReportView(reportInputs(state, { ...report, noteText: 'Shorter wording.' }))
    expect(edited.therapistNote!.attribution).toContain('wording edited for this report by Wassana Schlaepfer')
  })

  it('keeps photographs out unless the report includes them', () => {
    const { state, report } = miraReport()
    state.clients = state.clients.map((client) => (client.id === DEMO_CLIENT_IDS.mira ? { ...client, consents: { ...client.consents, photography: true } } : client))
    state.photos.push({ id: 'p1', clientId: DEMO_CLIENT_IDS.mira, view: 'back', capturedAt: '2026-11-20T10:00:00.000Z', dataUrl: 'data:image/jpeg;base64,AA' })
    expect(buildReportView(reportInputs(state, report)).photos).toBeNull()
    const included = buildReportView(reportInputs(state, { ...report, includePhotos: true, sections: [...report.sections, 'photos'] }))
    expect(included.photos).toHaveLength(1)
  })

  it('writes the trend in one plain sentence without claiming a cause', () => {
    const { state, report } = miraReport()
    const sentence = buildReportView(reportInputs(state, report)).areas[0]!.trend
    expect(sentence).toMatch(/^Left shoulder: \d+ scores from .+ ranged from 4 to 6 out of 10; the first was 5\/10 and the latest 5\/10\.$/)
    expect(sentence).not.toMatch(/because|due to|caused|improv|worse/i)
    expect(painTrendSentence('Left shoulder', [])).toBe('No left shoulder score has been recorded.')
  })

  it('reads a recipient naturally in a sentence without changing names', () => {
    expect(recipientInSentence('Family doctor', 'my')).toBe('my family doctor')
    expect(recipientInSentence('GP', 'the')).toBe('the GP')
    expect(recipientInSentence('Dr Lena Brandt', 'my')).toBe('Dr Lena Brandt')
  })

  it('lists what is missing before the client is asked', () => {
    const { report } = miraReport()
    expect(reportProblems(report)).toEqual([])
    expect(reportProblems({ ...report, noteText: ' ', areas: [] })).toEqual(['Choose at least one area.', 'Add the note that goes in the report.'])
    expect(reportProblems({ ...report, areas: ['calf:right'], view: 'front' })).toContain('Choose a figure view that shows every selected area.')
  })

  it('names the file without the client or any health detail', () => {
    expect(reportFileName({ updatedAt: NOW.toISOString() })).toBe(`aura-report-${practiceDay(NOW.toISOString())}.pdf`)
  })
})

describe('periods', () => {
  it('starts “last 6 visits” at the start of the sixth most recent visit day', () => {
    const starts = ['2026-10-01T10:00:00.000Z', '2026-10-12T10:00:00.000Z', '2026-10-19T10:00:00.000Z', '2026-10-26T10:00:00.000Z', '2026-11-02T10:00:00.000Z', '2026-11-09T10:00:00.000Z', '2026-11-16T10:00:00.000Z']
    const range = presetRange('visits', starts, NOW)
    expect(practiceDay(range.dateFrom)).toBe(practiceDay(starts[1]!))
    expect(new Date(range.dateFrom).getTime()).toBeLessThanOrEqual(new Date(starts[1]!).getTime())
    expect(range.dateTo).toBe(NOW.toISOString())
  })

  it('covers whole custom days but never the future', () => {
    const range = customRange('2026-11-01', '2026-11-30', NOW)
    expect(practiceDay(range.dateFrom)).toBe('2026-11-01')
    expect(range.dateTo).toBe(NOW.toISOString())
  })
})

describe('chart and figure geometry', () => {
  const chart = (days: number[]): ReportChart => ({
    key: 'pain-x',
    title: 'x',
    attribution: '',
    unit: '/10',
    yMax: 10,
    points: days.map((day) => ({ at: new Date(Date.UTC(2026, 9, 1 + day, 9)).toISOString(), value: 5, source: 'home' })),
    summary: '',
    gaps: [],
  })

  it('leaves a stretch of more than two weeks as a gap, never bridged', () => {
    const layout = chartLayout(chart([0, 7, 14, 40, 45]), '2026-10-01T00:00:00.000Z', '2026-11-20T00:00:00.000Z', 500, 140)
    expect(layout.segments.map((segment) => segment.length)).toEqual([3, 2])
  })

  it('places time in proportion and keeps every point inside the plot', () => {
    const layout = chartLayout(chart([0, 10, 20]), '2026-10-01T00:00:00.000Z', '2026-10-21T12:00:00.000Z', 500, 140)
    const [a, b, c] = layout.points
    expect(b!.x - a!.x).toBeCloseTo(c!.x - b!.x, 5)
    for (const point of layout.points) expect(point.x).toBeLessThanOrEqual(layout.plot.x1)
  })

  it('puts the client’s left on the image right from the front and on the image left from behind', () => {
    const leftShoulder = [0.2, 1.42] as const
    expect(projectToImage(front, leftShoulder).u).toBeGreaterThan(0.5)
    expect(projectToImage(back, leftShoulder).u).toBeLessThan(0.5)
    const marker = { area: 'shoulder:left' as const, label: 'Left shoulder', pain: 7, observedAt: NOW.toISOString() }
    const anchors = new Map([['shoulder:left' as const, leftShoulder]])
    const fromFront = figureLayout({ frame: front, anchors, markers: [marker], width: 500, height: 318 })
    expect(fromFront.sides).toEqual({ left: 'R', right: 'L' })
    expect(fromFront.markers[0]).toMatchObject({ side: 'right', lines: ['Left shoulder 7/10'] })
    const fromBehind = figureLayout({ frame: back, anchors, markers: [marker], width: 500, height: 318 })
    expect(fromBehind.sides).toEqual({ left: 'L', right: 'R' })
    expect(fromBehind.markers[0]!.side).toBe('left')
  })
})
