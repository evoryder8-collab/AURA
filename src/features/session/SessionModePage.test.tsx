import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { bonusCreditId } from '@/domain/care'
import { useDemoStore } from '@/data/demo/store'
import { demoAuth, renderPage, resetDemoStore } from '@/test/renderWithDemo'
import { FinishSessionPage } from './FinishSessionPage'
import { SessionModePage } from './SessionModePage'

const pratana = DEMO_THERAPIST_IDS.amara
const start = new Date('2026-11-23T09:00:00.000Z')

function bookNinety() {
  return useDemoStore.getState().addAppointment({
    clientId: DEMO_CLIENT_IDS.mira,
    therapistId: pratana,
    startsAt: start.toISOString(),
    durationMinutes: 90,
    sessionType: 'Deep restorative massage',
    status: 'confirmed',
    intakeStatus: 'complete',
    room: 'Garden room',
  })
}

describe('Session Mode timing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: start })
    resetDemoStore(start)
  })
  afterEach(() => vi.useRealTimers())

  it('counts down from 90:00, switches to extra care after zero, and survives a remount', async () => {
    const id = bookNinety()
    const view = renderPage(<SessionModePage />, {
      path: '/therapist/session/:appointmentId',
      url: `/therapist/session/${id}`,
      auth: demoAuth('therapist', pratana),
    })
    expect(screen.getByRole('timer')).toHaveTextContent('90:00')
    act(() => screen.getByRole('button', { name: /Start session/ }).click())
    act(() => {
      vi.setSystemTime(new Date(start.getTime() + 89 * 60_000 + 58_000))
      vi.advanceTimersByTime(1_100)
    })
    expect(screen.getByRole('timer')).toHaveTextContent('00:01')
    act(() => {
      vi.setSystemTime(new Date(start.getTime() + 90 * 60_000))
      vi.advanceTimersByTime(1_100)
    })
    expect(screen.getByText('Extra care')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('+00:01')

    view.unmount()
    act(() => vi.setSystemTime(new Date(start.getTime() + 95 * 60_000)))
    renderPage(<SessionModePage />, {
      path: '/therapist/session/:appointmentId',
      url: `/therapist/session/${id}`,
      auth: demoAuth('therapist', pratana),
    })
    expect(screen.getByRole('timer')).toHaveTextContent('+05:00')
  })

  it('keeps sessions of other therapists’ unassigned clients closed', () => {
    renderPage(<SessionModePage />, {
      path: '/therapist/session/:appointmentId',
      url: '/therapist/session/appointment-sage-later',
      auth: demoAuth('therapist', pratana),
    })
    expect(screen.getByText('This session isn’t available to you.')).toBeInTheDocument()
  })
})

describe('Finish and Bonus Care', () => {
  beforeEach(() => resetDemoStore())

  it('shows 90 booked, 102 actual, 12 extra and credits Pratana exactly once', async () => {
    const user = userEvent.setup()
    const id = bookNinety()
    useDemoStore.getState().startSession(id, start.toISOString())
    useDemoStore.getState().finishSession(id, new Date(start.getTime() + 102 * 60_000).toISOString())
    renderPage(<FinishSessionPage />, {
      path: '/therapist/session/:appointmentId/finish',
      url: `/therapist/session/${id}/finish`,
      auth: demoAuth('therapist', pratana),
    })
    const times = screen.getByRole('region', { name: 'Session time' })
    expect(times).toHaveTextContent('Booked90minutes')
    expect(times).toHaveTextContent('Actual102minutes')
    expect(times).toHaveTextContent('Extra12minutes')
    const confirm = screen.getByRole('button', { name: /Confirm 12/ })
    await user.click(confirm)
    useDemoStore.getState().confirmBonus(id, 12)
    const credits = useDemoStore.getState().bonusCredits.filter((credit) => credit.id === bonusCreditId(id))
    expect(credits).toHaveLength(1)
    expect(credits[0]?.minutes).toBe(12)
    expect(screen.getByText(/bringing her total to 47/)).toBeInTheDocument()
  })
})
