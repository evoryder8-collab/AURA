import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { seedDemo, TEST_NOW } from '@/features/visits/testing'
import { demoAuth, renderPage } from '@/test/renderWithDemo'
import { ClientProfilePage } from './ClientProfilePage'

describe('ClientProfilePage history', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TEST_NOW)
    seedDemo()
  })
  afterEach(() => vi.useRealTimers())

  it('shows a note the client left at arrival or the next day even when no score came with it', async () => {
    const visit = useDemoStore
      .getState()
      .appointments.find((item) => item.clientId === DEMO_CLIENT_IDS.mira && item.status === 'completed' && item.therapistId === DEMO_THERAPIST_IDS.sora)!
    useDemoStore.setState((state) => ({
      appointments: state.appointments.map((item) =>
        item.id === visit.id ? { ...item, arrival: { completedAt: visit.startsAt, note: 'Left knee clicks on the stairs' } } : item,
      ),
      followUps: [
        ...state.followUps.filter((item) => item.appointmentId !== visit.id),
        { id: 'follow-note-only', appointmentId: visit.id, clientId: visit.clientId, respondedAt: visit.startsAt, response: 1, note: 'Slept better than usual' },
      ],
    }))
    const user = userEvent.setup()
    renderPage(<ClientProfilePage />, {
      path: '/therapist/clients/:clientId',
      url: `/therapist/clients/${DEMO_CLIENT_IDS.mira}`,
      auth: demoAuth('therapist', DEMO_THERAPIST_IDS.sora),
    })
    await user.click(screen.getByRole('button', { name: 'History' }))
    expect(screen.getByText('Left knee clicks on the stairs')).toBeInTheDocument()
    expect(screen.getByText('Slept better than usual')).toBeInTheDocument()
  })
})
