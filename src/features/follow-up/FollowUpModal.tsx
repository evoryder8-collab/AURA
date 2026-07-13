import { Check, HeartHandshake } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/design-system/Button'
import { Field, Textarea } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { useDemoStore } from '@/data/demo/store'
import { FlowerPicker } from '@/features/body-map/FlowerPicker'

const responses = [
  'Much better',
  'Better',
  'Similar',
  'More tender but acceptable',
  'Worse',
  'Significantly worse',
]

export function FollowUpModal({
  clientId,
  appointmentId,
  open,
  onOpenChange,
}: {
  clientId: string
  appointmentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const client = useDemoStore((state) => state.clients.find((item) => item.id === clientId))
  const record = useDemoStore((state) => state.recordFollowUp)
  const [response, setResponse] = useState('')
  const [goalScore, setGoalScore] = useState(client?.goals[0]?.current ?? 5)
  const [comment, setComment] = useState('')
  const [complete, setComplete] = useState(false)

  const save = () => {
    record({ clientId, appointmentId, response, goalScore, comment })
    setComplete(true)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="A gentle next-day check-in"
      description="A missing response is never treated as a negative response."
    >
      {complete ? (
        <div className="followup-complete">
          <span>
            <Check size={25} />
          </span>
          <h3>Thank you</h3>
          <p>Your synthetic response has been added to your private progress view.</p>
          <Button onClick={() => onOpenChange(false)}>Return home</Button>
        </div>
      ) : (
        <div className="followup-flow">
          <HeartHandshake size={24} />
          <h3>How do you feel compared with before the session?</h3>
          <div className="response-options">
            {responses.map((item) => (
              <button
                key={item}
                className={response === item ? 'is-active' : ''}
                onClick={() => setResponse(item)}
              >
                {item}
              </button>
            ))}
          </div>
          {client?.goals[0] && (
            <FlowerPicker
              label="How possible does your goal feel today?"
              value={goalScore}
              onChange={setGoalScore}
            />
          )}
          <Field label="Anything you would like to add? (optional)">
            <Textarea value={comment} onChange={(event) => setComment(event.target.value)} />
          </Field>
          <Button fullWidth disabled={!response} onClick={save}>
            Save response
          </Button>
        </div>
      )}
    </Modal>
  )
}
