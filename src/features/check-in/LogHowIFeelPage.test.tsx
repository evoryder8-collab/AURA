import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_CLIENT_IDS } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { demoAuth, renderPage, resetDemoStore } from '@/test/renderWithDemo'
import { LogHowIFeelPage } from './LogHowIFeelPage'

const mira = DEMO_CLIENT_IDS.mira

describe('Log how I feel', () => {
  beforeEach(() => resetDemoStore())

  const open = () =>
    renderPage(<LogHowIFeelPage />, { path: '/client/log', url: '/client/log', auth: demoAuth('client', mira) })

  it('records a left shoulder 7/10 with a note, dated now, from the list without the figure', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Choose from a list' }))
    await user.click(screen.getByRole('button', { name: 'Shoulder' }))
    const card = screen.getByRole('heading', { name: 'Left shoulder' }).closest('article') as HTMLElement
    await user.click(within(card).getByRole('radio', { name: '7 out of 10' }))
    await user.type(screen.getByLabelText(/Anything to add/), 'Turning to look behind the car still hurts.')
    const before = useDemoStore.getState().observations.length
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('status')).toHaveTextContent('Saved to your record')
    expect(screen.getByRole('status')).toHaveTextContent('Wassana will see this before your visit tomorrow at 10:00.')
    const observations = useDemoStore.getState().observations
    expect(observations).toHaveLength(before + 1)
    expect(observations.at(-1)).toMatchObject({
      clientId: mira,
      source: 'home',
      entries: [{ region: 'shoulder', side: 'left', pain: 7 }],
      note: 'Turning to look behind the car still hurts.',
    })
  })

  it('makes zero a one-tap answer for a previously painful area', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getAllByRole('button', { name: 'Feels fine now' })[0] as HTMLElement)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(useDemoStore.getState().observations.at(-1)?.entries[0]?.pain).toBe(0)
  })

  it('explains what is missing instead of saving a half-filled entry', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Tap an area')
    await user.click(screen.getByRole('button', { name: 'Choose from a list' }))
    await user.click(screen.getByRole('button', { name: 'Calf' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a score for Left calf')
  })

  it('frees a side again once the card that held it is removed', async () => {
    useDemoStore.getState().logObservation({ clientId: mira, source: 'home', selections: [{ region: 'shoulder', side: 'right', pain: 3 }] })
    const user = userEvent.setup()
    open()
    const recent = within(screen.getByRole('region', { name: 'Recently recorded' }))
    await user.click(recent.getByRole('button', { name: /^Right shoulder/ }))
    await user.click(recent.getByRole('button', { name: /^Left shoulder/ }))
    const right = screen.getByRole('heading', { name: 'Right shoulder' }).closest('article') as HTMLElement
    expect(within(right).getByRole('button', { name: 'Both' })).toHaveAccessibleDescription('Left shoulder is already added')
    await user.click(screen.getByRole('button', { name: 'Remove Left shoulder' }))
    const both = within(right).getByRole('button', { name: 'Both' })
    expect(both).not.toHaveAttribute('aria-disabled')
    await user.click(both)
    expect(screen.getByRole('heading', { name: 'Shoulders (both sides)' })).toBeInTheDocument()
  })

  it('records both sides as two entries', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Choose from a list' }))
    await user.click(screen.getByRole('button', { name: 'Calf' }))
    await user.click(screen.getByRole('button', { name: 'Both' }))
    const scale = screen.getByRole('radiogroup', { name: /Pain in Calves \(both sides\)/ })
    await user.click(within(scale).getByRole('radio', { name: '3 out of 10' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(useDemoStore.getState().observations.at(-1)?.entries).toEqual([
      { region: 'calf', side: 'left', pain: 3 },
      { region: 'calf', side: 'right', pain: 3 },
    ])
  })
})
