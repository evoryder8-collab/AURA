import { useQuery } from '@tanstack/react-query'
import { format, isSameDay } from 'date-fns'
import { Clock3 } from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from '@/components/design-system/Badge'
import { Card } from '@/components/design-system/Card'
import { PageHeader } from '@/components/design-system/PageHeader'
import { Spinner } from '@/components/design-system/Spinner'
import { StatusStrip } from '@/components/feedback/StatusStrip'
import { createAuraRepositories } from '@/data/repositories'
import { useAuth } from '@/features/auth/auth-context'
import './connected-today.css'

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
    <div className="page connected-today">
      <PageHeader
        eyebrow={format(today, 'EEEE d MMMM yyyy')}
        title="Today"
        lead={`${todayAppointments.length} ${todayAppointments.length === 1 ? 'appointment' : 'appointments'} today · ${requests.length} ${requests.length === 1 ? 'request' : 'requests'} from clients awaiting review`}
      />

      <StatusStrip title="Only clients assigned to you appear here">
        Each appointment keeps the practitioner who gave it, while the client’s record stays
        continuous across the practice.
      </StatusStrip>

      {loading ? (
        <Spinner label="Loading your schedule" />
      ) : failed ? (
        <Card tone="concern" role="alert">
          <h2 className="title-md">Your schedule could not be loaded</h2>
          <p className="muted">
            No synthetic fallback data has been shown in this connected session.
          </p>
        </Card>
      ) : (
        <section className="stack" aria-labelledby="connected-timeline-heading">
          <div className="row row--between row--wrap">
            <h2 id="connected-timeline-heading" className="title-md">
              Appointments
            </h2>
            <Badge tone="favourable">
              {clients.length} assigned {clients.length === 1 ? 'client' : 'clients'}
            </Badge>
          </div>
          {todayAppointments.length === 0 ? (
            <div className="empty">
              <span>No appointments are set for you today.</span>
            </div>
          ) : (
            <ol className="connected-today__list">
              {todayAppointments.map((appointment) => {
                const client = clients.find((candidate) => candidate.id === appointment.clientId)
                return (
                  <li className="connected-today__item" key={appointment.id}>
                    <div className="connected-today__time">
                      <strong className="num">
                        {format(new Date(appointment.startsAt), 'HH:mm')}
                      </strong>
                      <span className="small muted">{appointment.durationMinutes} min</span>
                    </div>
                    <Card className="connected-today__card">
                      <div className="row row--wrap">
                        <Badge tone={appointment.status === 'requested' ? 'pending' : 'favourable'}>
                          {appointment.status}
                        </Badge>
                        {client?.intakeStatus !== 'complete' ? (
                          <Badge tone="pending">Intake pending</Badge>
                        ) : null}
                      </div>
                      <h3 className="title-md">{client?.preferredName ?? 'Assigned client'}</h3>
                      <p className="small muted">
                        <Clock3 size={13} aria-hidden="true" /> {appointment.sessionType} ·{' '}
                        {appointment.room ?? 'Room to confirm'}
                      </p>
                    </Card>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      )}
    </div>
  )
}
