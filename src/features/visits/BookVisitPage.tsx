import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { Spinner } from '@/components/design-system/Spinner'
import { Portrait } from '@/components/ui/Portrait'
import type { DemoAppointment, DemoTherapist } from '@/data/demo/model'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import { fmtDay, fmtTime, minutesLabel, PRACTICE_TIME_ZONE } from '@/lib/formatting/time'
import { availableStarts, bookingDays, SERVICES, startProblem, zonedParts, type Service, type StartProblem } from './slots'
import { SlotPicker, type SlotDay } from './SlotPicker'
import './visits.css'

type Step = 'therapist' | 'service' | 'time' | 'confirm' | 'done'
const STEPS: readonly Step[] = ['therapist', 'service', 'time', 'confirm']
const ROOM = 'Garden room'

/** The visits a new booking must not overlap: the therapist's and the client's own. */
const busyFor = (therapistId: string, clientId: string, appointments: readonly DemoAppointment[]) =>
  appointments.filter((appointment) => appointment.therapistId === therapistId || appointment.clientId === clientId)

/** Free days and times for one therapist and length, leaving out anything that clashes with the client's own visits too. */
function slotDays(input: {
  therapist: DemoTherapist
  clientId: string
  minutes: number
  appointments: readonly DemoAppointment[]
  now: number
}): SlotDay[] {
  const busy = busyFor(input.therapist.id, input.clientId, input.appointments)
  return bookingDays({ now: input.now, workingDays: input.therapist.workingDays, timeZone: PRACTICE_TIME_ZONE }).map((key) => ({
    key,
    starts: availableStarts({
      dayKey: key,
      durationMinutes: input.minutes,
      busy,
      now: input.now,
      timeZone: PRACTICE_TIME_ZONE,
      workingDays: input.therapist.workingDays,
    }),
  }))
}

