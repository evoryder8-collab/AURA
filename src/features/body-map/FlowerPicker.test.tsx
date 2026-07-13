import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { FlowerPicker } from './FlowerPicker'

function Harness() {
  const [value, setValue] = useState(4)
  return <FlowerPicker value={value} onChange={setValue} />
}

describe('FlowerPicker', () => {
  it('provides text-equivalent ratings and a resolved action', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Pain intensity: 8 out of 10' }))
    expect(screen.getByRole('button', { name: 'Pain intensity: 8 out of 10' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: /zero · resolved today/i }))
    expect(screen.getByRole('button', { name: /zero · resolved today/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
