/**
 * Progress data and charts audit. Every `it` named "BUG" fails on the current code; every
 * `it` named "holds" passes and records what was checked. Time-zone cases run only under the
 * TZ named in the test title, e.g.
 *   TZ=America/New_York npx vitest run src/__audit__/progress.audit.test.ts --testTimeout=30000
 *   TZ=America/Los_Angeles VITE_PRACTICE_TIMEZONE=Europe/London npx vitest run src/__audit__/progress.audit.test.ts --testTimeout=30000
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import {
  areaSeries,
  sessionPainPoints,
  visitMeasures,
  type ArrivalConfirmation,
  type CareObservation,
  type GoalScore,
} from '@/domain/care'
import { classifyPattern, type PatternObservation } from '@/domain/engine'
import { ClientHomePage } from '@/features/client-home/ClientHomePage'
import { ClientProfilePage } from '@/features/clients/ClientProfilePage'
import { ProgressExplorer } from '@/features/progress/ProgressExplorer'
import {
  DAY_MS,
  GAP_DAYS,
  findGaps,
  inWindow,
  lineSegments,
  painAnswer,
  painSeries,
  rangeWindow,
  type TimeWindow,
  type Visit,
} from '@/features/progress/model'
import { chartLayout } from '@/features/reports/geometry'
import { PRACTICE_TIME_ZONE } from '@/lib/formatting/time'
import { demoAuth, renderPage, resetDemoStore } from '@/test/renderWithDemo'

const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const NOW = Date.parse('2026-11-24T12:00:00Z')
const HOUR = 3_600_000
const iso = (at: number) => new Date(at).toISOString()
const normal = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

function observation(
  id: string,
  at: number,
  pain: number,
  source: CareObservation['source'] = 'home',
  extra: Partial<CareObservation> = {},
): CareObservation {
  return {
    id,
    clientId: 'c',
    source,
    observedAt: iso(at),
    recordedAt: iso(at),
    recordedBy: { role: 'client', id: 'c' },
    entries: [{ region: 'shoulder', side: 'left', pain }],
    ...extra,
  }
}

const visit = (id: string, at: number): Visit => ({ id, at, end: at + HOUR, therapistId: 't', therapistName: 'Pratana' })

function useFixedNow() {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    resetDemoStore(new Date(NOW))
  })
  afterEach(() => vi.useRealTimers())
}

/** The value text next to a <dt> in the Recovery Index facts. */
function fact(panel: HTMLElement, term: string) {
  const dt = within(panel).getByText(term)
  return normal(dt.nextElementSibling?.textContent)
}

describe('Gaps: chart legend, chart and PDF agree on GAP_DAYS', () => {
  useFixedNow()

  it('BUG: the pain chart legend promises "5+ days" while gaps are only drawn after GAP_DAYS (8)', () => {
    render(createElement(ProgressExplorer, { clientId: DEMO_CLIENT_IDS.mira, audience: 'client' }))
    const legend = screen.getByRole('list', { name: 'Key' })
    const gapKey = normal(within(legend).getByText(/No entries for/).textContent)
    // A 6-day stretch is not drawn as a gap, so a "5+ days" key is untrue for it.
    const window: TimeWindow = { from: NOW - 20 * DAY_MS, to: NOW, startsAtFirstEntry: false }
    expect(findGaps([NOW - 13 * DAY_MS, NOW - 7 * DAY_MS, NOW - HOUR], window)).toEqual([])
    expect(gapKey).toContain(String(GAP_DAYS))
  })

  it('BUG: two entries 8 days 6 hours apart are a gap on screen but joined by a line in the PDF', () => {
    const first = Date.parse('2026-11-02T09:00:00Z')
    const second = first + 8 * DAY_MS + 6 * HOUR
    const window: TimeWindow = { from: first, to: second, startsAtFirstEntry: false }
    const screenRuns = lineSegments([{ at: first }, { at: second }], findGaps([first, second], window)).length
    const pdf = chartLayout(
      {
        key: 'pain-shoulder:left',
        title: 'Left shoulder',
        attribution: 'Client-reported',
        unit: '/10',
        yMax: 10,
        points: [
          { at: iso(first), value: 5, source: 'home' },
          { at: iso(second), value: 5, source: 'home' },
        ],
        summary: '',
        gaps: [],
      },
      iso(first),
      iso(second),
      400,
      132,
    )
    expect(screenRuns).toBe(2)
    expect(pdf.segments.length).toBe(screenRuns)
  })

  it('BUG: the client home "Last six weeks" sparkline draws one line across a 10-day stretch the progress chart marks "No entries" (Noa)', () => {
    const { container } = renderPage(createElement(ClientHomePage), {
      path: '/client/home',
      url: '/client/home',
      auth: demoAuth('client', DEMO_CLIENT_IDS.noa),
    })
    const state = useDemoStore.getState()
    const series = areaSeries(
      state.observations.filter((item) => item.clientId === DEMO_CLIENT_IDS.noa),
      state.confirmations,
      'lower_back:centre',
      { from: iso(NOW - 42 * DAY_MS) },
    )
    const times = series.map((point) => Date.parse(point.observedAt))
    const innerGaps = findGaps(times, { from: times[0] as number, to: times.at(-1) as number, startsAtFirstEntry: false })
    expect(innerGaps).toHaveLength(1)
    const d = container.querySelector('.trend__chart path')?.getAttribute('d') ?? ''
    expect(d.match(/M/g)?.length).toBe(innerGaps.length + 1)
  })
})

