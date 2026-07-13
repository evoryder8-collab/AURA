import { addDays, format } from 'date-fns'
import { CalendarCheck, CalendarPlus, Check, Clock3 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { Field, Input, Select, Textarea } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { PageHeader } from '@/components/design-system/PageHeader'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'

export function ClientAppointmentsPage() {
  const auth = useAuth()
  const client = useDemoStore((state) =>
    state.clients.find((item) => item.id === auth.demoClientId),
  )
  const allAppointments = useDemoStore((state) => state.appointments)
  const appointments = allAppointments
    .filter((item) => item.clientId === auth.demoClientId)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  const addAppointment = useDemoStore((state) => state.addAppointment)
  const [open, setOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [date, setDate] = useState(format(addDays(new Date(), 7), "yyyy-MM-dd'T'14:00"))
  const [duration, setDuration] = useState('60')
  const [type, setType] = useState('Restorative massage')
  const [note, setNote] = useState('Afternoon preferred.')
  if (!client) return null
  const submit = () => {
    addAppointment({
      clientId: client.id,
      startsAt: new Date(date).toISOString(),
      durationMinutes: Number(duration),
      sessionType: type,
      status: 'requested',
      intakeStatus: client.intakeStatus,
      room: 'Unassigned',
      requestNote: note,
    })
    setSubmitted(true)
  }
  return (
    <div>
      <PageHeader
        eyebrow="Appointments"
        title={
          <>
            Time set aside
            <br />
            for you.
          </>
        }
        lead="Request a preferred time. Your therapist confirms availability before it becomes a booking."
        actions={
          <Button
            icon={<CalendarPlus size={17} />}
            onClick={() => {
              setSubmitted(false)
              setOpen(true)
            }}
          >
            Request appointment
          </Button>
        }
      />
      <div className="appointment-list">
        {appointments.map((appointment) => (
          <Card key={appointment.id} className="client-appointment-row">
            <div className="client-appointment-date">
              <span>{format(new Date(appointment.startsAt), 'MMM')}</span>
              <strong>{format(new Date(appointment.startsAt), 'd')}</strong>
              <small>{format(new Date(appointment.startsAt), 'EEE')}</small>
            </div>
            <div>
              <Badge
                tone={
                  appointment.status === 'confirmed'
                    ? 'favourable'
                    : appointment.status === 'requested'
                      ? 'pending'
                      : 'neutral'
                }
              >
                {appointment.status}
              </Badge>
              <h2>{appointment.sessionType}</h2>
              <p>
                <Clock3 size={14} /> {format(new Date(appointment.startsAt), 'HH:mm')} ·{' '}
                {appointment.durationMinutes} minutes
              </p>
            </div>
            <CalendarCheck size={22} />
          </Card>
        ))}
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Request an appointment"
        description="This sends a synthetic request for therapist confirmation."
      >
        {submitted ? (
          <div className="followup-complete">
            <span>
              <Check size={24} />
            </span>
            <h3>Request sent</h3>
            <p>Your preferred time now appears in both portals as requested.</p>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : (
          <div className="form-stack">
            <Field label="Preferred date and time">
              <Input
                type="datetime-local"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <div className="form-grid">
              <Field label="Session type">
                <Select value={type} onChange={(event) => setType(event.target.value)}>
                  <option>Restorative massage</option>
                  <option>Focused session</option>
                  <option>Progress review</option>
                </Select>
              </Field>
              <Field label="Duration">
                <Select value={duration} onChange={(event) => setDuration(event.target.value)}>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="75">75 minutes</option>
                </Select>
              </Field>
            </div>
            <Field label="Preference note (optional)">
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
            <Button fullWidth onClick={submit}>
              Send request
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
