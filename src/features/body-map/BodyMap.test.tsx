import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { BodyMap } from './BodyMap'

function Harness() {
  const [value, setValue] = useState<string[]>([])
  return <BodyMap value={value} onChange={setValue} />
}

describe('BodyMap', () => {
  it('supports keyboard selection with stable accessible region names', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const shoulder = screen.getByRole('button', { name: 'Left shoulder' })
    shoulder.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: /left shoulder, selected/i })).toBeInTheDocument()
    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Left shoulder' })).toBeInTheDocument()
  })

  it('marks caution regions independently from priority regions', () => {
    render(
      <BodyMap
        value={[]}
        cautionRegions={['right_shoulder']}
        priorityRegions={['left_hip']}
        readonly
      />,
    )
    expect(screen.getByText('Caution / do not treat')).toBeInTheDocument()
    expect(screen.getByText('Priority')).toBeInTheDocument()
  })
})
