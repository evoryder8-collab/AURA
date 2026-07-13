import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoState } from './fixtures'
import type { IntakeDraft } from './model'
import { useDemoStore } from './store'

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
