import { ArrowRight, CalendarPlus, Check } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Modal } from '@/components/design-system/Modal'
import { PageHeader } from '@/components/design-system/PageHeader'
import { Spinner } from '@/components/design-system/Spinner'
import { assetUrl, Portrait } from '@/components/ui/Portrait'
import type { DemoAppointment, DemoTherapist } from '@/data/demo/model'
import { clientAppointments, clientBonus, isUpcoming } from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import { dayKey, daysBetween, fmtDay, fmtTime, minutesLabel, relativeDay, whenPhrase } from '@/lib/formatting/time'
import { serviceName } from './slots'
import './visits.css'

/** A follow-up is offered for visits from the last few days that have no answer yet. */
const FOLLOW_UP_DAYS = 3

const visitWhen = (appointment: DemoAppointment, now: number) =>
  `${relativeDay(appointment.startsAt, now)} at ${fmtTime(appointment.startsAt)}`

export function VisitsPage() {
  const { demoClientId } = useAuth()
  const hydrated = useDemoStore((state) => state.hydrated)
  const appointments = useDemoStore((state) => state.appointments)
  const therapists = useDemoStore((state) => state.therapists)
  const followUps = useDemoStore((state) => state.followUps)
  const bonusCredits = useDemoStore((state) => state.bonusCredits)
  const cancelAppointment = useDemoStore((state) => state.cancelAppointment)
  const [now] = useState(Date.now)
  const [cancelling, setCancelling] = useState<DemoAppointment | null>(null)
  const [message, setMessage] = useState('')

  if (!hydrated) return <Spinner label="Opening your visits" fullPage />
  if (!demoClientId) {
    return (
      <div className="page">
        <p className="empty">This account has no client profile in the demo.</p>
      </div>
    )
  }

  const therapistOf = (appointment: DemoAppointment) => therapists.find((item) => item.id === appointment.therapistId)
  const mine = clientAppointments({ appointments }, demoClientId)
  const [next, ...later] = mine.filter((appointment) => isUpcoming(appointment, now))
  const past = mine.filter((appointment) => appointment.status === 'completed').reverse()
  const credits = new Map(clientBonus({ bonusCredits }, demoClientId).credits.map((credit) => [credit.appointmentId, credit]))
  const answered = new Set(followUps.filter((item) => item.clientId === demoClientId).map((item) => item.appointmentId))
  const checkInToday = Boolean(next && dayKey(next.startsAt) === dayKey(now) && !next.arrival && !next.session)

  const confirmCancel = () => {
    if (!cancelling) return
    cancelAppointment(cancelling.id)
    setMessage(`Your visit ${whenPhrase(cancelling.startsAt, now)} is cancelled.`)
    setCancelling(null)
  }

  return (
    <div className="page visits">
      <PageHeader
        title="Visits"
        actions={
          <Link to="/client/visits/book" className={`button button--md ${checkInToday ? 'button--secondary' : 'button--primary'}`}>
            <CalendarPlus size={18} aria-hidden="true" />
            Book a visit
          </Link>
        }
      />

      <p className="visits__status" role="status">
        {message}
      </p>

      {next ? (
        <NextVisit
          appointment={next}
          therapist={therapistOf(next)}
          now={now}
          checkIn={checkInToday}
          onCancel={() => setCancelling(next)}
        />
      ) : (
        <section className="card visit-hero visit-hero--empty" aria-labelledby="next-visit-title">
          <p className="eyebrow">Next visit</p>
          <h2 id="next-visit-title" className="title-md">
            Nothing booked yet
          </h2>
          <p className="muted">Choose a therapist and a time that suits you.</p>
        </section>
      )}

      {later.length ? (
        <section className="stack" aria-labelledby="later-title">
          <h2 id="later-title" className="visits__heading">
            Also coming up
          </h2>
          <ul className="list card visits__list">
            {later.map((appointment) => {
              const therapist = therapistOf(appointment)
              return (
                <li key={appointment.id} className="visit-row">
                  <Portrait name={therapist?.displayName ?? 'Therapist'} portrait={therapist?.portrait} size="sm" />
                  <div className="visit-row__body">
                    <p className="visit-row__title">
                      {visitWhen(appointment, now)}
                    </p>
                    <p className="visit-row__meta">
                      {therapist?.preferredName ?? 'Your therapist'} · {serviceName(appointment.sessionType)} ·{' '}
                      <span className="nowrap">{appointment.durationMinutes} min</span>
                    </p>
                  </div>
                  {appointment.session ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCancelling(appointment)}
                      aria-label={`Cancel visit on ${fmtDay(appointment.startsAt)} at ${fmtTime(appointment.startsAt)}`}
                    >
                      Cancel
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {past.length ? (
        <section className="stack" aria-labelledby="past-title">
          <h2 id="past-title" className="visits__heading">
            Past visits
          </h2>
          <ul className="list card visits__list">
            {past.map((appointment) => {
              const therapist = therapistOf(appointment)
              const summary = appointment.session?.summary
              const extra = credits.get(appointment.id)?.minutes ?? 0
              const followUpOpen =
                !answered.has(appointment.id) && daysBetween(appointment.startsAt, now) <= FOLLOW_UP_DAYS
              return (
                <li key={appointment.id} className="visit-row visit-row--past">
                  <Portrait name={therapist?.displayName ?? 'Therapist'} portrait={therapist?.portrait} size="sm" />
                  <div className="visit-row__body">
                    <p className="visit-row__title">{fmtDay(appointment.startsAt)}</p>
                    <p className="visit-row__meta">
                      {therapist?.displayName ?? 'Your therapist'} · {serviceName(appointment.sessionType)}
                    </p>
                    <p className="visit-row__meta">
                      <span className="nowrap">Booked {appointment.durationMinutes} min</span>
                      {summary ? (
                        <>
                          {' '}
                          · <span className="nowrap">Lasted {summary.actualMinutes} min</span>
                        </>
                      ) : null}
                    </p>
                    {extra > 0 || followUpOpen ? (
                      <div className="visit-row__extras">
                        {extra > 0 ? <Badge tone="gold">{minutesLabel(extra)} extra care</Badge> : null}
                        {followUpOpen ? (
                          <Link className="visit-row__follow" to={`/client/follow-up/${appointment.id}`}>
                            How are you feeling since? <ArrowRight size={16} aria-hidden="true" />
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <Modal
        open={cancelling !== null}
        onOpenChange={(open) => (open ? undefined : setCancelling(null))}
        title="Cancel this visit?"
        description={
          cancelling
            ? `${visitWhen(cancelling, now)} with ${therapistOf(cancelling)?.preferredName ?? 'your therapist'}. The time is released for someone else.`
            : undefined
        }
      >
        <div className="visits__confirm">
          <Button variant="secondary" onClick={() => setCancelling(null)}>
            Keep visit
          </Button>
          <Button variant="danger" onClick={confirmCancel}>
            Yes, cancel it
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function NextVisit({
  appointment,
  therapist,
  now,
  checkIn,
  onCancel,
}: {
  appointment: DemoAppointment
  therapist: DemoTherapist | undefined
  now: number
  checkIn: boolean
  onCancel: () => void
}) {
  const name = therapist?.displayName ?? 'Your therapist'
  return (
    <section className="card visit-hero" aria-labelledby="next-visit-title">
      <div className="visit-hero__body">
        <p className="eyebrow">Next visit</p>
        <h2 id="next-visit-title" className="visit-hero__when">
          <span>{relativeDay(appointment.startsAt, now)}</span> <span className="num">{fmtTime(appointment.startsAt)}</span>
        </h2>
        <p className="visit-hero__with">
          <Portrait name={name} portrait={therapist?.portrait} size="sm" className="visit-hero__avatar" />
          <span>
            with <strong>{name}</strong>
          </span>
        </p>
        <p className="visit-hero__meta">
          {serviceName(appointment.sessionType)} · <span className="nowrap">{minutesLabel(appointment.durationMinutes)}</span> ·{' '}
          <span className="nowrap">{appointment.room}</span>
        </p>
        <div className="visit-hero__actions">
          {checkIn ? (
            <Link to={`/client/arrival/${appointment.id}`} className="button button--primary button--lg">
              Check in for this visit
            </Link>
          ) : null}
          {appointment.session ? (
            <p className="visit-hero__note">Your visit is under way.</p>
          ) : appointment.arrival ? (
            <p className="visit-hero__note">
              <Check size={16} aria-hidden="true" /> You're checked in
            </p>
          ) : null}
          {appointment.session ? null : (
            <Button variant="ghost" onClick={onCancel}>
              Cancel visit
            </Button>
          )}
        </div>
      </div>
      {therapist?.portrait ? (
        <img className="visit-hero__figure" src={assetUrl(therapist.portrait.hero)} alt="" loading="lazy" decoding="async" />
      ) : null}
    </section>
  )
}
