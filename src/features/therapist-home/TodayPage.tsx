import { ArrowRight, ArrowUpRight, ClipboardCheck, FileText, History, MessageCircleHeart, Timer } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PainChip } from '@/components/ui/PainChip'
import { Portrait } from '@/components/ui/Portrait'
import {
  SESSION_RESPONSE_LABEL,
  areaKey,
  areaLabel,
  latestByArea,
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
import { BodyThumb } from '@/features/body/BodyThumb'
import { anchorFor } from '@/features/body/anchors'
import { dayPhrase, daysBetween, fmtDay, fmtTime, greeting, relativeDay, relativeWhen } from '@/lib/formatting/time'
import { useMediaQuery } from '@/lib/useMediaQuery'
import './today.css'

const SOURCE_SHORT: Record<CareObservation['source'], string> = {
  home: 'at home',
  arrival: 'at arrival',
  session: 'at a visit',
  follow_up: 'next-day reply',
}

function untilLabel(startsAt: string, now: number) {
  const minutes = Math.round((new Date(startsAt).getTime() - now) / 60_000)
  if (minutes <= 0) return 'Now'
  if (minutes < 60) return `In ${minutes} min`
  if (minutes < 24 * 60) return `In ${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim()
  return relativeDay(startsAt, now)
}

export function TodayPage() {
  const auth = useAuth()
  const therapistId = auth.demoTherapistId ?? ''
  const state = useDemoStore()
  const therapist = getTherapist(state, therapistId)
  const now = Date.now()
  const appointments = useMemo(() => therapistAppointments(state, therapistId), [state, therapistId])
  const upcoming = appointments.filter((item) => isUpcoming(item, now))
  const next = upcoming[0]
  const todayCount = upcoming.filter((item) => daysBetween(now, item.startsAt) === 0).length
  const wrapUps = appointments.filter((item) => item.session?.finishedAt && item.status !== 'completed')

  return (
    <div className="page today">
      <header className="today__top rise">
        <div>
          <p className="today__date">{new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</p>
          <h1 className="title-lg">
            {greeting(now)}, <span className="gradient-text gradient-text--dawn">{therapist?.preferredName}</span>
          </h1>
        </div>
        <p className="today__summary">
          <span className="num">{todayCount}</span> {todayCount === 1 ? 'visit' : 'visits'} today
          {next ? (
            <>
              <span aria-hidden="true"> · </span>next {untilLabel(next.startsAt, now).toLocaleLowerCase()}
            </>
          ) : null}
        </p>
      </header>

      {wrapUps.map((item) => (
        <Link key={item.id} to={`/therapist/session/${item.id}/finish`} className="today__wrap rise">
          <Timer size={20} aria-hidden="true" />
          <span>Confirm extra care for {getClient(state, item.clientId)?.preferredName}’s session to finish it.</span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      ))}

      <div className="today__grid">
        <div className="today__main">{next ? <NextBrief appointment={next} state={state} now={now} /> : <EmptyDay />}</div>
        <aside className="today__side" aria-label="Schedule and follow-ups">
          <Schedule appointments={upcoming.slice(next ? 1 : 0)} state={state} now={now} />
          <NeedsYou therapistId={therapistId} state={state} now={now} />
        </aside>
      </div>
    </div>
  )
}

function EmptyDay() {
  return (
    <section className="next next--empty glass">
      <p className="eyebrow">Up next</p>
      <h2 className="title-md">No upcoming visits</h2>
      <p className="muted">New bookings appear here with the client’s latest update.</p>
      <Link to="/therapist/calendar" className="button button--secondary">
        Open calendar
      </Link>
    </section>
  )
}

type Change = { key: string; label: string; pain: number; previous: number | undefined }

function changesIn(observation: CareObservation, before: ReturnType<typeof latestByArea>): Change[] {
  return observation.entries
    .map((entry) => {
      const key = areaKey(entry.region, entry.side)
      return { key, label: areaLabel(entry.region, entry.side), pain: entry.pain, previous: before.get(key)?.pain }
    })
    .sort((a, b) => Math.abs(b.pain - (b.previous ?? b.pain)) - Math.abs(a.pain - (a.previous ?? a.pain)) || b.pain - a.pain)
}

function Delta({ change }: { change: Change }) {
  if (change.previous === undefined) return <span className="delta delta--new">New area</span>
  const diff = change.pain - change.previous
  if (diff === 0) return <span className="delta">Same as last visit</span>
  return (
    <span className={`delta ${diff > 0 ? 'delta--up' : 'delta--down'}`}>
      {diff > 0 ? '↑' : '↓'} {Math.abs(diff)} since last visit
    </span>
  )
}

function NextBrief({ appointment, state, now }: { appointment: DemoAppointment; state: DemoState; now: number }) {
  const wide = useMediaQuery('(min-width: 1100px)')
  const client = getClient(state, appointment.clientId)
  const previous = previousVisit(state, appointment)
  const previousTherapist = getTherapist(state, previous?.therapistId)
  const updates = preVisitUpdates(state, appointment, now)
  const observations = clientObservations(state, appointment.clientId)
  const before = latestByArea(observations, previous?.session?.finishedAt ?? previous?.startsAt)
  const points = sessionPointsFor(state, appointment)
  const started = Boolean(appointment.session?.startedAt && !appointment.session.finishedAt)
  const markers: BodyMarker[] = points.map((point) => ({ area: point.area, pain: point.pain, label: areaLabel(point.region, point.side) }))
  const face = markers.length > 0 && markers.every((marker) => anchorFor(marker.area)?.surface === 'back') ? 'back' : 'front'
  const latest = updates[0]
  const headline = latest ? changesIn(latest, before)[0] : undefined
  const others = latest ? changesIn(latest, before).slice(1) : []

  if (!client) return null
  return (
    <section className="next edge-light rise" aria-labelledby="next-name">
      <div className="next__top">
        <p className="eyebrow next__eyebrow">{started ? 'In session now' : `Up next · ${untilLabel(appointment.startsAt, now)}`}</p>
        <p className="next__time">
          <span className="num gradient-text">{fmtTime(appointment.startsAt)}</span>
          <span>{relativeDay(appointment.startsAt, now)}</span>
        </p>
        <div className="next__who">
          <Portrait name={client.displayName} size="md" />
          <div>
            <h2 id="next-name" className="next__name">
              {client.displayName}
            </h2>
            <p className="next__service">
              {appointment.sessionType} · {appointment.durationMinutes}&nbsp;min
            </p>
          </div>
        </div>
      </div>

      <div className="next__body">
        <div className="next__changes">
          {latest && headline ? (
            <>
              <p className="next__label">Since the last visit</p>
              <div className="next__headline">
                <span className="next__area">{headline.label}</span>
                <PainChip score={headline.pain} large />
                <Delta change={headline} />
              </div>
              <p className="next__when">
                {relativeWhen(latest.observedAt, now)} · {SOURCE_SHORT[latest.source]}
              </p>
              {others.length ? (
                <ul className="next__more">
                  {others.map((change) => (
                    <li key={change.key}>
                      {change.label} <PainChip score={change.pain} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {updates.length > 1 ? (
                <ul className="next__earlier" aria-label="Earlier updates">
                  {updates.slice(1, 3).map((observation) => (
                    <li key={observation.id}>
                      <span>{relativeWhen(observation.observedAt, now)}</span>
                      {observation.entries.slice(0, 2).map((entry) => (
                        <span key={`${entry.region}:${entry.side}`} className="next__earlier-entry">
                          {areaLabel(entry.region, entry.side)} {entry.pain}/10
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <>
              <p className="next__label">Since the last visit</p>
              <p className="next__quiet">No new update from {client.preferredName} yet. The areas from the last visit are shown.</p>
            </>
          )}
          {previous ? (
            <p className="next__previous">
              Last visit {dayPhrase(previous.startsAt, now)} with{' '}
              {previous.therapistId === appointment.therapistId ? 'you' : (previousTherapist?.preferredName ?? 'the team')}
            </p>
          ) : null}
        </div>
        <div className="next__figure">
          {wide ? (
            <BodyStage face={face} variant="compact" markers={markers} label={`${client.preferredName}'s reported areas`} />
          ) : (
            <BodyThumb face={face} markers={markers} label={`${client.preferredName}'s reported areas`} />
          )}
        </div>
      </div>

      {latest?.note ? <blockquote className="next__quote">“{latest.note}”</blockquote> : null}

      <div className="next__actions">
        {!appointment.arrival ? (
          <Link className="button button--primary button--lg" to={`/therapist/arrival/${appointment.id}`}>
            <ClipboardCheck size={19} aria-hidden="true" /> Begin arrival
          </Link>
        ) : (
          <Link className="button button--primary button--lg" to={`/therapist/session/${appointment.id}`}>
            <Timer size={19} aria-hidden="true" /> {started ? 'Return to Session Mode' : 'Open Session Mode'}
          </Link>
        )}
        <Link className="button button--secondary button--lg" to={`/therapist/clients/${appointment.clientId}`}>
          <History size={19} aria-hidden="true" /> History
        </Link>
      </div>
    </section>
  )
}

