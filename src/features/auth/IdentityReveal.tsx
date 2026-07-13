import { ArrowRight, RotateCcw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/design-system/Button'
import { getIdentityAge, type IdentityCandidate } from './identity'
import './identity-reveal.css'

export type { IdentityCandidate } from './identity'

export type IdentityRevealProps = {
  candidates: readonly IdentityCandidate[]
  onContinue: (candidate: IdentityCandidate) => void
  allowUnmatchedPreview?: boolean
  eyebrow?: string
  heading?: string
  description?: string
  continueLabel?: string
  referenceDate?: Date
  className?: string
}

type RevealStage = 'form' | 'revealing' | 'revealed'

const genericMismatchMessage = 'We couldn’t confirm those details. Check them and try again.'

function normalizeName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function displayName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join('')
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setReducedMotion(mediaQuery.matches)
    mediaQuery.addEventListener('change', updatePreference)
    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  return reducedMotion
}

export function IdentityReveal({
  candidates,
  onContinue,
  allowUnmatchedPreview = false,
  eyebrow = 'Private identity check',
  heading = 'Let AURA recognize you',
  description = 'Enter your name and age to find your private portal entrance.',
  continueLabel = 'Continue to secure sign in',
  referenceDate,
  className = '',
}: IdentityRevealProps) {
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [stage, setStage] = useState<RevealStage>('form')
  const [selectedCandidate, setSelectedCandidate] = useState<IdentityCandidate | null>(null)
  const [portraitFailed, setPortraitFailed] = useState(false)
  const [nameError, setNameError] = useState('')
  const [ageError, setAgeError] = useState('')
  const [matchError, setMatchError] = useState('')
  const reducedMotion = usePrefersReducedMotion()
  const headingId = useId()
  const nameInputId = useId()
  const ageInputId = useId()
  const nameErrorId = useId()
  const ageErrorId = useId()
  const matchErrorId = useId()
  const revealFallbackTimer = useRef<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const continueButtonRef = useRef<HTMLButtonElement>(null)

  const today = useMemo(() => referenceDate ?? new Date(), [referenceDate])

  const completeReveal = useCallback(() => {
    setStage((currentStage) => (currentStage === 'revealing' ? 'revealed' : currentStage))
  }, [])

  useEffect(() => {
    if (stage !== 'revealing') return

    if (reducedMotion) {
      completeReveal()
      return
    }

    revealFallbackTimer.current = window.setTimeout(completeReveal, 1200)
    return () => {
      if (revealFallbackTimer.current !== null) window.clearTimeout(revealFallbackTimer.current)
    }
  }, [completeReveal, reducedMotion, stage])

  useEffect(() => {
    if (stage === 'revealed') continueButtonRef.current?.focus()
  }, [stage])

  useEffect(() => {
    if (stage === 'form') nameInputRef.current?.focus()
  }, [stage])

  const reset = () => {
    setStage('form')
    setSelectedCandidate(null)
    setPortraitFailed(false)
    setMatchError('')
  }

  const submitIdentity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedAge = Number(age)
    const nextNameError = name.trim() ? '' : 'Enter your name.'
    const nextAgeError =
      age && Number.isInteger(parsedAge) && parsedAge >= 1 && parsedAge <= 120
        ? ''
        : 'Enter an age from 1 to 120.'

    setNameError(nextNameError)
    setAgeError(nextAgeError)
    setMatchError('')
    if (nextNameError || nextAgeError) return

    const normalizedInputName = normalizeName(name)
    const matchedCandidate = candidates.find(
      (candidate) =>
        normalizeName(candidate.name) === normalizedInputName &&
        getIdentityAge(candidate, today) === parsedAge,
    )

    if (!matchedCandidate && !allowUnmatchedPreview) {
      setMatchError(genericMismatchMessage)
      return
    }

    const match = matchedCandidate ?? {
      id: 'unverified-preview',
      name: displayName(name),
      age: parsedAge,
      subtitle: 'Secure account verification comes next',
    }

    setSelectedCandidate(match)
    setPortraitFailed(false)
    setStage('revealing')
  }

  const nameDescribedBy = [nameError ? nameErrorId : '', matchError ? matchErrorId : '']
    .filter(Boolean)
    .join(' ')
  const ageDescribedBy = [ageError ? ageErrorId : '', matchError ? matchErrorId : '']
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className={`identity-reveal identity-reveal--${stage} ${className}`.trim()}
      aria-labelledby={headingId}
    >
      <div className="identity-reveal__aurora" aria-hidden="true" />
      {stage === 'form' ? (
        <div className="identity-reveal__content identity-reveal__content--form">
          <p className="identity-reveal__eyebrow">{eyebrow}</p>
          <h2 id={headingId}>{heading}</h2>
          <p className="identity-reveal__description">{description}</p>

          <form className="identity-reveal__form" onSubmit={submitIdentity} noValidate>
            <div className="identity-reveal__field">
              <label htmlFor={nameInputId}>Your full name</label>
              <input
                ref={nameInputRef}
                id={nameInputId}
                name="identity-name"
                type="text"
                autoComplete="name"
                value={name}
                aria-invalid={Boolean(nameError || matchError)}
                aria-describedby={nameDescribedBy || undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  setNameError('')
                  setMatchError('')
                }}
              />
              {nameError ? (
                <span id={nameErrorId} className="identity-reveal__field-error">
                  {nameError}
                </span>
              ) : null}
            </div>

            <div className="identity-reveal__field identity-reveal__field--age">
              <label htmlFor={ageInputId}>Your age</label>
              <input
                id={ageInputId}
                name="identity-age"
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={1}
                max={120}
                step={1}
                value={age}
                aria-invalid={Boolean(ageError || matchError)}
                aria-describedby={ageDescribedBy || undefined}
                onChange={(event) => {
                  setAge(event.target.value)
                  setAgeError('')
                  setMatchError('')
                }}
              />
              {ageError ? (
                <span id={ageErrorId} className="identity-reveal__field-error">
                  {ageError}
                </span>
              ) : null}
            </div>

            {matchError ? (
              <p id={matchErrorId} className="identity-reveal__match-error" role="alert">
                {matchError}
              </p>
            ) : null}

            <Button type="submit" size="lg" fullWidth iconAfter={<Sparkles size={18} />}>
              Reveal my portal
            </Button>
            <p className="identity-reveal__privacy-note">
              This recognition step does not sign you in. Your account credentials are still
              required next.
            </p>
          </form>
        </div>
      ) : selectedCandidate ? (
        <div className="identity-reveal__content identity-reveal__content--portrait">
          <p className="identity-reveal__signal" aria-live="polite">
            <Sparkles size={16} aria-hidden="true" />
            {stage === 'revealing'
              ? 'Forming your private entrance…'
              : selectedCandidate.id === 'unverified-preview'
                ? 'Entrance preview formed'
                : 'Identity recognized'}
          </p>

          <figure className="identity-reveal__figure">
            <div className="identity-reveal__hologram" onAnimationEnd={completeReveal}>
              <span
                className="identity-reveal__orbit identity-reveal__orbit--outer"
                aria-hidden="true"
              />
              <span
                className="identity-reveal__orbit identity-reveal__orbit--inner"
                aria-hidden="true"
              />
              <span className="identity-reveal__halo" aria-hidden="true" />
              <span className="identity-reveal__scan" aria-hidden="true" />
              <span
                className="identity-reveal__particle identity-reveal__particle--one"
                aria-hidden="true"
              />
              <span
                className="identity-reveal__particle identity-reveal__particle--two"
                aria-hidden="true"
              />
              <span
                className="identity-reveal__particle identity-reveal__particle--three"
                aria-hidden="true"
              />
              <div className="identity-reveal__portrait-frame">
                {selectedCandidate.portraitUrl && !portraitFailed ? (
                  <img
                    src={selectedCandidate.portraitUrl}
                    alt={`${selectedCandidate.name} profile portrait`}
                    style={{ transform: `scale(${selectedCandidate.portraitScale ?? 1})` }}
                    onError={() => setPortraitFailed(true)}
                  />
                ) : (
                  <span
                    className="identity-reveal__initials"
                    role="img"
                    aria-label={`${selectedCandidate.name} profile monogram`}
                  >
                    {initialsFor(selectedCandidate.name)}
                  </span>
                )}
              </div>
            </div>

            <figcaption className="identity-reveal__caption">
              <h2 id={headingId}>{selectedCandidate.name}</h2>
              {selectedCandidate.subtitle ? <p>{selectedCandidate.subtitle}</p> : null}
            </figcaption>
          </figure>

          {stage === 'revealed' ? (
            <div className="identity-reveal__actions">
              <Button
                ref={continueButtonRef}
                size="lg"
                fullWidth
                iconAfter={<ArrowRight size={18} />}
                onClick={() => onContinue(selectedCandidate)}
              >
                {continueLabel}
              </Button>
              <Button variant="ghost" fullWidth icon={<RotateCcw size={16} />} onClick={reset}>
                Not you? Start over
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
