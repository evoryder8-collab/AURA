import { beforeEach, describe, expect, it, vi } from 'vitest'
import { areaSeries, bonusSummary } from '@/domain/care'
import { createDemoState, DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS, reanchorDemoState } from './fixtures'
import { clientBonus, clientRecovery, preVisitUpdates, sessionPointsFor } from './selectors'
import { DEMO_STORAGE_KEY, mergePersistedDemoState, useDemoStore } from './store'

const mira = DEMO_CLIENT_IDS.mira
const pratana = DEMO_THERAPIST_IDS.amara
const wassana = DEMO_THERAPIST_IDS.sora

describe('demo fixtures tell one continuous story', () => {
  beforeEach(() => useDemoStore.setState({ ...createDemoState(), hydrated: true }))

  it('gives Mira history across both therapists and 35 bonus minutes from Pratana so far', () => {
    const state = useDemoStore.getState()
    const therapists = new Set(
      state.appointments.filter((item) => item.clientId === mira && item.status === 'completed').map((item) => item.therapistId),
    )
    expect(therapists).toEqual(new Set([pratana, wassana]))
    expect(clientBonus(state, mira).byTherapist.find((item) => item.therapistId === pratana)?.minutes).toBe(35)
  })

  it('keeps one shoulder point per visit even when a visit only confirmed an earlier report', () => {
    const state = useDemoStore.getState()
    const series = areaSeries(
      state.observations.filter((item) => item.clientId === mira),
      state.confirmations,
      'shoulder:left',
    )
    const ids = series.map((point) => point.observationId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(series.some((point) => point.confirmedAt.length === 1)).toBe(true)
  })

  it('feeds the deterministic engine one row per completed visit', () => {
    const { measures } = clientRecovery(useDemoStore.getState(), mira)
    expect(measures).toHaveLength(6)
    expect(measures.every((row) => row.pain !== null)).toBe(true)
  })
})

describe('acceptance: Pratana, 90-minute booking finished at 102 minutes', () => {
  beforeEach(() => useDemoStore.setState({ ...createDemoState(), hydrated: true }))

  it('credits 12 extra minutes to Pratana exactly once, even when confirmation is retried', () => {
    const store = useDemoStore.getState()
    const appointmentId = store.addAppointment({
      clientId: mira,
      therapistId: pratana,
      startsAt: '2026-11-23T09:00:00.000Z',
      durationMinutes: 90,
      sessionType: 'Deep restorative massage',
      status: 'confirmed',
      intakeStatus: 'complete',
      room: 'Garden room',
    })
    store.completeArrival({ appointmentId, confirm: [], updates: [{ region: 'shoulder', side: 'left', pain: 6 }] })
    store.startSession(appointmentId, '2026-11-23T09:00:00.000Z')
    store.finishSession(appointmentId, '2026-11-23T10:42:00.000Z')
    expect(useDemoStore.getState().appointments.find((item) => item.id === appointmentId)?.session?.summary).toEqual({
      bookedMinutes: 90,
      actualMinutes: 102,
      extraMinutes: 12,
    })
    useDemoStore.getState().confirmBonus(appointmentId, 12)
    useDemoStore.getState().confirmBonus(appointmentId, 12)
    const summary = bonusSummary(useDemoStore.getState().bonusCredits, mira)
    expect(summary.credits.filter((credit) => credit.appointmentId === appointmentId)).toHaveLength(1)
    expect(summary.byTherapist.find((item) => item.therapistId === pratana)?.minutes).toBe(47)
  })

  it('moves the test clock by shifting the recorded start, never past a finished session', () => {
    const store = useDemoStore.getState()
    store.startSession('appointment-noa-today', '2026-11-23T09:00:00.000Z')
    store.advanceSessionClock('appointment-noa-today', 10)
    expect(useDemoStore.getState().appointments.find((item) => item.id === 'appointment-noa-today')?.session?.startedAt).toBe(
      '2026-11-23T08:50:00.000Z',
    )
  })
})

describe('acceptance: day-seven update reaches Wassana before day eight', () => {
  beforeEach(() => useDemoStore.setState({ ...createDemoState(), hydrated: true }))

  it('shows the dated update, then maps confirmed and new areas after arrival', () => {
    const store = useDemoStore.getState()
    const observationId = store.logObservation({
      clientId: mira,
      source: 'home',
      selections: [{ region: 'shoulder', side: 'left', pain: 7 }],
      note: 'Turning to look behind the car still hurts.',
    })
    const appointment = useDemoStore.getState().appointments.find((item) => item.id === 'appointment-mira-tomorrow')
    if (!appointment) throw new Error('fixture missing')
    expect(appointment.therapistId).toBe(wassana)

    const updates = preVisitUpdates(useDemoStore.getState(), appointment, Date.now())
    expect(updates[0]).toMatchObject({ id: observationId, note: 'Turning to look behind the car still hurts.' })

    const before = sessionPointsFor(useDemoStore.getState(), appointment)
    expect(before.find((point) => point.area === 'shoulder:left')).toMatchObject({ pain: 7, status: 'unconfirmed' })

    useDemoStore.getState().completeArrival({
      appointmentId: appointment.id,
      confirm: [{ observationId, area: 'shoulder:left' }],
      updates: [{ region: 'calf', side: 'right', pain: 3 }],
    })
    const arrived = useDemoStore.getState().appointments.find((item) => item.id === appointment.id)
    if (!arrived) throw new Error('missing')
    const points = sessionPointsFor(useDemoStore.getState(), arrived)
    expect(points.map((point) => [point.area, point.pain, point.status])).toEqual([
      ['shoulder:left', 7, 'confirmed'],
      ['calf:right', 3, 'new'],
    ])

    const series = areaSeries(useDemoStore.getState().observations, useDemoStore.getState().confirmations, 'shoulder:left')
    expect(series.filter((point) => point.pain === 7)).toHaveLength(1)
  })

  it('re-running arrival replaces the visit record instead of adding to it', () => {
    const store = useDemoStore.getState()
    const update = { region: 'calf' as const, side: 'right' as const, pain: 3 }
    store.completeArrival({ appointmentId: 'appointment-mira-tomorrow', confirm: [], updates: [update] })
    store.completeArrival({ appointmentId: 'appointment-mira-tomorrow', confirm: [], updates: [{ ...update, pain: 4 }] })
    const arrivals = useDemoStore
      .getState()
      .observations.filter((item) => item.appointmentId === 'appointment-mira-tomorrow' && item.source === 'arrival')
    expect(arrivals).toHaveLength(1)
    expect(arrivals[0]?.entries[0]?.pain).toBe(4)
  })
})

describe('notes and reports', () => {
  beforeEach(() => useDemoStore.setState({ ...createDemoState(), hydrated: true }))

  it('requires fresh consent after any edit and records exactly what was agreed', () => {
    const store = useDemoStore.getState()
    const id = store.saveReport({
      clientId: mira,
      preparedBy: wassana,
      recipient: 'Family doctor',
      purpose: 'Discuss persistent left shoulder pain',
      dateFrom: '2026-10-01T00:00:00.000Z',
      dateTo: '2026-11-30T00:00:00.000Z',
      areas: ['shoulder:left'],
      sections: ['bodyMap', 'painTrend'],
      view: 'auto',
      noteText: 'For the doctor',
      recommendation: 'I recommend discussing the persistent left shoulder pain with your doctor.',
      includePhotos: false,
    })
    useDemoStore.getState().consentToReport(id, mira)
    expect(useDemoStore.getState().reports[0]?.status).toBe('draft')
    useDemoStore.getState().requestReportConsent(id)
    useDemoStore.getState().consentToReport(id, 'demo-client-noa')
    expect(useDemoStore.getState().reports[0]?.status).toBe('awaiting_consent')
    useDemoStore.getState().consentToReport(id, mira)
    expect(useDemoStore.getState().reports[0]).toMatchObject({
      status: 'consented',
      consent: { recipient: 'Family doctor', includesPhotos: false },
    })
  })

  it('keeps private and report notes apart', () => {
    const notes = useDemoStore.getState().notes.filter((note) => note.clientId === mira)
    expect(notes.filter((note) => note.visibility === 'private')).toHaveLength(2)
    expect(notes.filter((note) => note.visibility === 'report')).toHaveLength(1)
  })
})

describe('persistence', () => {
  it('ignores state from an older build instead of mixing shapes', () => {
    const current = { ...useDemoStore.getState(), ...createDemoState() }
    expect(mergePersistedDemoState({ clients: [] }, current)).toBe(current)
  })

  it('restores saved records and refreshes portraits from the current build', () => {
    const current = { ...useDemoStore.getState(), ...createDemoState() }
    const saved = createDemoState()
    saved.therapists = saved.therapists.map((therapist) => {
      const { portrait: _removed, ...rest } = therapist
      return rest
    })
    saved.notes = []
    const merged = mergePersistedDemoState({ ...saved, version: 2 }, current)
    expect(merged.notes).toEqual([])
    expect(merged.therapists[0]?.portrait?.avatar).toBe('portraits/pratana-avatar.webp')
  })

  it('moves the untouched story to today but keeps a visit the person worked on with the log it confirmed', () => {
    const friday = new Date(2026, 10, 20, 8, 0)
    const tuesday = new Date(2026, 10, 24, 9, 0)
    const saved = createDemoState(friday)
    const noaToday = saved.appointments.find((item) => item.id === 'appointment-noa-today')!
    saved.appointments = saved.appointments.map((item) =>
      item.id === noaToday.id ? { ...item, arrival: { completedAt: noaToday.startsAt } } : item,
    )
    saved.confirmations.push({
      id: 'confirm-by-the-person',
      clientId: DEMO_CLIENT_IDS.noa,
      appointmentId: noaToday.id,
      observationId: 'obs-noa-h1',
      area: 'lower_back:centre',
      confirmedAt: noaToday.startsAt,
    })

    const moved = reanchorDemoState(saved, tuesday)
    const today = createDemoState(tuesday)
    const startOf = (state: { appointments: Array<{ id: string; startsAt: string }> }, id: string) =>
      state.appointments.find((item) => item.id === id)?.startsAt
    const observedAt = (state: { observations: Array<{ id: string; observedAt: string }> }, id: string) =>
      state.observations.find((item) => item.id === id)?.observedAt
    expect({
      anchoredAt: moved.anchoredAt,
      noaToday: startOf(moved, noaToday.id),
      confirmedLog: observedAt(moved, 'obs-noa-h1'),
      miraTomorrow: startOf(moved, 'appointment-mira-tomorrow'),
      noaLastVisit: startOf(moved, 'appointment-noa-v2'),
    }).toEqual({
      anchoredAt: tuesday.toISOString(),
      noaToday: noaToday.startsAt,
      confirmedLog: observedAt(saved, 'obs-noa-h1'),
      miraTomorrow: startOf(today, 'appointment-mira-tomorrow'),
      noaLastVisit: startOf(today, 'appointment-noa-v2'),
    })
  })

  it('lets a visitor coming back the next day carry on with the story', () => {
    const saved = createDemoState(new Date(2026, 10, 23, 8, 30))
    expect(reanchorDemoState(saved, new Date(2026, 10, 24, 9, 50))).toEqual(saved)
  })

  it('finds the anchor of a record saved before anchors were kept, from Noa’s untouched visit', () => {
    const { anchoredAt: _unknown, ...saved } = createDemoState(new Date(2026, 10, 20, 8, 0))
    const tuesday = new Date(2026, 10, 24, 9, 0)
    expect(reanchorDemoState(saved, tuesday).appointments).toEqual(createDemoState(tuesday).appointments)
  })

  it('takes in a record another open tab saved, without saving it back', async () => {
    localStorage.clear()
    vi.resetModules()
    const { useDemoStore: otherTab } = await import('./store')
    await vi.waitFor(() => expect(otherTab.getState().hydrated).toBe(true))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const id = useDemoStore.getState().addNote({ clientId: mira, therapistId: pratana, visibility: 'private', body: 'Prefers a warmer room.' })
    expect(otherTab.getState().notes.some((note) => note.id === id)).toBe(true)
    expect(setItem.mock.calls.filter(([key]) => key === `${DEMO_STORAGE_KEY}:mirror`)).toHaveLength(1)
    setItem.mockRestore()
  })
})
