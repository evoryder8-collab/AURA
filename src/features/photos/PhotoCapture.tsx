import { Camera, ImagePlus, ShieldCheck, Timer, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/design-system/Button'
import { Field, Input, Select } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { StatusStrip } from '@/components/feedback/StatusStrip'
import type { DemoClient } from '@/data/demo/model'
import { useDemoStore } from '@/data/demo/store'
import { evaluateConsentGuard } from '@/domain/rules'
import { demoConsentRecords } from '@/lib/security/demoConsent'

export function PhotoCapture({
  client,
  open,
  onOpenChange,
}: {
  client: DemoClient
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const addPhoto = useDemoStore((state) => state.addPhoto)
  const [freshAt, setFreshAt] = useState<string | null>(null)
  const [challenge, setChallenge] = useState('')
  const [view, setView] = useState<'front' | 'side' | 'back'>('side')
  const [phase, setPhase] = useState<'before' | 'after'>('after')
  const [preview, setPreview] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      addPhoto(client.id, view, phase)
      setCountdown(null)
      onOpenChange(false)
      return
    }
    const timer = window.setTimeout(() => setCountdown((value) => (value ?? 1) - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [addPhoto, client.id, countdown, onOpenChange, phase, view])

  const guard = evaluateConsentGuard({
    action: 'create_photo',
    actorRole: 'therapist',
    actorClientId: null,
    targetClientId: client.id,
    therapistCanAccessClient: true,
    consents: demoConsentRecords(client),
    freshAuthenticationAt: freshAt,
  })

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Visual Progress"
      description="Alignment assistance for a private synthetic photo record. The web app cannot guarantee identical posture or distance."
      wide
    >
      {guard.reason === 'consent_missing_or_inactive' ? (
        <StatusStrip tone="caution" title="Photography consent is not active">
          Ask the client to review optional photography consent before capturing or viewing a
          record.
        </StatusStrip>
      ) : !guard.allowed ? (
        <div className="fresh-auth">
          <div className="fresh-auth__icon">
            <ShieldCheck size={28} />
          </div>
          <h3>Fresh authentication required</h3>
          <p>
            In connected mode this re-verifies the current account. For this synthetic demo, enter{' '}
            <strong>DEMO</strong>.
          </p>
          <Field label="Synthetic verification phrase">
            <Input
              value={challenge}
              onChange={(event) => setChallenge(event.target.value)}
              autoComplete="off"
            />
          </Field>
          <Button
            fullWidth
            disabled={challenge !== 'DEMO'}
            onClick={() => setFreshAt(new Date().toISOString())}
          >
            Continue securely
          </Button>
        </div>
      ) : (
        <div className="photo-capture">
          <div className="photo-stage">
            {preview ? (
              <img src={preview} alt="Local temporary capture preview" />
            ) : (
              <div className="photo-stage__empty">
                <Camera size={34} />
                <span>Camera or file preview</span>
              </div>
            )}
            <svg className="silhouette-overlay" viewBox="0 0 180 320" aria-hidden="true">
              <circle cx="90" cy="35" r="25" />
              <path d="M90 61c-35 0-47 22-44 68l8 73 12 103h48l12-103 8-73c3-46-9-68-44-68Z" />
            </svg>
            {countdown !== null && (
              <div className="photo-countdown" role="status">
                {countdown || <ImagePlus size={35} />}
              </div>
            )}
          </div>
          <div className="photo-controls form-stack">
            <div className="form-grid">
              <Field label="View">
                <Select
                  value={view}
                  onChange={(event) => setView(event.target.value as typeof view)}
                >
                  <option value="front">Front</option>
                  <option value="side">Side</option>
                  <option value="back">Back</option>
                </Select>
              </Field>
              <Field label="Phase">
                <Select
                  value={phase}
                  onChange={(event) => setPhase(event.target.value as typeof phase)}
                >
                  <option value="before">Before</option>
                  <option value="after">After</option>
                </Select>
              </Field>
            </div>
            <label className="button button--secondary button--md file-button">
              <Upload size={17} />
              <span>Choose camera or file</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) setPreview(URL.createObjectURL(file))
                }}
              />
            </label>
            <div className="ghost-control">
              <span>Previous-photo ghost overlay</span>
              <input
                type="range"
                min="0"
                max="80"
                defaultValue="28"
                aria-label="Previous photo overlay opacity"
              />
            </div>
            <StatusStrip title="Private by design" tone="info">
              The temporary preview is not cached. Connected mode uploads through a private bucket
              after capture.
            </StatusStrip>
            <Button
              icon={<Timer size={17} />}
              disabled={!preview || countdown !== null}
              onClick={() => setCountdown(3)}
            >
              Start three-second capture
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
