import { beforeEach, describe, expect, it, vi } from 'vitest'
import { areaSeries, bonusSummary } from '@/domain/care'
import { createDemoState, DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS, refreshPassedBookings } from './fixtures'
import { reportInputs } from '@/features/reports/inputs'
import { announceSave } from '@/test/otherTab'
import type { DemoAppointment, DemoReport, DemoState } from './model'
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

  it('reads the pattern from the visits inside a window only', () => {
    const window = { from: Date.now() - 17 * 86_400_000, to: Date.now(), startsAtFirstEntry: false }
    const { measures, result } = clientRecovery(useDemoStore.getState(), mira, window)
    const lastTwo = ['appointment-mira-v5', 'appointment-mira-v6']
    expect(measures.map((row) => row.visitId)).toEqual(lastTwo)
    expect(result.evidence.includedPoints.map((point) => point.observationId)).toEqual(lastTwo)
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

    const updates = preVisitUpdates(useDemoStore.getState(), appointment)
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

  describe('a report sent before sent copies were kept', () => {
    const day = 86_400_000
    const report = (id: string, status: DemoReport['status']): DemoReport => ({
      id,
      clientId: mira,
      preparedBy: wassana,
      createdAt: new Date(Date.now() - day).toISOString(),
      updatedAt: new Date(Date.now() - day).toISOString(),
      status,
      recipient: 'Family doctor',
      purpose: 'Discuss persistent left shoulder pain',
      dateFrom: new Date(Date.now() - 90 * day).toISOString(),
      dateTo: new Date(Date.now() + 30 * day).toISOString(),
      areas: ['shoulder:left'],
      sections: ['bodyMap', 'painTrend'],
      view: 'auto',
      noteText: 'For the doctor',
      recommendation: 'I recommend discussing the persistent left shoulder pain with your doctor.',
      includePhotos: false,
    })
    const shoulderScores = (id: string) => {
      const state = useDemoStore.getState()
      const saved = state.reports.find((item) => item.id === id)!
      return reportInputs(state, saved).content.areas.find((area) => area.area === 'shoulder:left')?.series.length
    }
    const logShoulder = () =>
      useDemoStore.getState().logObservation({ clientId: mira, source: 'home', selections: [{ region: 'shoulder', side: 'left', pain: 3 }] })

    it('is frozen on load when it awaits or has the client’s agreement, so a later log cannot change it', () => {
      const saved = {
        ...createDemoState(),
        reports: [
          report('awaiting', 'awaiting_consent'),
          { ...report('agreed', 'consented'), consent: { consentedAt: new Date().toISOString(), recipient: 'Family doctor', purpose: 'Discuss persistent left shoulder pain', includesPhotos: false } },
          report('draft', 'draft'),
        ],
      }
      useDemoStore.setState({ ...mergePersistedDemoState({ ...saved, version: 2 }, useDemoStore.getState()), hydrated: true })
      const before = ['awaiting', 'agreed', 'draft'].map(shoulderScores)
      logShoulder()
      expect(['awaiting', 'agreed', 'draft'].map(shoulderScores)).toEqual([before[0], before[1], before[2]! + 1])
    })

    it('is frozen when the client agrees to it', () => {
      useDemoStore.setState({ reports: [report('awaiting', 'awaiting_consent')] })
      useDemoStore.getState().consentToReport('awaiting', mira)
      const agreed = shoulderScores('awaiting')
      logShoulder()
      expect({ status: useDemoStore.getState().reports[0]?.status, scores: shoulderScores('awaiting') }).toEqual({ status: 'consented', scores: agreed })
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

  describe('a seeded booking whose time passed untouched', () => {
    // Opened on Friday 20 November at 08:00, back on Tuesday 24 November at 09:00 (practice time).
    const friday = new Date(2026, 10, 20, 8, 0)
    const tuesday = new Date(2026, 10, 24, 9, 0)
    const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString()
    const startsOf = (state: Pick<DemoState, 'appointments'>) =>
      Object.fromEntries(state.appointments.filter((item) => item.status === 'confirmed').map((item) => [item.id, item.startsAt]))
    const noaToday = 'appointment-noa-today'
    const booking = (saved: DemoState, id = noaToday) => saved.appointments.find((item) => item.id === id)!

    it('takes its slot in today’s story; a booking still ahead keeps its time', () => {
      expect(startsOf(refreshPassedBookings(createDemoState(friday), tuesday))).toEqual({
        // Friday 09:00, passed: now from the half hour after next.
        'appointment-noa-today': local(24, 10),
        // Monday 10:00 (Wassana's next working day after Friday), passed: now Wednesday 10:00.
        'appointment-mira-tomorrow': local(25, 10),
        // Monday 15:00, passed: now three days on.
        'appointment-sage-later': local(27, 15),
        // Thursday and Friday, still ahead: unchanged.
        'appointment-mira-next-week': local(26, 14),
        'appointment-noa-next-week': local(27, 9, 30),
      })
    })

    it('adds an upcoming booking a record from an older build never had, and changes nothing else', () => {
      const saved = createDemoState(friday)
      const older = { ...saved, appointments: saved.appointments.filter((item) => item.id !== 'appointment-noa-next-week') }
      const loaded = refreshPassedBookings(older, tuesday)
      expect(booking(loaded, 'appointment-noa-next-week')).toEqual(
        createDemoState(tuesday).appointments.find((item) => item.id === 'appointment-noa-next-week'),
      )
      expect(loaded.clients).toEqual(older.clients)
      expect(loaded.appointments.filter((item) => item.status === 'completed')).toEqual(older.appointments.filter((item) => item.status === 'completed'))
      // Loading again finds nothing missing or passed, so it changes nothing.
      expect(refreshPassedBookings(loaded, tuesday)).toBe(loaded)
    })

    it('leaves a booking missed earlier today where it was, so Today and Visits show it as missed', () => {
      const morning = new Date(2026, 10, 24, 8, 0)
      const afternoon = new Date(2026, 10, 24, 16, 0)
      const saved = createDemoState(morning)
      expect(Date.parse(booking(saved).startsAt) + booking(saved).durationMinutes * 60_000).toBeLessThan(afternoon.getTime())
      expect(booking(refreshPassedBookings(saved, afternoon))).toEqual(booking(saved))
    })

    it.each([
      ['an arrival', (saved: DemoState) => ({ ...saved, appointments: saved.appointments.map((item) => (item.id === noaToday ? { ...item, arrival: { completedAt: item.startsAt } } : item)) })],
      ['a session', (saved: DemoState) => ({ ...saved, appointments: saved.appointments.map((item) => (item.id === noaToday ? { ...item, session: { startedAt: item.startsAt } } : item)) })],
      ['a cancellation', (saved: DemoState) => ({ ...saved, appointments: saved.appointments.map((item) => (item.id === noaToday ? { ...item, status: 'cancelled' as const } : item)) })],
      ['a log pointing at it', (saved: DemoState) => ({ ...saved, observations: [...saved.observations, { ...saved.observations[0]!, id: 'obs-mine', appointmentId: noaToday }] })],
      ['a note pointing at it', (saved: DemoState) => ({ ...saved, notes: [...saved.notes, { ...saved.notes[0]!, id: 'note-mine', appointmentId: noaToday }] })],
    ])('stays where it is once it has %s', (_touch, touch) => {
      const saved = touch(createDemoState(friday))
      expect(booking(refreshPassedBookings(saved, tuesday))).toEqual(booking(saved))
    })

    it('stays where it is when today’s slot would overlap another visit for the same client', () => {
      const saved = createDemoState(friday)
      const mine: DemoAppointment = {
        ...booking(saved),
        id: 'appointment-mine',
        therapistId: wassana,
        startsAt: local(24, 10, 30),
        durationMinutes: 60,
        createdAt: friday.toISOString(),
      }
      const clash = refreshPassedBookings({ ...saved, appointments: [...saved.appointments, mine] }, tuesday)
      const released = refreshPassedBookings({ ...saved, appointments: [...saved.appointments, { ...mine, status: 'cancelled' }] }, tuesday)
      expect({ clash: booking(clash).startsAt, released: booking(released).startsAt }).toEqual({
        clash: booking(saved).startsAt,
        released: local(24, 10),
      })
    })

    it('leaves history, clients, consents, notes and cancelled visits exactly as saved after a load', () => {
      const seeded = createDemoState(friday)
      const saved: DemoState = {
        ...seeded,
        clients: seeded.clients.map((client) => (client.id === mira ? { ...client, consents: { ...client.consents, healthData: false } } : client)),
        notes: seeded.notes.map((note, index) => (index === 0 ? { ...note, body: 'Edited by Wassana.', updatedAt: friday.toISOString() } : note)),
        appointments: seeded.appointments.map((item) => (item.id === 'appointment-mira-next-week' ? { ...item, status: 'cancelled' } : item)),
      }
      const records = (state: DemoState) =>
        JSON.stringify([
          state.clients,
          state.appointments.filter((item) => item.status !== 'confirmed'),
          state.observations,
          state.confirmations,
          state.stiffness,
          state.rom,
          state.goals,
          state.goalScores,
          state.followUps,
          state.bonusCredits,
          state.notes,
          state.reports,
          state.photos,
        ])
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(tuesday)
      try {
        const loaded = mergePersistedDemoState({ ...saved, version: 2 }, { ...useDemoStore.getState(), ...createDemoState(tuesday) })
        expect(records(loaded)).toBe(records(saved))
        expect(loaded.clients.find((client) => client.id === mira)?.consents.healthData).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('moves a passed booking from an older build that placed it elsewhere, keeping that build’s history and the person’s log', () => {
      const seeded = createDemoState(new Date(2026, 10, 16, 8, 0))
      const saved: DemoState = {
        ...seeded,
        appointments: seeded.appointments.map((item) =>
          item.id === noaToday ? { ...item, startsAt: new Date(Date.parse(item.startsAt) + 15 * 60_000).toISOString() } : item,
        ),
        observations: [...seeded.observations, { ...seeded.observations[0]!, id: 'observation-mine', observedAt: local(17, 19), recordedAt: local(17, 19) }],
      }
      const refreshed = refreshPassedBookings(saved, tuesday)
      expect({
        noaToday: booking(refreshed).startsAt,
        history: refreshed.appointments.filter((item) => item.status === 'completed'),
        observations: refreshed.observations,
      }).toEqual({
        noaToday: local(24, 10),
        history: saved.appointments.filter((item) => item.status === 'completed'),
        observations: saved.observations,
      })
    })

    it('lets a visitor coming back the next day carry on with Mira’s visit, which is still ahead', () => {
      const saved = createDemoState(new Date(2026, 10, 23, 8, 30))
      const refreshed = refreshPassedBookings(saved, new Date(2026, 10, 24, 9, 50))
      expect(booking(refreshed, 'appointment-mira-tomorrow')).toEqual(booking(saved, 'appointment-mira-tomorrow'))
    })

    it('leaves a record from earlier today as it is while its bookings are still ahead', () => {
      const saved = createDemoState(new Date(2026, 10, 24, 8, 0))
      expect(refreshPassedBookings(saved, new Date(2026, 10, 24, 9, 0))).toEqual(saved)
    })
  })

  it('takes in a record another open tab saved, without saving it back', async () => {
    localStorage.clear()
    vi.resetModules()
    const { useDemoStore: otherTab } = await import('./store')
    await vi.waitFor(() => expect(otherTab.getState().hydrated).toBe(true))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const id = useDemoStore.getState().addNote({ clientId: mira, therapistId: pratana, visibility: 'private', body: 'Prefers a warmer room.' })
    announceSave()
    await vi.waitFor(() => expect(otherTab.getState().notes.some((note) => note.id === id)).toBe(true))
    await vi.waitFor(() => expect([useDemoStore, otherTab].every((store) => store.persist.hasHydrated())).toBe(true))
    expect(setItem.mock.calls.filter(([key]) => key === `${DEMO_STORAGE_KEY}:mirror`)).toHaveLength(1)
    setItem.mockRestore()
  })
})
