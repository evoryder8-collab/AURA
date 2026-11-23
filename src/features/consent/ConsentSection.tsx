import { useId, useState } from 'react'
import { Modal } from '@/components/design-system/Modal'
import type { ConsentState, DemoClient } from '@/data/demo/model'
import { useDemoStore } from '@/data/demo/store'
import { ConfirmItsYou } from './ConfirmItsYou'
import { useConsentGuard } from './freshAuth'
import './consent.css'

type ConsentKey = keyof ConsentState

/** What each choice allows, in the words a client would use. */
const CONSENT_CHOICES: ReadonlyArray<{ key: ConsentKey; title: string; allows: string }> = [
  {
    key: 'healthData',
    title: 'Health details',
    allows:
      'Lets AURA keep the pain scores, notes and measurements you and your therapists record, so you can both see how things change over time.',
  },
  {
    key: 'reminders',
    title: 'Reminders',
    allows:
      'Lets AURA remind you about upcoming visits and ask how you feel the day after one. This demo never sends messages.',
  },
  {
    key: 'photography',
    title: 'Progress photos',
    allows:
      'Lets you and your therapist take posture photos to compare over time. While it is off, the camera stays closed and saved photos are hidden.',
  },
  {
    key: 'handoff',
    title: 'Reports for your doctor',
    allows:
      'Lets your therapist prepare a summary for a doctor or other professional. You still agree to each report before it can be shared.',
  },
  {
    key: 'aiProcessing',
    title: 'AI writing help',
    allows:
      'Lets AURA use AI to help word written summaries. AI never decides what your records show; that stays with your therapist’s professional judgment.',
  },
]

export function ConsentSection({ client }: { client: DemoClient }) {
  const updateConsent = useDemoStore((state) => state.updateConsent)
  const evaluate = useConsentGuard(client)
  const [pending, setPending] = useState<{ key: ConsentKey; value: boolean } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const baseId = useId()

  const apply = (key: ConsentKey, value: boolean) => {
    updateConsent(client.id, key, value)
    const title = CONSENT_CHOICES.find((choice) => choice.key === key)?.title ?? 'Choice'
    setAnnouncement(`${title} turned ${value ? 'on' : 'off'}.`)
  }

  const request = (key: ConsentKey, value: boolean) => {
    const guard = evaluate('change_consent')
    if (guard.allowed) apply(key, value)
    else if (guard.reason === 'fresh_authentication_required') setPending({ key, value })
    else setAnnouncement('Only you can change your consent choices.')
  }

  return (
    <>
      <ul className="consent-list">
        {CONSENT_CHOICES.map(({ key, title, allows }) => {
          const on = client.consents[key]
          const titleId = `${baseId}-${key}-title`
          const allowsId = `${baseId}-${key}-allows`
          return (
            <li key={key} className="consent-row">
              <div className="consent-row__copy">
                <strong id={titleId}>{title}</strong>
                <p id={allowsId} className="small muted">
                  {allows}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby={titleId}
                aria-describedby={allowsId}
                className="consent-switch"
                onClick={() => request(key, !on)}
              >
                <span className="consent-switch__track" aria-hidden="true">
                  <span className="consent-switch__thumb" />
                </span>
                <span className="consent-switch__state" aria-hidden="true">
                  {on ? 'On' : 'Off'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      <Modal
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title="Change a consent choice"
      >
        <ConfirmItsYou
          reason="Consent choices decide who can see and do what with your records."
          onConfirmed={() => {
            if (pending) apply(pending.key, pending.value)
            setPending(null)
          }}
        />
      </Modal>
    </>
  )
}
