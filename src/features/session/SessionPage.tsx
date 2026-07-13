import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  FileText,
  Gauge,
  LockKeyhole,
  Mic,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  Sun,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { Field, Input, Select, Textarea } from '@/components/design-system/FormField'
import { StatusStrip } from '@/components/feedback/StatusStrip'
import { env } from '@/config/env'
import { useDemoStore } from '@/data/demo/store'
import { selectNextQuote, suggestBonusCareMinutes } from '@/domain/rules'
import { QuickAppointmentModal } from '@/features/appointments/QuickAppointmentModal'
import { useAuth } from '@/features/auth/auth-context'
import { BodyMap } from '@/features/body-map/BodyMap'
import { PhotoCapture } from '@/features/photos/PhotoCapture'
import { formatTime } from '@/lib/formatting/labels'
import {
  clearPendingSessionState,
  loadPendingSessionState,
  queueOfflineMutation,
  savePendingSessionState,
} from '@/lib/offline/queueClient'
import { useWakeLock } from './useWakeLock'

const quotes = [
  { id: 'stillness', text: 'Let stillness make room for what comes next.' },
  { id: 'ease', text: 'Ease can be noticed before it can be measured.' },
  { id: 'attention', text: 'Care is attention, offered without hurry.' },
  { id: 'rhythm', text: 'Progress has a rhythm of its own.' },
]

