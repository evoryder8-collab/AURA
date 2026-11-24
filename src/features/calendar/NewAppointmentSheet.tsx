import { useState } from 'react'
import { Button } from '@/components/design-system/Button'
import { Field, Select } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { Segmented } from '@/components/ui/Segmented'
import type { DemoAppointment, DemoClient, DemoTherapist } from '@/data/demo/model'
import { useDemoStore } from '@/data/demo/store'
import { clientsAssignedToTherapist } from '@/data/demo/team'
import { PRACTICE_TIME_ZONE } from '@/lib/formatting/time'
import { SlotPicker, type SlotDay } from '@/features/visits/SlotPicker'
import {
  availableStarts,
  bookingDays,
  clockTime,
  CLOSING_MINUTES,
  OPENING_MINUTES,
  SERVICES,
  startProblem,
  zonedParts,
  zonedTimeToUtc,
  type StartProblem,
} from '@/features/visits/slots'

const ROOM = 'Garden room'
type Minutes = `${(typeof SERVICES)[number]['minutes']}`

/** Visits that hold this therapist's or this client's time. */
const busyFor = (therapist: DemoTherapist, clientId: string, appointments: readonly DemoAppointment[]) =>
  appointments.filter((item) => item.therapistId === therapist.id || (clientId && item.clientId === clientId))

function freeDays(therapist: DemoTherapist, clientId: string, minutes: number, appointments: readonly DemoAppointment[], now: number): SlotDay[] {
  const busy = busyFor(therapist, clientId, appointments)
  return bookingDays({ now, workingDays: therapist.workingDays, timeZone: PRACTICE_TIME_ZONE }).map((key) => ({
    key,
    starts: availableStarts({ dayKey: key, durationMinutes: minutes, busy, now, timeZone: PRACTICE_TIME_ZONE, workingDays: therapist.workingDays }),
  }))
}

/** Books one of this therapist's own clients into a free time. Mounted only while open, so every opening starts fresh. */
export function NewAppointmentSheet({
  therapist,
  onClose,
  onBooked,
}: {
  therapist: DemoTherapist
  onClose: () => void
  onBooked: (appointment: { startsAt: string; client: DemoClient }) => void
}) {
  const therapists = useDemoStore((state) => state.therapists)
  const clients = useDemoStore((state) => state.clients)
  const appointments = useDemoStore((state) => state.appointments)
  const addAppointment = useDemoStore((state) => state.addAppointment)
  const [now] = useState(Date.now)
  const [clientId, setClientId] = useState('')
  const [minutes, setMinutes] = useState<Minutes>('60')
  const [dayKey, setDayKey] = useState<string | null>(null)
  const [startsAt, setStartsAt] = useState<string | null>(null)
  const [error, setError] = useState('')

  const assigned = clientsAssignedToTherapist({ therapists, clients }, therapist.id)
  const service = SERVICES.find((item) => `${item.minutes}` === minutes) ?? SERVICES[0]!
  const days = freeDays(therapist, clientId, service.minutes, appointments, now)
  const activeDay = days.find((day) => day.key === dayKey && day.starts.length) ?? days.find((day) => day.starts.length)
  const latest = clockTime(CLOSING_MINUTES - service.minutes)

  const problemAt = (key: string, minutesOfDay: number) =>
    startProblem({
      dayKey: key,
      minutes: minutesOfDay,
      durationMinutes: service.minutes,
      busy: busyFor(therapist, clientId, useDemoStore.getState().appointments),
      now: Date.now(),
      timeZone: PRACTICE_TIME_ZONE,
      workingDays: therapist.workingDays,
    })

  const explain = (problem: StartProblem) =>
    ({
      closed: `${therapist.preferredName} does not work on this day.`,
      outside_hours: `Choose a start from ${clockTime(OPENING_MINUTES)} to ${latest}, so a ${service.minutes}-minute visit ends by ${clockTime(CLOSING_MINUTES)}.`,
      past: 'That time has already passed. Choose a later time.',
      taken: 'That time overlaps another visit. Choose a different time.',
    })[problem]

  const pickCustom = (time: string, key: string) => {
    const [hours = 0, mins = 0] = time.split(':').map(Number)
    const problem = problemAt(key, hours * 60 + mins)
    if (problem) {
      setStartsAt(null)
      return setError(explain(problem))
    }
    setStartsAt(new Date(zonedTimeToUtc(key, hours * 60 + mins, PRACTICE_TIME_ZONE)).toISOString())
    setError('')
  }

  const create = () => {
    const client = assigned.find((item) => item.id === clientId)
    if (!client) return setError('Choose one of your clients.')
    if (!startsAt) return setError('Choose a start time.')
    // Checked again at booking: the time may have been taken, or passed, since it was chosen.
    const chosen = zonedParts(startsAt, PRACTICE_TIME_ZONE)
    const problem = problemAt(chosen.dayKey, chosen.minutes)
    if (problem) {
      setStartsAt(null)
      return setError(problem === 'taken' ? 'That time is no longer free. Please choose another.' : explain(problem))
    }
    addAppointment({
      clientId: client.id,
      therapistId: therapist.id,
      startsAt,
      durationMinutes: service.minutes,
      sessionType: service.name,
      status: 'confirmed',
      intakeStatus: client.intakeStatus,
      room: ROOM,
    })
    onBooked({ startsAt, client })
  }

  return (
    <Modal open onOpenChange={(open) => (open ? undefined : onClose())} title="New appointment" wide>
      <div className="new-appointment">
        {assigned.length ? (
          <>
            <Field label="Client">
              <Select
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value)
                  setStartsAt(null)
                  setError('')
                }}
              >
                <option value="" disabled>
                  Choose a client
                </option>
                {assigned.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.displayName}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="field">
              <span className="field__label">Length</span>
              <Segmented<Minutes>
                label="Length"
                value={minutes}
                onChange={(value) => {
                  setMinutes(value)
                  setStartsAt(null)
                }}
                options={SERVICES.map((item) => ({
                  value: `${item.minutes}` as Minutes,
                  label: `${item.minutes} min`,
                  ariaLabel: `${item.name}, ${item.minutes} minutes`,
                }))}
              />
              <span className="field__hint">{service.name}</span>
            </div>

            {activeDay ? (
              <SlotPicker
                key={`${clientId}-${minutes}`}
                custom={{ latest, onPick: pickCustom }}
                days={days}
                dayKey={activeDay.key}
                onDay={(key) => {
                  setDayKey(key)
                  setStartsAt(null)
                }}
                startsAt={startsAt}
                onStart={(start) => {
                  setStartsAt(start)
                  setError('')
                }}
              />
            ) : (
              <p className="empty">No {service.minutes}-minute openings in the next two weeks.</p>
            )}

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <Button size="lg" fullWidth onClick={create}>
              Book appointment
            </Button>
          </>
        ) : (
          <p className="empty">No clients are assigned to you yet.</p>
        )}
      </div>
    </Modal>
  )
}
