import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Field, Input } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { env } from '@/config/env'
import {
  beginTotpEnrollment,
  discardTotpEnrollment,
  listVerifiedTotpFactors,
  verifyTotpEnrollment,
  type TotpEnrollment,
} from '@/data/supabase/mfa'
import type { AuraRole } from '@/features/auth/auth-context'

export function MfaSettings({ role }: { role: AuraRole }) {
  const [verifiedCount, setVerifiedCount] = useState(0)
  const [loading, setLoading] = useState(!env.demoMode)
  const [working, setWorking] = useState(false)
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (env.demoMode) return
    let active = true
    void listVerifiedTotpFactors()
      .then((factors) => {
        if (active) setVerifiedCount(factors.length)
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : 'Authenticator status could not be loaded.',
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const startEnrollment = async () => {
    setWorking(true)
    setError(null)
    try {
      setEnrollment(await beginTotpEnrollment())
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Authenticator setup could not be started.',
      )
    } finally {
      setWorking(false)
    }
  }

  const closeEnrollment = async () => {
    const pending = enrollment
    setEnrollment(null)
    setCode('')
    if (!pending) return
    try {
      await discardTotpEnrollment(pending.id)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Incomplete authenticator setup could not be removed.',
      )
    }
  }

  const verify = async () => {
    if (!enrollment) return
    setWorking(true)
    setError(null)
    try {
      await verifyTotpEnrollment(enrollment.id, code.trim())
      setVerifiedCount((count) => count + 1)
      setEnrollment(null)
      setCode('')
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'That verification code could not be confirmed.',
      )
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <div className="setting-row">
        <KeyRound size={19} />
        <div>
          <strong>Multi-factor authentication</strong>
          <span>
            {env.demoMode
              ? `${role === 'therapist' ? 'Required therapist' : 'Optional client'} TOTP flow is available in connected mode.`
              : verifiedCount > 0
                ? `${verifiedCount} verified authenticator${verifiedCount === 1 ? '' : 's'} enrolled.`
                : 'Add an authenticator app for a second sign-in step.'}
          </span>
          {error && (
            <span className="form-error" role="alert">
              {error}
            </span>
          )}
        </div>
        {env.demoMode ? (
          <Badge tone="attention">Demo</Badge>
        ) : (
          <div className="setting-row__action">
            <Badge tone={verifiedCount > 0 ? 'favourable' : 'attention'}>
              {loading ? 'Checking' : verifiedCount > 0 ? 'Enrolled' : 'Not enrolled'}
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || working}
              onClick={() => void startEnrollment()}
            >
              {working ? 'Preparing…' : verifiedCount > 0 ? 'Add another' : 'Set up'}
            </Button>
          </div>
        )}
      </div>
      <Modal
        open={Boolean(enrollment)}
        onOpenChange={(open) => {
          if (!open) void closeEnrollment()
        }}
        title="Connect an authenticator"
        description="Scan the code, then confirm one current six-digit code. The setup secret stays in this dialog only."
      >
        {enrollment && (
          <div className="mfa-setup">
            <img src={enrollment.qrCodeUrl} alt="Authenticator enrollment QR code" />
            <p className="microcopy">Cannot scan it? Enter this setup key in your authenticator:</p>
            <code>{enrollment.secret}</code>
            <Field label="Six-digit verification code">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={8}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoFocus
              />
            </Field>
            <Button
              fullWidth
              size="lg"
              disabled={code.trim().length < 6 || working}
              onClick={() => void verify()}
            >
              {working ? 'Verifying…' : 'Verify authenticator'}
            </Button>
          </div>
        )}
      </Modal>
    </>
  )
}
