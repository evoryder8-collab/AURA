import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoState, DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import type { DemoAppointment } from '@/data/demo/model'
import { useDemoStore } from '@/data/demo/store'
import {
  buildReportContent,
  GAP_DAYS,
  reportIsExportable,
  type CareObservation,
  type DoctorReport,
} from '@/domain/care'
import { ArrivalPage } from '@/features/arrival/ArrivalPage'
import { ClientHomePage } from '@/features/client-home/ClientHomePage'
import { findGaps, lineSegments, painSeries } from '@/features/progress/model'
import { ProgressExplorer } from '@/features/progress/ProgressExplorer'
import { chartLayout } from '@/features/reports/geometry'
import { reportInputs } from '@/features/reports/inputs'
import { ReportBuilderPage } from '@/features/reports/ReportBuilderPage'
import { buildReportView, customRange, fmtMed, presetRange, type ReportInputs } from '@/features/reports/model'
import { TodayPage } from '@/features/therapist-home/TodayPage'
import { renderAs, seedDemo, TEST_NOW } from '@/features/visits/testing'
import { demoAuth, renderPage, resetDemoStore } from '@/test/renderWithDemo'

const MIRA = DEMO_CLIENT_IDS.mira
const NOA = DEMO_CLIENT_IDS.noa
const PRATANA = DEMO_THERAPIST_IDS.amara
const NOW = new Date('2026-11-23T15:00:00.000Z')
const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

function homeLog(id: string, observedAt: string, pain: number, clientId = MIRA): CareObservation {
  return {
    id,
    clientId,
    source: 'home',
    observedAt,
    recordedAt: observedAt,
    recordedBy: { role: 'client', id: clientId },
    entries: [{ region: 'shoulder', side: 'left', pain }],
  }
}

function report(patch: Partial<DoctorReport> = {}): DoctorReport {
  return {
    id: 'audit-report',
    clientId: MIRA,
    preparedBy: PRATANA,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    status: 'draft',
    recipient: 'Family doctor',
    purpose: 'a review of the persistent left shoulder pain',
    dateFrom: '2026-11-01T00:00:00.000Z',
    dateTo: NOW.toISOString(),
    areas: ['shoulder:left'],
    sections: ['bodyMap', 'painTrend', 'rangeOfMotion', 'goals', 'visits'],
    view: 'auto',
    noteText: 'Recorded at visits.',
    recommendation: 'I recommend discussing the left shoulder with your doctor.',
    includePhotos: false,
    ...patch,
  }
}

function viewFor(doc: DoctorReport, observations: readonly CareObservation[]) {
  const inputs: ReportInputs = {
    content: buildReportContent({ report: doc, observations, confirmations: [], rom: [], goals: [], goalScores: [] }),
    client: { name: 'Mira Ellison' },
    preparedBy: { name: 'Pratana Halstrick', title: 'Massage therapist' },
    therapistNames: {},
    visits: [],
    photos: [],
  }
  return buildReportView(inputs)
}

