import { ArrowLeft, FileText, Lock, Pencil, Stethoscope } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Textarea } from '@/components/design-system/FormField'
import { PainChip } from '@/components/ui/PainChip'
import { Portrait } from '@/components/ui/Portrait'
import { Segmented } from '@/components/ui/Segmented'
import {
  OBSERVATION_SOURCE_LABEL,
  SESSION_RESPONSE_LABEL,
  areaKeyLabel,
  areaLabel,
  lastReportedAt,
  latestByArea,
  type NoteVisibility,
} from '@/domain/care'
import type { DemoState } from '@/data/demo/model'
import type { DemoStore } from '@/data/demo/store'
import {
  clientAppointments,
  clientBonus,
  clientObservations,
  getClient,
  getTherapist,
  isUpcoming,
} from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { therapistCanAccessClient, therapistsForClient } from '@/data/demo/team'
import { useAuth } from '@/features/auth/auth-context'
import { BodyStage, type BodyMarker } from '@/features/body/BodyStage'
import { anchorFor } from '@/features/body/anchors'
import { ProgressPhotos } from '@/features/photos/ProgressPhotos'
import { ProgressExplorer } from '@/features/progress/ProgressExplorer'
import {
  dayPhrase,
  daysBetween,
  fmtDate,
  fmtDay,
  fmtTime,
  minutesLabel,
  relativeDay,
  relativeWhen,
} from '@/lib/formatting/time'
import './profile.css'

type Tab = 'overview' | 'history' | 'progress' | 'notes'

function ageOf(dateOfBirth: string, now = new Date()) {
  const [year, month, day] = dateOfBirth.split('-').map(Number)
  if (!year || !month || !day) return null
  let age = now.getFullYear() - year
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1
  return age
}

export function ClientProfilePage() {
  const { clientId = '' } = useParams()
  const auth = useAuth()
  const navigate = useNavigate()
  const state = useDemoStore()
  const client = getClient(state, clientId)
  const [tab, setTab] = useState<Tab>('overview')
  const allowed = therapistCanAccessClient(state, auth.demoTherapistId, clientId)

  if (!client || !allowed) {
    return (
      <div className="page">
        <Link to="/therapist/clients" className="back-link">
          <ArrowLeft size={18} aria-hidden="true" /> Clients
        </Link>
        <p className="empty">This client isn’t assigned to you.</p>
      </div>
    )
  }

  const team = therapistsForClient(state, clientId)
  const age = ageOf(client.dateOfBirth)

  return (
    <div className="page profile">
      <Link to="/therapist/clients" className="back-link">
        <ArrowLeft size={18} aria-hidden="true" /> Clients
      </Link>
      <header className="profile__head">
        <div className="profile__identity">
          <Portrait name={client.displayName} size="lg" />
          <div>
            <p className="eyebrow">{age !== null ? `${age} · ` : ''}Synthetic client</p>
            <h1 className="title-lg">{client.displayName}</h1>
            <div className="profile__team" aria-label="Care team">
              {team.map((member) => (
                <span key={member.id} className="profile__member">
                  <Portrait name={member.displayName} portrait={member.portrait} size="xs" />
                  {member.preferredName}
                </span>
              ))}
            </div>
          </div>
        </div>
        <Button
          icon={<Stethoscope size={18} />}
          onClick={() => navigate(`/therapist/clients/${client.id}/report`)}
        >
          Prepare report for a doctor
        </Button>
      </header>

      <Segmented
        className="profile__tabs"
        label="Client sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'history', label: 'History' },
          { value: 'progress', label: 'Progress' },
          { value: 'notes', label: 'Notes' },
        ]}
      />

      {tab === 'overview' ? (
        <>
          <Overview clientId={client.id} state={state} onTab={setTab} />
          <ProgressPhotos client={client} />
        </>
      ) : null}
      {tab === 'history' ? <History clientId={client.id} state={state} /> : null}
      {tab === 'progress' ? <ProgressExplorer clientId={client.id} audience="therapist" /> : null}
      {tab === 'notes' ? (
        <Notes clientId={client.id} state={state} therapistId={auth.demoTherapistId ?? ''} />
      ) : null}
    </div>
  )
}

