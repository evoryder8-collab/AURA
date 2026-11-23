import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { BookVisitPage } from './BookVisitPage'
import { renderAs, seedDemo, TEST_NOW } from './testing'

const mira = DEMO_CLIENT_IDS.mira
const pratana = DEMO_THERAPIST_IDS.amara
const show = () => renderAs({ clientId: mira }, '/client/visits/book', <BookVisitPage />)

async function reachTimes(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Pratana Halstrick/ }))
  await user.click(screen.getByRole('button', { name: /Longer massage/ }))
  return screen.getByRole('group', { name: /Start time/ })
}

describe('Book a visit', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TEST_NOW)
    seedDemo()
  })
  afterEach(() => vi.useRealTimers())

  it('shows each therapist with availability and whether the client has seen them', () => {
    show()
    const pratanaCard = screen.getByRole('button', { name: /Pratana Halstrick/ })
    expect(pratanaCard).toHaveTextContent('Seen before · 4 visits')
    expect(pratanaCard).toHaveTextContent(/Next opening Mon 23 Nov, 10:30/)
    expect(screen.getByRole('button', { name: /Wassana Schlaepfer/ })).toHaveTextContent('Seen before · 2 visits')
  })

  it('books therapist → length → time → confirm as exactly one visit with the chosen therapist', async () => {
    const user = userEvent.setup()
    show()
    const before = useDemoStore.getState().appointments.length

    const times = await reachTimes(user)
    expect(screen.getByRole('heading', { name: 'Pick a day and time' })).toHaveFocus()
    // Noa holds Pratana from 09:00 to 10:30 today, so a 75-minute visit can start at 10:30 at the earliest.
    const first = within(times).getAllByRole('button')[0]!
    expect(first).toHaveTextContent('10:30')
    await user.click(first)

    expect(screen.getByRole('heading', { name: 'Check and book' })).toHaveFocus()
    expect(screen.getByText('10:30–11:45')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Book this visit' }))

    const appointments = useDemoStore.getState().appointments
    expect(appointments).toHaveLength(before + 1)
    const booked = appointments.at(-1)!
    expect(booked).toMatchObject({
      clientId: mira,
      therapistId: pratana,
      durationMinutes: 75,
      sessionType: 'Longer massage',
      status: 'confirmed',
      intakeStatus: 'complete',
      room: 'Garden room',
    })
    expect(new Date(booked.startsAt).getHours()).toBe(10)
    expect(screen.getByRole('heading', { name: "You're booked with Pratana on Mon 23 Nov at 10:30" })).toHaveFocus()
    expect(screen.getByRole('link', { name: 'See my visits' })).toHaveAttribute('href', '/client/visits')
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/client/home')
  })

  it("never offers a time that clashes with the client's own visit with someone else", async () => {
    const user = userEvent.setup()
    show()
    await reachTimes(user)
    // Mira already sees Wassana tomorrow 10:00–11:00.
    await user.click(screen.getByRole('button', { name: /^Tuesday 24 November/ }))
    const labels = within(screen.getByRole('group', { name: /Start time/ }))
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(labels).toContain('11:00')
    expect(labels).not.toContain('09:00')
    expect(labels).not.toContain('10:30')
  })

  it('refuses a time taken while the client was confirming, and books nothing', async () => {
    const user = userEvent.setup()
    show()
    const times = await reachTimes(user)
    await user.click(within(times).getAllByRole('button')[0]!)
    const store = useDemoStore.getState()
    const taken = new Date(TEST_NOW)
    taken.setHours(10, 30)
    store.addAppointment({
      clientId: DEMO_CLIENT_IDS.noa,
      therapistId: pratana,
      startsAt: taken.toISOString(),
      durationMinutes: 60,
      sessionType: 'Therapeutic massage',
      status: 'confirmed',
      intakeStatus: 'complete',
      room: 'Garden room',
    })
    const count = useDemoStore.getState().appointments.length

    await user.click(screen.getByRole('button', { name: 'Book this visit' }))
    expect(screen.getByRole('alert')).toHaveTextContent('That time has just been taken')
    expect(useDemoStore.getState().appointments).toHaveLength(count)
  })
})