/** The body illustration loads over fetch; jsdom has no server, so serve the real file. */
function serveBodyViews() {
  const json = readFileSync(`${process.cwd()}/public/body/views.json`, 'utf8')
  vi.stubGlobal('fetch', async () => new Response(json, { status: 200, headers: { 'content-type': 'application/json' } }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TEST_NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('report and cross-screen audit', () => {
  it('[F1, any TZ] the doctor report (preview and PDF) draws the same gaps as the progress chart for the same scores', () => {
    // Two left-shoulder logs 8 days 10 hours apart: more than GAP_DAYS (8) days with no entry.
    const observations = [homeLog('a', '2026-11-01T08:00:00.000Z', 4), homeLog('b', '2026-11-09T18:00:00.000Z', 6)]
    const from = '2026-11-01T00:00:00.000Z'
    const to = '2026-11-10T00:00:00.000Z'

    const window = { from: Date.parse(from), to: Date.parse(to), startsAtFirstEntry: false }
    const points = painSeries(observations, [], 'shoulder:left', window, [])
    const progressRuns = lineSegments(points, findGaps(points.map((point) => point.at), window)).length

    const chart = viewFor(report({ dateFrom: from, dateTo: to }), observations).painCharts![0]!
    const reportRuns = chartLayout(chart, from, to, 507, 132).segments.length

    expect({ reportRuns, reportStatesTheGap: chart.gaps.some((gap) => gap.includes('between')) }).toEqual({
      reportRuns: progressRuns,
      reportStatesTheGap: progressRuns > 1,
    })
  })

  it('[F2, any TZ] the progress legend names the gap rule the chart draws (GAP_DAYS), not 5 days', () => {
    resetDemoStore(TEST_NOW)
    render(createElement(ProgressExplorer, { clientId: MIRA, audience: 'therapist' }))
    const legend = screen.getByRole('list', { name: 'Key' })
    // Mira's shoulder has a 10-day stretch without entries, so the legend shows the gap swatch.
    const gapItem = within(legend).getByText(/No entries/)
    expect(gapItem.textContent?.replace(/ /g, ' ')).toContain(`${GAP_DAYS}`)
  })

  it('[F3, any TZ] the client home six-week trend line breaks across a gap the progress chart breaks', () => {
    seedDemo()
    renderAs({ clientId: MIRA }, '/client/home', createElement(ClientHomePage))
    // Mira's shoulder: home log on day -24, next entry at the day -14 visit, 10 days apart.
    const path = document.querySelector('.trend__chart path')?.getAttribute('d') ?? ''
    const trendRuns = (path.match(/M/g) ?? []).length

    const state = useDemoStore.getState()
    const window = { from: TEST_NOW.getTime() - 42 * 86_400_000, to: TEST_NOW.getTime(), startsAtFirstEntry: false }
    const points = painSeries(state.observations.filter((item) => item.clientId === MIRA), [], 'shoulder:left', window, [])
    const progressRuns = lineSegments(points, findGaps(points.map((point) => point.at), window)).length
    expect({ trendRuns }).toEqual({ trendRuns: progressRuns })
  })

  it('[F4, TZ=Europe/Zurich] the visit table shows a score confirmed at an in-period visit even when the confirmed log predates the period', () => {
    const state = createDemoState(NOW)
    // Period starts 1 Nov: Mira's visit on 2 Nov confirmed her 30 Oct home log (6/10) at arrival.
    const doc = report(customRange('2026-11-01', '2026-11-23', NOW))
    const view = buildReportView(reportInputs(state, doc))
    const v4 = state.appointments.find((item) => item.id === 'appointment-mira-v4')!
    const row = view.visits!.rows.find((item) => item.date === fmtMed(v4.startsAt))!
    expect({ arrival: row.cells[0], summary: view.visits!.summary }).toEqual({
      arrival: '6/10 (confirmed)',
      summary: expect.stringContaining('Left shoulder at arrival: 6/10 at all 3 visits.'),
    })
  })

  it('[F5, TZ=Europe/Zurich] the visit-table footnote names the confirmed score’s real source (a next-day follow-up, not "logged at home")', () => {
    resetDemoStore(TEST_NOW)
    const store = () => useDemoStore.getState()
    // Tomorrow 09:55: Mira confirms her latest shoulder score, the 5/10 next-day follow-up after the day -7 visit.
    vi.setSystemTime(new Date(2026, 10, 24, 9, 55))
    store().completeArrival({
      appointmentId: 'appointment-mira-tomorrow',
      confirm: [{ observationId: 'obs-mira-v6-follow', area: 'shoulder:left' }],
      updates: [],
    })
    store().startSession('appointment-mira-tomorrow', new Date(2026, 10, 24, 10, 0).toISOString())
    store().finishSession('appointment-mira-tomorrow', new Date(2026, 10, 24, 11, 0).toISOString())
    store().confirmBonus('appointment-mira-tomorrow', 0)
    vi.setSystemTime(new Date(2026, 10, 24, 12, 0))

    const doc = report({ ...customRange('2026-11-17', '2026-11-24', new Date()), preparedBy: DEMO_THERAPIST_IDS.sora })
    const view = buildReportView(reportInputs(store(), doc))
    expect(view.visits!.rows.at(-1)!.cells[0]).toBe('5/10 (confirmed)')
    expect(view.visits!.footnotes.join(' ')).not.toContain('logged at home')
  })

  it('[F6, TZ=Europe/Zurich] after arrival, the Up next "Since the last visit" score agrees with the score on the same card’s body figure', async () => {
    seedDemo()
    serveBodyViews()
    // Noa (yesterday 5/10 at home) updates her lower back to 7/10 at arrival for today’s visit.
    useDemoStore.getState().completeArrival({
      appointmentId: 'appointment-noa-today',
      confirm: [],
      updates: [{ region: 'lower_back', side: 'centre', pain: 7 }],
    })
    renderAs({ therapistId: PRATANA }, '/therapist/today', createElement(TodayPage))
    const card = document.querySelector('section.next') as HTMLElement
    await waitFor(() => expect(card.querySelector('.body-thumb__dot')).not.toBeNull())
    const figure = Number.parseInt(card.querySelector('.body-thumb__dot')!.textContent ?? '', 10)
    const headline = Number.parseInt(within(card.querySelector('.next__headline') as HTMLElement).getByLabelText(/out of 10/).textContent ?? '', 10)
    expect({ headline, figure }).toEqual({ headline: 7, figure: 7 })
  })

  it('[F7, any TZ] a note typed at arrival is kept when every area is confirmed as still accurate', async () => {
    seedDemo()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage(createElement(ArrivalPage), {
      path: '/client/arrival/:appointmentId',
      url: '/client/arrival/appointment-noa-today',
      auth: demoAuth('client', NOA),
    })
    await user.click(screen.getByRole('button', { name: 'All still accurate' }))
    await user.type(screen.getByRole('textbox', { name: /Anything else for Pratana/ }), 'Left knee clicks on the stairs')
    await user.click(screen.getByRole('button', { name: 'I’m ready' }))
    expect(screen.getByRole('status')).toHaveTextContent('Thank you, Noa')
    expect(JSON.stringify(useDemoStore.getState())).toContain('Left knee clicks on the stairs')
  })

  it('[F8, TZ=Europe/Zurich] a consented report does not change when the client later backdates a log into its period', () => {
    resetDemoStore(TEST_NOW)
    const store = () => useDemoStore.getState()
    const visitStarts = store()
      .appointments.filter((item) => item.clientId === MIRA && item.status === 'completed')
      .map((item) => item.startsAt)
    const { clientId, preparedBy, recipient, purpose, areas, sections, view, noteText, recommendation, includePhotos } = report()
    const id = store().saveReport({
      clientId,
      preparedBy,
      recipient,
      purpose,
      areas,
      sections,
      view,
      noteText,
      recommendation,
      includePhotos,
      ...presetRange('visits', visitStarts, TEST_NOW),
    })
    store().requestReportConsent(id)
    store().consentToReport(id, MIRA)
    const consented = store().reports.find((item) => item.id === id)!
    const agreedTo = buildReportView(reportInputs(store(), consented))

    // That evening Mira logs "Yesterday" (19:00 the day before), inside the agreed period, with a private remark.
    vi.setSystemTime(new Date(2026, 10, 23, 21, 0))
    store().logObservation({
      clientId: MIRA,
      source: 'home',
      selections: [{ region: 'shoulder', side: 'left', pain: 9 }],
      observedAt: new Date(2026, 10, 22, 19, 0).toISOString(),
      note: 'Thinking of quitting my job over this.',
    })
    const exported = buildReportView(reportInputs(store(), store().reports.find((item) => item.id === id)!))

    expect(reportIsExportable(store().reports.find((item) => item.id === id)!)).toBe(true)
    expect({ areas: exported.areas, words: exported.recentWords }).toEqual({ areas: agreedTo.areas, words: agreedTo.recentWords })
  })

  it('[F9, TZ=Europe/Zurich] a consented report’s note attribution does not change when the source note is edited afterwards', () => {
    resetDemoStore(TEST_NOW)
    const store = () => useDemoStore.getState()
    const note = store().notes.find((item) => item.id === 'note-mira-report-1')!
    const id = store().saveReport({
      ...report({ noteId: note.id, noteText: note.body }),
      ...presetRange('visits', store().appointments.filter((a) => a.clientId === MIRA && a.status === 'completed').map((a) => a.startsAt), TEST_NOW),
    })
    store().requestReportConsent(id)
    store().consentToReport(id, MIRA)
    const consented = () => store().reports.find((item) => item.id === id)!
    const before = buildReportView(reportInputs(store(), consented())).therapistNote

    vi.setSystemTime(new Date(2026, 10, 25, 9, 0))
    store().updateNote(note.id, { body: 'Rewritten for my own records later.' })
    const after = buildReportView(reportInputs(store(), consented())).therapistNote

    expect(reportIsExportable(consented())).toBe(true)
    expect(after).toEqual(before)
  })

  it('[F11, TZ=Europe/Zurich] Up next never says "Same as last visit" for a client who has had no visit', () => {
    seedDemo()
    const store = () => useDemoStore.getState()
    const ivy = store().addClient({ preferredName: 'Ivy', email: '', phone: '', therapistId: PRATANA })
    store().addAppointment({
      clientId: ivy,
      therapistId: PRATANA,
      startsAt: new Date(2026, 10, 23, 8, 30).toISOString(),
      durationMinutes: 30,
      sessionType: 'First visit',
      status: 'confirmed',
      intakeStatus: 'complete',
      room: 'Garden room',
    })
    store().logObservation({
      clientId: ivy,
      source: 'home',
      selections: [{ region: 'shoulder', side: 'left', pain: 6 }],
      observedAt: new Date(2026, 10, 23, 7, 0).toISOString(),
    })
    renderAs({ therapistId: PRATANA }, '/therapist/today', createElement(TodayPage))
    expect(screen.getByRole('heading', { name: 'Ivy' })).toBeInTheDocument()
    const headline = (document.querySelector('section.next .next__headline') as HTMLElement).textContent
    expect(headline).not.toContain('Same as last visit')
  })

  it('[F12, any TZ] the report builder does not show or offer photographs while the client has photography turned off', async () => {
    resetDemoStore(TEST_NOW)
    const mira = useDemoStore.getState().clients.find((item) => item.id === MIRA)!
    expect(mira.consents.photography).toBe(false)
    useDemoStore.setState((state) => ({
      photos: [
        ...state.photos,
        { id: 'p1', clientId: MIRA, view: 'back', capturedAt: new Date(2026, 10, 20, 10, 0).toISOString(), dataUrl: 'data:image/png;base64,AA' },
      ],
    }))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage(createElement(ReportBuilderPage), {
      path: '/therapist/clients/:clientId/report',
      url: `/therapist/clients/${MIRA}/report`,
      auth: demoAuth('therapist', PRATANA),
    })
    const include = screen.getByRole('checkbox', { name: /Include photographs/ })
    if (!(include as HTMLInputElement).disabled) await user.click(include)
    expect(screen.queryAllByRole('img', { name: /taken/ })).toHaveLength(0)
  })

  it('[F13, any TZ] a next-day follow-up note is kept when no pain score is given', () => {
    seedDemo()
    const store = () => useDemoStore.getState()
    const id = 'appointment-noa-today'
    store().completeArrival({ appointmentId: id, confirm: [{ observationId: 'obs-noa-h1', area: 'lower_back:centre' }], updates: [] })
    store().startSession(id, new Date(2026, 10, 23, 9, 0).toISOString())
    store().finishSession(id, new Date(2026, 10, 23, 10, 30).toISOString())
    store().confirmBonus(id, 0)
    vi.setSystemTime(new Date(2026, 10, 24, 9, 0))
    store().recordFollowUp({ appointmentId: id, response: 1, selections: [], note: 'Slept through the night for once' })
    expect(store().followUps.some((item) => item.appointmentId === id)).toBe(true)
    expect(JSON.stringify(store())).toContain('Slept through the night for once')
  })

  it.runIf(DEVICE_TZ === 'Europe/Zurich')(
    '[F10, device TZ=Europe/Zurich, practice TZ=Pacific/Auckland] "last 6 visits" counts the same scores on Progress and in the report',
    async () => {
      vi.stubEnv('VITE_PRACTICE_TIMEZONE', 'Pacific/Auckland')
      vi.resetModules()
      const progress = await import('@/features/progress/model')
      const reports = await import('@/features/reports/model')
      const care = await import('@/domain/care')

      // Six visits at 10:00 Auckland time, three days apart; the first is 2 Nov in Auckland (1 Nov 22:00 in Zurich).
      const starts = [1, 4, 7, 10, 13, 16].map((day) => `2026-11-${String(day).padStart(2, '0')}T21:00:00.000Z`)
      const appointments = starts.map(
        (startsAt, index) =>
          ({ id: `v${index}`, clientId: MIRA, therapistId: PRATANA, startsAt, durationMinutes: 60, status: 'completed' }) as DemoAppointment,
      )
      const observations: CareObservation[] = [
        // 1 Nov 21:00 in Auckland, the evening before the first of the six visits.
        homeLog('eve', '2026-11-01T08:00:00.000Z', 7),
        ...starts.map((at, index) => ({ ...homeLog(`arr${index}`, at, 5), source: 'arrival' as const, appointmentId: `v${index}` })),
      ]

      const visits = progress.completedVisits(appointments, [], MIRA)
      const window = progress.rangeWindow('visits', visits, Date.parse(observations[0]!.observedAt), NOW.getTime())
      const progressCount = progress.painSeries(observations, [], 'shoulder:left', window, visits).length

      const doc = report(reports.presetRange('visits', starts, NOW))
      const content = care.buildReportContent({ report: doc, observations, confirmations: [], rom: [], goals: [], goalScores: [] })
      const reportCount = reports.buildReportView({
        content,
        client: { name: 'Mira' },
        preparedBy: { name: 'P', title: 'T' },
        therapistNames: {},
        visits: [],
        photos: [],
      }).areas[0]!.count

      expect(reportCount).toBe(progressCount)
    },
  )
})
