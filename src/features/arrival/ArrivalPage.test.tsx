import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { areaSeries } from '@/domain/care'
import { DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { getAppointment, sessionPointsFor } from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { demoAuth, renderPage, resetDemoStore } from '@/test/renderWithDemo'
import { ArrivalPage } from './ArrivalPage'

const mira = DEMO_CLIENT_IDS.mira
const appointmentId = 'appointment-mira-tomorrow'

describe('arrival intake', () => {
  beforeEach(() => {
    resetDemoStore()
    useDemoStore.getState().logObservation({
      clientId: mira,
      source: 'home',
      selections: [{ region: 'shoulder', side: 'left', pain: 7 }],
      note: 'Turning to look behind the car still hurts.',
    })
  })

  it('confirms yesterday’s shoulder and adds a right calf without duplicating the shoulder score', async () => {
    const user = userEvent.setup()
    renderPage(<ArrivalPage />, {
      path: '/therapist/arrival/:appointmentId',
      url: `/therapist/arrival/${appointmentId}`,
      auth: demoAuth('therapist', DEMO_THERAPIST_IDS.sora),
    })
    expect(screen.getByText('Please hand this screen to Mira')).toBeInTheDocument()
    const card = screen.getByRole('heading', { name: 'Left shoulder' }).closest('article') as HTMLElement
    expect(within(card).getByLabelText('7 out of 10')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: /Still accurate/ }))

    await user.click(screen.getByText('Choose from a list instead'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Area' }), 'calf')
    await user.click(screen.getByRole('button', { name: 'Right' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))
    const newCard = screen.getByRole('heading', { name: 'Right calf' }).closest('article') as HTMLElement
    await user.click(within(newCard).getByRole('radio', { name: '3 out of 10' }))
    await user.click(screen.getByRole('button', { name: 'I’m ready' }))

    expect(screen.queryByRole('alert')?.textContent ?? '').toBe('')
    expect(screen.getByRole('status')).toHaveTextContent('Thank you, Mira')
    const state = useDemoStore.getState()
    const appointment = getAppointment(state, appointmentId)
    if (!appointment) throw new Error('missing appointment')
    expect(sessionPointsFor(state, appointment).map((point) => [point.area, point.pain, point.status])).toEqual([
      ['shoulder:left', 7, 'confirmed'],
      ['calf:right', 3, 'new'],
    ])
    expect(areaSeries(state.observations, state.confirmations, 'shoulder:left').filter((point) => point.pain === 7)).toHaveLength(1)
  })

  it('asks for a decision on every recorded area before continuing', async () => {
    const user = userEvent.setup()
    renderPage(<ArrivalPage />, {
      path: '/client/arrival/:appointmentId',
      url: `/client/arrival/${appointmentId}`,
      auth: demoAuth('client', mira),
    })
    await user.click(screen.getByRole('button', { name: 'I’m ready' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Is left shoulder still 7/10?')
  })

  it('does not open another client’s visit', () => {
    renderPage(<ArrivalPage />, {
      path: '/client/arrival/:appointmentId',
      url: `/client/arrival/${appointmentId}`,
      auth: demoAuth('client', DEMO_CLIENT_IDS.noa),
    })
    expect(screen.getByText('This visit isn’t available to you.')).toBeInTheDocument()
    expect(screen.queryByText('Left shoulder')).not.toBeInTheDocument()
  })
})
