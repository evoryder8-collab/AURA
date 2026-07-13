import { format } from 'date-fns'
import { CheckCircle2, Gift, LockKeyhole } from 'lucide-react'
import { Badge } from '@/components/design-system/Badge'
import { Card } from '@/components/design-system/Card'
import { PageHeader } from '@/components/design-system/PageHeader'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'

export function ClientHistoryPage() {
  const auth = useAuth()
  const allAppointments = useDemoStore((state) => state.appointments)
  const appointments = allAppointments
    .filter((item) => item.clientId === auth.demoClientId && item.status === 'completed')
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  return (
    <div>
      <PageHeader
        eyebrow="Appointment history"
        title={
          <>
            Your recorded
            <br />
            visits.
          </>
        }
        lead="Client-safe summaries only. Raw therapist notes and assessments remain private."
      />
      <div className="history-list">
        {appointments.map((appointment) => (
          <Card key={appointment.id}>
            <div className="history-list__date">
              <span>{format(new Date(appointment.startsAt), 'MMM')}</span>
              <strong>{format(new Date(appointment.startsAt), 'd')}</strong>
            </div>
            <div>
              <Badge tone="favourable" icon={<CheckCircle2 size={12} />}>
                Completed
              </Badge>
              <h2>{appointment.sessionType}</h2>
              <p>{format(new Date(appointment.startsAt), 'EEEE, d MMMM yyyy · HH:mm')}</p>
              <div className="history-safe-note">
                <LockKeyhole size={14} />{' '}
                {appointment.session?.response
                  ? `Recorded response: ${appointment.session.response}`
                  : 'No client response recorded'}
              </div>
            </div>
            <div className="history-bonus">
              <Gift size={17} />
              <strong>+{appointment.session?.bonusMinutes ?? 0} min</strong>
              <span>Bonus Care</span>
            </div>
          </Card>
        ))}
        {!appointments.length && (
          <Card tone="soft">
            <p>Your completed visits will appear here.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
