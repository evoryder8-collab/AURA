import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { renderAs, seedDemo, TEST_NOW } from '@/features/visits/testing'
import { CalendarPage } from './CalendarPage'

const pratana = { therapistId: DEMO_THERAPIST_IDS.amara }
const wassana = { therapistId: DEMO_THERAPIST_IDS.sora }
const show = (who: { therapistId: string }) => renderAs(who, '/therapist/calendar', <CalendarPage />)
const originalMatchMedia = window.matchMedia

function useWideScreen() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

describe('Therapist calendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TEST_NOW)
    seedDemo()
  })
  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia })
  })

  it("shows only the signed-in therapist's own appointments", () => {
    const { unmount } = show(pratana)
    expect(screen.getByRole('button', { name: /Noa Lindqvist/ })).toBeInTheDocument()
    expect(screen.queryByText('Mira Ellison')).not.toBeInTheDocument() // tomorrow is with Wassana
    expect(screen.queryByText('Sage Okafor')).not.toBeInTheDocument()
    unmount()

    show(wassana)
    expect(screen.getByRole('button', { name: /Mira Ellison/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sage Okafor/ })).toBeInTheDocument()
    expect(screen.queryByText('Noa Lindqvist')).not.toBeInTheDocument()
  })

  it('lays the week out as columns on wider screens, with today marked in words', () => {
    useWideScreen()
    show(pratana)
    const monday = screen.getByRole('group', { name: /Mon 23/ })
    expect(within(monday).getByText('Today')).toBeInTheDocument()
    expect(within(monday).getByRole('button', { name: /Noa Lindqvist.*09:00–10:30.*Confirmed/ })).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/ })).toHaveLength(7)
  })

  it('moves between weeks', async () => {
    const user = userEvent.setup()
    show(pratana)
    await user.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(screen.getByRole('heading', { name: /16 Nov – 22 Nov/ })).toBeInTheDocument()
    // Mira's visit with Pratana a week ago.
    expect(screen.getByRole('button', { name: /Mira Ellison/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'This week' }))
    expect(screen.getByRole('heading', { name: /23 Nov – 29 Nov/ })).toBeInTheDocument()
  })

  it("opens today's visit with arrival, Session Mode and the client's profile", async () => {
    const user = userEvent.setup()
    show(pratana)
    await user.click(screen.getByRole('button', { name: /Noa Lindqvist/ }))
    const sheet = screen.getByRole('dialog', { name: 'Noa Lindqvist' })
    expect(within(sheet).getByRole('link', { name: 'Begin arrival' })).toHaveAttribute(
      'href',
      '/therapist/arrival/appointment-noa-today',
    )
    expect(within(sheet).getByRole('link', { name: 'Open Session Mode' })).toHaveAttribute(
      'href',
      '/therapist/session/appointment-noa-today',
    )
    expect(within(sheet).getByRole('link', { name: 'Open Noa Lindqvist' })).toHaveAttribute(
      'href',
      `/therapist/clients/${DEMO_CLIENT_IDS.noa}`,
    )
  })

  it('keeps arrival and Session Mode off visits that are not today', async () => {
    const user = userEvent.setup()
    show(wassana)
    await user.click(screen.getByRole('button', { name: /Mira Ellison/ }))
    const sheet = screen.getByRole('dialog', { name: 'Mira Ellison' })
    expect(within(sheet).queryByRole('link', { name: 'Begin arrival' })).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('link', { name: 'Open Session Mode' })).not.toBeInTheDocument()
  })

  it('books a new appointment for one of this therapist’s assigned clients only', async () => {
    const user = userEvent.setup()
    show(pratana)
    await user.click(screen.getByRole('button', { name: 'New appointment' }))
    const sheet = screen.getByRole('dialog', { name: 'New appointment' })
    const clientChoice = within(sheet).getByRole('combobox', { name: 'Client' })
    const options = within(clientChoice).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['Choose a client', 'Mira Ellison', 'Noa Lindqvist'])

    // Nothing is booked without a client.
    await user.click(within(sheet).getByRole('button', { name: 'Book appointment' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Choose one of your clients.')

    await user.selectOptions(clientChoice, DEMO_CLIENT_IDS.mira)
    await user.click(within(sheet).getByRole('button', { name: 'Deep restorative massage, 90 minutes' }))
    await user.click(within(sheet).getByRole('button', { name: /^Wednesday 25 November/ }))
    await user.click(within(within(sheet).getByRole('group', { name: /Start time/ })).getByRole('button', { name: '14:00' }))
    const before = useDemoStore.getState().appointments.length
    await user.click(within(sheet).getByRole('button', { name: 'Book appointment' }))

    const appointments = useDemoStore.getState().appointments
    expect(appointments).toHaveLength(before + 1)
    expect(appointments.at(-1)).toMatchObject({
      clientId: DEMO_CLIENT_IDS.mira,
      therapistId: DEMO_THERAPIST_IDS.amara,
      durationMinutes: 90,
      status: 'confirmed',
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Booked Mira Ellison on Wed 25 Nov at 14:00.')
    expect(screen.getByRole('button', { name: /Mira Ellison/ })).toBeInTheDocument()
  })

  it('books a custom time of day, like 10:15, and refuses one that overlaps or runs past closing', async () => {
    const user = userEvent.setup()
    show(pratana)
    const open = async () => {
      await user.click(screen.getByRole('button', { name: 'New appointment' }))
      const sheet = screen.getByRole('dialog', { name: 'New appointment' })
      await user.selectOptions(within(sheet).getByRole('combobox', { name: 'Client' }), DEMO_CLIENT_IDS.mira)
      await user.click(within(sheet).getByRole('button', { name: /^Wednesday 25 November/ }))
      await user.click(within(sheet).getByRole('button', { name: 'Custom' }))
      return { sheet, time: within(sheet).getByLabelText(/^Custom start time/) }
    }

    const first = await open()
    expect(within(first.sheet).getByText('Any minute from 09:00 to 17:00')).toBeInTheDocument()
    fireEvent.change(first.time, { target: { value: '17:30' } })
    expect(within(first.sheet).getByRole('alert')).toHaveTextContent('Choose a start from 09:00 to 17:00, so a 60-minute visit ends by 18:00.')
    fireEvent.change(first.time, { target: { value: '10:15' } })
    expect(within(first.sheet).queryByRole('alert')).not.toBeInTheDocument()
    await user.click(within(first.sheet).getByRole('button', { name: 'Book appointment' }))
    expect(screen.getByRole('status')).toHaveTextContent('Booked Mira Ellison on Wed 25 Nov at 10:15.')

    const second = await open()
    fireEvent.change(second.time, { target: { value: '10:45' } })
    expect(within(second.sheet).getByRole('alert')).toHaveTextContent('That time overlaps another visit. Choose a different time.')
    const before = useDemoStore.getState().appointments.length
    await user.click(within(second.sheet).getByRole('button', { name: 'Book appointment' }))
    expect(useDemoStore.getState().appointments).toHaveLength(before)
  })
})
