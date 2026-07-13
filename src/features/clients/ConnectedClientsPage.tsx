import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Search, ShieldCheck, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/design-system/Badge'
import { Card } from '@/components/design-system/Card'
import { PageHeader } from '@/components/design-system/PageHeader'
import { createAuraRepositories } from '@/data/repositories'
import { useAuth } from '@/features/auth/auth-context'
import { formatDay } from '@/lib/formatting/labels'

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
    <div>
      <PageHeader
        eyebrow="Protected team account · active assignments"
        title={
          <>
            Every journey,
            <br />
            held clearly.
          </>
        }
        lead={`${clients.length} client ${clients.length === 1 ? 'record is' : 'records are'} currently assigned to your care team account`}
      />

      <Card className="care-continuity" tone="soft">
        <span className="care-continuity__icon" aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div>
          <p className="eyebrow">Backend-authorized access</p>
          <h2>Practice membership alone never exposes a client</h2>
          <p>This directory is filtered by active therapist–client assignments in the database.</p>
        </div>
      </Card>

      <div className="client-toolbar">
        <label className="client-search">
          <Search size={18} />
          <span className="sr-only">Search assigned clients</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assigned clients…"
          />
        </label>
      </div>

      {loading ? (
        <Card tone="soft" role="status">
          <p>Loading your assigned client records…</p>
        </Card>
      ) : failed ? (
        <Card tone="soft" role="alert">
          <h2>Assigned clients are temporarily unavailable</h2>
          <p>No synthetic fallback data has been shown in this connected session.</p>
        </Card>
      ) : (
        <section className="client-grid" aria-live="polite">
          {results.length === 0 ? (
            <Card tone="soft">
              <p>No assigned client matches this search.</p>
            </Card>
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
              <Card key={client.id} className="client-card">
                <div className="client-card__top">
                  <div className="client-avatar" aria-hidden="true">
                    {client.preferredName[0]}
                  </div>
                  <div className="client-card__identity">
                    <div>
                      <Badge tone={client.intakeStatus === 'complete' ? 'favourable' : 'pending'}>
                        {client.intakeStatus === 'complete' ? 'Intake complete' : 'Intake pending'}
                      </Badge>
                    </div>
                    <h2>{client.preferredName}</h2>
                    <span>{client.email ?? 'Protected client account'}</span>
                  </div>
                  <UserRound size={24} aria-label="Assigned client" />
                </div>
                <div className="client-card__dates">
                  <div>
                    <CalendarDays size={15} />
                    <span>
                      Next visit{' '}
                      <strong>{next ? formatDay(next.startsAt) : 'Not scheduled'}</strong>
                    </span>
                  </div>
                  <div>
                    <UserRound size={15} />
                    <span>
                      Care continuity{' '}
                      <strong>
                        {practitionerCount || 1}{' '}
                        {(practitionerCount || 1) === 1 ? 'practitioner' : 'practitioners'}
                      </strong>
                    </span>
                  </div>
                </div>
              </Card>
            )
          })}
        </section>
      )}
    </div>
  )
}
