import { format, isSameDay, startOfWeek, addDays } from 'date-fns'
import {
  AlertTriangle,
  ArrowRight,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock3,
  FilePenLine,
  Play,
  Sparkles,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { PageHeader } from '@/components/design-system/PageHeader'
import { StatusStrip } from '@/components/feedback/StatusStrip'
import { useDemoStore } from '@/data/demo/store'
import { deriveClientMetrics } from '@/data/demo/derive'
import { QuickAppointmentModal } from '@/features/appointments/QuickAppointmentModal'
import { IntakeFlow } from '@/features/intake/IntakeFlow'
import { formatTime, patternLabel } from '@/lib/formatting/labels'

export function TodayPage() {
  const clients = useDemoStore((state) => state.clients)
  const appointments = useDemoStore((state) => state.appointments)
  const updateAppointment = useDemoStore((state) => state.updateAppointment)
  const [createOpen, setCreateOpen] = useState(false)
  const [intakeClientId, setIntakeClientId] = useState<string | null>(null)
  const [view, setView] = useState<'day' | 'week'>('day')
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])
  const dayAppointments = useMemo(
    () =>
      appointments
        .filter((item) => isSameDay(new Date(item.startsAt), today))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [appointments, today],
  )
  const requested = appointments.filter((item) => item.status === 'requested')
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })

  return (
    <div className="today-page">
      <PageHeader
        eyebrow={format(today, 'EEEE · d MMMM yyyy')}
        title={
          <>
            A clear view
            <br />
            of today.
          </>
        }
        lead={`${dayAppointments.length} appointments · ${requested.length} request awaiting a response`}
        actions={
          <>
            <div className="segmented">
              <button className={view === 'day' ? 'is-active' : ''} onClick={() => setView('day')}>
                Day
              </button>
              <button
                className={view === 'week' ? 'is-active' : ''}
                onClick={() => setView('week')}
              >
                Week
              </button>
            </div>
            <Button icon={<CalendarPlus size={17} />} onClick={() => setCreateOpen(true)}>
              New appointment
            </Button>
          </>
        }
      />

      {view === 'week' ? (
        <section className="week-overview" aria-label="Week overview">
          {Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).map((day) => {
            const items = appointments.filter((item) => isSameDay(new Date(item.startsAt), day))
            return (
              <button
                key={day.toISOString()}
                className={isSameDay(day, today) ? 'is-today' : ''}
                onClick={() => setView('day')}
              >
                <span>{format(day, 'EEE')}</span>
                <strong>{format(day, 'd')}</strong>
                <small>
                  {items.length} {items.length === 1 ? 'visit' : 'visits'}
                </small>
                <i>
                  {items.map((item) => (
                    <em key={item.id} />
                  ))}
                </i>
              </button>
            )
          })}
        </section>
      ) : (
        <div className="today-grid">
          <section className="timeline" aria-labelledby="timeline-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Treatment timeline</p>
                <h2 id="timeline-heading">Appointments</h2>
              </div>
              <Badge tone="favourable" icon={<Sparkles size={13} />}>
                Demo schedule
              </Badge>
            </div>
            {dayAppointments.length === 0 && (
              <Card tone="soft">
                <p>No appointments are set for today.</p>
                <Button onClick={() => setCreateOpen(true)}>Create the first appointment</Button>
              </Card>
            )}
            {dayAppointments.map((appointment, index) => {
              const client = clients.find((item) => item.id === appointment.clientId)
              if (!client) return null
              const derived = deriveClientMetrics(client)
              const pending = appointment.intakeStatus !== 'complete'
              const current = index === 0
              return (
                <article
                  className={`timeline-item${current ? ' is-current' : ''}`}
                  key={appointment.id}
                >
                  <div className="timeline-item__time">
                    <strong>{formatTime(appointment.startsAt)}</strong>
                    <span>{appointment.durationMinutes} min</span>
                  </div>
                  <div className="timeline-item__rail">
                    <i />
                  </div>
                  <Card className="appointment-card">
                    <div className="appointment-card__top">
                      <div>
                        <div className="appointment-card__badges">
                          {current && <Badge tone="gold">Current focus</Badge>}
                          {pending && <Badge tone="pending">Pending Intake</Badge>}
                          {client.reviewProgress && (
                            <Badge tone="concern" icon={<AlertTriangle size={12} />}>
                              Review Progress
                            </Badge>
                          )}
                        </div>
                        <h3>{client.preferredName}</h3>
                        <p>
                          {appointment.sessionType} · {appointment.room}
                        </p>
                      </div>
                      <div className="appointment-card__phase">
                        <span>{patternLabel[derived.pattern]}</span>
                        <small>{derived.confidence}% confidence</small>
                      </div>
                    </div>
                    {client.caution && (
                      <StatusStrip
                        tone={client.reviewProgress ? 'concern' : 'caution'}
                        title={client.caution.label}
                      >
                        {client.caution.fact}
                      </StatusStrip>
                    )}
                    <div className="appointment-card__goal">
                      <span>Functional focus</span>
                      <strong>
                        {client.goals[0]?.wording ?? 'Set a functional goal during intake'}
                      </strong>
                    </div>
                    <div className="appointment-card__actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        iconAfter={<ChevronRight size={15} />}
                        onClick={() => navigate(`/therapist/clients/${client.id}`)}
                      >
                        Open dashboard
                      </Button>
                      {pending ? (
                        <Button
                          size="sm"
                          icon={<FilePenLine size={16} />}
                          onClick={() => setIntakeClientId(client.id)}
                        >
                          Complete Intake
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          icon={<Play size={15} />}
                          onClick={() => navigate(`/therapist/session/${appointment.id}`)}
                        >
                          Start Massage
                        </Button>
                      )}
                    </div>
                  </Card>
                </article>
              )
            })}
          </section>

          <aside className="today-aside">
            <Card tone="dark" eyebrow="Next transition" title="Space to reset">
              <div className="breathing-mark" aria-hidden="true">
                <span />
              </div>
              <p>
                Your next confirmed session begins at{' '}
                {dayAppointments[1] ? formatTime(dayAppointments[1].startsAt) : '—'}.
              </p>
              <div className="stat-row">
                <div className="stat">
                  <span className="stat__label">Today</span>
                  <span className="stat__value">
                    {dayAppointments.reduce((sum, item) => sum + item.durationMinutes, 0)}m
                  </span>
                </div>
                <div className="stat">
                  <span className="stat__label">Bonus care</span>
                  <span className="stat__value">+7m</span>
                </div>
              </div>
            </Card>
            <Card eyebrow="Client requests" title={`${requested.length} awaiting you`}>
              {requested.map((appointment) => {
                const client = clients.find((item) => item.id === appointment.clientId)
                return (
                  <div className="request-row" key={appointment.id}>
                    <div>
                      <strong>{client?.preferredName}</strong>
                      <span>{format(new Date(appointment.startsAt), 'EEE d MMM · HH:mm')}</span>
                      <small>{appointment.requestNote}</small>
                    </div>
                    <div>
                      <button
                        aria-label={`Decline ${client?.preferredName}'s request`}
                        onClick={() => updateAppointment(appointment.id, { status: 'declined' })}
                      >
                        Decline
                      </button>
                      <button
                        aria-label={`Confirm ${client?.preferredName}'s request`}
                        onClick={() => updateAppointment(appointment.id, { status: 'confirmed' })}
                      >
                        <Check size={15} /> Confirm
                      </button>
                    </div>
                  </div>
                )
              })}
              {!requested.length && <p className="muted">All appointment requests are resolved.</p>}
            </Card>
            <Card
              tone="gold"
              eyebrow="Follow-up due"
              title="Mira’s next-day note"
              action={<Clock3 size={20} />}
            >
              <p className="muted">
                A gentle in-app follow-up is ready. Missing responses are never interpreted as
                negative.
              </p>
              <Button
                variant="secondary"
                size="sm"
                iconAfter={<ArrowRight size={15} />}
                onClick={() => navigate('/therapist/clients/demo-client-mira')}
              >
                Review record
              </Button>
            </Card>
          </aside>
        </div>
      )}
      <QuickAppointmentModal open={createOpen} onOpenChange={setCreateOpen} />
      {intakeClientId && (
        <IntakeFlow
          open={Boolean(intakeClientId)}
          onOpenChange={(open) => !open && setIntakeClientId(null)}
          clientId={intakeClientId}
        />
      )}
    </div>
  )
}