export function SessionPage() {
  const { appointmentId } = useParams()
  const auth = useAuth()
  const appointment = useDemoStore((state) =>
    state.appointments.find((item) => item.id === appointmentId),
  )
  const client = useDemoStore((state) =>
    state.clients.find((item) => item.id === appointment?.clientId),
  )
  const startSession = useDemoStore((state) => state.startSession)
  const finishSession = useDemoStore((state) => state.finishSession)
  const completeWrapUp = useDemoStore((state) => state.completeWrapUp)
  const updateAppointment = useDemoStore((state) => state.updateAppointment)
  const navigate = useNavigate()
  const [stage, setStage] = useState<'workspace' | 'session' | 'complete' | 'wrapup'>(() =>
    appointment?.session?.startedAt && !appointment.session.finishedAt
      ? 'session'
      : appointment?.status === 'completed'
        ? 'wrapup'
        : 'workspace',
  )
  const [photoOpen, setPhotoOpen] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [preparationNote, setPreparationNote] = useState(
    appointment?.session?.preparationNote ?? '',
  )
  const [assessmentStiffness, setAssessmentStiffness] = useState(
    appointment?.session?.assessment?.stiffness ?? client?.metrics.at(-1)?.stiffness ?? 0,
  )
  const [assessmentRom, setAssessmentRom] = useState(
    appointment?.session?.assessment?.rom ?? client?.metrics.at(-1)?.rom ?? 0,
  )
  const [assessmentMethod, setAssessmentMethod] = useState(
    appointment?.session?.assessment?.method ?? 'synthetic-scale-v1',
  )
  const [assessmentRegion, setAssessmentRegion] = useState(
    appointment?.session?.assessment?.region ?? client?.goals[0]?.region ?? 'lower_back',
  )

  if (!appointment || !client || (env.demoMode && appointment.therapistId !== auth.demoTherapistId))
    return (
      <Card>
        <h1>Session not available</h1>
        <p>This appointment belongs to another therapist’s schedule.</p>
        <Button onClick={() => navigate('/therapist/today')}>Return to Today</Button>
      </Card>
    )

  const offlineOwnerKey = auth.user?.id ?? auth.demoTherapistId ?? 'demo-therapist'

  const begin = () => {
    const startedAt = new Date().toISOString()
    updateAppointment(appointment.id, {
      session: {
        ...appointment.session,
        preparationNote: preparationNote.trim(),
        assessment: {
          stiffness: assessmentStiffness,
          rom: assessmentRom,
          method: assessmentMethod,
          region: assessmentRegion,
        },
      },
    })
    startSession(appointment.id, startedAt)
    void savePendingSessionState(offlineOwnerKey, {
      sessionId: appointment.id,
      appointmentId: appointment.id,
      startedAt,
      updatedAt: startedAt,
      elapsedSeconds: 0,
      paused: false,
      selectedRegionIds: [client.goals[0]?.region ?? 'lower_back'],
    })
    if (!navigator.onLine)
      void queueOfflineMutation(offlineOwnerKey, 'session.started', {
        appointmentId: appointment.id,
        startedAt,
      })
    setStage('session')
  }
  const finish = () => {
    const finishedAt = new Date().toISOString()
    finishSession(appointment.id, finishedAt)
    void clearPendingSessionState(offlineOwnerKey, appointment.id)
    if (!navigator.onLine)
      void queueOfflineMutation(offlineOwnerKey, 'session.finished', {
        appointmentId: appointment.id,
        finishedAt,
      })
    setStage('complete')
  }

  if (stage === 'session')
    return (
      <SessionMode
        appointmentId={appointment.id}
        offlineOwnerKey={offlineOwnerKey}
        onFinish={finish}
      />
    )
  if (stage === 'complete')
    return <FinishedScreen clientId={client.id} onContinue={() => setStage('wrapup')} />
  if (stage === 'wrapup')
    return (
      <WrapUp
        appointmentId={appointment.id}
        onSave={(values) => {
          completeWrapUp(appointment.id, values)
          navigate('/therapist/today')
        }}
        onBook={() => setBookingOpen(true)}
        bookingOpen={bookingOpen}
        setBookingOpen={setBookingOpen}
      />
    )

  const goal = client.goals[0]
  return (
    <div className="session-workspace">
      <button className="back-link" onClick={() => navigate('/therapist/today')}>
        <ArrowLeft size={17} /> Back to Today
      </button>
      <header className="session-header">
        <div>
          <p className="eyebrow">Session workspace · {formatTime(appointment.startsAt)}</p>
          <h1>{client.preferredName}</h1>
          <p>
            {appointment.sessionType} · {appointment.durationMinutes} minutes
          </p>
        </div>
        <div>
          <Badge tone={client.intakeStatus === 'complete' ? 'favourable' : 'pending'}>
            {client.intakeStatus === 'complete' ? 'Intake reviewed' : 'Pending Intake'}
          </Badge>
          <Badge tone={client.reviewProgress ? 'concern' : 'neutral'}>{client.phase}</Badge>
        </div>
      </header>
      {client.caution && (
        <StatusStrip
          tone={client.reviewProgress ? 'concern' : 'caution'}
          title={client.caution.label}
        >
          {client.caution.fact} Source: {client.caution.source}. Therapist judgment required.
        </StatusStrip>
      )}
      <div className="workspace-grid">
        <Card
          tone="dark"
          className="focus-card"
          eyebrow="Focus Map"
          title="A composed starting point"
        >
          <BodyMap
            value={[goal?.region ?? 'lower_back']}
            priorityRegions={[goal?.region ?? 'lower_back']}
            cautionRegions={client.caution ? [client.caution.region] : []}
            readonly
          />
          <div className="focus-priorities">
            <div>
              <span>Primary</span>
              <strong>{goal?.region.replaceAll('_', ' ') ?? 'To confirm'}</strong>
            </div>
            <div>
              <span>Secondary</span>
              <strong>
                {client.metrics.at(-1)?.pain && client.metrics.at(-1)!.pain > 5
                  ? 'Adjacent support'
                  : 'General integration'}
              </strong>
            </div>
          </div>
        </Card>
        <div className="workspace-stack">
          <Card eyebrow="Functional goal" title={goal?.wording ?? 'Set during conversation'}>
            <div className="goal-scale">
              <span>Baseline {goal?.baseline ?? '—'}</span>
              <i>
                <b style={{ width: `${(goal?.current ?? 0) * 10}%` }} />
              </i>
              <span>Now {goal?.current ?? '—'}</span>
            </div>
          </Card>
          <Card eyebrow="Session notes" title="Private preparation">
            <Field label="Therapist-private note">
              <Textarea
                value={preparationNote}
                onChange={(event) => setPreparationNote(event.target.value)}
                placeholder="Record relevant preparation without exposing it to the client view…"
              />
            </Field>
          </Card>
          <Card eyebrow="Quick assessment" title="Before treatment">
            <div className="form-grid">
              <Field label="Stiffness">
                <Input
                  type="number"
                  min="0"
                  max="10"
                  value={assessmentStiffness}
                  onChange={(event) => setAssessmentStiffness(Number(event.target.value))}
                />
              </Field>
              <Field label="ROM">
                <Input
                  type="number"
                  min="0"
                  max="10"
                  value={assessmentRom}
                  onChange={(event) => setAssessmentRom(Number(event.target.value))}
                />
              </Field>
              <Field label="Measurement method">
                <Select
                  value={assessmentMethod}
                  onChange={(event) => setAssessmentMethod(event.target.value)}
                >
                  <option value="synthetic-scale-v1">Synthetic scale v1</option>
                  <option value="visual-observation">Visual observation</option>
                </Select>
              </Field>
              <Field label="Body region">
                <Select
                  value={assessmentRegion}
                  onChange={(event) => setAssessmentRegion(event.target.value)}
                >
                  <option value={goal?.region}>{goal?.region.replaceAll('_', ' ')}</option>
                  <option value="upper_back">Upper back</option>
                  <option value="lower_back">Lower back</option>
                </Select>
              </Field>
            </div>
          </Card>
          <Card className="workspace-actions-card">
            <Button
              variant="secondary"
              icon={<Camera size={17} />}
              onClick={() => setPhotoOpen(true)}
            >
              Progress photo
            </Button>
            <Button size="lg" icon={<Play size={18} />} onClick={begin}>
              Start Massage
            </Button>
          </Card>
        </div>
      </div>
      <PhotoCapture client={client} open={photoOpen} onOpenChange={setPhotoOpen} />
    </div>
  )
}

