import { ArrowLeft, FlipVertical2, Play, RotateCcw, RotateCw, Square, TimerReset } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { Modal } from '@/components/design-system/Modal'
import { env } from '@/config/env'
import {
  areaLabel,
  finishSummary,
  rotateTable,
  sessionClock,
  type SessionPainPoint,
  type TableRotation,
} from '@/domain/care'
import { getAppointment, getClient, sessionPointsFor } from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { therapistCanAccessClient } from '@/data/demo/team'
import { useAuth } from '@/features/auth/auth-context'
import { BodyStage, type BodyMarker } from '@/features/body/BodyStage'
import type { FigureFace } from '@/features/body/anchors'
import { fmtTime, minutesLabel, relativeWhen, whenPhrase } from '@/lib/formatting/time'
import { useWakeLock } from './useWakeLock'
import './session.css'

const ORIENTATION_KEY = 'aura-table-orientation-v1'

function readOrientation(): TableRotation | null {
  try {
    const value = Number(localStorage.getItem(ORIENTATION_KEY))
    return value === 0 || value === 90 || value === 180 || value === 270 ? value : null
  } catch {
    return null
  }
}

function defaultOrientation(): TableRotation {
  return typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 270 : 0
}

/** Re-renders every second, aligned to the wall clock, so the display never drifts. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    let timer = 0
    const tick = () => {
      setNow(Date.now())
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
    }
    tick()
    const onVisible = () => document.visibilityState === 'visible' && setNow(Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active])
  return now
}

function markerDetail(point: SessionPainPoint, now: number) {
  if (point.status === 'unconfirmed') return `${relativeWhen(point.observedAt, now)} · not yet confirmed`
  if (point.status === 'confirmed') return `Recorded ${whenPhrase(point.observedAt, now)} · confirmed`
  if (point.status === 'new') return 'New today'
  return 'Updated today'
}

export function SessionModePage() {
  const { appointmentId } = useParams()
  const auth = useAuth()
  const navigate = useNavigate()
  const state = useDemoStore()
  const appointment = getAppointment(state, appointmentId)
  const client = getClient(state, appointment?.clientId)
  const allowed =
    appointment &&
    (appointment.therapistId === auth.demoTherapistId || therapistCanAccessClient(state, auth.demoTherapistId, appointment.clientId))

  const [rotation, setRotation] = useState<TableRotation>(() => readOrientation() ?? defaultOrientation())
  const [face, setFace] = useState<FigureFace>('front')
  const [confirmFinish, setConfirmFinish] = useState(false)
  const startedAt = appointment?.session?.startedAt
  const finishedAt = appointment?.session?.finishedAt
  const running = Boolean(startedAt && !finishedAt)
  const now = useNow(true)
  useWakeLock(running)

  /** Remembered on this device only once the therapist has chosen it. */
  const turnTable = (direction: 1 | -1) =>
    setRotation((value) => {
      const next = rotateTable(value, direction)
      try {
        localStorage.setItem(ORIENTATION_KEY, String(next))
      } catch {
        // Orientation is a convenience; the session works without storage.
      }
      return next
    })

  useEffect(() => {
    if (finishedAt && appointment) navigate(`/therapist/session/${appointment.id}/finish`, { replace: true })
  }, [finishedAt, appointment, navigate])

  const points = useMemo(() => (appointment ? sessionPointsFor(state, appointment) : []), [state, appointment])

  if (!appointment || !client || !allowed) {
    return (
      <main id="main-content" className="session session--missing">
        <p className="empty">This session isn’t available to you.</p>
        <Link to="/therapist/today" className="back-link">
          <ArrowLeft size={18} aria-hidden="true" /> Today
        </Link>
      </main>
    )
  }

  const clock = startedAt ? sessionClock(startedAt, appointment.durationMinutes, now) : null
  const display = clock?.display ?? `${appointment.durationMinutes}:00`
  const extra = clock?.phase === 'extra'
  const markers: BodyMarker[] = points.map((point) => ({
    area: point.area,
    pain: point.pain,
    label: areaLabel(point.region, point.side),
    detail: markerDetail(point, now),
    tone: point.status === 'unconfirmed' ? 'muted' : 'default',
  }))
  const unconfirmed = !appointment.arrival
  const latestReport = points.reduce<string | null>((latest, point) => (latest && latest > point.observedAt ? latest : point.observedAt), null)
  const summarySoFar = startedAt ? finishSummary(startedAt, new Date(now).toISOString(), appointment.durationMinutes) : null

  return (
    <main id="main-content" className={`session${extra ? ' is-extra' : ''}${running ? ' is-running' : ''}`}>
      <header className="session__bar">
        <Link to="/therapist/today" className="back-link">
          <ArrowLeft size={18} aria-hidden="true" /> Today
        </Link>
        <p className="session__who">
          <strong>{client.displayName}</strong>
          <span>
            {appointment.sessionType} · booked {minutesLabel(appointment.durationMinutes)}
          </span>
        </p>
      </header>

      <section className="session__stage" aria-label="Pain points on the body">
        <BodyStage
          face={face}
          rotation={rotation}
          markers={markers}
          variant="session"
          label={`${client.preferredName} lying ${face === 'front' ? 'face up' : 'face down'}, head towards the head of the table`}
        />
        <HeadOfTable rotation={rotation} />
        {unconfirmed ? (
          <div className="session__unconfirmed" role="note">
            <strong>
              {latestReport ? `Latest report ${whenPhrase(latestReport, now)}` : 'No recent report'}
            </strong>
            <span>Not yet confirmed at arrival.</span>
            <Link to={`/therapist/arrival/${appointment.id}`}>Begin arrival</Link>
          </div>
        ) : null}
        {!markers.length ? <p className="session__none">No areas of discomfort reported for today.</p> : null}
      </section>

      <aside className="session__side">
        <div className="session__clock" aria-live="off">
          <p className="session__clock-label">
            {extra ? 'Extra care' : running ? 'Remaining' : `${appointment.durationMinutes}-minute booking`}
          </p>
          <p className="session__time num" role="timer" aria-label={extra ? `Extra care ${display}` : `${display} remaining`}>
            {display}
          </p>
          {running && startedAt ? (
            <p className="session__clock-meta">
              Started {fmtTime(startedAt)} · ends {fmtTime(new Date(startedAt).getTime() + appointment.durationMinutes * 60_000)}
            </p>
          ) : null}
        </div>

        <div className="session__controls">
          <div className="session__orient" role="group" aria-label="Table orientation">
            <button type="button" className="session__tool" onClick={() => turnTable(-1)}>
              <RotateCcw size={22} aria-hidden="true" />
              <span>Turn left</span>
            </button>
            <button type="button" className="session__tool session__tool--flip" onClick={() => setFace((value) => (value === 'front' ? 'back' : 'front'))} aria-label={`${face === 'front' ? 'Face up' : 'Face down'}. Flip to ${face === 'front' ? 'face down' : 'face up'}`}>
              <FlipVertical2 size={22} aria-hidden="true" />
              <span>{face === 'front' ? 'Face up' : 'Face down'}</span>
            </button>
            <button type="button" className="session__tool" onClick={() => turnTable(1)}>
              <RotateCw size={22} aria-hidden="true" />
              <span>Turn right</span>
            </button>
          </div>

          {!startedAt ? (
            <Button size="lg" fullWidth icon={<Play size={20} />} onClick={() => state.startSession(appointment.id)}>
              Start session
            </Button>
          ) : (
            <Button size="lg" fullWidth variant="secondary" icon={<Square size={18} />} onClick={() => setConfirmFinish(true)}>
              Finish
            </Button>
          )}

          {env.demoMode && running ? (
            <div className="session__testclock" role="group" aria-label="Test clock for the synthetic demo">
              <span>
                <TimerReset size={15} aria-hidden="true" /> Demo test clock
              </span>
              <button type="button" onClick={() => state.advanceSessionClock(appointment.id, 1)}>
                +1 min
              </button>
              <button type="button" onClick={() => state.advanceSessionClock(appointment.id, 10)}>
                +10 min
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <Modal
        open={confirmFinish}
        onOpenChange={setConfirmFinish}
        title="Finish this session?"
        description={summarySoFar ? `Booked ${minutesLabel(summarySoFar.bookedMinutes)} · ${minutesLabel(summarySoFar.actualMinutes)} so far` : undefined}
      >
        <div className="stack">
          {summarySoFar && summarySoFar.extraMinutes > 0 ? (
            <p className="lead">That includes {minutesLabel(summarySoFar.extraMinutes)} of extra care. You’ll confirm it next.</p>
          ) : null}
          <Button
            size="lg"
            fullWidth
            onClick={() => {
              state.finishSession(appointment.id)
              setConfirmFinish(false)
            }}
          >
            Finish and review time
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setConfirmFinish(false)}>
            Keep going
          </Button>
        </div>
      </Modal>
    </main>
  )
}

function HeadOfTable({ rotation }: { rotation: TableRotation }) {
  const position = { 0: 'top', 90: 'right', 180: 'bottom', 270: 'left' }[rotation]
  return (
    <span className={`session__head session__head--${position}`} aria-hidden="true">
      Head of table
    </span>
  )
}
