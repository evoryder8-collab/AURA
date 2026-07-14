import { render, screen } from '@testing-library/react'
import type { MetricPoint } from '@/data/demo/model'
import { ProgressChart } from './ProgressChart'

const points: MetricPoint[] = [
  {
    id: 'metric-one',
    recordedAt: '2026-06-01T09:00:00.000Z',
    appointmentId: 'appointment-one',
    pain: 8,
    stiffness: 7,
    rom: 3,
    function: 4,
    response: 5,
  },
  {
    id: 'metric-two',
    recordedAt: '2026-07-01T09:00:00.000Z',
    appointmentId: 'appointment-two',
    pain: 4,
    stiffness: 5,
    rom: 7,
    function: 7,
    response: 8,
    events: ['Long flight'],
  },
]

describe('ProgressChart', () => {
  it('renders an accessible bespoke journey with context markers', () => {
    const { container } = render(<ProgressChart points={points} metric="pain" />)

    expect(screen.getByRole('img', { name: /pain over time.*2 observations/i })).toBeVisible()
    expect(screen.getByText('Comfort journey')).toBeVisible()
    expect(screen.getAllByText(/long flight/i)).not.toHaveLength(0)
    expect(container.querySelectorAll('.journey-line')).toHaveLength(2)
    expect(container.querySelector('.journey-event-star')).toBeInTheDocument()
  })

  it('keeps the empty state clear without drawing a misleading journey', () => {
    const { container } = render(<ProgressChart points={[]} metric="recovery" />)

    expect(screen.getByText('Recovery Index')).toBeVisible()
    expect(screen.getByText(/no comparable observations/i)).toBeVisible()
    expect(container.querySelector('.chart-canvas svg')).not.toBeInTheDocument()
  })
})
