import { ArrowLeft, ArrowRight, Check, Clock3, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { useAuth } from '@/features/auth/auth-context'
import { BodyMap } from '@/features/body-map/BodyMap'
import { FlowerPicker } from '@/features/body-map/FlowerPicker'
import { useDemoStore } from '@/data/demo/store'
import { queueOfflineMutation } from '@/lib/offline/queueClient'

const eventOptions = [
  'Poor sleep',
  'Long drive',
  'Sport',
  'More desk time',
  'Travel',
  'Nothing to add',
]

export function CheckInPage() {
  const { appointmentId } = useParams()
  const auth = useAuth()
  const client = useDemoStore((state) =>
    state.clients.find((item) => item.id === auth.demoClientId),
  )
  const appointment = useDemoStore((state) =>
    state.appointments.find((item) => item.id === appointmentId),
  )
  const recordCheckIn = useDemoStore((state) => state.recordCheckIn)
  const navigate = useNavigate()
  const latest = client?.metrics.at(-1)
  const [mode, setMode] = useState<'confirm' | 'edit'>('confirm')
  const [step, setStep] = useState(0)
  const [regions, setRegions] = useState([client?.goals[0]?.region ?? 'lower_back'])
  const [pain, setPain] = useState(latest?.pain ?? 4)
  const [events, setEvents] = useState<string[]>([])
  const [goal, setGoal] = useState(client?.goals[0]?.current ?? 5)
  const [saved, setSaved] = useState(false)

  if (!client || !appointment)
    return (
      <Card>
        <h1>Check-in unavailable</h1>
        <Button onClick={() => navigate('/client/home')}>Return home</Button>
      </Card>
    )

  const save = () => {
    recordCheckIn({
      clientId: client.id,
      appointmentId: appointment.id,
      pain,
      stiffness: latest?.stiffness ?? 4,
      rom: latest?.rom ?? 6,
      functionScore: goal,
      events,
    })
    if (!navigator.onLine)
      void queueOfflineMutation(auth.user?.id ?? client.id, 'check_in.recorded', {
        appointmentId: appointment.id,
        pain,
        functionScore: goal,
      })
    setSaved(true)
  }

  if (saved)
    return (
      <div className="checkin checkin--complete">
        <div className="checkin-complete-mark">
          <Check size={28} />
        </div>
        <p className="eyebrow">Check-in complete</p>
        <h1>
          You’re ready
          <br />
          for today.
        </h1>
        <p>Your therapist can review the changes before the session.</p>
        <Button onClick={() => navigate('/client/home')}>Return home</Button>
      </div>
    )

  return (
    <div className="checkin">
      <button className="back-link" onClick={() => navigate('/client/home')}>
        <ArrowLeft size={17} /> Back home
      </button>
      <header className="checkin__header">
        <div>
          <Badge tone="favourable" icon={<Clock3 size={12} />}>
            About 20 seconds
          </Badge>
          <h1>
            What feels
            <br />
            different today?
          </h1>
          <p>Previously active regions and ratings are already here. Change only what moved.</p>
        </div>
        <div className="checkin__progress">
          <span>{mode === 'confirm' ? 'Quick confirm' : `Step ${step + 1} of 4`}</span>
          <i>
            <b style={{ width: mode === 'confirm' ? '25%' : `${((step + 1) / 4) * 100}%` }} />
          </i>
        </div>
      </header>
      {mode === 'confirm' ? (
        <Card className="confirm-card">
          <div className="confirm-card__mark">
            <Sparkles size={20} />
          </div>
          <p className="eyebrow">Your last recorded state</p>
          <h2>
            {client.goals[0]?.region.replaceAll('_', ' ')} · {latest?.pain}/10
          </h2>
          <p>
            Goal: {client.goals[0]?.wording}
            <br />
            Ability: {client.goals[0]?.current}/10
          </p>
          <div className="confirm-card__actions">
            <Button size="lg" icon={<Check size={17} />} onClick={save}>
              Confirm unchanged
            </Button>
            <Button
              variant="secondary"
              size="lg"
              icon={<Plus size={17} />}
              onClick={() => setMode('edit')}
            >
              Something changed
            </Button>
          </div>
          <small>One tap saves an unchanged check-in.</small>
        </Card>
      ) : (
        <Card className="checkin-card">
          {step === 0 && (
            <div>
              <p className="eyebrow">1 · Current regions</p>
              <h2>Is this still where you notice it?</h2>
              <BodyMap value={regions} onChange={setRegions} />
              <p className="microcopy">
                Add a region, keep the selection, or tap a selected region to clear it.
              </p>
            </div>
          )}
          {step === 1 && (
            <div>
              <p className="eyebrow">2 · Rating</p>
              <h2>Change only what moved.</h2>
              <FlowerPicker value={pain} onChange={setPain} />
            </div>
          )}
          {step === 2 && (
            <div>
              <p className="eyebrow">3 · Context</p>
              <h2>Anything nearby in time?</h2>
              <p className="microcopy">
                Optional events are displayed as proximity only, never as a cause.
              </p>
              <div className="event-chips">
                {eventOptions.map((event) => (
                  <button
                    key={event}
                    className={events.includes(event) ? 'is-active' : ''}
                    onClick={() =>
                      setEvents((items) =>
                        items.includes(event)
                          ? items.filter((item) => item !== event)
                          : [...items, event],
                      )
                    }
                  >
                    {event}
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 3 && (
            <div>
              <p className="eyebrow">4 · Your goal</p>
              <h2>How possible does this feel today?</h2>
              <p>{client.goals[0]?.wording}</p>
              <FlowerPicker label="Current ability" value={goal} onChange={setGoal} />
            </div>
          )}
          <div className="checkin-card__actions">
            {step > 0 && (
              <Button
                variant="ghost"
                icon={<ArrowLeft size={16} />}
                onClick={() => setStep((value) => value - 1)}
              >
                Back
              </Button>
            )}
            {step < 3 ? (
              <Button
                iconAfter={<ArrowRight size={16} />}
                onClick={() => setStep((value) => value + 1)}
              >
                Continue
              </Button>
            ) : (
              <Button icon={<Check size={16} />} onClick={save}>
                Save check-in
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
