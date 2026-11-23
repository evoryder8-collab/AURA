import { Camera, Check, ImageUp, Lock, RefreshCcw, ShieldAlert, Timer, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/design-system/Button'
import { Modal } from '@/components/design-system/Modal'
import { Spinner } from '@/components/design-system/Spinner'
import { Segmented } from '@/components/ui/Segmented'
import type { DemoClient, DemoPhoto } from '@/data/demo/model'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import { ConfirmItsYou } from '@/features/consent/ConfirmItsYou'
import { useConsentGuard } from '@/features/consent/freshAuth'
import { fileToJpeg, frameToJpeg, VIEWFINDER_ASPECT } from './image'
import './photos.css'

type View = DemoPhoto['view']
type Step = 'explain' | 'requesting' | 'live' | 'preview' | 'saved' | 'fallback'
type FallbackReason = 'denied' | 'unsupported' | 'failed'

const VIEWS: ReadonlyArray<{ value: View; label: string }> = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
]
const TIMER_SECONDS = 3
const STORED_LOCALLY = 'Stored only in this browser for the synthetic demo.'

/**
 * Progress-photo camera flow: explain → permission → live viewfinder (optional timer) →
 * preview → retake or save. Denied or missing cameras fall back to a file picker.
 * Opened by a client for their own photos, or by a therapist for an assigned client.
 */
export function PhotoCapture({
  client,
  open,
  onOpenChange,
}: {
  client: DemoClient
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const auth = useAuth()
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={
        auth.role === 'therapist' ? `Progress photo for ${client.preferredName}` : 'Progress photo'
      }
      wide
    >
      {/* Mounted only while open, so closing always unmounts the flow and stops the camera. */}
      <CaptureFlow client={client} onClose={() => onOpenChange(false)} />
    </Modal>
  )
}

