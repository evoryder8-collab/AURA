import { ChevronRight, Search } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/design-system/PageHeader'
import { PainChip } from '@/components/ui/PainChip'
import { Portrait } from '@/components/ui/Portrait'
import type { DemoClient, DemoState } from '@/data/demo/model'
import {
  clientAppointments,
  clientObservations,
  nextAppointment,
  preVisitUpdates,
} from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { clientsAssignedToTherapist, therapistsForClient } from '@/data/demo/team'
import { areaLabel, updatesBetween, type PainEntry } from '@/domain/care'
import { evaluateConsentGuard } from '@/domain/rules'
import { useAuth } from '@/features/auth/auth-context'
import { fmtTime, relativeDay } from '@/lib/formatting/time'
import { demoConsentRecords } from '@/lib/security/demoConsent'
import './clients-list.css'

function clientSummary(state: DemoState, client: DemoClient, now: number) {
  const visits = clientAppointments(state, client.id)
  const next = nextAppointment(visits, now)
  const lastVisit = visits.filter((item) => item.status === 'completed').at(-1)
  const healthAllowed = evaluateConsentGuard({
    action: 'read_health_data',
    actorRole: 'therapist',
    actorClientId: null,
    targetClientId: client.id,
    therapistCanAccessClient: true,
    consents: demoConsentRecords(client),
    freshAuthenticationAt: null,
  }).allowed
  // Same window as the visit preview: everything reported since the client's last visit.
  const updates = !healthAllowed
    ? []
    : next
      ? preVisitUpdates(state, next, now)
      : updatesBetween(
          clientObservations(state, client.id),
          lastVisit?.session?.finishedAt ?? lastVisit?.startsAt,
          new Date(now).toISOString(),
        )
  return { next, lastVisit, healthAllowed, updates }
}

export function ClientsPage() {
  const auth = useAuth()
  const state = useDemoStore()
  const [now] = useState(() => Date.now())
  const [query, setQuery] = useState('')
  const searchId = useId()

  const rows = clientsAssignedToTherapist(state, auth.demoTherapistId)
    .map((client) => ({ client, ...clientSummary(state, client, now) }))
    .sort(
      (a, b) =>
        (a.next ? Date.parse(a.next.startsAt) : Infinity) -
          (b.next ? Date.parse(b.next.startsAt) : Infinity) ||
        a.client.displayName.localeCompare(b.client.displayName),
    )
  const needle = query.trim().toLocaleLowerCase()
  const results = needle
    ? rows.filter((row) => row.client.displayName.toLocaleLowerCase().includes(needle))
    : rows
  const therapistName = (id: string) =>
    id === auth.demoTherapistId
      ? 'you'
      : (state.therapists.find((item) => item.id === id)?.preferredName ?? 'another therapist')

  return (
    <div className="page clients-page">
      <PageHeader
        eyebrow="Practice"
        title="Clients"
        lead={`${rows.length} ${rows.length === 1 ? 'client is' : 'clients are'} assigned to you.`}
      />

      <div className="client-search">
        <label htmlFor={searchId} className="visually-hidden">
          Search your clients
        </label>
        <Search size={18} aria-hidden="true" />
        <input
          id={searchId}
          className="input"
          type="search"
          placeholder="Search by name"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {needle ? `${results.length} of ${rows.length} clients match.` : ''}
      </p>

      {rows.length === 0 ? (
        <div className="empty">
          <strong>No clients are assigned to you yet.</strong>
          <span>Clients appear here once they are added to your care.</span>
        </div>
      ) : results.length === 0 ? (
        <div className="empty">
          <strong>No client matches “{query.trim()}”.</strong>
          <span>Check the spelling or clear the search.</span>
        </div>
      ) : (
        <ul className="client-rows">
          {results.map(({ client, next, lastVisit, healthAllowed, updates }) => {
            const latest = updates[0]
            const peak = latest?.entries.reduce<PainEntry | undefined>(
              (top, entry) => (!top || entry.pain > top.pain ? entry : top),
              undefined,
            )
            const team = therapistsForClient(state, client.id)
            return (
              <li key={client.id}>
                <Link className="client-row" to={`/therapist/clients/${client.id}`}>
                  <span className="client-row__who">
                    <strong className="client-row__name">{client.displayName}</strong>
                    <span className="client-row__team">
                      <span className="client-row__portraits">
                        {team.map((therapist) => (
                          <Portrait
                            key={therapist.id}
                            name={therapist.displayName}
                            portrait={therapist.portrait}
                            size="xs"
                          />
                        ))}
                      </span>
                      <span className="small muted">
                        <span className="visually-hidden">Care team: </span>
                        {team.map((therapist) => therapist.preferredName).join(', ')}
                      </span>
                    </span>
                  </span>

                  <span className="client-row__fact">
                    <span className="eyebrow">Next visit</span>
                    <span>
                      {next ? (
                        <>
                          {relativeDay(next.startsAt, now)} ·{' '}
                          <span className="num">{fmtTime(next.startsAt)}</span>
                          <span className="muted"> with {therapistName(next.therapistId)}</span>
                        </>
                      ) : (
                        <span className="muted">Not booked</span>
                      )}
                    </span>
                  </span>

                  <span className="client-row__fact">
                    <span className="eyebrow">Since last visit</span>
                    {!healthAllowed ? (
                      <span className="muted">Health details are not shared</span>
                    ) : latest && peak ? (
                      <span className="client-row__update">
                        <PainChip score={peak.pain} />
                        <span>
                          {areaLabel(peak.region, peak.side)}
                          <span className="muted">
                            {' '}
                            · {relativeDay(latest.observedAt, now)}
                            {updates.length > 1 ? ` · ${updates.length} updates` : ''}
                          </span>
                        </span>
                      </span>
                    ) : (
                      <span className="muted">
                        {lastVisit
                          ? `No updates since ${relativeDay(lastVisit.startsAt, now)}`
                          : 'No updates yet'}
                      </span>
                    )}
                  </span>

                  <ChevronRight className="client-row__go" size={18} aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
