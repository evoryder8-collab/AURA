import { ArrowRight } from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type RefObject,
} from 'react'
import { Button } from '@/components/design-system/Button'
import { getIdentityAge } from './identity'
import { useAuth, type AuraRole } from './auth-context'
import {
  DEMO_PASSWORD,
  findIdentity,
  matchesDemoAccount,
  MIN_DEMO_PASSWORD,
  parseAge,
  tidyName,
  typedNamePreview,
  type EntranceIdentity,
} from './entrance-identity'

/** A labelled input whose error is linked to it and announced when it appears. */
function TextField({
  label,
  error,
  inputRef,
  className,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error: string
  inputRef: RefObject<HTMLInputElement | null>
}) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className="signin__field">
      <label className="signin__label" htmlFor={id}>
        {label}
      </label>
      <input
        {...input}
        id={id}
        ref={inputRef}
        className={className ? `input ${className}` : 'input'}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Step one: name and age (name only when connected, where nobody is looked up). */
export function IdentityForm({
  demo,
  candidates,
  onFound,
}: {
  demo: boolean
  candidates: readonly EntranceIdentity[]
  onFound: (identity: EntranceIdentity) => void
}) {
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [nameError, setNameError] = useState('')
  const [ageError, setAgeError] = useState('')
  const [matchError, setMatchError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const ageRef = useRef<HTMLInputElement>(null)
  const peopleId = useId()
  const today = useMemo(() => new Date(), [])

  useEffect(() => nameRef.current?.focus({ preventScroll: true }), [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsedAge = parseAge(age)
    const nextNameError = tidyName(name) ? '' : 'Enter your name.'
    const nextAgeError =
      demo && parsedAge === null ? 'Enter your age in whole years, from 1 to 120.' : ''
    setNameError(nextNameError)
    setAgeError(nextAgeError)
    setMatchError('')
    if (nextNameError || nextAgeError) {
      ;(nextNameError ? nameRef : ageRef).current?.focus()
      return
    }
    if (!demo) {
      onFound(typedNamePreview(name))
      return
    }
    const found = parsedAge === null ? null : findIdentity(candidates, name, parsedAge, today)
    if (!found) {
      setMatchError('We couldn’t find that name and age. Check both and try again.')
      nameRef.current?.focus()
      return
    }
    onFound(found)
  }

  return (
    <>
      <form className="signin__form" onSubmit={submit} noValidate>
        <div className={demo ? 'signin__pair' : undefined}>
          <TextField
            label="Your full name"
            error={nameError}
            inputRef={nameRef}
            name="name"
            autoComplete="name"
            autoCapitalize="words"
            spellCheck={false}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setNameError('')
              setMatchError('')
            }}
          />
          {demo ? (
            <TextField
              label="Your age"
              error={ageError}
              inputRef={ageRef}
              className="signin__age"
              name="age"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={3}
              value={age}
              onChange={(event) => {
                setAge(event.target.value.replace(/\D/g, ''))
                setAgeError('')
                setMatchError('')
              }}
            />
          ) : null}
        </div>
        {matchError ? (
          <p className="form-error" role="alert">
            {matchError}
          </p>
        ) : null}
        <Button type="submit" size="lg" fullWidth iconAfter={<ArrowRight size={18} />}>
          Continue
        </Button>
      </form>
      {demo && candidates.length > 0 ? (
        <div className="signin__people" role="group" aria-labelledby={peopleId}>
          <p id={peopleId} className="signin__people-label">
            Fictional demo people
          </p>
          <div className="signin__chips">
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="signin__chip"
                onClick={() => onFound(candidate)}
              >
                {candidate.name}
                <span className="visually-hidden">, age</span>{' '}
                <span className="signin__chip-age">{getIdentityAge(candidate, today)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}

/** Step three: username or email and password. */
export function CredentialsForm({
  role,
  identity,
  demo,
  onSignedIn,
  onStartOver,
}: {
  role: AuraRole
  identity: EntranceIdentity
  demo: boolean
  onSignedIn: () => void
  onStartOver: () => void
}) {
  const auth = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [identifierError, setIdentifierError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [linkError, setLinkError] = useState('')
  const identifierRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const headingId = useId()
  const account = demo ? identity.account : undefined

  useEffect(() => identifierRef.current?.focus({ preventScroll: true }), [])

  const fillDemo = () => {
    if (!account) return
    setIdentifier(account.username)
    setPassword(DEMO_PASSWORD)
    setIdentifierError('')
    setPasswordError('')
    submitRef.current?.focus()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const typed = identifier.trim()
    const nextIdentifierError = !typed
      ? 'Enter your username or email.'
      : demo && !matchesDemoAccount(identity, typed)
        ? account
          ? `That isn’t ${identity.firstName}’s demo sign-in. Use “${account.username}” or “${account.email}”.`
          : 'That username or email isn’t recognised.'
        : ''
    const nextPasswordError = demo
      ? password.length < MIN_DEMO_PASSWORD
        ? `Use at least ${MIN_DEMO_PASSWORD} characters.`
        : ''
      : password
        ? ''
        : 'Enter your password.'
    setIdentifierError(nextIdentifierError)
    setPasswordError(nextPasswordError)
    if (nextIdentifierError || nextPasswordError) {
      ;(nextIdentifierError ? identifierRef : passwordRef).current?.focus()
      return
    }
    if (demo) {
      auth.enterDemo(role, identity.id)
      onSignedIn()
      return
    }
    setBusy(true)
    const ok = await auth.signIn({ identifier: typed, password, expectedRole: role })
    setBusy(false)
    if (ok) onSignedIn()
  }

  const sendLink = async () => {
    const email = identifier.trim()
    if (!email.includes('@')) {
      setLinkError('Enter your email address above, then ask for the link.')
      identifierRef.current?.focus()
      return
    }
    setLinkError('')
    setLink('sending')
    setLink((await auth.signInWithMagicLink(email)) ? 'sent' : 'idle')
  }

  return (
    <form
      className="signin__form"
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="signin__title">
        Your sign-in details
      </h2>
      {account ? (
        <div className="signin__note">
          <p>
            Synthetic demo: any password of 8 or more characters works; nothing is sent anywhere.
          </p>
          <Button variant="secondary" size="sm" onClick={fillDemo}>
            Fill demo sign-in
          </Button>
        </div>
      ) : null}
      <TextField
        label="Username or email"
        error={identifierError || linkError}
        inputRef={identifierRef}
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={identifier}
        onChange={(event) => {
          setIdentifier(event.target.value)
          setIdentifierError('')
          setLinkError('')
        }}
      />
      <TextField
        label="Password"
        error={passwordError}
        inputRef={passwordRef}
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value)
          setPasswordError('')
        }}
      />
      {!demo && auth.error ? (
        <p className="form-error" role="alert">
          {auth.error}
        </p>
      ) : null}
      <Button
        ref={submitRef}
        type="submit"
        size="lg"
        fullWidth
        disabled={busy}
        iconAfter={<ArrowRight size={18} />}
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      {!demo && role === 'client' ? (
        <>
          <Button
            variant="ghost"
            fullWidth
            disabled={link !== 'idle'}
            onClick={() => void sendLink()}
          >
            {link === 'sent'
              ? 'Sign-in link sent'
              : link === 'sending'
                ? 'Sending…'
                : 'Email me a sign-in link'}
          </Button>
          <p className="signin__status" role="status">
            {link === 'sent' ? 'Check your email and open the link on this device.' : null}
          </p>
        </>
      ) : null}
      <Button variant="ghost" fullWidth onClick={onStartOver}>
        Not you? Start again
      </Button>
    </form>
  )
}

/** Connected accounts with an authenticator: the six-digit code. */
export function MfaForm({ onVerified }: { onVerified: () => void }) {
  const auth = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const headingId = useId()

  useEffect(() => codeRef.current?.focus({ preventScroll: true }), [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = code.trim()
    if (!/^\d{6,8}$/.test(value)) {
      setError('Enter the 6-digit code from your authenticator app.')
      codeRef.current?.focus()
      return
    }
    setError('')
    setBusy(true)
    const ok = await auth.verifyMfa(value)
    setBusy(false)
    if (ok) onVerified()
  }

  return (
    <form
      className="signin__form"
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="signin__title">
        Enter your 6-digit code
      </h2>
      <TextField
        label="Code from your authenticator app"
        error={error}
        inputRef={codeRef}
        name="one-time-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={8}
        value={code}
        onChange={(event) => {
          setCode(event.target.value.replace(/\D/g, ''))
          setError('')
        }}
      />
      {auth.error ? (
        <p className="form-error" role="alert">
          {auth.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" fullWidth disabled={busy}>
        {busy ? 'Checking…' : 'Verify'}
      </Button>
    </form>
  )
}