function Schedule({ appointments, state, now }: { appointments: DemoAppointment[]; state: DemoState; now: number }) {
  const days = new Map<string, DemoAppointment[]>()
  for (const item of appointments.slice(0, 8)) {
    const key = relativeDay(item.startsAt, now)
    days.set(key, [...(days.get(key) ?? []), item])
  }
  return (
    <section className="day glass" aria-labelledby="day-title">
      <div className="day__head">
        <h2 id="day-title" className="title-md">
          Coming up
        </h2>
        <Link to="/therapist/calendar" className="day__all">
          Calendar <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
      {appointments.length ? (
        [...days.entries()].map(([day, items]) => (
          <div key={day} className="day__group">
            <p className="day__label">{day}</p>
            <ol className="day__list">
              {items.map((item) => {
                const client = getClient(state, item.clientId)
                const update = preVisitUpdates(state, item, now)[0]
                const top = update?.entries.slice().sort((a, b) => b.pain - a.pain)[0]
                return (
                  <li key={item.id}>
                    <Link to={`/therapist/clients/${item.clientId}`} className="day__row">
                      <span className="day__time num">{fmtTime(item.startsAt)}</span>
                      <Portrait name={client?.displayName ?? ''} size="sm" />
                      <span className="day__who">
                        <strong>{client?.displayName}</strong>
                        <span>
                          {item.sessionType} · {item.durationMinutes} min
                        </span>
                      </span>
                      {top ? <PainChip score={top.pain} /> : null}
                    </Link>
                  </li>
                )
              })}
            </ol>
          </div>
        ))
      ) : (
        <p className="muted small">Nothing else booked this week.</p>
      )}
    </section>
  )
}

