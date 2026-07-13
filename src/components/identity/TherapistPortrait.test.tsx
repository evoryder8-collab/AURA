import { fireEvent, render, screen } from '@testing-library/react'
import { TherapistPortrait } from './TherapistPortrait'

const therapist = {
  preferredName: 'Sora',
  displayName: 'Sora Bell — fictional demo',
  portraitUrl: 'wassana%20therapist%20transparent.webp',
  portraitScale: 1.5,
}

describe('TherapistPortrait', () => {
  it('frames the configured portrait and keeps its monogram as the load-error fallback', () => {
    const { container } = render(<TherapistPortrait therapist={therapist} />)
    const image = container.querySelector('img')

    expect(image).toHaveAttribute('src', 'wassana%20therapist%20transparent.webp')
    expect(image).toHaveStyle({ transform: 'scale(1.5)' })
    expect(screen.getByText('SB')).toBeInTheDocument()

    fireEvent.error(image!)

    expect(image).toHaveStyle({ display: 'none' })
    expect(screen.getByText('SB')).toBeVisible()
  })
})
