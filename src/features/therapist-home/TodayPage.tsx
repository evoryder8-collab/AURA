import { ArrowRight, ClipboardCheck, History, Timer } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PainChip } from '@/components/ui/PainChip'
import { Portrait } from '@/components/ui/Portrait'
import {
  areaKey,
  areaLabel,
  latestByArea,
  OBSERVATION_SOURCE_LABEL,
  type CareObservation,
} from '@/domain/care'
import type { DemoAppointment, DemoState } from '@/data/demo/model'
import {
  clientObservations,
  getClient,
  getTherapist,
  isUpcoming,
  preVisitUpdates,
  previousVisit,
  sessionPointsFor,
  therapistAppointments,
} from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import { BodyStage, type BodyMarker } from '@/features/body/BodyStage'
import { anchorFor } from '@/features/body/anchors'
import { dayPhrase, daysBetween, fmtDate, fmtTime, greeting, minutesLabel, relativeDay, relativeWhen } from '@/lib/formatting/time'
import './today.css'

export function TodayPage() {
  const auth = useAuth()
  const therapistId = auth.demoTherapistId ?? ''
  const state = useDemoStore()
  const therapist = getTherapist(state, therapistId)
  const now = Date.now()
  const appointments = useMemo(() => therapistAppointments(state, therapistId), [state, therapistId])
  const upcoming = appointments.filter((item) => isUpcoming(item, now))
  const next = upcoming[0]
  const laterToday = upcoming.slice(1).filter((item) => daysBetween(now, item.startsAt) === 0)
  const thisWeek = upcoming.slice(1).filter((item) => daysBetween(now, item.startsAt) > 0 && daysBetween(now, item.startsAt) <= 7)
  const wrapUps = appointments.filter((item) => item.session?.finishedAt && item.status !== 'completed')

  return (
    <div className="page today">
      <header className="today__hello rise">
        <p className="eyebrow">{fmtDate(now)}</p>
        <h1 className="title-lg">
          {greeting(now)}, {therapist?.preferredName}
        </h1>
      </header>

      {wrapUps.map((item) => (
        <Link key={item.id} to={`/therapist/session/${item.id}/finish`} className="today__wrap rise">
          <Timer size={20} aria-hidden="true" />
          <span>
            Finish wrapping up {getClient(state, item.clientId)?.preferredName}’s session — confirm extra care minutes.
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      ))}

      {next ? <NextAppointment appointment={next} state={state} now={now} /> : <EmptyDay />}

      {laterToday.length ? (
        <section className="today__section" aria-labelledby="later-title">
          <h2 id="later-title" className="eyebrow">
            Later today
          </h2>
          <ul className="list">{laterToday.map((item) => <AgendaRow key={item.id} appointment={item} state={state} now={now} />)}</ul>
        </section>
      ) : null}

      {thisWeek.length ? (
        <section className="today__section" aria-labelledby="week-title">
          <h2 id="week-title" className="eyebrow">
            This week
          </h2>
          <ul className="list">{thisWeek.map((item) => <AgendaRow key={item.id} appointment={item} state={state} now={now} />)}</ul>
        </section>
      ) : null}
    </div>
  )
}

function EmptyDay() {
  return (
    <section className="empty">
      <strong>No upcoming visits</strong>
      <span>New bookings appear here with the client’s latest update.</span>
      <Link to="/therapist/calendar" className="back-link">
        Open calendar <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  )
}

function changeLine(observation: CareObservation, before: ReturnType<typeof latestByArea>) {
  return observation.entries.map((entry) => {
    const key = areaKey(entry.region, entry.side)
    const previous = before.get(key)
    return { key, label: areaLabel(entry.region, entry.side), pain: entry.pain, previous: previous?.pain }
  })
}

