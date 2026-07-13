import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoState, DEMO_THERAPIST_IDS } from './fixtures'
import type { IntakeDraft } from './model'
import { getClientProgressAcrossTherapists, mergePersistedDemoState, useDemoStore } from './store'

const draft: IntakeDraft = {
  step: 4,
  preferredName: 'Noa Updated',
  email: 'noa.updated@example.invalid',
  phone: '+00 000 000 2222',
  dateOfBirth: '1987-09-23',
  healthNotes: 'Synthetic relevant detail',
  healthFlags: ['allergy'],
  hasRecentProcedure: true,
  procedureRegion: 'right_shoulder',
  procedureType: 'synthetic procedure',
  procedureDate: '2026-06-01',
  clearance: 'missing',
  medications: 'Synthetic medication context',
  restrictions: 'Recorded synthetic restriction',
  goalWording: 'Reach a shelf with more ease',
  goalCategory: 'Daily activity',
  goalScore: 4,
  bodyRegions: ['right_shoulder'],
  painScore: 5,
  consents: {
    healthData: true,
    photography: false,
    reminders: true,
    handoff: false,
    aiProcessing: false,
  },
  guardianName: '',
  guardianRelationship: '',
  guardianConfirmed: false,
  savedAt: '2026-07-13T12:00:00.000Z',
}

describe('demo intake persistence', () => {
  beforeEach(() => {
    useDemoStore.setState({ ...createDemoState(), hydrated: true })
  })

  it('persists a partial draft and retains the structured record on completion', () => {
    const store = useDemoStore.getState()
    store.saveIntakeDraft('demo-client-noa', draft)

    let client = useDemoStore.getState().clients.find((item) => item.id === 'demo-client-noa')
    expect(client).toMatchObject({
      preferredName: 'Noa Updated',
      intakeStatus: 'partial',
      intakeDraft: { medications: 'Synthetic medication context', step: 4 },
    })
    expect(
      useDemoStore.getState().appointments.find((item) => item.clientId === 'demo-client-noa'),
    ).toMatchObject({ intakeStatus: 'partial' })

    useDemoStore.getState().completeIntake('demo-client-noa', undefined, { ...draft, step: 8 })
    client = useDemoStore.getState().clients.find((item) => item.id === 'demo-client-noa')
    expect(client).toMatchObject({
      intakeStatus: 'complete',
      intakeRecord: {
        procedureType: 'synthetic procedure',
        restrictions: 'Recorded synthetic restriction',
      },
      caution: { label: 'Clearance to confirm', region: 'right_shoulder' },
    })
  })
})

describe('demo team continuity', () => {
  beforeEach(() => {
    useDemoStore.setState({ ...createDemoState(), hydrated: true })
  })

  it('seeds overlapping therapist assignments and keeps Amara available to every client', () => {
    const state = createDemoState()

    expect(state.therapists).toHaveLength(3)
    expect(
      state.clients.every((client) =>
        client.assignedTherapistIds.includes(DEMO_THERAPIST_IDS.amara),
      ),
    ).toBe(true)
    expect(
      new Set(
        state.appointments
          .filter((appointment) => appointment.clientId === 'demo-client-mira')
          .map((appointment) => appointment.therapistId),
      ).size,
    ).toBeGreaterThan(1)
  })

  it('aggregates metrics and goals by client even when care crosses therapists', () => {
    const state = createDemoState()
    const before = getClientProgressAcrossTherapists(state, 'demo-client-mira')

    state.appointments = state.appointments.map((appointment) =>
      appointment.clientId === 'demo-client-mira'
        ? { ...appointment, therapistId: DEMO_THERAPIST_IDS.elias }
        : appointment,
    )

    expect(getClientProgressAcrossTherapists(state, 'demo-client-mira')).toEqual(before)
    expect(before.metrics).toHaveLength(6)
    expect(before.goals).toHaveLength(1)
  })

  it('assigns a new client to the creating therapist', () => {
    const id = useDemoStore.getState().addClient({
      preferredName: 'River',
      email: 'river@example.invalid',
      phone: '+00 000 000 0404',
      therapistId: DEMO_THERAPIST_IDS.sora,
    })
    const state = useDemoStore.getState()

    expect(state.clients.find((client) => client.id === id)?.assignedTherapistIds).toEqual([
      DEMO_THERAPIST_IDS.sora,
    ])
    expect(
      state.therapists
        .find((therapist) => therapist.id === DEMO_THERAPIST_IDS.sora)
        ?.assignedClientIds.includes(id),
    ).toBe(true)
  })

  it('backfills team assignments and a required therapist when hydrating legacy state', () => {
    const fixture = createDemoState()
    const legacyClients = fixture.clients.map(
      ({ assignedTherapistIds: _assigned, ...client }) => client,
    )
    const legacyAppointments = fixture.appointments.map(
      ({ therapistId: _therapist, ...item }) => item,
    )
    const merged = mergePersistedDemoState(
      { clients: legacyClients, appointments: legacyAppointments },
      useDemoStore.getState(),
    )

    expect(merged.therapists).toHaveLength(3)
    expect(merged.clients.every((client) => client.assignedTherapistIds.length > 0)).toBe(true)
    expect(merged.appointments.every((appointment) => appointment.therapistId.length > 0)).toBe(
      true,
    )
  })

  it('adds newly configured demo portraits to an already persisted therapist roster', () => {
    const fixture = createDemoState()
    const therapistsWithoutPortraits = fixture.therapists.map(
      ({ portraitUrl: _portrait, portraitScale: _scale, ...therapist }) => therapist,
    )
    const merged = mergePersistedDemoState(
      { therapists: therapistsWithoutPortraits },
      useDemoStore.getState(),
    )

    expect(
      merged.therapists.find((therapist) => therapist.id === DEMO_THERAPIST_IDS.amara)?.portraitUrl,
    ).toContain('Pratana%20Transp%20V2.webp')
    expect(
      merged.therapists.find((therapist) => therapist.id === DEMO_THERAPIST_IDS.amara)
        ?.portraitScale,
    ).toBe(2.15)
    expect(
      merged.therapists.find((therapist) => therapist.id === DEMO_THERAPIST_IDS.sora)?.portraitUrl,
    ).toContain('wassana%20therapist%20transparent.webp')
    expect(
      merged.therapists.find((therapist) => therapist.id === DEMO_THERAPIST_IDS.sora)
        ?.portraitScale,
    ).toBe(1.5)
  })
})
