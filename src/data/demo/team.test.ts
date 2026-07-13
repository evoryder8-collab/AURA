import { createDemoState, DEMO_THERAPIST_IDS } from './fixtures'
import {
  appointmentsForTherapist,
  clientsAssignedToTherapist,
  therapistCanAccessClient,
  therapistsForClient,
} from './team'

describe('demo therapist team selectors', () => {
  it('scopes a therapist to assigned clients and their own appointments', () => {
    const state = createDemoState()

    expect(
      clientsAssignedToTherapist(state, DEMO_THERAPIST_IDS.elias).map((client) => client.id),
    ).toEqual(['demo-client-noa', 'demo-client-sage'])
    expect(
      appointmentsForTherapist(state, DEMO_THERAPIST_IDS.elias).every(
        (appointment) => appointment.therapistId === DEMO_THERAPIST_IDS.elias,
      ),
    ).toBe(true)
    expect(therapistCanAccessClient(state, DEMO_THERAPIST_IDS.elias, 'demo-client-mira')).toBe(
      false,
    )
  })

  it('allows a client to have overlapping assigned team members', () => {
    const state = createDemoState()

    expect(therapistsForClient(state, 'demo-client-mira').map((item) => item.id)).toEqual([
      DEMO_THERAPIST_IDS.amara,
      DEMO_THERAPIST_IDS.sora,
    ])
  })
})
