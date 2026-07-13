import { addDays, format } from 'date-fns'
import { CalendarCheck, CalendarPlus, Check, Clock3, Sparkles, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { Field, Input, Select, Textarea } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { PageHeader } from '@/components/design-system/PageHeader'
import { TherapistPortrait } from '@/components/identity/TherapistPortrait'
import { env } from '@/config/env'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import { ConnectedClientAppointmentsPage } from './ConnectedClientAppointmentsPage'

export function ClientAppointmentsPage() {
  return env.demoMode ? <DemoClientAppointmentsPage /> : <ConnectedClientAppointmentsPage />
}

function DemoClientAppointmentsPage() {
  const auth = useAuth()
  const client = useDemoStore((state) =>
    state.clients.find((item) => item.id === auth.demoClientId),
  )
  const allAppointments = useDemoStore((state) => state.appointments)
  const therapists = useDemoStore((state) => state.therapists)
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
  const [therapistId, setTherapistId] = useState('')
  const completeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (submitted) completeRef.current?.focus()
  }, [submitted])
  if (!client) return null
  const availableTherapists = therapists.filter(
    (therapist) => therapist.availability.status !== 'away',
  )
  const selectedTherapist = availableTherapists.find((item) => item.id === therapistId)
  const submit = () => {
    if (!selectedTherapist) return
    addAppointment({
      clientId: client.id,
      therapistId: selectedTherapist.id,
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
              setTherapistId(availableTherapists[0]?.id ?? '')
              setOpen(true)
            }}
          >
            Request appointment
          </Button>
        }
      />
      <div className="appointment-list">
        {appointments.map((appointment) => {
          const appointmentTherapist = therapists.find(
            (therapist) => therapist.id === appointment.therapistId,
          )
          return (
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
                <p className="client-appointment-therapist">
                  {appointmentTherapist ? (
                    <TherapistPortrait
                      therapist={appointmentTherapist}
                      className="client-appointment__portrait"
                    />
                  ) : (
                    <UserRound size={14} />
                  )}{' '}
                  With{' '}
                  {appointmentTherapist?.displayName.replace(' — fictional demo', '') ??
                    'your AURA team'}
                </p>
              </div>
              <CalendarCheck size={22} />
            </Card>
          )
        })}
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={submitted ? 'Request sent' : 'Request an appointment'}
        description={
          submitted
            ? 'Your synthetic appointment request is ready for team review.'
            : 'Choose a team member and a preferred time. This creates a synthetic request for confirmation.'
        }
        wide
      >
        {submitted ? (
          <div
            ref={completeRef}
            className="followup-complete"
            role="status"
            aria-live="polite"
            tabIndex={-1}
          >
            <span>
              <Check size={24} />
            </span>
            <h3>Request sent</h3>
            <p>
              Your preferred time with {selectedTherapist?.preferredName ?? 'your AURA team'} now
              appears in both portals as requested.
            </p>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : (
          <div className="form-stack">
            <section className="booking-therapists" aria-labelledby="booking-therapist-title">
              <div className="booking-therapists__intro">
                <span className="booking-therapists__sparkle" aria-hidden="true">
                  <Sparkles size={17} />
                </span>
                <div>
                  <h3 id="booking-therapist-title">Who would you like to see?</h3>
                  <p>
                    Every visit contributes to your same goals and progress, whichever team member
                    you choose.
                  </p>
                </div>
              </div>
              <div className="therapist-choice-grid">
                {availableTherapists.map((therapist) => {
                  const selected = therapist.id === therapistId
                  return (
                    <label
                      key={therapist.id}
                      className={`therapist-choice${selected ? ' is-selected' : ''}`}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="preferred-therapist"
                        value={therapist.id}
                        checked={selected}
                        onChange={() => setTherapistId(therapist.id)}
                      />
                      <TherapistPortrait
                        therapist={therapist}
                        className="therapist-choice__portrait"
                      />
                      <span className="therapist-choice__detail">
                        <span className="therapist-choice__topline">
                          <strong>{therapist.displayName.replace(' — fictional demo', '')}</strong>
                          <span className="therapist-choice__check" aria-hidden="true">
                            <Check size={13} />
                          </span>
                        </span>
                        <small>{therapist.professionalTitle}</small>
                        <span className="therapist-choice__specialties">
                          {therapist.specialties.slice(0, 2).map((specialty) => (
                            <span key={specialty}>{specialty}</span>
                          ))}
                        </span>
                        <Badge
                          tone={therapist.availability.status === 'limited' ? 'gold' : 'favourable'}
                        >
                          {therapist.availability.label}
                        </Badge>
                      </span>
                    </label>
                  )
                })}
              </div>
            </section>
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
            <Button fullWidth onClick={submit} disabled={!selectedTherapist}>
              Send request
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