export function BookVisitPage() {
  const { demoClientId } = useAuth()
  const hydrated = useDemoStore((state) => state.hydrated)
  const therapists = useDemoStore((state) => state.therapists)
  const appointments = useDemoStore((state) => state.appointments)
  const addAppointment = useDemoStore((state) => state.addAppointment)
  const [now] = useState(Date.now)
  const [step, setStep] = useState<Step>('therapist')
  const [therapistId, setTherapistId] = useState<string | null>(null)
  const [minutes, setMinutes] = useState<Service['minutes'] | null>(null)
  const [dayKey, setDayKey] = useState<string | null>(null)
  const [startsAt, setStartsAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const shownStep = useRef(step)

  // Each step change moves focus to the new step's heading so screen readers announce where they are.
  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    heading.current?.focus()
  }, [step])

  if (!hydrated) return <Spinner label="Opening booking" fullPage />
  if (!demoClientId) {
    return (
      <div className="page">
        <p className="empty">This account has no client profile in the demo.</p>
      </div>
    )
  }
  const clientId = demoClientId

  const therapist = therapists.find((item) => item.id === therapistId)
  const service = SERVICES.find((item) => item.minutes === minutes)
  const days = therapist && service ? slotDays({ therapist, clientId, minutes: service.minutes, appointments, now }) : []
  const activeDay = days.find((day) => day.key === dayKey && day.starts.length) ?? days.find((day) => day.starts.length)

  const go = (next: Step) => {
    setError('')
    setStep(next)
  }
  const back = () => go(STEPS[Math.max(0, STEPS.indexOf(step) - 1)] ?? 'therapist')

  const book = () => {
    if (!therapist || !service || !startsAt) return
    // The chosen time is checked again: it may have passed, or another booking taken it, since it was shown.
    const local = zonedParts(startsAt, PRACTICE_TIME_ZONE)
    const problem = startProblem({
      dayKey: local.dayKey,
      minutes: local.minutes,
      durationMinutes: service.minutes,
      busy: busyFor(therapist.id, clientId, useDemoStore.getState().appointments),
      now: Date.now(),
      timeZone: PRACTICE_TIME_ZONE,
      workingDays: therapist.workingDays,
    })
    if (problem) {
      const reason: Record<StartProblem, string> = {
        past: 'That time has just passed. Please choose a later one.',
        taken: 'That time has just been taken. Please choose another.',
        closed: `${therapist.preferredName} no longer works on that day. Please choose another.`,
        outside_hours: 'That time is outside opening hours. Please choose another.',
      }
      setStartsAt(null)
      setStep('time')
      setError(reason[problem])
      return
    }
    addAppointment({
      clientId,
      therapistId: therapist.id,
      startsAt,
      durationMinutes: service.minutes,
      sessionType: service.name,
      status: 'confirmed',
      intakeStatus: 'complete',
      room: ROOM,
    })
    go('done')
  }

  if (step === 'done' && therapist && service && startsAt) {
    return (
      <div className="page book">
        <section className="card book-done" aria-labelledby="book-step-title">
          <Portrait name={therapist.displayName} portrait={therapist.portrait} size="xl" glow />
          <h1 id="book-step-title" ref={heading} tabIndex={-1} className="book__step-title">
            You're booked with {therapist.preferredName} on {fmtDay(startsAt)} at {fmtTime(startsAt)}
          </h1>
          <p className="lead">
            {service.name} · <span className="nowrap">{minutesLabel(service.minutes)}</span> · {ROOM}. On the day, you can check in from
            Visits.
          </p>
          <div className="book-done__actions">
            <Link to="/client/visits" className="button button--primary button--lg">
              See my visits
            </Link>
            <Link to="/client/home" className="button button--secondary button--lg">
              Back to home
            </Link>
          </div>
        </section>
      </div>
    )
  }

  const index = STEPS.indexOf(step)
  return (
    <div className="page book">
      <div className="book__top">
        {step === 'therapist' ? (
          <Link to="/client/visits" className="back-link">
            <ChevronLeft size={18} aria-hidden="true" /> Visits
          </Link>
        ) : (
          <Button variant="ghost" size="sm" icon={<ChevronLeft size={18} aria-hidden="true" />} onClick={back}>
            Back
          </Button>
        )}
        <div className="book__progress">
          <span>
            Step {index + 1} of {STEPS.length}
          </span>
          <span className="book__bars" aria-hidden="true">
            {STEPS.map((item, position) => (
              <span key={item} className={position <= index ? 'is-done' : undefined} />
            ))}
          </span>
        </div>
      </div>

      <h1 className="visually-hidden">Book a visit</h1>

      {step === 'therapist' ? (
        <StepSection title="Who would you like to see?" heading={heading}>
          <div className="book__options">
            {therapists.map((item) => {
              const seen = appointments.filter(
                (appointment) =>
                  appointment.clientId === clientId && appointment.therapistId === item.id && appointment.status === 'completed',
              ).length
              const away = item.availability.status === 'away'
              const first = away
                ? undefined
                : slotDays({ therapist: item, clientId, minutes: 60, appointments, now }).find((day) => day.starts.length)
                    ?.starts[0]
              return (
                <button
                  key={item.id}
                  type="button"
                  className="book-option book-option--therapist"
                  aria-pressed={item.id === therapistId}
                  disabled={away || !first}
                  onClick={() => {
                    setTherapistId(item.id)
                    setDayKey(null)
                    setStartsAt(null)
                    go('service')
                  }}
                >
                  <span className="book-option__head">
                    <Portrait name={item.displayName} portrait={item.portrait} size="lg" />
                    <span className="book-option__body">
                      <span className="book-option__name">{item.displayName}</span>{' '}
                      <span className="book-option__detail">{item.specialties.join(' · ')}</span>
                    </span>
                    <ChevronRight className="book-option__chevron" size={20} aria-hidden="true" />
                  </span>{' '}
                  <span className="book-option__tags">
                      <Badge tone={first ? 'favourable' : 'neutral'}>
                        {away
                          ? item.availability.label
                          : first
                            ? `Next opening ${fmtDay(first)}, ${fmtTime(first)}`
                            : 'No openings in the next two weeks'}
                      </Badge>{' '}
                      <Badge>{seen ? `Seen before · ${seen} ${seen === 1 ? 'visit' : 'visits'}` : 'New to you'}</Badge>
                  </span>
                </button>
              )
            })}
          </div>
        </StepSection>
      ) : null}

      {step === 'service' && therapist ? (
        <StepSection title="How long would you like?" heading={heading} chosen={<Chosen therapist={therapist} />}>
          <div className="book__options">
            {SERVICES.map((item) => (
              <button
                key={item.minutes}
                type="button"
                className="book-option"
                aria-pressed={item.minutes === minutes}
                onClick={() => {
                  setMinutes(item.minutes)
                  setStartsAt(null)
                  go('time')
                }}
              >
                <span className="book-option__minutes" aria-hidden="true">
                  <strong className="num">{item.minutes}</strong>
                  <span>min</span>
                </span>
                <span className="book-option__body">
                  <span className="book-option__name">{item.name}</span>{' '}
                  <span className="book-option__detail">{item.detail}</span>
                  <span className="visually-hidden">, {minutesLabel(item.minutes)}</span>
                </span>
                <ChevronRight className="book-option__chevron" size={20} aria-hidden="true" />
              </button>
            ))}
          </div>
        </StepSection>
      ) : null}

      {step === 'time' && therapist && service ? (
        <StepSection
          title="Pick a day and time"
          heading={heading}
          chosen={<Chosen therapist={therapist} service={service} />}
        >
          {error ? (
            <p className="book__error" role="alert">
              {error}
            </p>
          ) : null}
          {activeDay ? (
            <SlotPicker
              days={days}
              dayKey={activeDay.key}
              onDay={(key) => {
                setDayKey(key)
                setStartsAt(null)
              }}
              startsAt={startsAt}
              onStart={(start) => {
                setStartsAt(start)
                go('confirm')
              }}
            />
          ) : (
            <p className="empty">
              {therapist.preferredName} has no {service.minutes}-minute openings in the next two weeks. Try a shorter visit or
              another therapist.
            </p>
          )}
        </StepSection>
      ) : null}

      {step === 'confirm' && therapist && service && startsAt ? (
        <StepSection title="Check and book" heading={heading}>
          <Card tone="gold" className="book-summary" as="div">
            <div className="book-summary__who">
              <Portrait name={therapist.displayName} portrait={therapist.portrait} size="lg" glow />
              <div>
                <strong>{therapist.displayName}</strong>
                <span className="muted small">{therapist.professionalTitle}</span>
              </div>
            </div>
            <dl className="book-summary__facts">
              <div>
                <dt>Day</dt>
                <dd>{fmtDay(startsAt)}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd className="num">
                  {fmtTime(startsAt)}–{fmtTime(new Date(startsAt).getTime() + service.minutes * 60_000)}
                </dd>
              </div>
              <div>
                <dt>Visit</dt>
                <dd>
                  {service.name} · <span className="nowrap">{service.minutes} min</span>
                </dd>
              </div>
              <div>
                <dt>Room</dt>
                <dd>{ROOM}</dd>
              </div>
            </dl>
          </Card>
          <Button size="lg" fullWidth onClick={book}>
            Book this visit
          </Button>
        </StepSection>
      ) : null}
    </div>
  )
}

function StepSection({
  title,
  heading,
  chosen,
  children,
}: {
  title: string
  heading: RefObject<HTMLHeadingElement | null>
  chosen?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="book__step" aria-labelledby="book-step-title">
      <h2 id="book-step-title" ref={heading} tabIndex={-1} className="book__step-title">
        {title}
      </h2>
      {chosen}
      {children}
    </section>
  )
}

function Chosen({ therapist, service }: { therapist: DemoTherapist; service?: Service }) {
  return (
    <p className="book__chosen">
      <Portrait name={therapist.displayName} portrait={therapist.portrait} size="xs" />
      <span>
        With {therapist.preferredName}
        {service ? (
          <>
            {' '}· {service.name} · <span className="nowrap">{service.minutes} min</span>
          </>
        ) : null}
      </span>
    </p>
  )
}
