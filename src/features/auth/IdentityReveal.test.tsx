import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { IdentityReveal } from './IdentityReveal'
import type { EntranceIdentity } from './entrance-identity'

const pratana: EntranceIdentity = {
  id: 'demo-therapist-amara',
  name: 'Pratana Halstrick',
  firstName: 'Pratana',
  subtitle: 'Massage therapist · practice lead',
  portrait: { hero: 'portraits/pratana-hero.webp', avatar: 'portraits/pratana-avatar.webp' },
}

const mira: EntranceIdentity = {
  id: 'demo-client-mira',
  name: 'Mira Ellison',
  firstName: 'Mira',
  subtitle: 'Sees Pratana and Wassana',
}

function preferReducedMotion(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: matches && query.includes('reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  )
}

describe('IdentityReveal', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows a therapist’s own portrait, named once for screen readers', () => {
    const { container } = render(<IdentityReveal identity={pratana} />)

    const region = screen.getByRole('region', { name: 'Pratana Halstrick' })
    expect(screen.getByRole('heading', { level: 1, name: 'Pratana Halstrick' })).toBeInTheDocument()
    expect(screen.getByText('Massage therapist · practice lead')).toBeInTheDocument()
    const portrait = container.querySelector('img.reveal__portrait')
    expect(portrait).toHaveAttribute('src', '/portraits/pratana-hero.webp')
    expect(portrait).toHaveAttribute('alt', '')
    expect(region.querySelector('.reveal__stage')).toHaveAttribute('aria-hidden', 'true')
  })

  it('forms a client’s initials in light instead of a photograph', () => {
    const { container } = render(<IdentityReveal identity={mira} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Mira Ellison' })).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.reveal__monogram')).toHaveTextContent('ME')
  })

  it('starts no animation loop when reduced motion is preferred', () => {
    preferReducedMotion(true)
    const frame = vi.spyOn(window, 'requestAnimationFrame')
    const { container } = render(<IdentityReveal identity={pratana} />)

    expect(screen.getByRole('heading', { name: 'Pratana Halstrick' })).toBeInTheDocument()
    expect(container.querySelector('canvas')).toBeNull()
    expect(frame).not.toHaveBeenCalled()
  })

  it('floats the portrait when motion is allowed', () => {
    preferReducedMotion(false)
    const frame = vi.spyOn(window, 'requestAnimationFrame')
    render(<IdentityReveal identity={pratana} />)
    expect(frame).toHaveBeenCalled()
  })
})
