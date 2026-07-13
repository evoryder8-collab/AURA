import { useQuery } from '@tanstack/react-query'
import { format, isSameDay } from 'date-fns'
import { Clock3, ShieldCheck, UserRound } from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from '@/components/design-system/Badge'
import { Card } from '@/components/design-system/Card'
import { PageHeader } from '@/components/design-system/PageHeader'
import { createAuraRepositories } from '@/data/repositories'
import { useAuth } from '@/features/auth/auth-context'

export function ConnectedTodayPage() {
  const auth = useAuth()
  const repositories = useMemo(() => createAuraRepositories({ mode: 'supabase' }), [])
  const today = useMemo(() => new Date(), [])
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
  const ownAppointments = (appointmentsQuery.data ?? []).filter(
    (appointment) => appointment.therapistUserId === auth.user?.id,
  )
  const todayAppointments = ownAppointments
    .filter((appointment) => isSameDay(new Date(appointment.startsAt), today))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const requests = ownAppointments.filter((appointment) => appointment.status === 'requested')
  const loading = clientsQuery.isLoading || appointmentsQuery.isLoading
  const failed = clientsQuery.isError || appointmentsQuery.isError

  return (
    <div className="today-page">
      <PageHeader
        eyebrow={`Protected team account · ${format(today, 'EEEE · d MMMM yyyy')}`}
        title={
          <>
            A clear view
            <br />
            of your day.
          </>
        }
        lead={`${todayAppointments.length} appointments today · ${requests.length} client-selected ${requests.length === 1 ? 'request' : 'requests'} awaiting review`}
      />

      <Card className="care-continuity" tone="soft">
        <span className="care-continuity__icon" aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div>
          <p className="eyebrow">Assignment-scoped team view</p>
          <h2>Only clients in your active care team appear here</h2>
          <p>
            Each appointment preserves the delivering practitioner while the client’s outcome record
            stays continuous across the practice.
          </p>
        </div>
      </Card>

      {loading ? (
        <Card tone="soft" role="status">
          <p>Loading your assigned clients and protected schedule…</p>
        </Card>
      ) : failed ? (
        <Card tone="soft" role="alert">
          <h2>Your protected schedule is temporarily unavailable</h2>
          <p>No synthetic fallback data has been shown in this connected session.</p>
        </Card>
      ) : (
        <section className="timeline" aria-labelledby="connected-timeline-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your treatment timeline</p>
              <h2 id="connected-timeline-heading">Appointments</h2>
            </div>
            <Badge tone="favourable">{clients.length} assigned clients</Badge>
          </div>
          {todayAppointments.length === 0 ? (
            <Card tone="soft">
              <p>No appointments are set for you today.</p>
            </Card>
          ) : null}
          {todayAppointments.map((appointment) => {
            const client = clients.find((candidate) => candidate.id === appointment.clientId)
            return (
              <article className="timeline-item" key={appointment.id}>
                <div className="timeline-item__time">
                  <strong>{format(new Date(appointment.startsAt), 'HH:mm')}</strong>
                  <span>{appointment.durationMinutes} min</span>
                </div>
                <div className="timeline-item__rail">
                  <i />
                </div>
                <Card className="appointment-card">
                  <div className="appointment-card__top">
                    <div>
                      <div className="appointment-card__badges">
                        <Badge tone={appointment.status === 'requested' ? 'pending' : 'favourable'}>
                          {appointment.status}
                        </Badge>
                        {client?.intakeStatus !== 'complete' ? (
                          <Badge tone="pending">Pending intake</Badge>
                        ) : null}
                      </div>
                      <h3>{client?.preferredName ?? 'Assigned client'}</h3>
                      <p>
                        {appointment.sessionType} · {appointment.room ?? 'Room to confirm'}
                      </p>
                    </div>
                    <div className="appointment-card__phase">
                      <UserRound size={17} />
                      <span>Client-owned record</span>
                      <small>
                        <Clock3 size={12} /> Your appointment
                      </small>
                    </div>
                  </div>
                </Card>
              </article>
            )
          })}
        </section>
      )}
    </div>
  )
}
