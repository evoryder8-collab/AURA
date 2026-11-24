import { Check, CheckCheck, ChevronLeft, ChevronRight, CirclePlay, Clock3, Plus, UserCheck, type LucideIcon } from 'lucide-react'
import { useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Modal } from '@/components/design-system/Modal'
import { PageHeader } from '@/components/design-system/PageHeader'
import { Spinner } from '@/components/design-system/Spinner'
import type { DemoAppointment } from '@/data/demo/model'
import { useDemoStore } from '@/data/demo/store'
import { appointmentsForTherapist, getDemoTherapist } from '@/data/demo/team'
import { useAuth } from '@/features/auth/auth-context'
import { addDays, formatDayKey, holdsTime, serviceName, startOfWeek, weekdayOf, zonedParts } from '@/features/visits/slots'
import { fmtDay, fmtTime, PRACTICE_TIME_ZONE } from '@/lib/formatting/time'
import { useNow } from '@/lib/useNow'
import { NewAppointmentSheet } from './NewAppointmentSheet'
import './calendar.css'

const WIDE_QUERY = '(min-width: 760px)'
const HOUR_PX = 64
const tz = PRACTICE_TIME_ZONE

function useWide() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(WIDE_QUERY)
      query.addEventListener('change', notify)
      return () => query.removeEventListener('change', notify)
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  )
}

type Cue = { label: string; icon: LucideIcon; tone: 'live' | 'done' | 'arrived' | 'pending' | 'confirmed' }

/** One small status cue per visit: an icon shape plus its word, never colour alone. */
function statusCue(appointment: DemoAppointment): Cue {
  if (appointment.session?.startedAt && !appointment.session.finishedAt) return { label: 'In session', icon: CirclePlay, tone: 'live' }
  if (appointment.status === 'completed' || appointment.session?.finishedAt) return { label: 'Finished', icon: CheckCheck, tone: 'done' }
  if (appointment.arrival) return { label: 'Checked in', icon: UserCheck, tone: 'arrived' }
  if (appointment.status === 'requested' || appointment.status === 'pending') return { label: 'Awaiting reply', icon: Clock3, tone: 'pending' }
  return { label: 'Confirmed', icon: Check, tone: 'confirmed' }
}

const endOf = (appointment: DemoAppointment) => new Date(appointment.startsAt).getTime() + appointment.durationMinutes * 60_000
const timeRange = (appointment: DemoAppointment) => `${fmtTime(appointment.startsAt)}–${fmtTime(endOf(appointment))}`

export function CalendarPage() {
  const { demoTherapistId } = useAuth()
  const hydrated = useDemoStore((state) => state.hydrated)
  const therapists = useDemoStore((state) => state.therapists)
  const clients = useDemoStore((state) => state.clients)
  const appointments = useDemoStore((state) => state.appointments)
  const wide = useWide()
  const now = useNow()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(zonedParts(Date.now(), tz).dayKey))
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')

  if (!hydrated) return <Spinner label="Opening your calendar" fullPage />
  const therapist = getDemoTherapist({ therapists }, demoTherapistId)
  if (!therapist) {
    return (
      <div className="page">
        <p className="empty">This account has no therapist profile in the demo.</p>
      </div>
    )
  }

  const today = zonedParts(now, tz).dayKey
  const thisWeek = startOfWeek(today)
  const days = Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset))
  const byDay = new Map<string, DemoAppointment[]>(days.map((key) => [key, []]))
  for (const appointment of appointmentsForTherapist({ appointments }, therapist.id).filter(holdsTime)) {
    byDay.get(zonedParts(appointment.startsAt, tz).dayKey)?.push(appointment)
  }
  for (const list of byDay.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const clientOf = (appointment: DemoAppointment) => clients.find((client) => client.id === appointment.clientId)
  const open = openId ? appointmentsForTherapist({ appointments }, therapist.id).find((item) => item.id === openId) : undefined
  const weekLabel = `${formatDayKey(weekStart, { day: 'numeric', month: 'short' })} – ${formatDayKey(addDays(weekStart, 6), { day: 'numeric', month: 'short' })}`

  const view = { days, byDay, today, now, clientOf, onOpen: setOpenId, workingDays: therapist.workingDays }

  return (
    <div className="page calendar">
      <PageHeader
        title="Calendar"
        actions={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
            New appointment
          </Button>
        }
      />

      <div className="calendar__nav">
        <Button
          variant="secondary"
          className="calendar__step"
          aria-label="Previous week"
          onClick={() => setWeekStart(addDays(weekStart, -7))}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </Button>
        <h2 className="calendar__week" aria-live="polite">
          <span className="visually-hidden">Week of </span>
          {weekLabel}
        </h2>
        <Button variant="secondary" className="calendar__step" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight size={20} aria-hidden="true" />
        </Button>
        {weekStart === thisWeek ? null : (
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(thisWeek)}>
            This week
          </Button>
        )}
      </div>

      <p className="calendar__status" role="status">
        {message}
      </p>

      {wide ? <WeekGrid {...view} /> : <Agenda {...view} />}

      {open ? (
        <AppointmentSheet appointment={open} clientName={clientOf(open)?.displayName ?? 'Client'} today={today} onClose={() => setOpenId(null)} />
      ) : null}

      {creating ? (
        <NewAppointmentSheet
          therapist={therapist}
          onClose={() => setCreating(false)}
          onBooked={({ startsAt, client }) => {
            setCreating(false)
            setWeekStart(startOfWeek(zonedParts(startsAt, tz).dayKey))
            setMessage(`Booked ${client.displayName} on ${fmtDay(startsAt)} at ${fmtTime(startsAt)}.`)
          }}
        />
      ) : null}
    </div>
  )
}

