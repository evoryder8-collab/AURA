import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { assetUrl } from '@/components/ui/assets'
import { env } from '@/config/env'
import { useDemoStore } from '@/data/demo/store'
import { DuskScene } from '@/features/entrance/DuskScene'
import { IdentityReveal } from './IdentityReveal'
import { useAuth, type AuraRole } from './auth-context'
import { CredentialsForm, IdentityForm, MfaForm } from './entrance-forms'
import { demoIdentities, portalLanding, type EntranceIdentity } from './entrance-identity'
import './entrance-signin.css'

/** Morph between steps where the browser can (the portrait glides into place); otherwise just switch. */
function morph(update: () => void) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced || typeof document.startViewTransition !== 'function') {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}

export function LoginPage() {
  const { role } = useParams()
  const portal: AuraRole = role === 'client' ? 'client' : 'therapist'
  // A new portal starts clean: nothing typed for one role carries into the other.
  return <SignIn key={portal} role={portal} />
}

function SignIn({ role }: { role: AuraRole }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const demo = env.demoMode
  const therapists = useDemoStore((state) => state.therapists)
  const clients = useDemoStore((state) => state.clients)
  const candidates = useMemo(
    () => (demo ? demoIdentities(role, therapists, clients) : []),
    [clients, demo, role, therapists],
  )
  const [identity, setIdentity] = useState<EntranceIdentity | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [settled, setSettled] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const step = auth.mfaChallengeRequired
    ? 'mfa'
    : !identity
      ? 'identity'
      : confirmed
        ? 'credentials'
        : 'reveal'

  // Fetch the fictional portraits ahead, so the reveal never waits on the network.
  useEffect(() => {
    for (const person of candidates) {
      if (person.portrait) new Image().src = assetUrl(person.portrait.hero)
    }
  }, [candidates])

  useEffect(() => {
    if (step !== 'reveal') return
    // Show the person from the top, with the answer focused below them.
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0
    confirmRef.current?.focus({ preventScroll: true })
  }, [step])

  if (auth.role && !auth.mfaChallengeRequired)
    return <Navigate to={portalLanding(auth.role, demo)} replace />

  const startOver = () =>
    morph(() => {
      setIdentity(null)
      setConfirmed(false)
      setSettled(false)
    })
  const confirm = (value: boolean) =>
    morph(() => {
      setConfirmed(value)
      // Back on the reveal, the light may move again.
      if (!value) setSettled(false)
    })
  const signedIn = () => navigate(portalLanding(role, demo), { replace: true })

  return (
    <main id="main-content" className={`signin signin--${role}`} data-step={step}>
      <DuskScene focus={[0.72, 0.76]} energy={identity ? 0.55 : 0.85} settled={settled} />
      <div className="signin__layout">
        {step === 'identity' ? (
          <Link to="/" className="signin__back">
            <ArrowLeft size={18} aria-hidden="true" /> Back
          </Link>
        ) : step === 'mfa' ? null : (
          <button
            type="button"
            className="signin__back"
            onClick={() => (step === 'credentials' ? confirm(false) : startOver())}
          >
            <ArrowLeft size={18} aria-hidden="true" /> Back
          </button>
        )}

        <div className="signin__hero">
          {identity ? (
            <IdentityReveal identity={identity} settled={settled} />
          ) : (
            <div className="signin__intro">
              <h1>
                {role === 'therapist' ? 'Therapist' : 'Client'}{' '}
                <span className="nowrap">sign-in</span>
              </h1>
              <p>{demo ? 'Start with your name and age.' : 'Start with your name.'}</p>
            </div>
          )}
        </div>

        <div
          className="signin__panel"
          onFocus={step === 'credentials' || step === 'mfa' ? () => setSettled(true) : undefined}
        >
          {step === 'identity' ? (
            <IdentityForm demo={demo} candidates={candidates} onFound={setIdentity} />
          ) : step === 'reveal' ? (
            <div className="signin__confirm">
              <Button
                ref={confirmRef}
                size="lg"
                fullWidth
                iconAfter={<ArrowRight size={18} />}
                onClick={() => confirm(true)}
              >
                {demo ? 'That’s me' : 'Continue'}
              </Button>
              <Button variant="ghost" fullWidth onClick={startOver}>
                {demo ? 'Not me, start again' : 'Change name'}
              </Button>
            </div>
          ) : step === 'credentials' && identity ? (
            <CredentialsForm
              role={role}
              identity={identity}
              demo={demo}
              onSignedIn={signedIn}
              onStartOver={startOver}
            />
          ) : (
            <MfaForm onVerified={signedIn} />
          )}
        </div>
      </div>
    </main>
  )
}
