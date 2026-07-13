import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import {
  CalendarCheck,
  CalendarPlus,
  Check,
  Clock3,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { Field, Input, Select } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { PageHeader } from '@/components/design-system/PageHeader'
import { env } from '@/config/env'
import { createAuraRepositories, type AppointmentStatus } from '@/data/repositories'
import { useAuth } from '@/features/auth/auth-context'

function publicPortraitUrl(path: string | null) {
  if (!path || !env.supabase) return null
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return `${env.supabase.url}/storage/v1/object/public/brand-assets-public/${encodedPath}`
}

function statusTone(status: AppointmentStatus) {
  if (status === 'confirmed') return 'favourable' as const
  if (status === 'requested' || status === 'pending') return 'pending' as const
  return 'neutral' as const
}

export function ConnectedClientAppointmentsPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const repositories = useMemo(() => createAuraRepositories({ mode: 'supabase' }), [])
  const clientId = auth.demoClientId
  const userId = auth.user?.id ?? null
  const [open, setOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [date, setDate] = useState(format(addDays(new Date(), 7), "yyyy-MM-dd'T'14:00"))
  const [duration, setDuration] = useState('60')
  const [sessionType, setSessionType] = useState('Restorative massage')
  const [therapistId, setTherapistId] = useState('')
  const completeRef = useRef<HTMLDivElement>(null)

  const clientQuery = useQuery({
    queryKey: ['connected', userId, 'client', clientId],
    enabled: Boolean(userId && clientId),
    queryFn: () => repositories.clients.get(clientId!),
  })
  const appointmentsQuery = useQuery({
    queryKey: ['connected', userId, 'appointments', clientId],
    enabled: Boolean(userId && clientId),
    queryFn: () => repositories.appointments.list({ clientId: clientId! }),
  })
  const therapistsQuery = useQuery({
    queryKey: ['connected', userId, 'bookable-therapists'],
    enabled: Boolean(userId),
    queryFn: () => repositories.therapists!.listBookable(),
  })

  const requestMutation = useMutation({
    mutationFn: async () => {
      const client = clientQuery.data
      if (!client || !therapistId) throw new Error('Booking prerequisites are unavailable.')
      return repositories.appointments.create({
        clientId: client.id,
        therapistUserId: therapistId,
        startsAt: new Date(date).toISOString(),
        durationMinutes: Number(duration),
        sessionType,
        status: 'requested',
        intakeStatusSnapshot: client.intakeStatus,
        room: null,
      })
    },
    onSuccess: async () => {
      setSubmitted(true)
      await queryClient.invalidateQueries({
        queryKey: ['connected', userId, 'appointments', clientId],
      })
    },
  })

  useEffect(() => {
    if (submitted) completeRef.current?.focus()
  }, [submitted])

  const therapists = therapistsQuery.data ?? []
  const appointments = [...(appointmentsQuery.data ?? [])].sort((a, b) =>
    b.startsAt.localeCompare(a.startsAt),
  )
  const selectedTherapist = therapists.find((therapist) => therapist.userId === therapistId)
  const loading = clientQuery.isLoading || appointmentsQuery.isLoading || therapistsQuery.isLoading
  const failed = clientQuery.isError || appointmentsQuery.isError || therapistsQuery.isError

  return (
    <div>
      <PageHeader
        eyebrow="Appointments · protected account"
        title={
          <>
            Time set aside
            <br />
            for you.
          </>
        }
        lead="Choose any available practitioner in your practice. Every visit remains part of your one continuous progress record."
        actions={
          <Button
            icon={<CalendarPlus size={17} />}
            disabled={loading || failed || !clientQuery.data || therapists.length === 0}
            onClick={() => {
              setSubmitted(false)
              requestMutation.reset()
              setTherapistId(therapists[0]?.userId ?? '')
              setOpen(true)
            }}
          >
            Request appointment
          </Button>
        }
      />

      {loading ? (
        <Card tone="soft" role="status">
          <p>Loading your protected appointments and care team…</p>
        </Card>
      ) : failed || !clientQuery.data ? (
        <Card tone="soft" role="alert">
          <h2>Appointments are temporarily unavailable</h2>
          <p>
            Your protected records could not be loaded. No local demo data has been substituted.
          </p>
        </Card>
      ) : (
        <>
          <Card className="care-continuity" tone="soft">
            <span className="care-continuity__icon" aria-hidden="true">
              <ShieldCheck size={20} />
            </span>
            <div>
              <p className="eyebrow">One continuous record</p>
              <h2>Your progress belongs to you</h2>
              <p>
                Practitioner attribution stays on each appointment while outcomes and feedback
                continue to aggregate around your client record.
              </p>
            </div>
          </Card>
          <div className="appointment-list">
            {appointments.length === 0 ? (
              <Card tone="soft">
                <p>No appointments are recorded yet.</p>
              </Card>
            ) : null}
            {appointments.map((appointment) => {
              const therapist = therapists.find(
                (candidate) => candidate.userId === appointment.therapistUserId,
              )
              return (
                <Card key={appointment.id} className="client-appointment-row">
                  <div className="client-appointment-date">
                    <span>{format(new Date(appointment.startsAt), 'MMM')}</span>
                    <strong>{format(new Date(appointment.startsAt), 'd')}</strong>
                    <small>{format(new Date(appointment.startsAt), 'EEE')}</small>
                  </div>
                  <div>
                    <Badge tone={statusTone(appointment.status)}>{appointment.status}</Badge>
                    <h2>{appointment.sessionType}</h2>
                    <p>
                      <Clock3 size={14} /> {format(new Date(appointment.startsAt), 'HH:mm')} ·{' '}
                      {appointment.durationMinutes} minutes
                    </p>
                    <p className="client-appointment-therapist">
                      <UserRound size={14} /> With{' '}
                      {therapist?.professionalName ?? 'your assigned practitioner'}
                    </p>
                  </div>
                  <CalendarCheck size={22} />
                </Card>
              )
            })}
          </div>
        </>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={submitted ? 'Request sent' : 'Request an appointment'}
        description={
          submitted
            ? 'Your selected practitioner and preferred time were recorded securely.'
            : 'Choose a practitioner and a preferred time. Availability is confirmed separately.'
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
              Your preferred time with {selectedTherapist?.professionalName ?? 'your care team'}
              is now awaiting confirmation.
            </p>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : (
          <div className="form-stack">
            <section className="booking-therapists" aria-labelledby="connected-therapist-title">
              <div className="booking-therapists__intro">
                <span className="booking-therapists__sparkle" aria-hidden="true">
                  <Sparkles size={17} />
                </span>
                <div>
                  <h3 id="connected-therapist-title">Who would you like to see?</h3>
                  <p>Your goals and progress stay together whichever practitioner you choose.</p>
                </div>
              </div>
              <div className="therapist-choice-grid">
                {therapists.map((therapist) => {
                  const selected = therapist.userId === therapistId
                  const initials = therapist.professionalName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join('')
                  const portrait = publicPortraitUrl(therapist.publicPortraitPath)
                  return (
                    <label
                      key={therapist.userId}
                      className={`therapist-choice${selected ? ' is-selected' : ''}`}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="connected-preferred-therapist"
                        value={therapist.userId}
                        checked={selected}
                        onChange={() => setTherapistId(therapist.userId)}
                      />
                      <span className="therapist-choice__portrait" aria-hidden="true">
                        <span>{initials}</span>
                        {portrait ? (
                          <img
                            src={portrait}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : null}
                      </span>
                      <span className="therapist-choice__detail">
                        <span className="therapist-choice__topline">
                          <strong>{therapist.professionalName}</strong>
                          <span className="therapist-choice__check" aria-hidden="true">
                            <Check size={13} />
                          </span>
                        </span>
                        <small>{therapist.professionalTitle ?? 'Massage practitioner'}</small>
                        <Badge tone="favourable">Available for online requests</Badge>
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
                min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <div className="form-grid">
              <Field label="Session type">
                <Select
                  value={sessionType}
                  onChange={(event) => setSessionType(event.target.value)}
                >
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
            {requestMutation.isError ? (
              <p className="form-error" role="alert">
                The appointment request could not be saved. Check the time and try again.
              </p>
            ) : null}
            <Button
              fullWidth
              disabled={!therapistId || requestMutation.isPending}
              onClick={() => requestMutation.mutate()}
            >
              {requestMutation.isPending ? 'Sending securely…' : 'Send request'}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