function Overview({
  clientId,
  state,
  onTab,
}: {
  clientId: string
  state: DemoState
  onTab: (tab: Tab) => void
}) {
  const now = Date.now()
  const observations = clientObservations(state, clientId)
  // Recent means recorded or confirmed as still accurate in the last 30 days; the score keeps its own date.
  const confirmations = state.confirmations.filter((item) => item.clientId === clientId)
  const latest = [...latestByArea(observations, undefined, confirmations).values()].filter(
    (point) => daysBetween(lastReportedAt(point, now), now) <= 30 && point.pain > 0,
  )
  const upcoming = clientAppointments(state, clientId).find((item) => isUpcoming(item, now))
  const upcomingTherapist = getTherapist(state, upcoming?.therapistId)
  const bonus = clientBonus(state, clientId)
  const markers: BodyMarker[] = latest.map((point) => ({
    area: point.area,
    pain: point.pain,
    label: areaLabel(point.region, point.side),
    detail: relativeDay(point.observedAt, now),
  }))
  const face =
    markers.length && markers.every((marker) => anchorFor(marker.area)?.surface === 'back')
      ? 'back'
      : 'front'
  const reports = state.reports.filter((report) => report.clientId === clientId)

  return (
    <div className="profile__overview">
      <section className="profile__figure card" aria-label="Latest reported areas">
        <BodyStage face={face} variant="compact" markers={markers} label="Latest reported areas" />
      </section>
      <div className="stack">
        <section className="card" aria-labelledby="latest-areas">
          <h2 id="latest-areas" className="eyebrow">
            Latest by area · last 30 days
          </h2>
          <ul className="list profile__latest">
            {latest.length ? (
              latest
                .sort((a, b) => b.pain - a.pain)
                .map((point) => (
                  <li key={point.area}>
                    <div>
                      <strong>{areaKeyLabel(point.area)}</strong>
                      <span className="small muted">
                        {relativeWhen(point.observedAt, now)} ·{' '}
                        {OBSERVATION_SOURCE_LABEL[point.source]}
                        {lastReportedAt(point, now) > Date.parse(point.observedAt)
                          ? ` · confirmed at arrival ${dayPhrase(lastReportedAt(point, now), now)}`
                          : null}
                      </span>
                      {point.note ? <q className="small">{point.note}</q> : null}
                    </div>
                    <PainChip score={point.pain} />
                  </li>
                ))
            ) : (
              <li className="muted">No discomfort recorded in the last 30 days.</li>
            )}
          </ul>
          <button type="button" className="link-button" onClick={() => onTab('history')}>
            Full history
          </button>
        </section>
        <section className="card" aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" className="eyebrow">
            Next visit
          </h2>
          {upcoming ? (
            <p className="profile__next">
              {relativeDay(upcoming.startsAt, now)} {fmtTime(upcoming.startsAt)} with{' '}
              {upcomingTherapist?.preferredName} · {minutesLabel(upcoming.durationMinutes)}
            </p>
          ) : (
            <p className="muted">Nothing booked.</p>
          )}
          <p className="small muted">
            Extra care across visits: {minutesLabel(bonus.lifetimeMinutes)}
            {bonus.byTherapist
              .map(
                (item) =>
                  ` · ${getTherapist(state, item.therapistId)?.preferredName} ${item.minutes}`,
              )
              .join('')}
          </p>
        </section>
        {reports.length ? (
          <section className="card" aria-labelledby="reports-title">
            <h2 id="reports-title" className="eyebrow">
              Reports for a doctor
            </h2>
            <ul className="list">
              {reports.map((report) => (
                <li key={report.id} className="profile__report">
                  <Link to={`/therapist/clients/${clientId}/report/${report.id}`}>
                    <FileText size={18} aria-hidden="true" />
                    <span>
                      {report.recipient} · {fmtDay(report.updatedAt)}
                    </span>
                    <Badge
                      tone={
                        report.status === 'consented'
                          ? 'favourable'
                          : report.status === 'awaiting_consent'
                            ? 'pending'
                            : 'neutral'
                      }
                    >
                      {report.status === 'consented'
                        ? 'Consent given'
                        : report.status === 'awaiting_consent'
                          ? 'Awaiting consent'
                          : report.status === 'withdrawn'
                            ? 'Withdrawn'
                            : 'Draft'}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}

type HistoryItem =
  { kind: 'visit'; at: string; id: string } | { kind: 'observation'; at: string; id: string }

function History({ clientId, state }: { clientId: string; state: DemoState }) {
  const now = Date.now()
  const visits = clientAppointments(state, clientId).filter((item) => item.status === 'completed')
  const between = clientObservations(state, clientId).filter((item) => item.source === 'home')
  const items: HistoryItem[] = [
    ...visits.map((visit) => ({ kind: 'visit' as const, at: visit.startsAt, id: visit.id })),
    ...between.map((observation) => ({
      kind: 'observation' as const,
      at: observation.observedAt,
      id: observation.id,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <ol className="timeline">
      {items.map((item) => {
        if (item.kind === 'observation') {
          const observation = between.find((entry) => entry.id === item.id)
          if (!observation) return null
          return (
            <li key={item.id} className="timeline__item timeline__item--home">
              <span className="timeline__when">{relativeWhen(observation.observedAt, now)}</span>
              <div className="timeline__body">
                <strong>Logged at home</strong>
                <div className="row row--wrap">
                  {observation.entries.map((entry) => (
                    <span key={`${entry.region}:${entry.side}`} className="timeline__entry">
                      {areaLabel(entry.region, entry.side)} <PainChip score={entry.pain} />
                    </span>
                  ))}
                </div>
                {observation.note ? <q>{observation.note}</q> : null}
              </div>
            </li>
          )
        }
        const visit = visits.find((entry) => entry.id === item.id)
        if (!visit) return null
        const therapist = getTherapist(state, visit.therapistId)
        const arrival = state.observations.find(
          (entry) => entry.appointmentId === visit.id && entry.source === 'arrival',
        )
        const confirmations = state.confirmations.filter(
          (entry) => entry.appointmentId === visit.id,
        )
        const follow = state.followUps.find((entry) => entry.appointmentId === visit.id)
        const credit = state.bonusCredits.find((entry) => entry.appointmentId === visit.id)
        return (
          <li key={item.id} className="timeline__item timeline__item--visit">
            <span className="timeline__when">{fmtDate(visit.startsAt)}</span>
            <div className="timeline__body">
              <div className="row">
                <Portrait
                  name={therapist?.displayName ?? ''}
                  portrait={therapist?.portrait}
                  size="xs"
                />
                <strong>
                  Visit with {therapist?.preferredName} · {visit.sessionType}
                </strong>
              </div>
              <p className="small muted">
                Booked {visit.session?.summary?.bookedMinutes ?? visit.durationMinutes} · actual{' '}
                {visit.session?.summary?.actualMinutes ?? '—'} min
                {credit && credit.minutes > 0
                  ? ` · ${minutesLabel(credit.minutes)} extra care`
                  : ''}
              </p>
              <div className="row row--wrap">
                {arrival?.entries.map((entry) => (
                  <span key={`${entry.region}:${entry.side}`} className="timeline__entry">
                    {areaLabel(entry.region, entry.side)} <PainChip score={entry.pain} />{' '}
                    <small className="muted">at arrival</small>
                  </span>
                ))}
                {confirmations.map((entry) => (
                  <span key={entry.id} className="timeline__entry">
                    {areaKeyLabel(entry.area)}{' '}
                    <small className="muted">confirmed from an earlier entry</small>
                  </span>
                ))}
              </div>
              {follow ? (
                <p className="small">
                  Next day: <strong>{SESSION_RESPONSE_LABEL[`${follow.response}`]}</strong>
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Notes({
  clientId,
  state,
  therapistId,
}: {
  clientId: string
  state: DemoStore
  therapistId: string
}) {
  const [filter, setFilter] = useState<'all' | NoteVisibility>('all')
  const [draft, setDraft] = useState('')
  const [visibility, setVisibility] = useState<NoteVisibility>('private')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const notes = useMemo(
    () =>
      state.notes
        .filter(
          (note) => note.clientId === clientId && (filter === 'all' || note.visibility === filter),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.notes, clientId, filter],
  )

  return (
    <div className="profile__notes">
      <section className="card stack" aria-labelledby="new-note">
        <h2 id="new-note" className="title-md">
          New note
        </h2>
        <Segmented
          label="Who the note is for"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'private', label: 'Private working note' },
            { value: 'report', label: 'For a doctor’s report' },
          ]}
        />
        <Textarea
          value={draft}
          rows={3}
          maxLength={1200}
          aria-label="Note"
          onChange={(event) => setDraft(event.target.value)}
        />
        <p className="field__hint">
          {visibility === 'private'
            ? 'Private notes stay inside the practice. They are never offered for a report.'
            : 'Written for a doctor. You can pick and edit it when preparing a report; the client sees it before agreeing to share.'}
        </p>
        <Button
          variant="secondary"
          disabled={!draft.trim()}
          onClick={() => {
            state.addNote({ clientId, therapistId, visibility, body: draft })
            setDraft('')
          }}
        >
          Save note
        </Button>
      </section>

      <Segmented
        label="Show notes"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'private', label: 'Private' },
          { value: 'report', label: 'For reports' },
        ]}
      />
      <ul className="list profile__note-list">
        {notes.map((note) => {
          const author = getTherapist(state, note.therapistId)
          const mine = note.therapistId === therapistId
          return (
            <li key={note.id}>
              <div className="row row--between row--wrap">
                <span className="small muted">
                  {fmtDate(note.createdAt)} · {author?.preferredName}
                  {note.updatedAt !== note.createdAt ? ' · edited' : ''}
                </span>
                {note.visibility === 'private' ? (
                  <Badge icon={<Lock size={12} aria-hidden="true" />}>Private · never shared</Badge>
                ) : (
                  <Badge tone="favourable" icon={<Stethoscope size={12} aria-hidden="true" />}>
                    For a doctor’s report
                  </Badge>
                )}
              </div>
              {editing === note.id ? (
                <div className="stack">
                  <Textarea
                    value={editText}
                    rows={3}
                    aria-label="Edit note"
                    onChange={(event) => setEditText(event.target.value)}
                  />
                  <div className="row">
                    <Button
                      size="sm"
                      onClick={() => {
                        state.updateNote(note.id, { body: editText })
                        setEditing(null)
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="profile__note-body">{note.body}</p>
              )}
              {mine && editing !== note.id ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Pencil size={14} />}
                  onClick={() => {
                    setEditing(note.id)
                    setEditText(note.body)
                  }}
                >
                  Edit
                </Button>
              ) : null}
            </li>
          )
        })}
        {!notes.length ? <li className="muted">No notes yet.</li> : null}
      </ul>
    </div>
  )
}
