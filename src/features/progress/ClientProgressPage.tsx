import { LockKeyhole, Sparkles, Target } from 'lucide-react'
import { Badge } from '@/components/design-system/Badge'
import { Card } from '@/components/design-system/Card'
import { PageHeader } from '@/components/design-system/PageHeader'
import { ProgressRing } from '@/components/design-system/ProgressRing'
import { useDemoStore } from '@/data/demo/store'
import { deriveClientMetrics } from '@/data/demo/derive'
import { useAuth } from '@/features/auth/auth-context'
import { ProgressChart } from './ProgressChart'
import { patternLabel } from '@/lib/formatting/labels'

export function ClientProgressPage() {
  const auth = useAuth()
  const client = useDemoStore((state) =>
    state.clients.find((item) => item.id === auth.demoClientId),
  )
  if (!client) return null
  const derived = deriveClientMetrics(client)
  return (
    <div>
      <PageHeader
        eyebrow="Your progress"
        title={
          <>
            A clear view
            <br />
            of your journey.
          </>
        }
        lead="Only information approved for your personal portal is shown."
      />
      <section className="client-progress-hero">
        <Card tone="dark">
          <ProgressRing value={derived.recoveryIndex} label="Recovery Index" size={150} />
          <div>
            <p className="eyebrow">Recovery Index</p>
            <h2>{derived.recoveryIndex}/100</h2>
            <Badge tone={client.reviewProgress ? 'attention' : 'favourable'}>
              {derived.confidence}% confidence
            </Badge>
          </div>
        </Card>
        <Card tone="gold">
          <Target size={22} />
          <p className="eyebrow">Functional goal</p>
          <h2>{client.goals[0]?.wording}</h2>
          <p>
            {client.goals[0]?.baseline}/10 baseline → {client.goals[0]?.current}/10 now
          </p>
        </Card>
      </section>
      {client.insight.status === 'approved' ? (
        <Card className="client-insight">
          <Sparkles size={20} />
          <div>
            <p className="eyebrow">Therapist-approved insight</p>
            <h2>{patternLabel[derived.pattern]}</h2>
            <p>{client.insight.client}</p>
            <small>{client.insight.evidence}</small>
          </div>
        </Card>
      ) : (
        <Card tone="soft">
          <LockKeyhole size={20} />
          <p>Draft insight remains private until therapist approval.</p>
        </Card>
      )}
      <section className="dashboard-section">
        <div className="chart-grid">
          <ProgressChart points={client.metrics} metric="pain" />
          <ProgressChart points={client.metrics} metric="stiffness" />
          <ProgressChart points={client.metrics} metric="rom" />
          <ProgressChart points={client.metrics} metric="function" />
          <ProgressChart points={client.metrics} metric="response" />
          <ProgressChart points={client.metrics} metric="recovery" />
        </div>
      </section>
      <p className="client-scope-note">
        These graphs show recorded observations and a deterministic prototype pattern. They do not
        diagnose, establish a cause, or guarantee an outcome.
      </p>
    </div>
  )
}
