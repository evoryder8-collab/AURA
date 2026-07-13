import { addDays, format } from 'date-fns'
import { CalendarPlus, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/design-system/Button'
import { Field, Input, Select } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { useDemoStore } from '@/data/demo/store'

export function QuickAppointmentModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const clients = useDemoStore((state) => state.clients)
  const addClient = useDemoStore((state) => state.addClient)
  const addAppointment = useDemoStore((state) => state.addAppointment)
  const [path, setPath] = useState<'existing' | 'new'>('existing')
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [startsAt, setStartsAt] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd'T'10:00"))
  const [sessionType, setSessionType] = useState('Restorative massage')
  const [duration, setDuration] = useState('60')

  const save = () => {
    const selectedId =
      path === 'new'
        ? addClient({ preferredName: name || 'New demo client', email, phone })
        : clientId
    if (!selectedId) return
    addAppointment({
      clientId: selectedId,
      startsAt: new Date(startsAt).toISOString(),
      durationMinutes: Number(duration),
      sessionType,
      status: path === 'new' ? 'pending' : 'confirmed',
      intakeStatus:
        path === 'new'
          ? 'pending'
          : (clients.find((client) => client.id === selectedId)?.intakeStatus ?? 'pending'),
      room: 'Studio',
    })
    setName('')
    setEmail('')
    setPhone('')
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create an appointment"
      description="Choose an existing record or begin a new fictional demo intake."
    >
      <div className="path-selector" role="group" aria-label="Client type">
        <button
          className={path === 'existing' ? 'is-active' : ''}
          onClick={() => setPath('existing')}
        >
          <Users size={19} />
          <span>
            <strong>Existing Client</strong>
            <small>Book from the active client list</small>
          </span>
        </button>
        <button className={path === 'new' ? 'is-active' : ''} onClick={() => setPath('new')}>
          <UserPlus size={19} />
          <span>
            <strong>New Client</strong>
            <small>Creates a Pending Intake</small>
          </span>
        </button>
      </div>
      <div className="form-stack appointment-form">
        {path === 'existing' ? (
          <Field label="Client">
            <Select value={clientId} onChange={(event) => setClientId(event.target.value)}>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.displayName}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="form-grid">
            <Field label="Preferred name">
              <Input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Fictional demo name"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.invalid"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+00 000 000 0000"
              />
            </Field>
          </div>
        )}
        <div className="form-grid">
          <Field label="Date and time">
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field label="Session type">
            <Select value={sessionType} onChange={(event) => setSessionType(event.target.value)}>
              <option>Restorative massage</option>
              <option>First visit</option>
              <option>Progress review</option>
              <option>Focused session</option>
            </Select>
          </Field>
          <Field label="Duration">
            <Select value={duration} onChange={(event) => setDuration(event.target.value)}>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="75">75 minutes</option>
              <option value="90">90 minutes</option>
            </Select>
          </Field>
        </div>
      </div>
      <div className="form-actions">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          icon={<CalendarPlus size={17} />}
          onClick={save}
          disabled={path === 'new' && !name.trim()}
        >
          Create appointment
        </Button>
      </div>
    </Modal>
  )
}
