import { ArrowLeft, Check } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { Textarea } from '@/components/design-system/FormField'
import { ScoreScale } from '@/components/ui/ScoreScale'
import { SESSION_RESPONSE_LABEL, areaLabel, type SessionResponse } from '@/domain/care'
import { getAppointment, getTherapist, sessionPointsFor } from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import { dayPhrase } from '@/lib/formatting/time'
import './follow-up.css'

const RESPONSES: SessionResponse[] = [2, 1, 0, -1, -2]

export function FollowUpPage() {
  const { appointmentId } = useParams()
  const auth = useAuth()
  const navigate = useNavigate()
  const state = useDemoStore()
  const appointment = getAppointment(state, appointmentId)
  const therapist = getTherapist(state, appointment?.therapistId)
  const existing = state.followUps.find((item) => item.appointmentId === appointmentId)
  const [response, setResponse] = useState<SessionResponse | null>(null)
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  if (!appointment || appointment.clientId !== auth.demoClientId) {
    return (
      <main id="main-content" className="follow">
        <p className="empty">This visit isn’t available to you.</p>
      </main>
    )
  }
  const points = sessionPointsFor(state, appointment)

  if (existing) {
    return (
      <main id="main-content" className="follow follow--done">
        <div className="follow__done rise" role="status">
          <span className="follow__mark" aria-hidden="true">
            <Check size={28} strokeWidth={2.4} />
          </span>
          <h1 className="title-lg">Thank you</h1>
          <p className="lead">
            You told {therapist?.preferredName ?? 'your therapist'} you felt “{SESSION_RESPONSE_LABEL[`${existing.response}`].toLocaleLowerCase()}”.
          </p>
          <Button size="lg" fullWidth onClick={() => navigate('/client/home')}>
            Done
          </Button>
        </div>
      </main>
    )
  }

  const save = () => {
    if (response === null) {
      setError('Choose how you feel compared with before your visit.')
      return
    }
    state.recordFollowUp({
      appointmentId: appointment.id,
      response,
      selections: points.flatMap((point) => {
        const value = scores[point.area]
        return value === undefined || value === null ? [] : [{ region: point.region, side: point.side, pain: value }]
      }),
      ...(note.trim() ? { note: note.trim() } : {}),
    })
  }

  return (
    <main id="main-content" className="follow">
      <Link to="/client/home" className="back-link">
        <ArrowLeft size={18} aria-hidden="true" /> Home
      </Link>
      <header>
        <p className="eyebrow">After your visit {dayPhrase(appointment.startsAt)}</p>
        <h1 className="title-lg">How do you feel compared with before you saw {therapist?.preferredName}?</h1>
      </header>
      <div className="follow__choices" role="radiogroup" aria-label="How you feel compared with before your visit">
        {RESPONSES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={response === value}
            className={`follow__choice follow__choice--${value > 0 ? 'up' : value < 0 ? 'down' : 'same'}`}
            onClick={() => {
              setResponse(value)
              setError('')
            }}
          >
            {SESSION_RESPONSE_LABEL[`${value}`]}
          </button>
        ))}
      </div>
      {points.length ? (
        <section className="stack" aria-label="Areas from your visit (optional)">
          <h2 className="eyebrow">How do these areas feel now? (optional)</h2>
          {points.map((point) => (
            <div key={point.area} className="field">
              <span className="field__label">{areaLabel(point.region, point.side)}</span>
              <ScoreScale
                label={`${areaLabel(point.region, point.side)} now, 0 to 10`}
                value={scores[point.area] ?? null}
                onChange={(value) => setScores((current) => ({ ...current, [point.area]: value }))}
              />
            </div>
          ))}
        </section>
      ) : null}
      <label className="field">
        <span className="field__label">Anything to add? (optional)</span>
        <Textarea rows={2} maxLength={280} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <footer className="follow__save">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button size="lg" fullWidth onClick={save}>
          Send to {therapist?.preferredName ?? 'my therapist'}
        </Button>
      </footer>
    </main>
  )
}