function CaptureFlow({ client, onClose }: { client: DemoClient; onClose: () => void }) {
  const auth = useAuth()
  const addPhoto = useDemoStore((state) => state.addPhoto)
  const evaluate = useConsentGuard(client)
  const guard = evaluate('create_photo')
  const isOwn = auth.role === 'client'

  const [step, setStep] = useState<Step>('explain')
  const [fallback, setFallback] = useState<FallbackReason>('unsupported')
  const [source, setSource] = useState<'camera' | 'file'>('camera')
  const [view, setView] = useState<View>('front')
  const [timerOn, setTimerOn] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  /** Bumped on every start, stop and unmount so a late permission answer is discarded. */
  const requestRef = useRef(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const stopCamera = useCallback(() => {
    requestRef.current += 1
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCountdown(null)
  }, [])

  // Closing the dialog unmounts this flow: release the camera, ignore pending answers.
  useEffect(
    () => () => {
      requestRef.current += 1
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    },
    [],
  )

  // If access lapses mid-flow (consent or confirmation window), the camera closes with it.
  useEffect(() => {
    if (!guard.allowed) stopCamera()
  }, [guard.allowed, stopCamera])

  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (step !== 'live' || !video || !stream) return
    video.srcObject = stream
    // Muted inline video may autoplay; if play() is refused the shutter waits for frames.
    video.play().catch(() => undefined)
  }, [step])

  // Move focus to each new step's heading so keyboard and screen-reader users follow along.
  const screen = guard.allowed ? step : guard.reason
  const firstScreen = useRef(true)
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false
      return
    }
    headingRef.current?.focus()
  }, [screen])

  const startCamera = async () => {
    setMessage(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setFallback('unsupported')
      setStep('fallback')
      return
    }
    stopCamera()
    const request = requestRef.current
    setStep('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      if (request !== requestRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      setSource('camera')
      setStep('live')
    } catch (error) {
      if (request !== requestRef.current) return
      const name = (error as { name?: unknown } | null)?.name
      setFallback(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed')
      setStep('fallback')
    }
  }

  const cancelCamera = () => {
    stopCamera()
    setStep('explain')
  }

  const capture = useCallback(() => {
    const video = videoRef.current
    const dataUrl = video
      ? frameToJpeg(video, video.videoWidth, video.videoHeight, VIEWFINDER_ASPECT)
      : null
    if (!dataUrl) {
      setCountdown(null)
      setMessage('The camera is still starting. Hold steady and try again.')
      return
    }
    stopCamera()
    setMessage(null)
    setPreview(dataUrl)
    setStep('preview')
  }, [stopCamera])

  useEffect(() => {
    if (countdown === null) return
    const timer = window.setTimeout(() => {
      if (countdown <= 1) capture()
      else setCountdown(countdown - 1)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [countdown, capture])

  const chooseFile = async (file: File) => {
    setMessage(null)
    if (!file.type.startsWith('image/')) {
      setMessage('Choose an image file, such as a JPEG or PNG photo.')
      return
    }
    stopCamera()
    try {
      const dataUrl = await fileToJpeg(file)
      setPreview(dataUrl)
      setSource('file')
      setStep('preview')
    } catch {
      setMessage('That photo could not be opened. Try a different one.')
    }
  }

  const retake = () => {
    setPreview(null)
    if (source === 'camera') void startCamera()
    else setStep('fallback')
  }

  const save = () => {
    if (!preview) return
    // Re-check at the moment of saving, not only when the step was drawn.
    if (!evaluate('create_photo').allowed) {
      setMessage('This photo could not be saved because access has changed.')
      return
    }
    addPhoto({ clientId: client.id, view, dataUrl: preview })
    setStep('saved')
  }

  const viewLabel = VIEWS.find((item) => item.value === view)?.label ?? 'Front'
  const heading = (text: string) => (
    <h3 ref={headingRef} tabIndex={-1} className="title-md capture__heading">
      {text}
    </h3>
  )
  const alert = message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null

  if (guard.reason === 'consent_missing_or_inactive') {
    return (
      <Blocked icon={<Lock size={22} />} heading={heading('Progress photos are off')}>
        {isOwn
          ? 'Your consent choices have photography turned off, so the camera stays closed. Turn on Progress photos under Consent on your Me page to take one.'
          : `${client.preferredName} has photography turned off, so the camera stays closed. Only ${client.preferredName} can turn it back on.`}
      </Blocked>
    )
  }
  if (guard.reason === 'fresh_authentication_required') {
    return <ConfirmItsYou reason="Progress photos are private health records." />
  }
  if (!guard.allowed) {
    return (
      <Blocked icon={<ShieldAlert size={22} />} heading={heading('Photos are not available here')}>
        {auth.role === 'therapist'
          ? `You can take photos only for clients assigned to you.`
          : 'You can take photos only for your own record.'}
      </Blocked>
    )
  }

  if (step === 'saved') {
    return (
      <div className="capture capture--done" role="status">
        <span className="capture__done-mark" aria-hidden="true">
          <Check size={26} />
        </span>
        {heading('Photo saved')}
        {preview ? (
          <img className="capture__thumb" src={preview} alt={`${viewLabel} view you just saved`} />
        ) : null}
        <p className="muted">
          {viewLabel} view, added to {isOwn ? 'your' : `${client.preferredName}’s`} progress photos.{' '}
          {STORED_LOCALLY}
        </p>
        <div className="capture__actions">
          <Button
            variant="secondary"
            icon={<Camera size={17} aria-hidden="true" />}
            onClick={() => {
              setPreview(null)
              setStep('explain')
            }}
          >
            Take another
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="capture">
      <div className={`capture__stage capture__stage--${step}`}>
        {step === 'live' ? (
          <video
            ref={videoRef}
            className="capture__video"
            autoPlay
            muted
            playsInline
            aria-label="Live camera view"
          />
        ) : null}
        {step === 'preview' && preview ? (
          <img
            className="capture__image"
            src={preview}
            alt={`Your ${viewLabel.toLowerCase()} view photo, not saved yet`}
          />
        ) : null}
        {step !== 'preview' ? <AlignmentGuide view={view} /> : null}
        {countdown !== null ? (
          <div className="capture__countdown" aria-hidden="true">
            {countdown}
          </div>
        ) : null}
      </div>

      <div className="capture__panel">
        {step === 'explain' ? (
          <>
            {heading('Before you start')}
            <p className="muted">
              Photos taken the same way each time make posture easier to compare between visits.
            </p>
            <ul className="capture__tips small">
              <li>Stand about two metres from the camera, in even light.</li>
              <li>Line up with the guide: head on the centre line, feet on the floor marks.</li>
              <li>On your own? Prop the phone up and use the timer.</li>
            </ul>
            <ViewAndTimer view={view} onView={setView} timerOn={timerOn} onTimer={setTimerOn} />
            <p className="capture__note small">
              <Lock size={14} aria-hidden="true" /> {STORED_LOCALLY} Your browser will ask before
              the camera turns on.
            </p>
            {alert}
            <div className="capture__actions">
              <Button
                size="lg"
                icon={<Camera size={18} aria-hidden="true" />}
                onClick={() => void startCamera()}
              >
                Turn on camera
              </Button>
              <FilePick label="Choose a photo instead" onFile={chooseFile} />
            </div>
          </>
        ) : null}

        {step === 'requesting' ? (
          <>
            {heading('Waiting for the camera')}
            <Spinner label="Choose Allow when your browser asks to use the camera." />
            <div className="capture__actions">
              <Button variant="ghost" onClick={cancelCamera}>
                Cancel
              </Button>
            </div>
          </>
        ) : null}

        {step === 'live' ? (
          <>
            {heading('Line up with the guide')}
            <p className="visually-hidden" role="status" aria-live="polite">
              {countdown !== null ? `Taking the photo in ${countdown}` : ''}
            </p>
            {alert}
            <div className="capture__actions">
              {countdown === null ? (
                <Button
                  size="lg"
                  icon={
                    timerOn ? (
                      <Timer size={18} aria-hidden="true" />
                    ) : (
                      <Camera size={18} aria-hidden="true" />
                    )
                  }
                  onClick={() => (timerOn ? setCountdown(TIMER_SECONDS) : capture())}
                >
                  {timerOn ? `Take photo in ${TIMER_SECONDS} seconds` : 'Take photo'}
                </Button>
              ) : (
                <Button size="lg" variant="secondary" onClick={() => setCountdown(null)}>
                  Cancel timer
                </Button>
              )}
              <Button
                variant="ghost"
                icon={<X size={17} aria-hidden="true" />}
                onClick={cancelCamera}
              >
                Close camera
              </Button>
            </div>
            <ViewAndTimer
              view={view}
              onView={setView}
              timerOn={timerOn}
              onTimer={setTimerOn}
              disabled={countdown !== null}
            />
          </>
        ) : null}

        {step === 'preview' ? (
          <>
            {heading('Keep this photo?')}
            <p className="muted">
              {viewLabel} view. {STORED_LOCALLY}
            </p>
            {alert}
            <div className="capture__actions">
              <Button size="lg" icon={<Check size={18} aria-hidden="true" />} onClick={save}>
                Save photo
              </Button>
              <Button
                variant="secondary"
                icon={<RefreshCcw size={17} aria-hidden="true" />}
                onClick={retake}
              >
                {source === 'camera' ? 'Retake' : 'Choose another'}
              </Button>
            </div>
          </>
        ) : null}

        {step === 'fallback' ? (
          <>
            {heading(
              fallback === 'denied'
                ? 'Camera access is off'
                : fallback === 'unsupported'
                  ? 'No live camera here'
                  : 'The camera did not start',
            )}
            <p className="muted">
              {fallback === 'denied'
                ? 'AURA was not allowed to use the camera. You can allow it in your browser’s site settings and try again, or take or choose a photo below.'
                : fallback === 'unsupported'
                  ? 'This browser cannot show a live camera view here. You can still take or choose a photo below.'
                  : 'The camera may be busy in another app. Try again, or take or choose a photo below.'}
            </p>
            <ViewAndTimer view={view} onView={setView} />
            <p className="capture__note small">
              <Lock size={14} aria-hidden="true" /> {STORED_LOCALLY}
            </p>
            {alert}
            <div className="capture__actions">
              <FilePick label="Take or choose a photo" primary onFile={chooseFile} />
              {fallback !== 'unsupported' ? (
                <Button
                  variant="secondary"
                  icon={<RefreshCcw size={17} aria-hidden="true" />}
                  onClick={() => void startCamera()}
                >
                  Try the camera again
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function Blocked({
  icon,
  heading,
  children,
}: {
  icon: ReactNode
  heading: ReactNode
  children: ReactNode
}) {
  return (
    <div className="capture capture--blocked">
      <span className="capture__blocked-mark" aria-hidden="true">
        {icon}
      </span>
      {heading}
      <p className="muted">{children}</p>
    </div>
  )
}

function ViewAndTimer({
  view,
  onView,
  timerOn,
  onTimer,
  disabled = false,
}: {
  view: View
  onView: (view: View) => void
  timerOn?: boolean
  onTimer?: (on: boolean) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="capture__options" disabled={disabled}>
      <legend className="visually-hidden">Photo options</legend>
      <div className="capture__option">
        <span className="field__label" aria-hidden="true">
          View
        </span>
        <Segmented label="Which view" value={view} options={VIEWS} onChange={onView} />
      </div>
      {onTimer ? (
        <div className="capture__option">
          <span className="field__label" aria-hidden="true">
            Timer
          </span>
          <Segmented
            label="Timer"
            value={timerOn ? 'on' : 'off'}
            options={[
              { value: 'off', label: 'Off' },
              {
                value: 'on',
                label: `${TIMER_SECONDS} s`,
                ariaLabel: `${TIMER_SECONDS}-second timer`,
              },
            ]}
            onChange={(value) => onTimer(value === 'on')}
          />
        </div>
      ) : null}
    </fieldset>
  )
}

function FilePick({
  label,
  primary = false,
  onFile,
}: {
  label: string
  primary?: boolean
  onFile: (file: File) => void
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className={`button button--md capture__file ${primary ? 'button--primary' : 'button--secondary'}`}
    >
      <ImageUp size={17} aria-hidden="true" />
      <span>{label}</span>
      <input
        id={id}
        className="visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
    </label>
  )
}

/** Plumb line, head, shoulder, hip and floor marks for repeatable framing. */
function AlignmentGuide({ view }: { view: View }) {
  const wide = view !== 'side'
  return (
    <svg
      className="capture__guide"
      viewBox="0 0 300 400"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <line className="capture__plumb" x1="150" y1="14" x2="150" y2="390" />
      <ellipse cx="150" cy="62" rx={wide ? 26 : 23} ry="31" />
      <line x1={wide ? 92 : 128} y1="124" x2={wide ? 208 : 172} y2="124" />
      <line x1={wide ? 104 : 130} y1="234" x2={wide ? 196 : 170} y2="234" />
      <line x1="62" y1="384" x2="238" y2="384" />
      {wide ? (
        <>
          <rect x="116" y="372" width="24" height="9" rx="4.5" />
          <rect x="160" y="372" width="24" height="9" rx="4.5" />
        </>
      ) : (
        <rect x="138" y="372" width="38" height="9" rx="4.5" />
      )}
    </svg>
  )
}