describe('Recovery Index panel', () => {
  useFixedNow()

  it('BUG: "Pain, first to last visit" reads −10 points although pain rose from 5/10 to 6/10 (Mira, therapist)', () => {
    render(createElement(ProgressExplorer, { clientId: DEMO_CLIENT_IDS.mira, audience: 'therapist' }))
    const panel = screen.getByRole('region', { name: 'Recovery Index' })
    const rows = within(within(panel).getByRole('table')).getAllByRole('row').slice(1)
    const painCell = (row: HTMLElement | undefined) => normal(within(row as HTMLElement).getAllByRole('cell')[1]?.textContent)
    expect([painCell(rows[0]), painCell(rows.at(-1))]).toEqual(['5/10', '6/10'])
    expect(fact(panel, 'Pain, first to last visit')).not.toMatch(/^−/)
  })

  it('BUG: with "last 30 days" the summary spans the window but "Index, first to last visit" is still all-time (Mira, therapist)', () => {
    render(createElement(ProgressExplorer, { clientId: DEMO_CLIENT_IDS.mira, audience: 'therapist' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Time range' }), { target: { value: 'days30' } })
    const panel = screen.getByRole('region', { name: 'Recovery Index' })
    const summary = normal(panel.querySelector('.progress-summary')?.textContent)
    const [from, to] = [...summary.matchAll(/([\d.]+) of 100/g)].map((match) => Number(match[1]))
    const shown = Number(fact(panel, 'Index, first to last visit').replace('−', '-').replace(/[^\d.+-]/g, ''))
    expect({ summary, shown }).toEqual({ summary, shown: Math.round(((to as number) - (from as number)) * 10) / 10 })
  })

  it('BUG: a pain-free arrival (0/10) is dropped from the Recovery Index instead of counting as pain 0', () => {
    const day = (n: number) => Date.parse('2026-11-01T10:00:00Z') + n * DAY_MS
    const measures = visitMeasures({
      visits: [
        { id: 'v1', startsAt: iso(day(0)), arrivalCompleted: true },
        { id: 'v2', startsAt: iso(day(7)), arrivalCompleted: true },
      ],
      observations: [
        observation('a1', day(0), 6, 'arrival', { appointmentId: 'v1' }),
        observation('a2', day(7), 0, 'arrival', { appointmentId: 'v2' }),
      ],
      confirmations: [],
      stiffness: [],
      rom: [],
      goalScores: [],
    })
    expect(measures.map((item) => item.pain)).toEqual([6, 0])
  })

  it('BUG (latent, no UI yet adds a second goal): goal ease at each visit jumps between different goals', () => {
    const day = (n: number) => Date.parse('2026-11-01T10:00:00Z') + n * DAY_MS
    const score = (id: string, goalId: string, n: number, value: number): GoalScore => ({
      id,
      goalId,
      clientId: 'c',
      recordedAt: iso(day(n) - HOUR),
      score: value,
      source: 'arrival',
    })
    const measures = visitMeasures({
      visits: [0, 7, 14].map((n) => ({ id: `v${n}`, startsAt: iso(day(n)), arrivalCompleted: false })),
      observations: [],
      confirmations: [],
      stiffness: [],
      rom: [],
      // Goal A (hard, 2 then 3) is rated at visits 1 and 3, goal B (easy, 9) at visit 2.
      goalScores: [score('a1', 'A', 0, 2), score('b1', 'B', 7, 9), score('a2', 'A', 14, 3)],
    })
    expect(measures.map((item) => item.functionalAbility)).toEqual([2, 2, 3])
  })
})

describe('Arrival confirmations and "latest"', () => {
  useFixedNow()

  it('BUG: an area confirmed "still accurate" at the previous visit is treated as settled at the next one', () => {
    const entry = observation('h', Date.parse('2026-11-01T18:00:00Z'), 6)
    const confirmation: ArrivalConfirmation = {
      id: 'c1',
      clientId: 'c',
      appointmentId: 'v1',
      observationId: 'h',
      area: 'shoulder:left',
      confirmedAt: '2026-11-03T09:54:00Z',
    }
    const points = sessionPainPoints({
      observations: [entry],
      confirmations: [confirmation],
      appointmentId: 'v2',
      appointmentStartsAt: '2026-11-10T10:00:00Z',
      arrivalCompleted: false,
      previousVisitAt: '2026-11-03T11:00:00Z',
    })
    expect(points.map((point) => point.area)).toEqual(['shoulder:left'])
  })

  it('BUG: the therapist overview "Latest by area · last 30 days" hides an area the client confirmed 9 days ago', () => {
    const state = useDemoStore.getState()
    const noaVisit = state.appointments.find((item) => item.id === 'appointment-noa-v2')
    if (!noaVisit?.arrival) throw new Error('fixture changed: Noa has no second visit')
    const old: CareObservation = {
      id: 'obs-noa-neck-old',
      clientId: DEMO_CLIENT_IDS.noa,
      source: 'home',
      observedAt: iso(NOW - 40 * DAY_MS),
      recordedAt: iso(NOW - 40 * DAY_MS),
      recordedBy: { role: 'client', id: DEMO_CLIENT_IDS.noa },
      entries: [{ region: 'neck', side: 'left', pain: 4 }],
    }
    useDemoStore.setState({
      observations: [...state.observations, old],
      confirmations: [
        ...state.confirmations,
        {
          id: 'confirm-noa-neck',
          clientId: DEMO_CLIENT_IDS.noa,
          appointmentId: noaVisit.id,
          observationId: old.id,
          area: 'neck:left',
          confirmedAt: noaVisit.arrival.completedAt,
        },
      ],
    })
    renderPage(createElement(ClientProfilePage), {
      path: '/therapist/clients/:clientId',
      url: `/therapist/clients/${DEMO_CLIENT_IDS.noa}`,
      auth: demoAuth('therapist', DEMO_THERAPIST_IDS.amara),
    })
    const latest = screen.getByRole('heading', { name: /Latest by area/ }).closest('section') as HTMLElement
    expect(within(latest).getByText('Lower back')).toBeInTheDocument()
    expect(within(latest).queryByText('Left side of neck')).toBeInTheDocument()
  })

  it('BUG: "last 30 days" says there are no entries although the client confirmed the score at a visit inside the window', () => {
    const entry = observation('h', NOW - 40 * DAY_MS, 6)
    const visits = [visit('v1', NOW - 20 * DAY_MS)]
    const confirmations: ArrivalConfirmation[] = [
      { id: 'c1', clientId: 'c', appointmentId: 'v1', observationId: 'h', area: 'shoulder:left', confirmedAt: iso(NOW - 20 * DAY_MS) },
    ]
    const window = rangeWindow('days30', visits, NOW - 40 * DAY_MS, NOW)
    const points = painSeries([entry], confirmations, 'shoulder:left', window, visits)
    const everything = painSeries([entry], confirmations, 'shoulder:left', { from: 0, to: NOW, startsAtFirstEntry: false }, visits)
    const { answer } = painAnswer({
      points,
      area: 'shoulder:left',
      visits,
      window,
      phrase: 'over the last 30 days',
      audience: 'client',
      clientName: 'C',
      now: NOW,
      earlier: everything.at(-1),
    })
    expect(normal(answer)).toMatch(/visit/)
  })
})

describe('Range windows and time zones', () => {
  it('BUG [any device TZ with DST, e.g. Europe/Zurich or America/New_York]: "last 30/90 days" starts on a different day depending on the hour', () => {
    const differing: Record<string, string[]> = { days30: [], days90: [] }
    for (let day = new Date(2026, 0, 1); day.getFullYear() === 2026; day.setDate(day.getDate() + 1)) {
      const at = (hour: number, minute: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime()
      for (const range of ['days30', 'days90'] as const) {
        const starts = [at(0, 30), at(12, 0), at(23, 30)].map((now) => new Date(rangeWindow(range, [], undefined, now).from).toDateString())
        if (new Set(starts).size > 1) differing[range]?.push(`${day.toDateString()}: ${starts.join(' / ')}`)
      }
    }
    const report = Object.entries(differing).map(([range, days]) => `${range}: ${days.length} days, e.g. ${days.find((day) => day.startsWith('Tue Nov 24')) ?? days[0] ?? '-'}`)
    expect(report).toEqual(['days30: 0 days, e.g. -', 'days90: 0 days, e.g. -'])
  })

  it.runIf(PRACTICE_TIME_ZONE !== DEVICE_TZ)(
    `BUG [TZ=${DEVICE_TZ}, practice ${PRACTICE_TIME_ZONE}]: the visits range starts at device midnight, dropping an entry from the morning of the sixth-last visit`,
    () => {
      const visits = [10, 12, 14, 16, 18, 20].map((date) => visit(`v${date}`, Date.parse(`2026-11-${date}T10:00:00Z`)))
      const morning = Date.parse('2026-11-10T07:30:00Z')
      const window = rangeWindow('visits', visits, Date.parse('2026-11-01T09:00:00Z'), NOW)
      expect(inWindow(morning, window)).toBe(true)
    },
  )
})

describe('What holds', () => {
  useFixedNow()

  it('holds: "both sides" fills each side once, and one side never leaks into the other', () => {
    const both: CareObservation = { ...observation('b', NOW - DAY_MS, 4), entries: [{ region: 'shoulder', side: 'left', pain: 4 }, { region: 'shoulder', side: 'right', pain: 4 }] }
    const leftOnly = observation('l', NOW - HOUR, 7)
    const window: TimeWindow = { from: 0, to: NOW, startsAtFirstEntry: false }
    expect(painSeries([both, leftOnly], [], 'shoulder:left', window, []).map((point) => point.pain)).toEqual([4, 7])
    expect(painSeries([both, leftOnly], [], 'shoulder:right', window, []).map((point) => point.pain)).toEqual([4])
  })

  it('holds: a confirmation annotates its entry and never adds a second point', () => {
    const entry = observation('h', NOW - 5 * DAY_MS, 6)
    const confirmations: ArrivalConfirmation[] = [
      { id: 'c1', clientId: 'c', appointmentId: 'v1', observationId: 'h', area: 'shoulder:left', confirmedAt: iso(NOW - 2 * DAY_MS) },
    ]
    const points = painSeries([entry], confirmations, 'shoulder:left', { from: 0, to: NOW, startsAtFirstEntry: false }, [visit('v1', NOW - 2 * DAY_MS)])
    expect(points).toHaveLength(1)
    expect(points[0]?.confirmations.map((item) => item.visit?.id)).toEqual(['v1'])
  })

  it('holds: empty and single-point series give no line and no crash', () => {
    const window: TimeWindow = { from: NOW - 3 * DAY_MS, to: NOW, startsAtFirstEntry: false }
    expect(lineSegments([], findGaps([], window))).toEqual([])
    expect(lineSegments([{ at: NOW - DAY_MS }], findGaps([NOW - DAY_MS], window))).toEqual([[{ at: NOW - DAY_MS }]])
  })

  it('holds: the pattern engine gives the same result for the same visits in any input order', () => {
    const rows: PatternObservation[] = [0, 7, 14, 21, 28].map((n, index) => ({
      id: `v${n}`,
      observedAt: iso(Date.parse('2026-10-01T10:00:00Z') + n * DAY_MS),
      pain: [6, 6, 5, 4, 3][index] ?? null,
      stiffness: [7, 6, 6, 5, 5][index] ?? null,
      rom: { value: [6.5, 6.8, 7, 7.2, 7.5][index] ?? 0, method: 'percent-of-typical-v1' },
    }))
    expect(classifyPattern([...rows].reverse())).toEqual(classifyPattern(rows))
  })

  it('holds: home chip, sparkline and progress chart show the same latest left-shoulder score (Mira)', () => {
    const { container } = renderPage(createElement(ClientHomePage), {
      path: '/client/home',
      url: '/client/home',
      auth: demoAuth('client', DEMO_CLIENT_IDS.mira),
    })
    const chip = normal(within(screen.getByRole('group', { name: 'Recently recorded areas' })).getByText('Left shoulder').parentElement?.textContent)
    const card = container.querySelector('.trend')?.getAttribute('aria-label') ?? ''
    const state = useDemoStore.getState()
    const all = painSeries(
      state.observations.filter((item) => item.clientId === DEMO_CLIENT_IDS.mira),
      state.confirmations,
      'shoulder:left',
      { from: 0, to: NOW, startsAtFirstEntry: false },
      [],
    )
    const latest = all.at(-1)?.pain
    expect(chip).toContain(`Last ${latest}/10`)
    expect(card).toContain(`Left shoulder: ${latest} out of 10`)
  })
})