function NextAppointment({ appointment, state, now }: { appointment: DemoAppointment; state: DemoState; now: number }) {
  const client = getClient(state, appointment.clientId)
  const previous = previousVisit(state, appointment)
  const previousTherapist = getTherapist(state, previous?.therapistId)
  const updates = preVisitUpdates(state, appointment, now)
  const observations = clientObservations(state, appointment.clientId)
  const beforeUpdates = latestByArea(observations, previous?.session?.finishedAt ?? previous?.startsAt)
  const points = sessionPointsFor(state, appointment)
  const started = Boolean(appointment.session?.startedAt && !appointment.session.finishedAt)
  const markers: BodyMarker[] = points.map((point) => ({ area: point.area, pain: point.pain, label: areaLabel(point.region, point.side) }))
  const showBack = markers.length > 0 && markers.every((marker) => anchorFor(marker.area)?.surface === 'back')

  if (!client) return null
  return (
    <section className="next rise" aria-labelledby="next-title">
      <div className="next__head">
        <p className="eyebrow">{started ? 'In session now' : 'Next appointment'}</p>
        <h2 id="next-title" className="next__when">
          <span className="num">{fmtTime(appointment.startsAt)}</span> {relativeDay(appointment.startsAt, now)}
        </h2>
        <p className="next__client">
          <strong>{client.displayName}</strong>
          <span className="muted">
            {appointment.sessionType} · {minutesLabel(appointment.durationMinutes)}
          </span>
        </p>
      </div>

      <div className="next__update">
        <div className="next__figure">
          <BodyStage
            face={showBack ? 'back' : 'front'}
            variant="compact"
            markers={markers}
            showSides
            label={`${client.preferredName}'s reported areas`}
          />
        </div>
        <div className="next__story">
          {updates.length ? (
            <>
              <h3 className="eyebrow">Since the last visit</h3>
              <ul className="next__updates">
                {updates.slice(0, 3).map((observation) => (
                  <li key={observation.id}>
                    <p className="next__update-when">
                      {relativeWhen(observation.observedAt, now)} · {OBSERVATION_SOURCE_LABEL[observation.source]}
                    </p>
                    {changeLine(observation, beforeUpdates).map((line) => (
                      <p key={line.key} className="next__update-line">
                        <span>{line.label}</span>
                        <PainChip score={line.pain} />
                        {line.previous !== undefined && line.previous !== line.pain ? (
                          <span className="small muted">was {line.previous} at the last visit</span>
                        ) : null}
                      </p>
                    ))}
                    {observation.note ? <q>{observation.note}</q> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h3 className="eyebrow">Since the last visit</h3>
              <p className="muted">No new update from {client.preferredName} yet. Their last recorded areas are shown.</p>
            </>
          )}
          {previous ? (
            <p className="small muted next__previous">
              Last visit {dayPhrase(previous.startsAt, now)} with{' '}
              {previous.therapistId === appointment.therapistId ? 'you' : (previousTherapist?.preferredName ?? 'the team')}
            </p>
          ) : null}
        </div>
      </div>

      <div className="next__actions">
        {!appointment.arrival ? (
          <Link className="button button--primary button--lg" to={`/therapist/arrival/${appointment.id}`}>
            <ClipboardCheck size={18} aria-hidden="true" /> Begin arrival
          </Link>
        ) : (
          <Link className="button button--primary button--lg" to={`/therapist/session/${appointment.id}`}>
            <Timer size={18} aria-hidden="true" /> {started ? 'Return to Session Mode' : 'Open Session Mode'}
          </Link>
        )}
        <Link className="button button--secondary button--lg" to={`/therapist/clients/${appointment.clientId}`}>
          <History size={18} aria-hidden="true" /> History
        </Link>
      </div>
    </section>
  )
}

function AgendaRow({ appointment, state, now }: { appointment: DemoAppointment; state: DemoState; now: number }) {
  const client = getClient(state, appointment.clientId)
  const update = preVisitUpdates(state, appointment, now)[0]
  const top = update?.entries.slice().sort((a, b) => b.pain - a.pain)[0]
  return (
    <li className="agenda-row">
      <Link to={`/therapist/clients/${appointment.clientId}`}>
        <span className="agenda-row__time num">
          {fmtTime(appointment.startsAt)}
          <small>{relativeDay(appointment.startsAt, now)}</small>
        </span>
        <span className="agenda-row__who">
          <strong>{client?.displayName}</strong>
          <span className="small muted">
            {top ? `${relativeDay(update.observedAt, now)} · ${areaLabel(top.region, top.side)} ${top.pain}/10` : appointment.sessionType}
          </span>
        </span>
        <Portrait name={client?.displayName ?? ''} size="xs" />
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </li>
  )
}
