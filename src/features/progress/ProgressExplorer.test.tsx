import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_CLIENT_IDS } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { demoAuth, renderPage, resetDemoStore } from '@/test/renderWithDemo'
import { ProgressExplorer } from './ProgressExplorer'
import { ProgressPage } from './ProgressPage'

const mira = DEMO_CLIENT_IDS.mira

const painChart = () => screen.getByRole('group', { name: /pain from 0 to 10/ })
const painPoints = () => within(painChart()).getAllByRole('button')
const painRegion = () => screen.getByRole('region', { name: /^How has my .* felt/ })
const selectedPoint = () => within(painChart()).getByRole('button', { pressed: true })
const normal = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ')

/** Every left-shoulder observation of Mira's, counted from the store, not from the chart. */
const shoulderObservations = () =>
  useDemoStore
    .getState()
    .observations.filter((item) => item.clientId === mira && item.entries.some((entry) => entry.region === 'shoulder' && entry.side === 'left'))

describe('ProgressExplorer', () => {
  beforeEach(() => resetDemoStore())

  it('leads with the question and answers it from the plotted series', () => {
    render(<ProgressExplorer clientId={mira} audience="client" />)
    expect(screen.getByRole('heading', { level: 1, name: 'How has my left shoulder felt over the last 6 visits?' })).toBeInTheDocument()
    const answer = normal(within(painRegion()).getByText(/^Your left shoulder was/).textContent)
    expect(answer).toMatch(/^Your left shoulder was 6\/10 at your last visit on .+ and 5\/10 on .+ in your next.day follow.up\.$/)
    // The answer's latest figure is the latest point on the chart.
    expect(painPoints().at(-1)).toHaveAccessibleName(/5 out of 10, Next-day follow-up/)
  })

  it('changes the question and the answer when the area or range changes', async () => {
    const user = userEvent.setup()
    render(<ProgressExplorer clientId={mira} audience="client" />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Body area' }), 'neck:left')
    expect(screen.getByRole('heading', { level: 1, name: 'How has my left side of neck felt over the last 6 visits?' })).toBeInTheDocument()
    expect(normal(screen.getByText(/^Your left side of neck was/).textContent)).toMatch(/^Your left side of neck was 3\/10 at your visit on /)
    expect(painPoints()).toHaveLength(3)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Time range' }), 'days30')
    expect(screen.getByRole('heading', { level: 1, name: 'How has my left side of neck felt over the last 30 days?' })).toBeInTheDocument()
    expect(normal(screen.getByText(/entries over the last 30 days/).textContent)).toBe('2 entries over the last 30 days, between 2/10 and 3/10.')
    expect(painPoints()).toHaveLength(2)
  })

  it('never adds a point for a confirmation, and shows the confirmation on the original entry', async () => {
    const user = userEvent.setup()
    render(<ProgressExplorer clientId={mira} audience="client" />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Time range' }), 'all')
    expect(useDemoStore.getState().confirmations.some((item) => item.clientId === mira)).toBe(true)
    expect(painPoints()).toHaveLength(shoulderObservations().length)

    const confirmed = within(painChart()).getByRole('button', { name: /confirmed at arrival/ })
    await user.click(confirmed)
    const detail = screen.getByRole('region', { name: 'Selected entry' })
    expect(within(detail).getByText(/Confirmed as still accurate when you arrived/)).toBeInTheDocument()
    expect(within(detail).getByText('Logged at home')).toBeInTheDocument()
  })

  it('draws a stretch without entries as "No entries" and says when entries stopped', () => {
    render(<ProgressExplorer clientId={mira} audience="client" />)
    expect(within(painChart()).getAllByText('No entries').length).toBeGreaterThan(0)
    expect(within(painRegion()).getByText(/^No entries since /)).toBeInTheDocument()
    expect(within(painRegion()).getByText(/No entries for 5\+/)).toBeInTheDocument()
  })

  it('shows date, score, source, who recorded it and the note for a selected point', async () => {
    const user = userEvent.setup()
    render(<ProgressExplorer clientId={mira} audience="client" />)
    await user.click(within(painChart()).getAllByRole('button', { name: /Next-day follow-up, with a note/ }).at(-1) as HTMLElement)
    const detail = screen.getByRole('region', { name: 'Selected entry' })
    expect(within(detail).getByLabelText('5 out of 10')).toBeInTheDocument()
    expect(within(detail).getByText('Next-day follow-up')).toBeInTheDocument()
    expect(within(detail).getByText(/The day after your visit with Pratana/)).toBeInTheDocument()
    expect(within(detail).getByText('You')).toBeInTheDocument()
    expect(within(detail).getByText('“Looser for an evening, then back to the same.”')).toBeInTheDocument()
    expect(within(detail).getByText('Your note')).toBeInTheDocument()
  })

  it('moves between points with the keyboard', async () => {
    const user = userEvent.setup()
    render(<ProgressExplorer clientId={mira} audience="client" />)
    const points = painPoints()
    const last = points.at(-1) as HTMLElement
    expect(last).toHaveAttribute('tabindex', '0')
    expect(points.filter((point) => point.getAttribute('tabindex') === '0')).toHaveLength(1)

    last.focus()
    await user.keyboard('{ArrowLeft}')
    expect(selectedPoint()).toBe(points.at(-2))
    expect(selectedPoint()).toHaveFocus()
    expect(within(screen.getByRole('region', { name: 'Selected entry' })).getByText('Arrival check')).toBeInTheDocument()

    await user.keyboard('{Home}')
    expect(selectedPoint()).toBe(painPoints()[0])
    await user.keyboard('{End}')
    expect(selectedPoint()).toBe(painPoints().at(-1))

    await user.click(screen.getByRole('button', { name: 'Previous entry' }))
    expect(selectedPoint()).toBe(painPoints().at(-2))
  })

  it('offers a table with exactly the data the chart draws', async () => {
    const user = userEvent.setup()
    render(<ProgressExplorer clientId={mira} audience="client" />)
    const toggle = within(painRegion()).getByRole('button', { name: 'Show as table' })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const table = within(painRegion()).getByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    const points = painPoints()
    expect(rows).toHaveLength(points.length)
    rows.forEach((row, index) => {
      const score = within(row).getAllByRole('cell')[0]?.textContent
      const label = points[index]?.getAttribute('aria-label') ?? ''
      expect(label).toContain(`${score?.replace('/10', '')} out of 10`)
      expect(normal(label)).toContain(normal(within(row).getByRole('rowheader').textContent))
    })
  })

  it('keeps range of motion groups to one method each', () => {
    const { rom } = useDemoStore.getState()
    const sample = rom.find((item) => item.clientId === mira && item.movement === 'neck_rotation')
    if (!sample) throw new Error('fixture has no neck rotation')
    useDemoStore.setState({ rom: [...rom, { ...sample, id: 'rom-estimate', degrees: 70, method: 'visual_estimate' }] })
    render(<ProgressExplorer clientId={mira} audience="therapist" />)
    const groups = screen.getAllByRole('region', { name: 'Neck rotation, left' })
    expect(groups).toHaveLength(2)
    const [goniometer, estimate] = groups as [HTMLElement, HTMLElement]
    expect(within(goniometer).getAllByText('Goniometer').length).toBeGreaterThan(0)
    expect(within(goniometer).queryByText('Visual estimate')).not.toBeInTheDocument()
    expect(within(estimate).getAllByText('Visual estimate').length).toBeGreaterThan(0)
    expect(within(estimate).queryByText('Goniometer')).not.toBeInTheDocument()
    expect(within(estimate).getByRole('group', { name: /visual estimate/ }).querySelectorAll('[data-point]')).toHaveLength(1)
  })

  it('labels the Recovery Index as a prototype and shows the engine’s own explanation', () => {
    render(<ProgressExplorer clientId={mira} audience="therapist" />)
    const panel = screen.getByRole('region', { name: 'Recovery Index' })
    expect(within(panel).getByText('Prototype · not clinically validated')).toBeInTheDocument()
    expect(within(panel).getByText('aura-pattern-engine-v1 · prototype-v1')).toBeInTheDocument()
    expect(within(panel).getByText(/Prototype pattern thresholds — not clinically validated\./)).toBeInTheDocument()
  })

  it('never uses causal or diagnostic wording', () => {
    const { container } = render(<ProgressExplorer clientId={mira} audience="client" />)
    expect(container.textContent).not.toMatch(/because of|caused|improved|diagnos|heal/i)
  })
})

describe('ProgressPage', () => {
  beforeEach(() => resetDemoStore())

  it('shows only the signed-in client’s own data', () => {
    renderPage(<ProgressPage />, { path: '/client/progress', url: '/client/progress', auth: demoAuth('client', DEMO_CLIENT_IDS.noa) })
    expect(screen.getByRole('heading', { level: 1, name: /^How has my lower back felt/ })).toBeInTheDocument()
    expect(screen.queryByText(/shoulder/)).not.toBeInTheDocument()
  })
})