function SessionMode({
  appointmentId,
  offlineOwnerKey,
  onFinish,
}: {
  appointmentId: string
  offlineOwnerKey: string
  onFinish: () => void
}) {
  const appointment = useDemoStore((state) =>
    state.appointments.find((item) => item.id === appointmentId),
  )!
  const client = useDemoStore((state) =>
    state.clients.find((item) => item.id === appointment.clientId),
  )!
  const startedAt = appointment.session?.startedAt ?? new Date().toISOString()
  const [now, setNow] = useState(Date.now())
  const [dim, setDim] = useState(18)
  const [pausedVisual, setPausedVisual] = useState(false)
  const wake = useWakeLock(true)
  const online = navigator.onLine
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const elapsedMinutes = elapsedSeconds / 60
  const progress = Math.min(1, elapsedMinutes / appointment.durationMinutes)
  const reached = elapsedMinutes >= appointment.durationMinutes
  const easing = progress >= 0.66
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  const circumference = 2 * Math.PI * 112

  useEffect(() => {
    if (pausedVisual) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [pausedVisual])

  useEffect(() => {
    let active = true
    void loadPendingSessionState(offlineOwnerKey, appointment.id).then((state) => {
      if (active && state != null) setPausedVisual(state.paused)
    })
    return () => {
      active = false
    }
  }, [appointment.id, offlineOwnerKey])

  useEffect(() => {
    const persist = () => {
      const updatedAt = new Date().toISOString()
      const persistedElapsedSeconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
      )
      void savePendingSessionState(offlineOwnerKey, {
        sessionId: appointment.id,
        appointmentId: appointment.id,
        startedAt,
        updatedAt,
        elapsedSeconds: persistedElapsedSeconds,
        paused: pausedVisual,
        selectedRegionIds: [client.goals[0]?.region ?? 'lower_back'],
      })
    }
    persist()
    const timer = window.setInterval(persist, 5_000)
    window.addEventListener('pagehide', persist)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pagehide', persist)
    }
  }, [appointment.id, client.goals, offlineOwnerKey, pausedVisual, startedAt])

  return (
    <main
      id="main-content"
      className={`session-mode${reached ? ' has-reached-time' : ''}`}
      style={{ '--session-dim': `${dim / 100}` } as React.CSSProperties}
    >
      <div className="session-mode__dimmer" />
      <header className="session-mode__header">
        <div className="session-mode__wordmark">
          <Sparkles size={15} /> AURA
        </div>
        <div className="session-status">
          <span>
            {online ? <Wifi size={14} /> : <WifiOff size={14} />}
            {online ? 'Synced' : 'Saved locally'}
          </span>
          <span>
            <LockKeyhole size={14} /> Wake lock: {wake.status}
          </span>
        </div>
      </header>
      <div className="session-mode__content">
        <section className="session-mode__client">
          <p className="eyebrow">In session · {appointment.sessionType}</p>
          <h1>{client.preferredName}</h1>
          <p>{appointment.durationMinutes} minute booking · privacy-conscious display</p>
          <div className="session-focus">
            <div className={easing ? 'is-easing' : ''}>
              <span>Primary focus</span>
              <strong>{client.goals[0]?.region.replaceAll('_', ' ') ?? 'General focus'}</strong>
            </div>
            <div className={easing ? 'is-warming' : ''}>
              <span>Secondary focus</span>
              <strong>Integration & ease</strong>
            </div>
          </div>
          <div className="session-goal">
            <TargetIcon />
            <div>
              <span>Functional goal</span>
              <strong>{client.goals[0]?.wording ?? 'No goal recorded'}</strong>
            </div>
          </div>
        </section>
        <section className="session-body">
          <BodyMap
            horizontalOnly
            value={[client.goals[0]?.region ?? 'lower_back']}
            priorityRegions={[client.goals[0]?.region ?? 'lower_back']}
            cautionRegions={client.caution ? [client.caution.region] : []}
            readonly
          />
          {client.caution && (
            <div className="session-caution">
              <AlertTriangle size={14} /> Hatched blue region requires therapist review
            </div>
          )}
        </section>
        <section className="session-timer">
          <div className="timer-ring">
            <svg viewBox="0 0 250 250" aria-hidden="true">
              <circle cx="125" cy="125" r="112" />
              <circle
                className="timer-ring__value"
                cx="125"
                cy="125"
                r="112"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
              />
            </svg>
            <div>
              <span>
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </span>
              <small>
                {reached
                  ? 'Booked time reached · care continues'
                  : `${Math.max(0, Math.ceil(appointment.durationMinutes - elapsedMinutes))} min remaining`}
              </small>
            </div>
          </div>
          <div className="session-tools">
            <button
              onClick={() => setPausedVisual((value) => !value)}
              aria-label={pausedVisual ? 'Resume timer display' : 'Pause timer display'}
            >
              {pausedVisual ? <Play size={18} /> : <Pause size={18} />}
            </button>
            <label>
              <Moon size={15} />
              <input
                type="range"
                min="0"
                max="58"
                value={dim}
                onChange={(event) => setDim(Number(event.target.value))}
                aria-label="In-app dimming overlay"
              />
              <Sun size={15} />
            </label>
            <button onClick={() => void wake.request()} aria-label="Request screen wake lock">
              <RotateCcw size={17} />
            </button>
          </div>
          <Button
            variant={reached ? 'gold' : 'secondary'}
            size="lg"
            icon={<Square size={16} />}
            onClick={onFinish}
          >
            Finished
          </Button>
        </section>
      </div>
      {easing && (
        <div className="session-suggestion">
          A gentle pacing cue: ease primary focus and warm the secondary area.
        </div>
      )}
    </main>
  )
}

