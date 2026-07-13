import { addDays, format } from 'date-fns'
import { Check, FileCheck2, LockKeyhole, Send, ShieldCheck } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { Button } from '@/components/design-system/Button'
import { Field, Input, Textarea } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { StatusStrip } from '@/components/feedback/StatusStrip'
import type { DemoClient } from '@/data/demo/model'
import { useDemoStore } from '@/data/demo/store'
import { evaluateConsentGuard } from '@/domain/rules'
import { demoConsentRecords } from '@/lib/security/demoConsent'

const HandoffPdfAction = lazy(() => import('./HandoffPdfAction'))

const sectionOptions = [
  'Functional goals',
  'Progress overview',
  'Pain graph',
  'Stiffness graph',
  'ROM graph',
  'Function graph',
  'Session response',
  'Body-map timeline',
  'Recorded interventions',
  'Context events',
  'Pattern observation',
  'Therapist note',
]

export function HandoffWorkflow({
  client,
  open,
  onOpenChange,
}: {
  client: DemoClient
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const allHandoffs = useDemoStore((state) => state.handoffs)
  const allAppointments = useDemoStore((state) => state.appointments)
  const allEvents = useDemoStore((state) => state.events)
  const handoffs = useMemo(
    () => allHandoffs.filter((item) => item.clientId === client.id),
    [allHandoffs, client.id],
  )
  const appointments = useMemo(
    () => allAppointments.filter((item) => item.clientId === client.id),
    [allAppointments, client.id],
  )
  const events = useMemo(
    () => allEvents.filter((item) => item.clientId === client.id),
    [allEvents, client.id],
  )
  const createHandoff = useDemoStore((state) => state.createHandoff)
  const updateHandoff = useDemoStore((state) => state.updateHandoff)
  const current = handoffs.at(-1)
  const [recipientName, setRecipientName] = useState('Dr. Fictional Recipient')
  const [organization, setOrganization] = useState('Demo Collaborative Practice')
  const [purpose, setPurpose] = useState('Review of recorded progress')
  const [note, setNote] = useState(
    'Please review the recorded progress and functional-goal context.',
  )
  const [dateFrom, setDateFrom] = useState(format(addDays(new Date(), -90), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [sections, setSections] = useState(
    sectionOptions.filter((item) => item !== 'Therapist note'),
  )
  const [photos, setPhotos] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [freshAt, setFreshAt] = useState<string | null>(null)
  const [challenge, setChallenge] = useState('')
  const handoff = handoffs.find((item) => item.id === createdId) ?? current
  const canIncludePhotos = client.consents.photography && client.photos.length > 0
  const generateGuard = evaluateConsentGuard({
    action: 'generate_handoff',
    actorRole: 'therapist',
    actorClientId: null,
    targetClientId: client.id,
    therapistCanAccessClient: true,
    consents: demoConsentRecords(client),
    freshAuthenticationAt: freshAt,
  })

  const toggleSection = (section: string) =>
    setSections((items) =>
      items.includes(section) ? items.filter((item) => item !== section) : [...items, section],
    )
  const requestConsent = () => {
    const id = createHandoff({
      clientId: client.id,
      status: 'awaiting_consent',
      recipientName,
      recipientOrganization: organization,
      purpose,
      therapistNote: note,
      dateFrom,
      dateTo,
      includedSections: sections,
      includePhotos: photos,
      expiresAt: addDays(new Date(), 7).toISOString(),
    })
    setCreatedId(id)
  }

  const filename = useMemo(
    () => `aura-handoff-${handoff?.id ?? 'pending'}-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
    [handoff?.id],
  )

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Prepare Professional Handoff"
      description="A therapist-reviewed, consent-gated summary. Photographs remain off by default."
      wide
    >
      {!handoff ? (
        <div className="handoff-builder">
          <div className="handoff-builder__fields form-stack">
            <div className="form-grid">
              <Field label="Recipient name">
                <Input
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                />
              </Field>
              <Field label="Organization">
                <Input
                  value={organization}
                  onChange={(event) => setOrganization(event.target.value)}
                />
              </Field>
            </div>
            <Field label="Purpose">
              <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} />
            </Field>
            <div className="form-grid">
              <Field label="From">
                <Input
                  type="date"
                  value={dateFrom}
                  max={dateTo}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </Field>
              <Field label="To">
                <Input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </Field>
            </div>
            <Field label="Therapist context note">
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </div>
          <div className="handoff-builder__sections">
            <p className="eyebrow">Included sections</p>
            <div className="section-checks">
              {sectionOptions.map((section) => (
                <label key={section}>
                  <input
                    type="checkbox"
                    checked={sections.includes(section)}
                    onChange={() => toggleSection(section)}
                  />
                  <span>{section}</span>
                </label>
              ))}
            </div>
            <label className={`photo-include${!canIncludePhotos ? ' is-disabled' : ''}`}>
              <input
                type="checkbox"
                disabled={!canIncludePhotos}
                checked={photos}
                onChange={(event) => setPhotos(event.target.checked)}
              />
              <span>
                <strong>Include progress photographs</strong>
                <small>
                  {canIncludePhotos
                    ? 'Explicitly selected for this handoff'
                    : 'Unavailable: photography consent or photographs are missing'}
                </small>
              </span>
            </label>
          </div>
          <div className="handoff-preview">
            <p className="eyebrow">Preview</p>
            <div>
              <span>AURA</span>
              <small>Professional handoff</small>
              <h3>
                {client.preferredName}
                <br />
                Progress summary
              </h3>
              <p>
                {recipientName}
                <br />
                {organization}
              </p>
              <i>Therapist branding dominates · Powered by AURA</i>
            </div>
          </div>
          <StatusStrip title="Client consent is the next required step" tone="caution">
            Recipient, purpose, included categories, photograph choice, delivery, and expiry will be
            shown to the client.
          </StatusStrip>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              icon={<Send size={16} />}
              disabled={
                !recipientName ||
                !purpose ||
                !sections.length ||
                !dateFrom ||
                !dateTo ||
                dateFrom > dateTo
              }
              onClick={requestConsent}
            >
              Request client consent
            </Button>
          </div>
        </div>
      ) : handoff.status === 'awaiting_consent' ? (
        <div className="handoff-state">
          <div className="handoff-state__icon">
            <LockKeyhole size={30} />
          </div>
          <p className="eyebrow">Awaiting client decision</p>
          <h3>Consent request prepared</h3>
          <p>
            {client.preferredName} can review the named recipient, purpose,{' '}
            {handoff.includedSections.length} included categories, delivery method, and{' '}
            {format(new Date(handoff.expiresAt), 'd MMMM')} expiry from their Consent page.
          </p>
          <StatusStrip title="No document has been generated" tone="info">
            A handoff cannot be generated until the synthetic client records approval.
          </StatusStrip>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close and continue
            </Button>
          </div>
        </div>
      ) : (
        <div className="handoff-state">
          <div className="handoff-state__icon handoff-state__icon--success">
            <ShieldCheck size={30} />
          </div>
          <p className="eyebrow">Consent recorded</p>
          <h3>Ready for final review</h3>
          <p>
            {client.preferredName} approved sharing with {handoff.recipientName} at{' '}
            {handoff.recipientOrganization}. The secure-link adapter remains feature-flagged;
            authenticated PDF download is operational.
          </p>
          <div className="handoff-summary">
            <div>
              <span>Purpose</span>
              <strong>{handoff.purpose}</strong>
            </div>
            <div>
              <span>Date range</span>
              <strong>
                {format(new Date(handoff.dateFrom), 'd MMM yyyy')} –{' '}
                {format(new Date(handoff.dateTo), 'd MMM yyyy')}
              </strong>
            </div>
            <div>
              <span>Sections</span>
              <strong>{handoff.includedSections.length} selected</strong>
            </div>
            <div>
              <span>Photographs</span>
              <strong>{handoff.includePhotos ? 'Included' : 'Not included'}</strong>
            </div>
            <div>
              <span>Expiry</span>
              <strong>{format(new Date(handoff.expiresAt), 'd MMM yyyy')}</strong>
            </div>
          </div>
          {generateGuard.allowed ? (
            <Suspense
              fallback={
                <Button size="lg" disabled>
                  Preparing PDF tools…
                </Button>
              }
            >
              <HandoffPdfAction
                client={client}
                handoff={handoff}
                appointments={appointments}
                events={events}
                filename={filename}
                onGenerated={() => updateHandoff(handoff.id, { status: 'generated' })}
              />
            </Suspense>
          ) : (
            <div className="fresh-auth handoff-fresh-auth">
              <p>
                Fresh authentication is required before generating this sensitive document. Enter{' '}
                <strong>DEMO</strong> for the synthetic flow.
              </p>
              <Field label="Synthetic verification phrase">
                <Input
                  value={challenge}
                  onChange={(event) => setChallenge(event.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Button
                disabled={challenge !== 'DEMO'}
                onClick={() => setFreshAt(new Date().toISOString())}
              >
                Verify & continue
              </Button>
            </div>
          )}
          {handoff.status === 'generated' && (
            <StatusStrip tone="success" title="Synthetic handoff generated">
              <FileCheck2 size={14} /> An audit event would be appended in connected mode.
            </StatusStrip>
          )}
          <p className="microcopy">
            <Check size={13} /> Document includes a permanent scope disclaimer and exact prototype
            pattern evidence.
          </p>
        </div>
      )}
    </Modal>
  )
}
