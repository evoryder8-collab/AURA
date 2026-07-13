import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { env } from '@/config/env'
import { Button } from '@/components/design-system/Button'
import { Field, Input } from '@/components/design-system/FormField'
import { useDemoStore } from '@/data/demo/store'
import { useAuth, type AuraRole } from './auth-context'

const schema = z.object({
  identifier: z.string().min(3, 'Enter your email or configured username.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
})
type Values = z.infer<typeof schema>

export function LoginPage() {
  const { role: roleParam } = useParams()
  const role: AuraRole = roleParam === 'client' ? 'client' : 'therapist'
  const auth = useAuth()
  const navigate = useNavigate()
  const clients = useDemoStore((state) => state.clients)
  const [magicSent, setMagicSent] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaSubmitting, setMfaSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  if (auth.role && !auth.mfaChallengeRequired) {
    return <Navigate to={auth.role === 'therapist' ? '/therapist/today' : '/client/home'} replace />
  }

  const connectedSignIn = async (values: Values) => {
    const ok = await auth.signIn({ ...values, expectedRole: role })
    if (ok) navigate(role === 'therapist' ? '/therapist/today' : '/client/home')
  }

  const enterDemo = (clientId?: string) => {
    auth.enterDemo(role, clientId)
    navigate(role === 'therapist' ? '/therapist/today' : '/client/home')
  }

  const verifyMfa = async () => {
    setMfaSubmitting(true)
    const ok = await auth.verifyMfa(mfaCode.trim())
    setMfaSubmitting(false)
    if (ok) navigate(auth.role === 'client' ? '/client/home' : '/therapist/today')
  }

  return (
    <main id="main-content" className={`login login--${role}`}>
      <section className="login__visual" aria-hidden="true">
        <div className="login__visual-mark">A</div>
        <p>
          {role === 'therapist'
            ? 'A composed day begins with a clear view.'
            : 'Your progress, held with care.'}
        </p>
      </section>
      <section className="login__form-wrap">
        <Link to="/" className="back-link">
          <ArrowLeft size={17} /> Change entrance
        </Link>
        <div className="login__form">
          <p className="eyebrow">{role === 'therapist' ? 'Practice portal' : 'Personal portal'}</p>
          <h1>Welcome {role === 'therapist' ? 'back' : 'to your AURA'}</h1>
          <p className="login__intro">
            Your entrance choice only changes this presentation. Your protected account role
            determines what you can access.
          </p>
          {env.demoMode ? (
            <div className="demo-entry">
              <div className="demo-entry__note">
                <ShieldCheck size={19} />
                <div>
                  <strong>Synthetic demo access</strong>
                  <span>No password or personal information is required.</span>
                </div>
              </div>
              {role === 'therapist' ? (
                <Button
                  size="lg"
                  fullWidth
                  iconAfter={<ArrowRight size={18} />}
                  onClick={() => enterDemo()}
                >
                  Enter therapist demo
                </Button>
              ) : (
                <div className="demo-profiles">
                  {clients.map((client) => (
                    <button key={client.id} onClick={() => enterDemo(client.id)}>
                      <span className="demo-profile__avatar">{client.preferredName[0]}</span>
                      <span>
                        <strong>{client.preferredName}</strong>
                        <small>{client.phase}</small>
                      </span>
                      <ArrowRight size={17} />
                    </button>
                  ))}
                </div>
              )}
              <div className="demo-divider">
                <span>Connected mode preview</span>
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
                  <span>Enter the current code from the authenticator linked to this account.</span>
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
              Connected sign-in becomes available when Supabase public credentials are configured.
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
