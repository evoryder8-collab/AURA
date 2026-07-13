import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IdentityReveal, type IdentityCandidate } from './IdentityReveal'

const candidates: IdentityCandidate[] = [
  {
    id: 'therapist-aria',
    name: 'Aria Morgan',
    age: 38,
    portraitUrl: '/demo/aria.webp',
    subtitle: 'Senior massage therapist',
  },
  {
    id: 'client-noa',
    name: 'Noa Williams',
    dateOfBirth: '1992-09-08',
  },
]

describe('IdentityReveal', () => {
  it('requires a name and age before performing the local lookup', async () => {
    const user = userEvent.setup()
    render(<IdentityReveal candidates={candidates} onContinue={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /reveal my portal/i }))

    expect(screen.getByText('Enter your name.')).toBeInTheDocument()
    expect(screen.getByText('Enter an age from 1 to 120.')).toBeInTheDocument()
  })

  it('matches normalized exact identity details, reveals a WebP portrait, then continues', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()
    render(<IdentityReveal candidates={candidates} onContinue={onContinue} />)

    await user.type(screen.getByLabelText(/your full name/i), '  ARIA   MORGAN ')
    await user.type(screen.getByLabelText(/your age/i), '38')
    await user.click(screen.getByRole('button', { name: /reveal my portal/i }))

    const portrait = screen.getByRole('img', { name: /aria morgan profile portrait/i })
    expect(portrait).toHaveAttribute('src', '/demo/aria.webp')
    expect(screen.getByText('Senior massage therapist')).toBeInTheDocument()
    expect(screen.getByText(/forming your private entrance/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /continue to secure sign in/i }),
    ).not.toBeInTheDocument()

    const continueButton = await screen.findByRole(
      'button',
      {
        name: /continue to secure sign in/i,
      },
      { timeout: 1600 },
    )
    expect(continueButton).toHaveFocus()
    await user.click(continueButton)
    expect(onContinue).toHaveBeenCalledWith(candidates[0])

    await user.click(screen.getByRole('button', { name: /not you.*start over/i }))
    expect(screen.getByLabelText(/your full name/i)).toHaveFocus()
  })

  it.each([
    ['unknown identity', 'Someone Else', '38'],
    ['incorrect age', 'Aria Morgan', '39'],
  ])('uses the same non-enumerating error for %s', async (_caseName, enteredName, enteredAge) => {
    const user = userEvent.setup()
    render(<IdentityReveal candidates={candidates} onContinue={vi.fn()} />)

    await user.type(screen.getByLabelText(/your full name/i), enteredName)
    await user.type(screen.getByLabelText(/your age/i), enteredAge)
    await user.click(screen.getByRole('button', { name: /reveal my portal/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'We couldn’t confirm those details. Check them and try again.',
    )
    expect(screen.queryByText(/not found|wrong age|unknown/i)).not.toBeInTheDocument()
  })

  it('derives current age from date of birth and provides an initials fallback', async () => {
    const user = userEvent.setup()
    render(
      <IdentityReveal
        candidates={candidates}
        referenceDate={new Date(2026, 6, 14)}
        onContinue={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText(/your full name/i), 'Noa Williams')
    await user.type(screen.getByLabelText(/your age/i), '33')
    await user.click(screen.getByRole('button', { name: /reveal my portal/i }))

    expect(screen.getByRole('img', { name: /noa williams profile monogram/i })).toHaveTextContent(
      'NW',
    )
  })

  it('can reveal a non-enumerating initials preview for connected-mode identities', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()
    render(<IdentityReveal candidates={[]} allowUnmatchedPreview onContinue={onContinue} />)

    await user.type(screen.getByLabelText(/your full name/i), '  Jamie   Rivera  ')
    await user.type(screen.getByLabelText(/your age/i), '41')
    await user.click(screen.getByRole('button', { name: /reveal my portal/i }))

    const monogram = screen.getByRole('img', { name: /jamie rivera profile monogram/i })
    expect(monogram).toHaveTextContent('JR')
    expect(screen.getByText('Secure account verification comes next')).toBeInTheDocument()
    expect(await screen.findByText('Entrance preview formed', {}, { timeout: 1600 })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(
      await screen.findByRole('button', { name: /continue to secure sign in/i }, { timeout: 1600 }),
    )

    expect(onContinue).toHaveBeenCalledWith({
      id: 'unverified-preview',
      name: 'Jamie Rivera',
      age: 41,
      subtitle: 'Secure account verification comes next',
    })
  })

  it('skips the reveal delay when reduced motion is preferred', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      () =>
        ({
          matches: true,
          media: '(prefers-reduced-motion: reduce)',
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    )
    const user = userEvent.setup()
    render(<IdentityReveal candidates={candidates} onContinue={vi.fn()} />)

    await user.type(screen.getByLabelText(/your full name/i), 'Aria Morgan')
    await user.type(screen.getByLabelText(/your age/i), '38')
    await user.click(screen.getByRole('button', { name: /reveal my portal/i }))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /continue to secure sign in/i }),
      ).not.toBeDisabled(),
    )
  })
})
