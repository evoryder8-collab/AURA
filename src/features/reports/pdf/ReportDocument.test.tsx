// @vitest-environment node
/**
 * Renders Mira's report to a real PDF. To inspect the files (the directory must exist):
 *   REPORT_PDF_OUT=<dir> npx vitest run src/features/reports/pdf
 * writes <dir>/mira-report.pdf (builder defaults) and <dir>/mira-report-full.pdf
 * (both areas, front and back, every section).
 */
import { renderToBuffer, renderToFile } from '@react-pdf/renderer'
import type { DoctorReport } from '@/domain/care'
import { createDemoState, DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import type { DemoState } from '@/data/demo/model'
import { parseBodyViews } from '../body'
import { reportInputs } from '../inputs'
import { buildReportView, presetRange } from '../model'
import { ReportDocument } from './ReportDocument'

const NOW = new Date('2026-11-23T15:00:00.000Z')
const MIRA = DEMO_CLIENT_IDS.mira

/** The story's latest log: seven days after her visit, left shoulder 7/10. */
function storyState(): DemoState {
  const state = createDemoState(NOW)
  const at = new Date(NOW.getTime() - 3 * 3_600_000).toISOString()
  state.observations.push({
    id: 'obs-mira-story',
    clientId: MIRA,
    source: 'home',
    observedAt: at,
    recordedAt: at,
    recordedBy: { role: 'client', id: MIRA },
    entries: [{ region: 'shoulder', side: 'left', pain: 7 }],
    note: 'Turning to look behind the car still hurts.',
  })
  return state
}

function consentedReport(state: DemoState, patch: Partial<DoctorReport> = {}): DoctorReport {
  const visits = state.appointments
    .filter((appointment) => appointment.clientId === MIRA && appointment.status === 'completed')
    .map((appointment) => appointment.startsAt)
  const note = state.notes.find((item) => item.id === 'note-mira-report-1')!
  const base: DoctorReport = {
    id: 'report-mira',
    clientId: MIRA,
    preparedBy: DEMO_THERAPIST_IDS.sora,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    status: 'consented',
    recipient: 'Family doctor',
    purpose: 'a review of the persistent left shoulder pain',
    ...presetRange('visits', visits, NOW),
    areas: ['shoulder:left'],
    sections: ['bodyMap', 'painTrend', 'rangeOfMotion', 'goals', 'visits'],
    view: 'auto',
    noteId: note.id,
    noteText: note.body,
    recommendation: 'I recommend discussing the persistent left shoulder pain with your doctor.',
    includePhotos: false,
    ...patch,
  }
  return {
    ...base,
    consent: { consentedAt: NOW.toISOString(), recipient: base.recipient, purpose: base.purpose, includesPhotos: base.includePhotos },
  }
}

// No Node typings in the app project: read the environment through globalThis.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const views = Object.values(import.meta.glob('/public/body/views.json', { eager: true, import: 'default' }))[0]
const publicBody = decodeURIComponent(new URL('../../../../public/body/', import.meta.url).pathname)

/** The real print renders from public/body; without them the document says the figure is unavailable. */
const bodyAssets = () => (views ? parseBodyViews(views, (file) => publicBody + file) : null)

async function render(report: DoctorReport, state: DemoState, name: string) {
  const view = buildReportView(reportInputs(state, report))
  const document = <ReportDocument view={view} body={bodyAssets()} />
  if (env.REPORT_PDF_OUT) await renderToFile(document, `${env.REPORT_PDF_OUT}/${name}`)
  return { view, buffer: await renderToBuffer(document) }
}

describe('doctor report PDF', () => {
  it('finds the anatomical model’s print renders', () => {
    expect(bodyAssets()?.views.front.width).toBeGreaterThan(0)
  })

  it('renders the report with the builder defaults', async () => {
    const state = storyState()
    const { view, buffer } = await render(consentedReport(state), state, 'mira-report.pdf')
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(view.areas[0]).toMatchObject({ label: 'Left shoulder', latest: '7/10' })
    expect(view.therapistNote?.attribution).toMatch(/^Therapist observation — Pratana Halstrick, /)
  })

  it('renders both areas, both views and every section', async () => {
    const state = storyState()
    const report = consentedReport(state, { areas: ['shoulder:left', 'neck:left'], view: 'paired' })
    const { buffer } = await render(report, state, 'mira-report-full.pdf')
    expect(buffer.length).toBeGreaterThan(10_000)
  }, 20_000)

  it('gives the document nothing from private notes', () => {
    const state = storyState()
    const view = buildReportView(reportInputs(state, consentedReport(state)))
    const everything = JSON.stringify(view)
    for (const note of state.notes.filter((item) => item.visibility === 'private')) {
      expect(everything).not.toContain(note.body.slice(0, 24))
    }
    // Even a report pointed at a private note keeps only its own wording and credits no one by it.
    const pointed = consentedReport(state, { noteId: 'note-mira-private-2', noteText: 'Written for the report.' })
    const inputs = reportInputs(state, pointed)
    expect(inputs.note).toBeUndefined()
    expect(JSON.stringify(buildReportView(inputs))).not.toContain('Guarded on left rotation')
  })
})
