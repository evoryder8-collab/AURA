import { Check, FileOutput, LockKeyhole, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { PageHeader } from '@/components/design-system/PageHeader'
import { Field, Input } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { StatusStrip } from '@/components/feedback/StatusStrip'
import { useDemoStore } from '@/data/demo/store'
import type { ConsentState } from '@/data/demo/model'
import { useAuth } from '@/features/auth/auth-context'

const choices = [
  {
    key: 'healthData' as const,
    label: 'Relevant health and treatment records',
    detail: 'Required for the connected treatment workflow.',
  },
  {
    key: 'photography' as const,
    label: 'Progress photography',
    detail: 'Optional · private storage and fresh authentication.',
  },
  {
    key: 'reminders' as const,
    label: 'Appointment and follow-up reminders',
    detail: 'Optional · in-app only in this test build.',
  },
  {
    key: 'aiProcessing' as const,
    label: 'AI-assisted narration',
    detail: 'Optional · deterministic pattern logic never uses a generative model.',
  },
]

export function ConsentsPage() {
  const auth = useAuth()
  const client = useDemoStore((state) =>
    state.clients.find((item) => item.id === auth.demoClientId),
  )
  const allHandoffs = useDemoStore((state) => state.handoffs)
  const handoffs = allHandoffs.filter((item) => item.clientId === auth.demoClientId)
  const updateConsent = useDemoStore((state) => state.updateConsent)
  const updateHandoff = useDemoStore((state) => state.updateHandoff)
  const [pending, setPending] = useState<
    | { type: 'consent'; key: keyof ConsentState; value: boolean }
    | { type: 'handoff'; id: string; approved: boolean }
    | { type: 'request'; label: string }
    | null
  >(null)
  const [challenge, setChallenge] = useState('')
  const [requestRecorded, setRequestRecorded] = useState<string | null>(null)
  if (!client) return null
  const awaiting = handoffs.filter((item) => item.status === 'awaiting_consent')
  const decide = (id: string, approved: boolean) => {
    setChallenge('')
    setPending({ type: 'handoff', id, approved })
  }
  const confirmSensitiveAction = () => {
    if (!pending || challenge !== 'DEMO') return
    if (pending.type === 'consent') updateConsent(client.id, pending.key, pending.value)
    if (pending.type === 'handoff') {
      updateConsent(client.id, 'handoff', pending.approved)
      updateHandoff(pending.id, { status: pending.approved ? 'approved' : 'revoked' })
    }
    if (pending.type === 'request') setRequestRecorded(pending.label)
    setPending(null)
    setChallenge('')
  }
  const queueRequest = (label: string) => {
    setChallenge('')
    setPending({ type: 'request', label })
  }
  return (
    <div>
      <PageHeader
        eyebrow="Consent & privacy"
        title={
          <>
            Your choices,
            <br />
            kept explicit.
          </>
        }
        lead="You can review optional choices here. Connected mode records grants and revocations as append-only audit events."
      />
      {requestRecorded && (
        <StatusStrip tone="success" title={`${requestRecorded} request recorded`}>
          The synthetic request is ready for therapist review.
        </StatusStrip>
      )}
      {awaiting.map((handoff) => (
        <Card key={handoff.id} className="handoff-consent-card" tone="gold">
          <div className="handoff-consent-card__head">
            <FileOutput size={22} />
            <div>
              <p className="eyebrow">Professional handoff request</p>
              <h2>Review before anything is generated</h2>
            </div>
            <Badge tone="attention">Decision needed</Badge>
          </div>
          <div className="handoff-consent-detail">
            <div>
              <span>Recipient</span>
              <strong>
                {handoff.recipientName}
                <br />
                {handoff.recipientOrganization}
              </strong>
            </div>
            <div>
              <span>Purpose</span>
              <strong>{handoff.purpose}</strong>
            </div>
            <div>
              <span>Included categories</span>
              <strong>{handoff.includedSections.join(', ')}</strong>
            </div>
            <div>
              <span>Photographs</span>
              <strong>{handoff.includePhotos ? 'Included' : 'Not included'}</strong>
            </div>
            <div>
              <span>Delivery</span>
              <strong>Authenticated PDF · secure link off</strong>
            </div>
            <div>
              <span>Expiry</span>
              <strong>{new Date(handoff.expiresAt).toLocaleDateString()}</strong>
            </div>
          </div>
          <StatusStrip tone="info" title="Approval applies only to this named handoff">
            You can decline now. Once approved, the therapist must still review and generate the
            document.
          </StatusStrip>
          <div className="form-actions">
            <Button
              variant="secondary"
              icon={<X size={16} />}
              onClick={() => decide(handoff.id, false)}
            >
              Decline
            </Button>
            <Button icon={<Check size={16} />} onClick={() => decide(handoff.id, true)}>
              Approve this handoff
            </Button>
          </div>
        </Card>
      ))}
      <section className="consent-page-grid">
        <Card eyebrow="Standing choices" title="Optional permissions">
          {choices.map((choice) => (
            <label className="consent-setting" key={choice.key}>
              <div>
                <strong>{choice.label}</strong>
                <span>{choice.detail}</span>
              </div>
              <input
                type="checkbox"
                checked={client.consents[choice.key]}
                disabled={choice.key === 'healthData'}
                onChange={(event) => {
                  setChallenge('')
                  setPending({ type: 'consent', key: choice.key, value: event.target.checked })
                }}
              />
            </label>
          ))}
        </Card>
        <Card tone="dark" eyebrow="Data boundaries" title="What stays private">
          <ul className="privacy-list">
            <li>
              <LockKeyhole size={15} />
              Raw therapist notes
            </li>
            <li>
              <LockKeyhole size={15} />
              Draft or rejected insights
            </li>
            <li>
              <LockKeyhole size={15} />
              Other client records
            </li>
            <li>
              <ShieldCheck size={15} />
              Photos without active consent
            </li>
          </ul>
          <p>Consent does not override backend authorization or private storage policy.</p>
        </Card>
        <Card tone="soft" eyebrow="Data requests" title="Export or deletion">
          <p className="muted">
            Create a test request for the therapist to review. This prototype does not claim to
            complete jurisdiction-specific legal obligations.
          </p>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => queueRequest('Export')}>
              Request export
            </Button>
            <Button variant="secondary" onClick={() => queueRequest('Deletion')}>
              Request deletion
            </Button>
          </div>
        </Card>
      </section>
      <Modal
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title="Confirm this sensitive change"
        description="Connected mode re-verifies the signed-in account. Enter DEMO for this synthetic workflow."
      >
        <div className="form-stack">
          <Field label="Synthetic verification phrase">
            <Input
              value={challenge}
              onChange={(event) => setChallenge(event.target.value)}
              autoComplete="off"
            />
          </Field>
          <Button fullWidth disabled={challenge !== 'DEMO'} onClick={confirmSensitiveAction}>
            Verify & confirm
          </Button>
        </div>
      </Modal>
    </div>
  )
}
