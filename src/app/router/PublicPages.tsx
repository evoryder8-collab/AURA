import {
  ArrowLeft,
  CloudOff,
  Download,
  FileCheck2,
  FileWarning,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { Field, Input, Select, Textarea } from '@/components/design-system/FormField'
import { Spinner } from '@/components/design-system/Spinner'
import { env } from '@/config/env'
import {
  downloadSecureHandoff,
  inspectSecureHandoff,
  respondToSecureHandoff,
  type SecureHandoffInspection,
} from '@/data/supabase/secureHandoff'

export function AuthCallbackPage() {
  return (
    <main id="main-content" className="public-state">
      <Card>
        <ShieldCheck size={28} />
        <h1>Completing secure sign-in…</h1>
        <p>The authenticated session is being verified before role-based routing.</p>
        <Link className="button button--primary button--md" to="/">
          Return to entrance
        </Link>
      </Card>
    </main>
  )
}

export function OfflinePage() {
  return (
    <main id="main-content" className="public-state">
      <Card>
        <CloudOff size={28} />
        <h1>AURA is offline</h1>
        <p>
          The app shell and minimal pending Session Mode state remain available. Private media and
          unrestricted API responses are never cached.
        </p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </Card>
    </main>
  )
}

export function PublicHandoffPage() {
  const { token } = useParams()
  const [inspection, setInspection] = useState<SecureHandoffInspection | null>(null)
  const [loading, setLoading] = useState(
    Boolean(token && env.flags.secureHandoffLinks && !env.demoMode),
  )
  const [error, setError] = useState<string | null>(null)
  const [respondentName, setRespondentName] = useState('')
  const [organization, setOrganization] = useState('')
  const [message, setMessage] = useState('')
  const [contactPreference, setContactPreference] = useState<'none' | 'email' | 'phone'>('none')
  const [working, setWorking] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!token || env.demoMode || !env.flags.secureHandoffLinks) return
    let active = true
    void inspectSecureHandoff(token)
      .then((data) => {
        if (active) setInspection(data)
      })
      .catch(() => {
        if (active) setError('Link unavailable or expired.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  const download = async () => {
    if (!token) return
    setWorking(true)
    setError(null)
    try {
      const blob = await downloadSecureHandoff(token)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'aura-handoff.pdf'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    } catch {
      setError('Document unavailable or expired.')
    } finally {
      setWorking(false)
    }
  }

  const respond = async () => {
    if (!token || !message.trim()) return
    setWorking(true)
    setError(null)
    try {
      await respondToSecureHandoff(token, {
        ...(respondentName.trim() ? { respondentName: respondentName.trim() } : {}),
        ...(organization.trim() ? { organization: organization.trim() } : {}),
        message: message.trim(),
        contactPreference,
      })
      setSubmitted(true)
    } catch {
      setError('The response could not be submitted.')
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <Spinner label="Validating secure handoff" fullPage />

  if (!inspection) {
    const featureUnavailable = env.demoMode || !env.flags.secureHandoffLinks
    return (
      <main id="main-content" className="public-state">
        <Card>
          <FileWarning size={28} />
          <h1>Secure handoff link</h1>
          <p>
            {!token || error
              ? 'Link unavailable or expired.'
              : featureUnavailable
                ? 'Secure recipient links are not enabled in this synthetic build.'
                : 'Link unavailable or expired.'}{' '}
            Generic responses protect recipient and client information.
          </p>
          <Link className="button button--primary button--md" to="/">
            Return to AURA
          </Link>
        </Card>
      </main>
    )
  }

  return (
    <main id="main-content" className="public-state public-handoff">
      <Card>
        <FileCheck2 size={28} />
        <p className="eyebrow">Scoped professional handoff</p>
        <h1>Secure document access</h1>
        <dl className="handoff-summary">
          <div>
            <dt>Intended recipient</dt>
            <dd>{inspection.recipientName}</dd>
          </div>
          <div>
            <dt>Organization</dt>
            <dd>{inspection.recipientOrganization ?? 'Not specified'}</dd>
          </div>
          <div>
            <dt>Purpose</dt>
            <dd>{inspection.purpose}</dd>
          </div>
          <div>
            <dt>Included categories</dt>
            <dd>{inspection.includedSections.join(', ')}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(inspection.expiresAt))}
            </dd>
          </div>
        </dl>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button
          size="lg"
          icon={<Download size={17} />}
          disabled={working}
          onClick={() => void download()}
        >
          {working ? 'Preparing…' : 'Download PDF'}
        </Button>
        <div className="divider" />
        {submitted ? (
          <div role="status">
            <strong>Response submitted</strong>
            <p>The response is tied only to this handoff. No wider client record was exposed.</p>
          </div>
        ) : (
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault()
              void respond()
            }}
          >
            <h2>Send a scoped response</h2>
            <div className="form-grid">
              <Field label="Your name (optional)">
                <Input
                  value={respondentName}
                  onChange={(event) => setRespondentName(event.target.value)}
                />
              </Field>
              <Field label="Organization (optional)">
                <Input
                  value={organization}
                  onChange={(event) => setOrganization(event.target.value)}
                />
              </Field>
            </div>
            <Field label="Message">
              <Textarea
                required
                maxLength={2000}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </Field>
            <Field label="Contact preference">
              <Select
                value={contactPreference}
                onChange={(event) =>
                  setContactPreference(event.target.value as typeof contactPreference)
                }
              >
                <option value="none">No preference</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
              </Select>
            </Field>
            <Button
              type="submit"
              variant="secondary"
              icon={<Send size={16} />}
              disabled={working || !message.trim()}
            >
              Submit response
            </Button>
          </form>
        )}
      </Card>
    </main>
  )
}

export function PrivacyPlaceholderPage() {
  return (
    <main id="main-content" className="public-state">
      <Card>
        <p className="eyebrow">Technical placeholder</p>
        <h1>Privacy documentation is not supplied by this test build.</h1>
        <p>
          This route exists for integration testing only and is not legal advice or a production
          privacy notice.
        </p>
        <Link className="button button--secondary button--md" to="/">
          <ArrowLeft size={15} /> Return
        </Link>
      </Card>
    </main>
  )
}

export function NotFoundPage() {
  return (
    <main id="main-content" className="public-state">
      <Card>
        <h1>That page is not part of AURA.</h1>
        <Link className="button button--primary button--md" to="/">
          Return to the entrance
        </Link>
      </Card>
    </main>
  )
}
