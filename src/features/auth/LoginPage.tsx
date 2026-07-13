import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Mail,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { env } from '@/config/env'
import { Button } from '@/components/design-system/Button'
import { Field, Input } from '@/components/design-system/FormField'
import { useDemoStore } from '@/data/demo/store'
import { IdentityReveal, type IdentityCandidate } from './IdentityReveal'
import { getIdentityAge } from './identity'
import { useAuth, type AuraRole } from './auth-context'

const schema = z.object({
  identifier: z.string().min(3, 'Enter your email or configured username.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
})
type Values = z.infer<typeof schema>

function portalLanding(role: AuraRole) {
  if (role === 'therapist') return '/therapist/today'
  return env.demoMode ? '/client/home' : '/client/appointments'
}

export function LoginPage() {
  const { role: roleParam } = useParams()
  const role: AuraRole = roleParam === 'client' ? 'client' : 'therapist'
  const auth = useAuth()
  const navigate = useNavigate()
  const clients = useDemoStore((state) => state.clients)
  const therapists = useDemoStore((state) => state.therapists)
  const [identified, setIdentified] = useState<IdentityCandidate | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaSubmitting, setMfaSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const identityCandidates = useMemo<IdentityCandidate[]>(
    () =>
      env.demoMode
        ? role === 'therapist'
          ? therapists.map((therapist) => ({
              id: therapist.id,
              name: therapist.displayName.replace(' — fictional demo', ''),
              dateOfBirth: therapist.dateOfBirth,
              subtitle: therapist.professionalTitle,
              ...(therapist.portraitUrl ? { portraitUrl: therapist.portraitUrl } : {}),
              ...(therapist.portraitScale ? { portraitScale: therapist.portraitScale } : {}),
            }))
          : clients.map((client) => ({
              id: client.id,
              name: client.preferredName,
              dateOfBirth: client.dateOfBirth,
              subtitle: client.phase,
              ...(client.portraitUrl ? { portraitUrl: client.portraitUrl } : {}),
              ...(client.portraitScale ? { portraitScale: client.portraitScale } : {}),
            }))
        : [],
    [clients, role, therapists],
  )

  useEffect(() => setIdentified(null), [role])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [identified])

  if (auth.role && !auth.mfaChallengeRequired) {
    return <Navigate to={portalLanding(auth.role)} replace />
  }

  const connectedSignIn = async (values: Values) => {
    const ok = await auth.signIn({ ...values, expectedRole: role })
    if (ok) navigate(portalLanding(role))
  }

  const enterDemo = (profileId?: string) => {
    auth.enterDemo(role, profileId)
    navigate(portalLanding(role))
  }

  const verifyMfa = async () => {
    setMfaSubmitting(true)
    const ok = await auth.verifyMfa(mfaCode.trim())
    setMfaSubmitting(false)
    if (ok) navigate(portalLanding(auth.role ?? role))
  }

  const identityStage = !identified && !auth.mfaChallengeRequired
  const isUnverifiedPreview = identified?.id === 'unverified-preview'
  const recognizedName = identified?.name ?? (role === 'therapist' ? 'Therapist' : 'Client')
  const recognizedFirstName = recognizedName.split(' ')[0] ?? recognizedName
  const recognizedInitials = recognizedName
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <main id="main-content" className={`login login--${role}`}>
      <section className="login__visual" aria-hidden="true">
        <div className={`login__visual-mark${identified ? ' is-identity' : ''}`}>
          {identified ? recognizedInitials : 'A'}
        </div>
        <p>
          {role === 'therapist'
            ? 'Every practitioner has a private place within the team.'
            : 'Your progress follows you, whoever supports your care.'}
        </p>
      </section>
      <section className="login__form-wrap">
        <Link to="/" className="back-link">
          <ArrowLeft size={17} /> Change entrance
        </Link>
        <div className={`login__form${identityStage ? ' login__form--identity' : ''}`}>
          {identityStage ? (
            <>
              <IdentityReveal
                candidates={identityCandidates}
                allowUnmatchedPreview={!env.demoMode}
                eyebrow={role === 'therapist' ? 'Team identity' : 'Personal identity'}
                heading={
                  role === 'therapist' ? 'Find your place on the team' : 'Let your AURA take shape'
                }
                description={
                  role === 'therapist'
                    ? 'Enter your name and age to reveal your individual practice entrance.'
                    : 'Enter your name and age to reveal your personal portal before secure sign in.'
                }
                onContinue={setIdentified}
              />
              {env.demoMode && (
                <div className="demo-identity-guide" aria-label="Fictional demo identities">
                  <span>Fictional identities to try</span>
                  <div>
                    {identityCandidates.map((candidate) => (
                      <span key={candidate.id}>
                        <strong>{candidate.name}</strong> · age {getIdentityAge(candidate)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {identified && !auth.mfaChallengeRequired && (
                <button
                  type="button"
                  className="login__change-identity"
                  onClick={() => setIdentified(null)}
                >
                  <RotateCcw size={15} /> Not you? Change identity
                </button>
              )}
              <div className="credential-identity">
                <span className="credential-identity__portrait" aria-hidden="true">
                  <span>{recognizedInitials}</span>
                  {identified?.portraitUrl && (
                    <img
                      src={identified.portraitUrl}
                      alt=""
                      style={{ transform: `scale(${identified.portraitScale ?? 1})` }}
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                    />
                  )}
                </span>
                <div>
                  <span>
                    {auth.mfaChallengeRequired
                      ? 'Account verified'
                      : isUnverifiedPreview
                        ? 'Entrance preview'
                        : 'Identity revealed'}
                  </span>
                  <strong>{recognizedName}</strong>
                  <small>
                    {identified?.subtitle ??
                      (role === 'therapist' ? 'Individual team account' : 'Private client account')}
                  </small>
                </div>
                {auth.mfaChallengeRequired || !isUnverifiedPreview ? (
                  <ShieldCheck size={20} />
                ) : (
                  <Sparkles size={20} />
                )}
              </div>
              <p className="eyebrow">
                {role === 'therapist' ? 'Practice portal' : 'Personal portal'} · secure entry
              </p>
              <h1>Welcome, {recognizedFirstName}.</h1>
              <p className="login__intro">
                {isUnverifiedPreview
                  ? 'This personalized entrance is only a preview. Your credentials will securely identify your account and determine what you can access.'
                  : 'Your name and age shaped this private entrance; credentials and the protected backend role still determine what you can access.'}
              </p>
              {env.demoMode && !auth.mfaChallengeRequired ? (
                <div className="demo-entry">
                  <div className="demo-entry__note">
                    <ShieldCheck size={19} />
                    <div>
                      <strong>Synthetic demo access</strong>
                      <span>
                        No password or personal information is required for this showcase.
                      </span>
                    </div>
                  </div>
                  <Button
                    size="lg"
                    fullWidth
                    iconAfter={<ArrowRight size={18} />}
                    onClick={() => enterDemo(identified?.id)}
                  >
                    Enter {recognizedFirstName}’s {role === 'therapist' ? 'team' : 'client'} demo
                  </Button>
                  <div className="demo-divider">
                    <span>Connected account sign in</span>
                  </div>
                </div>
              ) : null}
              {auth.mfaChallengeRequired ? (
                <form
                  className="form-stack"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void verifyMfa()
                  }}
                >
                  <div className="demo-entry__note">
                    <ShieldCheck size={19} />
                    <div>
                      <strong>Authenticator verification</strong>
                      <span>
                        Enter the current code from the authenticator linked to this account.
                      </span>
                    </div>
                  </div>
                  <Field label="Six-digit verification code">
                    <div className="input-with-icon">
                      <KeyRound size={18} />
                      <Input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]*"
                        maxLength={8}
                        value={mfaCode}
                        onChange={(event) => setMfaCode(event.target.value)}
                        autoFocus
                      />
                    </div>
                  </Field>
                  {auth.error && (
                    <p className="form-error" role="alert">
                      {auth.error}
                    </p>
                  )}
                  <Button
                    type="submit"
                    fullWidth
                    size="lg"
                    disabled={mfaCode.trim().length < 6 || mfaSubmitting}
                  >
                    {mfaSubmitting ? 'Verifying…' : 'Verify & continue'}
                  </Button>
                </form>
              ) : (
                <form className="form-stack" onSubmit={handleSubmit(connectedSignIn)} noValidate>
                  <Field label="Email or username" error={errors.identifier?.message}>
                    <div className="input-with-icon">
                      <Mail size={18} />
                      <Input autoComplete="username" {...register('identifier')} />
                    </div>
                  </Field>
                  <Field label="Password" error={errors.password?.message}>
                    <div className="input-with-icon">
                      <KeyRound size={18} />
                      <Input
                        type="password"
                        autoComplete="current-password"
                        {...register('password')}
                      />
                    </div>
                  </Field>
                  {auth.error && (
                    <p className="form-error" role="alert">
                      {auth.error}
                    </p>
                  )}
                  <Button type="submit" fullWidth size="lg" disabled={env.demoMode || isSubmitting}>
                    {isSubmitting ? 'Verifying…' : 'Sign in securely'}
                  </Button>
                  {role === 'client' && (
                    <Button
                      variant="ghost"
                      fullWidth
                      disabled={env.demoMode || magicSent}
                      onClick={async () => {
                        const email = getValues('identifier')
                        if (!email.includes('@')) return
                        setMagicSent(await auth.signInWithMagicLink(email))
                      }}
                    >
                      {magicSent ? 'Secure link sent' : 'Email me a magic link'}
                    </Button>
                  )}
                </form>
              )}
              {env.demoMode && (
                <p className="microcopy login__disabled-note">
                  Connected sign-in becomes available when Supabase public credentials are
                  configured.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  )
}