function TargetIcon() {
  return <Gauge size={18} />
}

function FinishedScreen({ clientId, onContinue }: { clientId: string; onContinue: () => void }) {
  const completed = useDemoStore(
    (state) =>
      state.appointments.filter((item) => item.clientId === clientId && item.status === 'completed')
        .length,
  )
  const quote = useMemo(() => selectNextQuote(quotes, clientId, completed), [clientId, completed])
  useEffect(() => {
    const timer = window.setTimeout(onContinue, 5500)
    return () => window.clearTimeout(timer)
  }, [onContinue])
  return (
    <main id="main-content" className="finished-screen">
      <div className="finished-screen__halo">
        <Sparkles size={22} />
      </div>
      <p className="eyebrow">AURA</p>
      <h1>
        Massage
        <br />
        Complete
      </h1>
      <blockquote>“{quote?.text}”</blockquote>
      <div className="finished-screen__portrait">
        <span>DT</span>
      </div>
      <p>Demo Therapist · synthetic test practice</p>
      <Button variant="secondary" onClick={onContinue}>
        Continue to wrap-up
      </Button>
    </main>
  )
}

function WrapUp({
  appointmentId,
  onSave,
  onBook,
  bookingOpen,
  setBookingOpen,
}: {
  appointmentId: string
  onSave: (values: {
    actualMinutes: number
    bonusMinutes: number
    pressure: string
    response: string
    note: string
    areas: string[]
    approaches: string[]
    aftercare: string
    voiceCapture?: { durationSeconds: number; sizeBytes: number; recordedAt: string }
  }) => void
  onBook: () => void
  bookingOpen: boolean
  setBookingOpen: (open: boolean) => void
}) {
  const appointment = useDemoStore((state) =>
    state.appointments.find((item) => item.id === appointmentId),
  )!
  const client = useDemoStore((state) =>
    state.clients.find((item) => item.id === appointment.clientId),
  )!
  const derivedActual = appointment.session?.actualMinutes ?? appointment.durationMinutes
  const [actual, setActual] = useState(derivedActual)
  const suggestion = suggestBonusCareMinutes(actual, appointment.durationMinutes)
  const [bonus, setBonus] = useState(suggestion.suggestedConfirmationMinutes)
  const [pressure, setPressure] = useState('Medium')
  const [response, setResponse] = useState('Better')
  const [note, setNote] = useState('')
  const [areas, setAreas] = useState<string[]>(
    appointment.session?.areas ?? [client.goals[0]?.region ?? 'general', 'General integration'],
  )
  const [approaches, setApproaches] = useState<string[]>(
    appointment.session?.approaches ?? ['Myofascial', 'Slow compression'],
  )
  const [aftercare, setAftercare] = useState(appointment.session?.aftercare ?? '')
  const [recording, setRecording] = useState(false)
  const [voiceCapture, setVoiceCapture] = useState(appointment.session?.voiceCapture)
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null)
  const [draftSaved, setDraftSaved] = useState(false)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const voiceChunks = useRef<Blob[]>([])
  const recordingStartedAt = useRef(0)
  const updateAppointment = useDemoStore((state) => state.updateAppointment)

  useEffect(
    () =>
      setBonus(
        suggestBonusCareMinutes(actual, appointment.durationMinutes).suggestedConfirmationMinutes,
      ),
    [actual, appointment.durationMinutes],
  )
  useEffect(
    () => () => {
      if (mediaRecorder.current?.state === 'recording') mediaRecorder.current.stop()
    },
    [],
  )
  const toggleRecording = async () => {
    if (recording) {
      mediaRecorder.current?.stop()
      setRecording(false)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceStatus('Voice capture is unavailable here. Use the manual private note instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder.current = new MediaRecorder(stream)
      voiceChunks.current = []
      recordingStartedAt.current = Date.now()
      mediaRecorder.current.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) voiceChunks.current.push(event.data)
      })
      mediaRecorder.current.start()
      setRecording(true)
      setVoiceStatus('Recording stays in this tab until the synthetic wrap-up is completed.')
      mediaRecorder.current.addEventListener(
        'stop',
        () => {
          stream.getTracks().forEach((track) => track.stop())
          const audio = new Blob(voiceChunks.current, {
            type: mediaRecorder.current?.mimeType || 'audio/webm',
          })
          const durationSeconds = Math.max(
            1,
            Math.round((Date.now() - recordingStartedAt.current) / 1000),
          )
          setVoiceCapture({
            durationSeconds,
            sizeBytes: audio.size,
            recordedAt: new Date().toISOString(),
          })
          setVoiceStatus(
            `Private demo capture ready · ${durationSeconds} second${durationSeconds === 1 ? '' : 's'} · not uploaded.`,
          )
          voiceChunks.current = []
        },
        { once: true },
      )
    } catch {
      setRecording(false)
      setVoiceStatus('Microphone access was not available. Use the manual private note instead.')
    }
  }

  const toggleChoice = (
    value: string,
    selected: string[],
    setSelected: (values: string[]) => void,
  ) => {
    setSelected(
      selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
    )
  }

  return (
    <div className="wrapup">
      <header>
        <p className="eyebrow">Session wrap-up</p>
        <h1>
          Complete the record
          <br />
          while it’s fresh.
        </h1>
        <p>
          {client.preferredName} · {appointment.sessionType}
        </p>
      </header>
      <div className="wrapup-grid">
        <Card eyebrow="Work recorded" title="Areas & approach">
          <div className="choice-chips">
            <label>
              <input
                type="checkbox"
                checked={areas.includes(client.goals[0]?.region ?? 'general')}
                onChange={() => toggleChoice(client.goals[0]?.region ?? 'general', areas, setAreas)}
              />
              {client.goals[0]?.region.replaceAll('_', ' ')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={areas.includes('General integration')}
                onChange={() => toggleChoice('General integration', areas, setAreas)}
              />
              General integration
            </label>
            <label>
              <input
                type="checkbox"
                checked={areas.includes('Upper back')}
                onChange={() => toggleChoice('Upper back', areas, setAreas)}
              />
              Upper back
            </label>
          </div>
          <div className="divider" />
          <div className="choice-chips">
            <label>
              <input
                type="checkbox"
                checked={approaches.includes('Myofascial')}
                onChange={() => toggleChoice('Myofascial', approaches, setApproaches)}
              />
              Myofascial
            </label>
            <label>
              <input
                type="checkbox"
                checked={approaches.includes('Slow compression')}
                onChange={() => toggleChoice('Slow compression', approaches, setApproaches)}
              />
              Slow compression
            </label>
            <label>
              <input
                type="checkbox"
                checked={approaches.includes('Mobilisation')}
                onChange={() => toggleChoice('Mobilisation', approaches, setApproaches)}
              />
              Mobilisation
            </label>
            <label>
              <input
                type="checkbox"
                checked={approaches.includes('Breath cue')}
                onChange={() => toggleChoice('Breath cue', approaches, setApproaches)}
              />
              Breath cue
            </label>
          </div>
          <Field label="Pressure">
            <Select value={pressure} onChange={(event) => setPressure(event.target.value)}>
              <option>Light</option>
              <option>Medium</option>
              <option>Firm</option>
              <option>Varied</option>
            </Select>
          </Field>
        </Card>
        <Card eyebrow="Immediate response" title="What changed today?">
          <Field label="Recorded response">
            <Select value={response} onChange={(event) => setResponse(event.target.value)}>
              <option>Much better</option>
              <option>Better</option>
              <option>Similar</option>
              <option>More tender but acceptable</option>
              <option>Worse</option>
              <option>Significantly worse</option>
            </Select>
          </Field>
          <div className="voice-note">
            <button onClick={() => void toggleRecording()}>
              {recording ? <Square size={18} /> : <Mic size={18} />}
            </button>
            <div>
              <strong>
                {recording ? 'Recording synthetic voice note…' : 'Add a private voice note'}
              </strong>
              <span>
                {recording ? 'Stop when complete' : 'Manual text always remains available'}
              </span>
            </div>
          </div>
          {voiceStatus && (
            <p className="microcopy" role="status">
              {voiceStatus}
            </p>
          )}
          <Field label="Manual private note">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Private therapist summary…"
            />
          </Field>
        </Card>
        <Card tone="gold" eyebrow="Time record" title="Bonus Care Minutes">
          <div className="time-ledger">
            <Field label="Booked minutes">
              <Input type="number" value={appointment.durationMinutes} readOnly />
            </Field>
            <Field label="Actual care minutes">
              <Input
                type="number"
                min="0"
                value={actual}
                onChange={(event) => setActual(Number(event.target.value))}
              />
            </Field>
            <Field label="Confirm client-visible bonus">
              <Input
                type="number"
                min="0"
                value={bonus}
                onChange={(event) => setBonus(Math.max(0, Number(event.target.value)))}
              />
            </Field>
          </div>
          <StatusStrip
            tone={suggestion.thresholdMet ? 'success' : 'info'}
            title={
              suggestion.thresholdMet
                ? `Suggested +${suggestion.calculatedMinutes} min`
                : 'Below the 3-minute display threshold'
            }
          >
            The therapist confirms or edits this value. Negative minutes are never shown.
          </StatusStrip>
        </Card>
        <Card eyebrow="Aftercare & next visit" title="Close the loop">
          <Field label="Client-visible aftercare">
            <Textarea
              value={aftercare}
              onChange={(event) => setAftercare(event.target.value)}
              placeholder="Optional, non-diagnostic aftercare note…"
            />
          </Field>
          <Button variant="secondary" icon={<Plus size={16} />} onClick={onBook}>
            Draft next appointment
          </Button>
        </Card>
      </div>
      <div className="wrapup-actions">
        <Button
          variant="ghost"
          icon={<FileText size={16} />}
          onClick={() => {
            updateAppointment(appointment.id, {
              session: {
                ...appointment.session,
                actualMinutes: actual,
                bonusMinutes: bonus,
                pressure,
                response,
                note,
                areas,
                approaches,
                aftercare,
                ...(voiceCapture ? { voiceCapture } : {}),
              },
            })
            setDraftSaved(true)
          }}
        >
          {draftSaved ? 'Private draft saved' : 'Save private draft'}
        </Button>
        <Button
          size="lg"
          icon={<Save size={17} />}
          disabled={recording}
          onClick={() =>
            onSave({
              actualMinutes: actual,
              bonusMinutes: bonus,
              pressure,
              response,
              note,
              areas,
              approaches,
              aftercare,
              ...(voiceCapture ? { voiceCapture } : {}),
            })
          }
        >
          Complete wrap-up
        </Button>
      </div>
      <QuickAppointmentModal open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  )
}