type ViewProps = {
  days: string[]
  byDay: Map<string, DemoAppointment[]>
  today: string
  now: number
  clientOf: (appointment: DemoAppointment) => { displayName: string } | undefined
  onOpen: (id: string) => void
  workingDays: readonly number[]
}

function WeekGrid({ days, byDay, today, now, clientOf, onOpen, workingDays }: ViewProps) {
  // Opening hours by default, stretched to fit any visit booked outside them.
  const visits = days.flatMap((key) => byDay.get(key) ?? [])
  const nowMinutes = zonedParts(now, tz).minutes
  const nowShown = days.includes(today)
  const starts = [...visits.map((item) => zonedParts(item.startsAt, tz).minutes), ...(nowShown ? [nowMinutes] : [])]
  const ends = [...visits.map((item, index) => (starts[index] ?? 0) + item.durationMinutes), ...(nowShown ? [nowMinutes] : [])]
  const firstHour = Math.max(0, Math.min(8, ...starts.map((minutes) => Math.floor(minutes / 60))))
  const lastHour = Math.min(24, Math.max(19, ...ends.map((minutes) => Math.ceil(minutes / 60))))
  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index)
  const offset = (minutes: number) => ((minutes - firstHour * 60) * HOUR_PX) / 60

  return (
    <div className="week" style={{ '--hour': `${HOUR_PX}px`, '--hours': hours.length } as CSSProperties}>
      <div className="week__gutter" aria-hidden="true">
        <div className="week__corner" />
        <div className="week__hours">
          {hours.map((hour) => (
            <span key={hour} style={{ top: offset(hour * 60) }}>
              {String(hour).padStart(2, '0')}:00
            </span>
          ))}
        </div>
      </div>
      {days.map((key) => {
        const list = byDay.get(key) ?? []
        const isToday = key === today
        const headingId = `day-${key}`
        return (
          <div key={key} className={`week__col${isToday ? ' is-today' : ''}`} role="group" aria-labelledby={headingId}>
            <h3 id={headingId} className="week__dayhead">
              <span className="week__weekday">{formatDayKey(key, { weekday: 'short' })}</span>{' '}
              <span className="week__date num">{formatDayKey(key, { day: 'numeric' })}</span>{' '}
              <span className="visually-hidden">{formatDayKey(key, { month: 'long' })} </span>
              {isToday ? <span className="week__today">Today</span> : null}
            </h3>
            <div className={`week__lane${workingDays.includes(weekdayOf(key)) ? '' : ' is-off'}`}>
              {list.length ? (
                <ul className="week__visits">
                  {list.map((appointment) => {
                    const start = zonedParts(appointment.startsAt, tz).minutes
                    const cue = statusCue(appointment)
                    const Icon = cue.icon
                    return (
                      <li
                        key={appointment.id}
                        style={{ top: offset(start), height: Math.max(30, (appointment.durationMinutes * HOUR_PX) / 60) }}
                      >
                        <button
                          type="button"
                          className={`cal-block cal-block--${cue.tone}${endOf(appointment) < now ? ' is-past' : ''}`}
                          onClick={() => onOpen(appointment.id)}
                        >
                          <span className="cal-block__name">{clientOf(appointment)?.displayName ?? 'Client'}</span>{' '}
                          <span className="cal-block__time num">
                            <Icon size={13} aria-hidden="true" />
                            <span>{timeRange(appointment)}</span>
                          </span>{' '}
                          <span className="cal-block__service">{serviceName(appointment.sessionType)}</span>
                          <span className="visually-hidden">, {cue.label}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <span className="visually-hidden">No visits</span>
              )}
              {isToday ? (
                <span className="week__now" style={{ top: offset(nowMinutes) }} aria-hidden="true" />
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Agenda({ days, byDay, today, now, clientOf, onOpen, workingDays }: ViewProps) {
  return (
    <ol className="agenda">
      {days.map((key) => {
        const list = byDay.get(key) ?? []
        const isToday = key === today
        return (
          <li key={key} className={`agenda__day${isToday ? ' is-today' : ''}`}>
            <h3 className="agenda__date">
              {formatDayKey(key)}
              {isToday ? <Badge tone="favourable">Today</Badge> : null}
            </h3>
            {list.length ? (
              <ul className="agenda__list">
                {list.map((appointment) => {
                  const cue = statusCue(appointment)
                  const Icon = cue.icon
                  return (
                    <li key={appointment.id}>
                      <button
                        type="button"
                        className={`agenda-item cal-block--${cue.tone}${endOf(appointment) < now ? ' is-past' : ''}`}
                        onClick={() => onOpen(appointment.id)}
                      >
                        <span className="agenda-item__time num">
                          {fmtTime(appointment.startsAt)}{' '}
                          <small>{appointment.durationMinutes} min</small>
                        </span>{' '}
                        <span className="agenda-item__body">
                          <strong>{clientOf(appointment)?.displayName ?? 'Client'}</strong>{' '}
                          <span>{serviceName(appointment.sessionType)}</span>
                        </span>{' '}
                        <span className="agenda-item__cue">
                          <Icon size={15} aria-hidden="true" />
                          {cue.label}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="agenda__empty">{workingDays.includes(weekdayOf(key)) ? 'Nothing booked' : 'Day off'}</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function AppointmentSheet({
  appointment,
  clientName,
  today,
  onClose,
}: {
  appointment: DemoAppointment
  clientName: string
  today: string
  onClose: () => void
}) {
  const cue = statusCue(appointment)
  const Icon = cue.icon
  const finished = appointment.status === 'completed' || Boolean(appointment.session?.finishedAt)
  const started = Boolean(appointment.session?.startedAt)
  const dayOf = !finished && (started || zonedParts(appointment.startsAt, tz).dayKey === today)
  const arrivalFirst = dayOf && !appointment.arrival && !started

  return (
    <Modal
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={clientName}
      description={`${fmtDay(appointment.startsAt)} · ${timeRange(appointment)}`}
    >
      <div className="cal-sheet">
        <dl className="cal-sheet__facts">
          <div>
            <dt>Visit</dt>
            <dd>
              {serviceName(appointment.sessionType)} · <span className="nowrap">{appointment.durationMinutes} min</span>
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd className="cal-sheet__cue">
              <Icon size={16} aria-hidden="true" /> {cue.label}
            </dd>
          </div>
          <div>
            <dt>Room</dt>
            <dd>{appointment.room}</dd>
          </div>
        </dl>
        <div className="cal-sheet__actions">
          {arrivalFirst ? (
            <Link to={`/therapist/arrival/${appointment.id}`} className="button button--primary button--lg">
              Begin arrival
            </Link>
          ) : null}
          {dayOf ? (
            <Link
              to={`/therapist/session/${appointment.id}`}
              className={`button button--lg ${arrivalFirst ? 'button--secondary' : 'button--primary'}`}
            >
              Open Session Mode
            </Link>
          ) : null}
          <Link to={`/therapist/clients/${appointment.clientId}`} className="button button--secondary button--lg">
            Open {clientName}
          </Link>
        </div>
      </div>
    </Modal>
  )
}
