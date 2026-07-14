import { Camera, CameraOff, Check, RefreshCcw, ShieldCheck, Timer, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/design-system/Button'
import { Field, Input, Select } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { StatusStrip } from '@/components/feedback/StatusStrip'
import type { DemoClient } from '@/data/demo/model'
import { useDemoStore } from '@/data/demo/store'
import { evaluateConsentGuard } from '@/domain/rules'
import { demoConsentRecords } from '@/lib/security/demoConsent'

type CameraState = 'idle' | 'starting' | 'live' | 'unsupported' | 'denied'

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
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [cameraMessage, setCameraMessage] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const stopCamera = useCallback(() => {
    releaseStream()
    setCountdown(null)
    setCameraState('idle')
  }, [releaseStream])

  const replacePreview = useCallback((nextPreview: string | null) => {
    setPreview((currentPreview) => {
      if (currentPreview) URL.revokeObjectURL(currentPreview)
      return nextPreview
    })
  }, [])

  useEffect(() => {
    if (!open) stopCamera()
  }, [open, stopCamera])

  useEffect(
    () => () => {
      releaseStream()
    },
    [releaseStream],
  )

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const startCamera = useCallback(async () => {
    replacePreview(null)
    setCameraMessage('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unsupported')
      setCameraMessage(
        'Live camera is unavailable in this browser. Use the camera or file button below.',
      )
      return
    }

    releaseStream()
    setCameraState('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Camera preview could not be prepared.')
      video.srcObject = stream
      await video.play()
      setCameraState('live')
    } catch (error) {
      releaseStream()
      setCameraState('denied')
      setCameraMessage(
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'Camera permission was not granted. You can still open the device camera or choose a photo.'
          : 'A live preview could not start. You can still open the device camera or choose a photo.',
      )
    }
  }, [releaseStream, replacePreview])

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraMessage('The camera is still preparing. Hold steady and try once more.')
      setCountdown(null)
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraMessage(
            'The preview could not be captured. Try the device camera button instead.',
          )
          return
        }
        replacePreview(URL.createObjectURL(blob))
        stopCamera()
      },
      'image/jpeg',
      0.9,
    )
  }, [replacePreview, stopCamera])

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      captureFrame()
      return
    }
    const timer = window.setTimeout(() => setCountdown((value) => (value ?? 1) - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [captureFrame, countdown])

  const guard = evaluateConsentGuard({
    action: 'create_photo',
    actorRole: 'therapist',
    actorClientId: null,
    targetClientId: client.id,
    therapistCanAccessClient: true,
    consents: demoConsentRecords(client),
    freshAuthenticationAt: freshAt,
  })

  const saveCapture = () => {
    if (!preview) return
    addPhoto(client.id, view, phase)
    replacePreview(null)
    stopCamera()
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Visual Progress"
      description="Use a live camera preview or your device camera. Alignment guides help create a more consistent private synthetic record."
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
          <div className={`photo-stage photo-stage--${cameraState}`}>
            {preview ? <img src={preview} alt="Local temporary capture preview" /> : null}
            <video
              ref={videoRef}
              className={cameraState === 'live' || cameraState === 'starting' ? 'is-visible' : ''}
              autoPlay
              muted
              playsInline
              aria-label="Live camera preview"
            />
            {!preview && cameraState !== 'live' && cameraState !== 'starting' ? (
              <div className="photo-stage__empty">
                <Camera size={34} />
                <strong>Ready when you are</strong>
                <span>Start a live preview or use your device camera</span>
              </div>
            ) : null}
            {cameraState === 'starting' ? (
              <div className="photo-stage__preparing" role="status">
                <span /> Preparing camera…
              </div>
            ) : null}
            <svg className="silhouette-overlay" viewBox="0 0 180 320" aria-hidden="true">
              <circle cx="90" cy="35" r="25" />
              <path d="M90 61c-35 0-47 22-44 68l8 73 12 103h48l12-103 8-73c3-46-9-68-44-68Z" />
            </svg>
            {countdown !== null && (
              <div className="photo-countdown" role="status" aria-live="assertive">
                {countdown || <Camera size={35} />}
              </div>
            )}
            <canvas ref={canvasRef} hidden />
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

            {preview ? (
              <div className="photo-actions">
                <Button
                  variant="secondary"
                  icon={<RefreshCcw size={17} />}
                  onClick={() => void startCamera()}
                >
                  Retake live
                </Button>
                <Button icon={<Check size={17} />} onClick={saveCapture}>
                  Save synthetic record
                </Button>
              </div>
            ) : cameraState === 'live' ? (
              <div className="photo-actions">
                <Button variant="secondary" icon={<CameraOff size={17} />} onClick={stopCamera}>
                  Close camera
                </Button>
                <Button
                  icon={<Timer size={17} />}
                  disabled={countdown !== null}
                  onClick={() => setCountdown(3)}
                >
                  {countdown === null ? 'Take photo in 3 seconds' : 'Hold steady…'}
                </Button>
              </div>
            ) : (
              <Button
                icon={<Camera size={17} />}
                disabled={cameraState === 'starting'}
                onClick={() => void startCamera()}
              >
                {cameraState === 'starting' ? 'Preparing live camera…' : 'Open live camera'}
              </Button>
            )}

            <label className="button button--secondary button--md file-button">
              <Upload size={17} />
              <span>Use device camera or choose photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  stopCamera()
                  replacePreview(URL.createObjectURL(file))
                  event.currentTarget.value = ''
                }}
              />
            </label>

            {cameraMessage ? (
              <StatusStrip title="Camera fallback ready" tone="caution">
                {cameraMessage}
              </StatusStrip>
            ) : null}

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
              The live image and preview stay on this device. Demo mode stores only synthetic record
              metadata—not the photo itself.
            </StatusStrip>
          </div>
        </div>
      )}
    </Modal>
  )
}
