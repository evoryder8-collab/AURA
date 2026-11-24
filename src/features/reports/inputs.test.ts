import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoState, DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { useDemoStore, type ReportDraft } from '@/data/demo/store'
import { reportInputs } from './inputs'
import { buildReportView } from './model'

const MIRA = DEMO_CLIENT_IDS.mira
const NOW = new Date('2026-11-23T15:00:00.000Z')
const store = () => useDemoStore.getState()
const view = (id: string) => buildReportView(reportInputs(store(), store().reports.find((report) => report.id === id)!))

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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useDemoStore.setState({ ...createDemoState(NOW), hydrated: true })
})
afterEach(() => vi.useRealTimers())

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
