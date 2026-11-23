import { Camera, Lock, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { Modal } from '@/components/design-system/Modal'
import type { DemoClient, DemoPhoto } from '@/data/demo/model'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import { ConfirmItsYou } from '@/features/consent/ConfirmItsYou'
import { useConsentGuard } from '@/features/consent/freshAuth'
import { fmtDate, fmtShortDate } from '@/lib/formatting/time'
import { PhotoCapture } from './PhotoCapture'
import './photos.css'

const VIEW_LABEL: Record<DemoPhoto['view'], string> = { front: 'Front', side: 'Side', back: 'Back' }

/** A client's saved progress photos, gated by photography consent and a recent "confirm it's you". */
export function ProgressPhotos({ client }: { client: DemoClient }) {
  const auth = useAuth()
  const allPhotos = useDemoStore((state) => state.photos)
  const removePhoto = useDemoStore((state) => state.removePhoto)
  const evaluate = useConsentGuard(client)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [toDelete, setToDelete] = useState<DemoPhoto | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const isOwn = auth.role === 'client'
  const photos = allPhotos
    .filter((photo) => photo.clientId === client.id)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
  const guard = evaluate('view_photo')
  const consentOff = guard.reason === 'consent_missing_or_inactive'
  const count = `${photos.length} saved ${photos.length === 1 ? 'photo' : 'photos'}`
  const describe = (photo: DemoPhoto) =>
    `${VIEW_LABEL[photo.view]} view, ${fmtDate(photo.capturedAt)}`

  return (
    <Card
      as="section"
      title="Progress photos"
      aria-label="Progress photos"
      action={
        guard.allowed || guard.reason === 'fresh_authentication_required' ? (
          <Button
            size="sm"
            icon={<Camera size={16} aria-hidden="true" />}
            onClick={() => setCameraOpen(true)}
          >
            Take a photo
          </Button>
        ) : null
      }
    >
      {consentOff ? (
        <div className="stack">
          <p className="muted">
            {isOwn
              ? 'Photography is off in your consent choices, so the camera stays closed. Turn on Progress photos under Consent to take one.'
              : `${client.preferredName} has photography turned off, so the camera stays closed.`}
          </p>
          {photos.length ? (
            <p className="small muted">
              {count} {photos.length === 1 ? 'stays' : 'stay'} hidden while it is off.
            </p>
          ) : null}
        </div>
      ) : guard.reason === 'fresh_authentication_required' ? (
        <div className="stack">
          <p className="muted">
            {photos.length
              ? `${count}. Confirm it’s you to see them.`
              : 'No photos yet. Photos taken the same way each time make posture easier to compare between visits.'}
          </p>
          {photos.length ? (
            <div>
              <Button
                variant="secondary"
                icon={<Lock size={16} aria-hidden="true" />}
                onClick={() => setConfirming(true)}
              >
                Show photos
              </Button>
            </div>
          ) : null}
        </div>
      ) : !guard.allowed ? (
        <p className="muted">
          Photos are available only to the client and their assigned therapists.
        </p>
      ) : photos.length === 0 ? (
        <p className="muted">
          No photos yet. Photos taken the same way each time make posture easier to compare between
          visits.
        </p>
      ) : (
        <ul
          className="photo-grid"
          aria-label={isOwn ? 'Your progress photos' : `${client.preferredName}’s progress photos`}
        >
          {photos.map((photo) => (
            <li key={photo.id} className="photo-tile">
              <img src={photo.dataUrl} alt={describe(photo)} loading="lazy" decoding="async" />
              <div className="photo-tile__meta">
                <span>
                  {VIEW_LABEL[photo.view]} · {fmtShortDate(photo.capturedAt)}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete photo: ${describe(photo)}`}
                  onClick={() => setToDelete(photo)}
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted photos-local">
        Stored only in this browser for the synthetic demo.
      </p>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      <PhotoCapture client={client} open={cameraOpen} onOpenChange={setCameraOpen} />

      <Modal open={confirming} onOpenChange={setConfirming} title="Progress photos">
        <ConfirmItsYou
          reason="Progress photos are private health records."
          onConfirmed={() => setConfirming(false)}
        />
      </Modal>

      <Modal
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Delete this photo?"
        description="It is removed from this browser and cannot be brought back."
      >
        {toDelete ? (
          <div className="stack">
            <img className="photo-delete-preview" src={toDelete.dataUrl} alt={describe(toDelete)} />
            <div className="row row--wrap">
              <Button
                variant="danger"
                icon={<Trash2 size={16} aria-hidden="true" />}
                onClick={() => {
                  removePhoto(toDelete.id)
                  setAnnouncement(`Deleted ${describe(toDelete)}.`)
                  setToDelete(null)
                }}
              >
                Delete photo
              </Button>
              <Button variant="secondary" onClick={() => setToDelete(null)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </Card>
  )
}
