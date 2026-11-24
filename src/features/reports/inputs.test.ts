import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoState, DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { useDemoStore, type ReportDraft } from '@/data/demo/store'
import { reportIsExportable } from '@/domain/care'
import { reportInputs } from './inputs'
import { buildReportView } from './model'

const MIRA = DEMO_CLIENT_IDS.mira
const NOW = new Date('2026-11-23T15:00:00.000Z')
const HOUR = 3_600_000
const store = () => useDemoStore.getState()
const saved = (id: string) => store().reports.find((report) => report.id === id)!
const view = (id: string) => buildReportView(reportInputs(store(), saved(id)))

function save(patch: Partial<ReportDraft> = {}) {
  const note = store().notes.find((item) => item.id === 'note-mira-report-1')!
  return store().saveReport({
    clientId: MIRA,
    preparedBy: DEMO_THERAPIST_IDS.sora,
    recipient: 'Family doctor',
    purpose: 'a review of the persistent left shoulder pain',
    dateFrom: '2026-10-01T00:00:00.000Z',
    dateTo: NOW.toISOString(),
    areas: ['shoulder:left'],
    sections: ['bodyMap', 'painTrend', 'goals', 'visits'],
    view: 'auto',
    noteId: note.id,
    noteText: note.body,
    recommendation: 'I recommend discussing the persistent left shoulder pain with your doctor.',
    includePhotos: false,
    ...patch,
  })
}

/** Mira logs a score for yesterday evening, inside the report period, with a remark. */
function backdatedLog() {
  vi.setSystemTime(NOW.getTime() + HOUR)
  store().logObservation({
    clientId: MIRA,
    source: 'home',
    selections: [{ region: 'shoulder', side: 'left', pain: 9 }],
    observedAt: new Date(NOW.getTime() - 20 * HOUR).toISOString(),
    note: 'Worse after carrying the shopping',
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useDemoStore.setState({ ...createDemoState(NOW), hydrated: true })
})
afterEach(() => vi.useRealTimers())

describe('a report sent to the client is frozen', () => {
  it('builds a draft from the records as they are now', () => {
    const id = save()
    const before = view(id).areas[0]!.count
    backdatedLog()
    expect(view(id).areas[0]!.count).toBe(before + 1)
    expect(view(id).recentWords[0]!.text).toBe('Worse after carrying the shopping')
  })

  it('keeps what the client was sent through consent and export, whatever changes afterwards', () => {
    const id = save()
    store().requestReportConsent(id)
    const sent = view(id)

    backdatedLog()
    vi.setSystemTime(NOW.getTime() + 48 * HOUR)
    store().updateNote('note-mira-report-1', { body: 'Rewritten for my own records later.' })
    expect(view(id)).toEqual(sent)

    store().consentToReport(id, MIRA)
    const consented = view(id)
    expect(reportIsExportable(saved(id))).toBe(true)
    expect({ ...consented, consent: null }).toEqual(sent)
    expect(consented.consent).toMatch(/^Mira Ellison agreed on /)
  })

  it('needs the client’s agreement again after an edit, on content built afresh', () => {
    const id = save()
    store().requestReportConsent(id)
    store().consentToReport(id, MIRA)
    const agreed = view(id).areas[0]!.count
    backdatedLog()

    store().saveReport({ ...saved(id), recommendation: 'I recommend a review of the left shoulder.' }, id)
    expect(saved(id)).toMatchObject({ status: 'draft' })
    expect(saved(id)).not.toHaveProperty('snapshot')
    expect(saved(id)).not.toHaveProperty('consent')
    expect(reportIsExportable(saved(id))).toBe(false)
    expect(view(id).areas[0]!.count).toBe(agreed + 1)

    store().requestReportConsent(id)
    store().consentToReport(id, MIRA)
    expect(view(id).areas[0]!.count).toBe(agreed + 1)
  })

  it('shares only the photographs the client was shown, and drops one once deleted or with photography off', () => {
    store().updateConsent(MIRA, 'photography', true)
    const shown = store().addPhoto({ clientId: MIRA, view: 'back', dataUrl: 'data:image/png;base64,AA' })
    const id = save({ includePhotos: true, sections: ['bodyMap', 'photos'], dateTo: new Date(NOW.getTime() + 6 * HOUR).toISOString() })
    store().requestReportConsent(id)
    const photos = () => view(id).photos?.map((photo) => photo.caption)
    expect(photos()).toHaveLength(1)

    vi.setSystemTime(NOW.getTime() + HOUR)
    store().addPhoto({ clientId: MIRA, view: 'front', dataUrl: 'data:image/png;base64,BB' })
    expect(photos()).toEqual([expect.stringMatching(/^Back view/)])

    store().updateConsent(MIRA, 'photography', false)
    expect(photos()).toEqual([])
    store().updateConsent(MIRA, 'photography', true)
    store().removePhoto(shown)
    expect(photos()).toEqual([])
  })
})

describe('photographs in a report', () => {
  it('are left out while the client has photography turned off', () => {
    store().addPhoto({ clientId: MIRA, view: 'back', dataUrl: 'data:image/png;base64,AA' })
    const id = save({ includePhotos: true, sections: ['bodyMap', 'photos'] })
    expect(store().clients.find((client) => client.id === MIRA)!.consents.photography).toBe(false)
    expect(view(id).photos).toEqual([])
    store().updateConsent(MIRA, 'photography', true)
    expect(view(id).photos).toHaveLength(1)
  })
})
