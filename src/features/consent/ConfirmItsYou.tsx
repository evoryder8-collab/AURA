import { ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/design-system/Button'
import { Field, Input } from '@/components/design-system/FormField'
import { env } from '@/config/env'
import { useFreshAuth } from './freshAuth'
import './consent.css'

const PHRASE = 'DEMO'

/**
 * The fresh-authentication step required before photos and consent changes.
 * Connected builds re-verify the account; this synthetic demo accepts a typed phrase.
 */
export function ConfirmItsYou({
  reason,
  onConfirmed,
}: {
  reason: string
  onConfirmed?: () => void
}) {
  const { confirm } = useFreshAuth()
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const headingId = useId()

  // The typed phrase is a demo stand-in only; connected builds must never accept it.
  if (!env.demoMode) {
    return (
      <p className="form-error" role="alert">
        Re-verifying your account is not available in this build, so this action stays locked.
      </p>
    )
  }

  return (
    <form
      className="confirm-you"
      aria-labelledby={headingId}
      onSubmit={(event) => {
        event.preventDefault()
        if (phrase.trim().toUpperCase() !== PHRASE) {
          setError(`Type ${PHRASE} to continue.`)
          return
        }
        confirm()
        onConfirmed?.()
      }}
    >
      <span className="confirm-you__icon" aria-hidden="true">
        <ShieldCheck size={22} />
      </span>
      <h3 id={headingId} className="title-md">
        Confirm it’s you
      </h3>
      <p className="muted">
        {reason} In the connected app you would sign in again. In this synthetic demo, type{' '}
        <strong>{PHRASE}</strong>.
      </p>
      <Field label={`Type ${PHRASE} to confirm`} error={error}>
        <Input
          value={phrase}
          onChange={(event) => {
            setPhrase(event.target.value)
            setError(undefined)
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
        />
      </Field>
      <Button type="submit" fullWidth>
        Confirm
      </Button>
    </form>
  )
}