function NeedsYou({ therapistId, state, now }: { therapistId: string; state: DemoState; now: number }) {
  const myClients = new Set(state.therapists.find((item) => item.id === therapistId)?.assignedClientIds ?? [])
  const reports = state.reports.filter((report) => report.preparedBy === therapistId && report.status !== 'draft' && report.status !== 'withdrawn')
  const followUps = state.followUps
    .filter((item) => myClients.has(item.clientId) && daysBetween(item.respondedAt, now) <= 2)
    .sort((a, b) => b.respondedAt.localeCompare(a.respondedAt))
    .slice(0, 3)
  if (!reports.length && !followUps.length) return null
  return (
    <section className="needs glass" aria-labelledby="needs-title">
      <h2 id="needs-title" className="title-md">
        Recent replies
      </h2>
      <ul className="needs__list">
        {reports.map((report) => (
          <li key={report.id}>
            <Link to={`/therapist/clients/${report.clientId}/report/${report.id}`} className="needs__row">
              <span className="needs__icon" aria-hidden="true">
                <FileText size={18} />
              </span>
              <span>
                <strong>{getClient(state, report.clientId)?.preferredName}’s report</strong>
                <span>{report.status === 'consented' ? 'Agreed — ready to download' : 'Waiting for the client to agree'}</span>
              </span>
            </Link>
          </li>
        ))}
        {followUps.map((item) => (
          <li key={item.id}>
            <Link to={`/therapist/clients/${item.clientId}`} className="needs__row">
              <span className="needs__icon needs__icon--cool" aria-hidden="true">
                <MessageCircleHeart size={18} />
              </span>
              <span>
                <strong>
                  {getClient(state, item.clientId)?.preferredName}: {SESSION_RESPONSE_LABEL[`${item.response}`].toLocaleLowerCase()}
                </strong>
                <span>Next-day reply · {fmtDay(item.respondedAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
