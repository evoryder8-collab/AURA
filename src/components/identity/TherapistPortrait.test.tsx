import { fireEvent, render, screen } from '@testing-library/react'
import { TherapistPortrait } from './TherapistPortrait'

const therapist = {
  preferredName: 'Wassana',
  displayName: 'Wassana Schlaepfer — fictional demo',
  portraitUrl: 'wassana-schlaepfer-demo.png',
  portraitScale: 1.5,
}

describe('TherapistPortrait', () => {
  it('frames the configured portrait and keeps its monogram as the load-error fallback', () => {
    const { container } = render(<TherapistPortrait therapist={therapist} />)
    const image = container.querySelector('img')

    expect(image).toHaveAttribute('src', 'wassana-schlaepfer-demo.png')
    expect(image).toHaveStyle({ transform: 'scale(1.5)' })
    expect(screen.getByText('WS')).toBeInTheDocument()

    fireEvent.error(image!)

    expect(image).toHaveStyle({ display: 'none' })
    expect(screen.getByText('WS')).toBeVisible()
  })
})
