import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/design-system/Button'
import { Modal } from '@/components/design-system/Modal'
import { useDemoStore } from '@/data/demo/store'

/** Puts the synthetic demo back to its starting state, after an explicit confirmation. */
export function ResetDemoData() {
  const resetDemo = useDemoStore((state) => state.resetDemo)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

  return (
    <div className="stack">
      <p className="small muted">
        Everything in this demo is fictional and kept only in this browser. Resetting brings back
        the starting visits, logs, consent choices and reports, and removes photos you saved.
      </p>
      <div>
        <Button
          variant="secondary"
          icon={<RotateCcw size={16} aria-hidden="true" />}
          onClick={() => setConfirming(true)}
        >
          Reset demo data
        </Button>
      </div>
      <p role="status" className="small" aria-live="polite">
        {done ? 'Demo data reset to its starting state.' : ''}
      </p>
      <Modal
        open={confirming}
        onOpenChange={setConfirming}
        title="Reset the synthetic demo?"
        description="Every change made in this browser is replaced with the starting demo data. This cannot be undone."
      >
        <div className="row row--wrap">
          <Button
            variant="danger"
            onClick={() => {
              resetDemo()
              setDone(true)
              setConfirming(false)
            }}
          >
            Reset demo data
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Keep my changes
          </Button>
        </div>
      </Modal>
    </div>
  )
}
