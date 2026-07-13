import { addDays, addWeeks, format, isSameDay, startOfWeek, subWeeks } from 'date-fns'
import { CalendarPlus, ChevronLeft, ChevronRight, Clock3, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Field, Input, Select } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { PageHeader } from '@/components/design-system/PageHeader'
import { useDemoStore } from '@/data/demo/store'
import type { DemoAppointment } from '@/data/demo/model'
import { QuickAppointmentModal } from './QuickAppointmentModal'

export function CalendarPage() {
  const appointments = useDemoStore((state) => state.appointments)
  const clients = useDemoStore((state) => state.clients)
  const updateAppointment = useDemoStore((state) => state.updateAppointment)
  const [anchor, setAnchor] = useState(new Date())
  const [view, setView] = useState<'day' | 'week'>('week')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<DemoAppointment | null>(null)
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })
  const days = useMemo(
    () => (view === 'day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))),
    [anchor, view, weekStart],
  )
  const [editTime, setEditTime] = useState('')
  const [editDuration, setEditDuration] = useState('60')
  const openEdit = (appointment: DemoAppointment) => {
    setEditing(appointment)
    setEditTime(format(new Date(appointment.startsAt), "yyyy-MM-dd'T'HH:mm"))
    setEditDuration(String(appointment.durationMinutes))
  }
  const saveEdit = () => {
    if (!editing) return
    updateAppointment(editing.id, {
      startsAt: new Date(editTime).toISOString(),
      durationMinutes: Number(editDuration),
    })
    setEditing(null)
  }
  return (
    <div>
      <PageHeader
        eyebrow="Practice calendar · Europe/Zurich"
        title={
          <>
            Time, with room
            <br />
            to breathe.
          </>
        }
        lead="Timestamps are stored in UTC and presented in the configured practice timezone."
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
            <Button icon={<CalendarPlus size={16} />} onClick={() => setCreateOpen(true)}>
              New appointment
            </Button>
          </>
        }
      />
      <div className="calendar-toolbar">
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronLeft size={16} />}
          onClick={() => setAnchor(view === 'week' ? subWeeks(anchor, 1) : addDays(anchor, -1))}
        >
          Previous
        </Button>
        <h2>
          {view === 'week'
            ? `${format(weekStart, 'd MMM')} — ${format(addDays(weekStart, 6), 'd MMM yyyy')}`
            : format(anchor, 'EEEE, d MMMM yyyy')}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          iconAfter={<ChevronRight size={16} />}
          onClick={() => setAnchor(view === 'week' ? addWeeks(anchor, 1) : addDays(anchor, 1))}
        >
          Next
        </Button>
      </div>
      <section
        className={`calendar-grid calendar-grid--${view}`}
        aria-label={`${view} appointment calendar`}
      >
        {days.map((day) => (
          <div
            className={`calendar-day${isSameDay(day, new Date()) ? ' is-today' : ''}`}
            key={day.toISOString()}
          >
            <header>
              <span>{format(day, 'EEE')}</span>
              <strong>{format(day, 'd')}</strong>
            </header>
            <div className="calendar-day__body">
              {appointments
                .filter((item) => isSameDay(new Date(item.startsAt), day))
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                .map((appointment) => {
                  const client = clients.find((item) => item.id === appointment.clientId)
                  return (
                    <button
                      className={`calendar-event calendar-event--${appointment.status}`}
                      key={appointment.id}
                      onClick={() => openEdit(appointment)}
                    >
                      <span>
                        <Clock3 size={11} />
                        {format(new Date(appointment.startsAt), 'HH:mm')}
                      </span>
                      <strong>{client?.preferredName}</strong>
                      <small>
                        {appointment.sessionType} · {appointment.durationMinutes}m
                      </small>
                      <Badge tone={appointment.intakeStatus === 'complete' ? 'neutral' : 'pending'}>
                        {appointment.intakeStatus === 'complete'
                          ? appointment.status
                          : 'Pending Intake'}
                      </Badge>
                    </button>
                  )
                })}
            </div>
          </div>
        ))}
      </section>
      <p className="microcopy calendar-scope">
        Calendar cells contain scheduling context only; sensitive health detail and private notes
        stay inside the client record.
      </p>
      <QuickAppointmentModal open={createOpen} onOpenChange={setCreateOpen} />
      <Modal
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit appointment time"
        description="A safe edit flow replaces drag-and-drop on touch devices."
      >
        <div className="form-stack">
          <Field label="Date and time">
            <Input
              type="datetime-local"
              value={editTime}
              onChange={(event) => setEditTime(event.target.value)}
            />
          </Field>
          <Field label="Duration">
            <Select value={editDuration} onChange={(event) => setEditDuration(event.target.value)}>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="75">75 minutes</option>
              <option value="90">90 minutes</option>
            </Select>
          </Field>
          <Button icon={<Pencil size={16} />} onClick={saveEdit}>
            Save changes
          </Button>
        </div>
      </Modal>
    </div>
  )
}
