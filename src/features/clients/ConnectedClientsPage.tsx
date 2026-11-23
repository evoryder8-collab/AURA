import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Search, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/design-system/Badge'
import { Card } from '@/components/design-system/Card'
import { PageHeader } from '@/components/design-system/PageHeader'
import { Spinner } from '@/components/design-system/Spinner'
import { StatusStrip } from '@/components/feedback/StatusStrip'
import { createAuraRepositories } from '@/data/repositories'
import { useAuth } from '@/features/auth/auth-context'
import { formatDay } from '@/lib/formatting/labels'
import './clients-list.css'

export function ConnectedClientsPage() {
  const auth = useAuth()
  const repositories = useMemo(() => createAuraRepositories({ mode: 'supabase' }), [])
  const [query, setQuery] = useState('')
  const userId = auth.user?.id ?? null
  const clientsQuery = useQuery({
    queryKey: ['connected', userId, 'therapist', 'assigned-clients'],
    enabled: Boolean(userId),
    queryFn: () => repositories.clients.list({ active: true }),
  })
  const appointmentsQuery = useQuery({
    queryKey: ['connected', userId, 'therapist', 'appointments'],
    enabled: Boolean(userId),
    queryFn: () => repositories.appointments.list(),
  })
  const clients = clientsQuery.data ?? []
  const appointments = appointmentsQuery.data ?? []
  const results = clients
    .filter((client) => client.preferredName.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.preferredName.localeCompare(b.preferredName))
  const loading = clientsQuery.isLoading || appointmentsQuery.isLoading
  const failed = clientsQuery.isError || appointmentsQuery.isError

  return (
    <div className="page clients-page">
      <PageHeader
        eyebrow="Practice"
        title="Clients"
        lead={`${clients.length} ${clients.length === 1 ? 'client is' : 'clients are'} assigned to you.`}
      />

      <StatusStrip title="Only your assigned clients">
        The database filters this list by your active client assignments. Belonging to the practice
        alone never shows a client.
      </StatusStrip>

      <div className="client-search">
        <label htmlFor="connected-client-search" className="visually-hidden">
          Search your clients
        </label>
        <Search size={18} aria-hidden="true" />
        <input
          id="connected-client-search"
          className="input"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name"
        />
      </div>

      {loading ? (
        <Spinner label="Loading your assigned clients" />
      ) : failed ? (
        <Card tone="concern" role="alert">
          <h2 className="title-md">Your clients could not be loaded</h2>
          <p className="muted">
            No synthetic fallback data has been shown in this connected session.
          </p>
        </Card>
      ) : (
        <section className="connected-grid" aria-live="polite" aria-label="Assigned clients">
          {results.length === 0 ? (
            <div className="empty">
              <span>No assigned client matches this search.</span>
            </div>
          ) : null}
          {results.map((client) => {
            const clientAppointments = appointments
              .filter((appointment) => appointment.clientId === client.id)
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
            const next = clientAppointments.find(
              (appointment) =>
                new Date(appointment.startsAt) >= new Date() &&
                appointment.status !== 'cancelled' &&
                appointment.status !== 'declined',
            )
            const practitionerCount = new Set(
              clientAppointments.map((appointment) => appointment.therapistUserId).filter(Boolean),
            ).size
            return (
              <Card key={client.id} className="connected-client">
                <div className="connected-client__top">
                  <span className="connected-client__avatar" aria-hidden="true">
                    {client.preferredName[0]}
                  </span>
                  <div className="connected-client__identity">
                    <h2>{client.preferredName}</h2>
                    <span className="small muted">
                      {client.email ?? 'Protected client account'}
                    </span>
                  </div>
                </div>
                <div>
                  <Badge tone={client.intakeStatus === 'complete' ? 'favourable' : 'pending'}>
                    {client.intakeStatus === 'complete' ? 'Intake complete' : 'Intake pending'}
                  </Badge>
                </div>
                <dl className="connected-client__facts">
                  <div>
                    <dt>
                      <CalendarDays size={15} aria-hidden="true" /> Next visit
                    </dt>
                    <dd>{next ? formatDay(next.startsAt) : 'Not scheduled'}</dd>
                  </div>
                  <div>
                    <dt>
                      <UserRound size={15} aria-hidden="true" /> Care team
                    </dt>
                    <dd>
                      {practitionerCount || 1}{' '}
                      {(practitionerCount || 1) === 1 ? 'practitioner' : 'practitioners'}
                    </dd>
                  </div>
                </dl>
              </Card>
            )
          })}
        </section>
      )}
    </div>
  )
}
