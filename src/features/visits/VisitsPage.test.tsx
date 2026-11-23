import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_CLIENT_IDS } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { renderAs, seedDemo, TEST_NOW } from './testing'
import { VisitsPage } from './VisitsPage'

const mira = { clientId: DEMO_CLIENT_IDS.mira }
const show = () => renderAs(mira, '/client/visits', <VisitsPage />)
const statusOf = (id: string) => useDemoStore.getState().appointments.find((item) => item.id === id)?.status

describe('Visits', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TEST_NOW)
    seedDemo()
  })
  afterEach(() => vi.useRealTimers())

  it('leads with the next visit, its therapist and time, and only shows this client’s visits', () => {
    show()
    const hero = screen.getByRole('region', { name: /tomorrow 10:00/i })
    expect(within(hero).getByText('Wassana Schlaepfer')).toBeInTheDocument()
    expect(within(hero).getByText(/60 minutes/)).toBeInTheDocument()
    expect(within(hero).queryByRole('link', { name: 'Check in for this visit' })).not.toBeInTheDocument()
    // Sage's and Noa's visits belong to other clients.
    expect(screen.queryByText(/Focused session/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Book a visit' })).toHaveAttribute('href', '/client/visits/book')
  })

  it('offers check-in on the day of the visit', () => {
    const today = new Date(TEST_NOW)
    today.setHours(17)
    useDemoStore.getState().updateAppointment('appointment-mira-tomorrow', { startsAt: today.toISOString() })
    show()
    expect(screen.getByRole('link', { name: 'Check in for this visit' })).toHaveAttribute(
      'href',
      '/client/arrival/appointment-mira-tomorrow',
    )
  })

  it('needs a confirmation before a visit is cancelled', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Cancel visit' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel this visit?' })
    expect(statusOf('appointment-mira-tomorrow')).toBe('confirmed')

    await user.click(within(dialog).getByRole('button', { name: 'Keep visit' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(statusOf('appointment-mira-tomorrow')).toBe('confirmed')

    await user.click(screen.getByRole('button', { name: 'Cancel visit' }))
    await user.click(screen.getByRole('button', { name: 'Yes, cancel it' }))
    expect(statusOf('appointment-mira-tomorrow')).toBe('cancelled')
    expect(screen.getByRole('status')).toHaveTextContent(/is cancelled/)
    expect(screen.getByRole('heading', { name: 'Nothing booked yet' })).toBeInTheDocument()
  })

  it('shows booked and actual minutes, and extra care straight from the Bonus Care ledger', () => {
    // The ledger is the only source: a credit that differs from the raw overrun must win.
    useDemoStore.setState((state) => ({
      bonusCredits: state.bonusCredits.map((credit) =>
        credit.appointmentId === 'appointment-mira-v6' ? { ...credit, minutes: 3 } : credit,
      ),
    }))
    show()
    const past = screen.getByRole('region', { name: 'Past visits' })
    const rows = within(past).getAllByRole('listitem')
    expect(rows).toHaveLength(6)
    const latest = rows[0]!
    expect(latest).toHaveTextContent('Pratana Halstrick')
    expect(latest).toHaveTextContent('Booked 60 min')
    expect(latest).toHaveTextContent('Lasted 65 min')
    expect(latest).toHaveTextContent('3 minutes extra care')
    expect(latest).not.toHaveTextContent('5 minutes extra care')
  })

  it('asks how the client feels only for recent visits without a follow-up', () => {
    const twoDaysAgo = new Date(TEST_NOW)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    useDemoStore.setState((state) => ({
      followUps: state.followUps.filter((item) => item.appointmentId !== 'appointment-mira-v6'),
      appointments: state.appointments.map((item) =>
        item.id === 'appointment-mira-v6' ? { ...item, startsAt: twoDaysAgo.toISOString() } : item,
      ),
    }))
    show()
    const links = screen.getAllByRole('link', { name: /how are you feeling since/i })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/client/follow-up/appointment-mira-v6')
  })
})
