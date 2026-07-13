import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileOutput,
  Info,
  LockKeyhole,
  MapPin,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { ProgressRing } from '@/components/design-system/ProgressRing'
import { StatusStrip } from '@/components/feedback/StatusStrip'
import { useDemoStore } from '@/data/demo/store'
import { deriveClientMetrics } from '@/data/demo/derive'
import { BodyMap } from '@/features/body-map/BodyMap'
import { HandoffWorkflow } from '@/features/handoffs/HandoffWorkflow'
import { PhotoCapture } from '@/features/photos/PhotoCapture'
import { ProgressChart } from '@/features/progress/ProgressChart'
import { formatDay, formatFullDate, patternLabel } from '@/lib/formatting/labels'

export function ClientDashboardPage() {
  const { clientId } = useParams()
  const client = useDemoStore((state) => state.clients.find((item) => item.id === clientId))
  const allAppointments = useDemoStore((state) => state.appointments)
  const appointments = useMemo(
    () => allAppointments.filter((item) => item.clientId === clientId),
    [allAppointments, clientId],
  )
  const approveInsight = useDemoStore((state) => state.approveInsight)
  const navigate = useNavigate()
  const [whyOpen, setWhyOpen] = useState(false)
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [range, setRange] = useState<'4w' | '3m' | 'all'>('3m')
  const [selectedVisit, setSelectedVisit] = useState<string | null>(null)

  const engineResult = useMemo(() => {
    if (!client) return null
    return deriveClientMetrics(client)
  }, [client])

  if (!client)
    return (
      <Card tone="soft">
        <h1>Client record not found</h1>
        <Button onClick={() => navigate('/therapist/clients')}>Return to Clients</Button>
      </Card>
    )
  const latest = client.metrics.at(-1)
  const goal = client.goals[0]
  const recoveryIndex = engineResult?.recoveryIndex ?? 0
  const confidence = engineResult?.confidence ?? 0
  const currentPattern = engineResult?.pattern ?? client.pattern
  const sortedAppointments = [...appointments].sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  const chartPoints = range === '4w' ? client.metrics.slice(-4) : client.metrics

  return (
    <div className="client-dashboard">
      <button className="back-link" onClick={() => navigate('/therapist/clients')}>
        <ArrowLeft size={17} /> All clients
      </button>
      <header className="client-hero">
        <div className="client-hero__identity">
          <div className="client-avatar client-avatar--large">{client.preferredName[0]}</div>
          <div>
            <div className="client-hero__badges">
              <Badge tone="neutral">Fictional demo record</Badge>
              {client.reviewProgress && (
                <Badge tone="concern">
                  <AlertTriangle size={12} /> Review Progress
                </Badge>
              )}
            </div>
            <h1>{client.preferredName}</h1>
            <p>{client.phase} · active client</p>
          </div>
        </div>
        <div className="client-hero__actions">
          <Button
            variant="secondary"
            icon={<CalendarPlus size={16} />}
            onClick={() => navigate('/therapist/calendar')}
          >
            Book
          </Button>
          <Button icon={<FileOutput size={16} />} onClick={() => setHandoffOpen(true)}>
            Prepare handoff
          </Button>
        </div>
      </header>
      {client.caution && (
        <StatusStrip
          tone={client.reviewProgress ? 'concern' : 'caution'}
          title={client.caution.label}
        >
          {client.caution.fact}{' '}
          <small>
            Source: {client.caution.source} · last reviewed {formatDay(client.caution.reviewedAt)}.
            Therapist judgment required.
          </small>
        </StatusStrip>
      )}

      <section className="dashboard-summary">
        <Card tone="dark" className="recovery-card">
          <div>
            <p className="eyebrow">Recovery Index</p>
            <h2>{recoveryIndex}</h2>
            <span>out of 100</span>
          </div>
          <ProgressRing value={recoveryIndex} label="Recovery Index" size={142} />
          <div className="recovery-card__confidence">
            <span>Confidence</span>
            <strong>{confidence}%</strong>
            <small>{client.metrics.length} comparable observations</small>
          </div>
        </Card>
        <Card className="insight-card" tone={client.reviewProgress ? 'concern' : 'default'}>
          <div className="insight-card__top">
            <div className="insight-mark">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="eyebrow">Synergy Insight · {client.insight.status}</p>
              <h2>{patternLabel[currentPattern]}</h2>
            </div>
          </div>
          <p>{client.insight.therapist}</p>
          <div className="insight-evidence">{client.insight.evidence}</div>
          {client.insight.status === 'draft' && (
            <div className="insight-actions">
              <Button
                variant="secondary"
                size="sm"
                icon={<X size={14} />}
                onClick={() => approveInsight(client.id, false)}
              >
                Reject draft
              </Button>
              <Button
                size="sm"
                icon={<Check size={14} />}
                onClick={() => approveInsight(client.id, true)}
              >
                Approve client narration
              </Button>
            </div>
          )}
          <button
            className="why-button"
            onClick={() => setWhyOpen((value) => !value)}
            aria-expanded={whyOpen}
          >
            <Info size={15} /> Why am I seeing this?{' '}
            {whyOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {whyOpen && engineResult && (
            <div className="why-panel">
              <p>
                <strong>Pure deterministic engine</strong> · {engineResult.result.engineVersion} /{' '}
                {engineResult.result.ruleVersion}
              </p>
              <dl>
                <div>
                  <dt>Triggered rule</dt>
                  <dd>{engineResult.result.triggeredRule}</dd>
                </div>
                <div>
                  <dt>Included</dt>
                  <dd>{engineResult.result.evidence.includedPoints.length} observations</dd>
                </div>
                <div>
                  <dt>Excluded</dt>
                  <dd>{engineResult.result.evidence.excludedPoints.length} data points</dd>
                </div>
                <div>
                  <dt>Recovery delta</dt>
                  <dd>{engineResult.result.explanation.facts.recoveryIndexDelta ?? '—'}</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>
                    {engineResult.result.confidence.score}% · {engineResult.result.confidence.level}
                  </dd>
                </div>
                <div>
                  <dt>Threshold status</dt>
                  <dd>{engineResult.result.explanation.thresholdLabel}</dd>
                </div>
              </dl>
              <p>Context events indicate proximity only. They do not establish a cause.</p>
            </div>
          )}
        </Card>
        <Card tone="gold" className="goal-card">
          <div className="goal-card__icon">
            <Target size={22} />
          </div>
          <p className="eyebrow">Active functional goal</p>
          <h2>{goal?.wording ?? 'Building the first goal'}</h2>
          <div className="goal-card__score">
            <span>
              Baseline <strong>{goal?.baseline ?? '—'}</strong>
            </span>
            <i />
            <span>
              Now <strong>{goal?.current ?? '—'}</strong>
            </span>
          </div>
          <p>
            {goal?.category} · target {goal ? formatFullDate(goal.targetDate) : 'not set'}
          </p>
        </Card>
      </section>

      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Progress suite</p>
            <h2>Recorded over time</h2>
          </div>
          <div className="range-pills" role="group" aria-label="Graph time range">
            <button className={range === '4w' ? 'is-active' : ''} onClick={() => setRange('4w')}>
              4W
            </button>
            <button className={range === '3m' ? 'is-active' : ''} onClick={() => setRange('3m')}>
              3M
            </button>
            <button className={range === 'all' ? 'is-active' : ''} onClick={() => setRange('all')}>
              All
            </button>
          </div>
        </div>
        <div className="chart-grid">
          <ProgressChart points={chartPoints} metric="pain" />
          <ProgressChart points={chartPoints} metric="stiffness" />
          <ProgressChart points={chartPoints} metric="rom" />
          <ProgressChart points={chartPoints} metric="function" />
          <ProgressChart points={chartPoints} metric="response" />
          <ProgressChart points={chartPoints} metric="recovery" />
        </div>
      </section>

      <section className="dashboard-detail-grid">
        <Card eyebrow="Focus Map" title="Body journey">
          <BodyMap
            value={[goal?.region ?? 'lower_back']}
            priorityRegions={[goal?.region ?? 'lower_back']}
            cautionRegions={client.caution ? [client.caution.region] : []}
            readonly
          />
          <div className="body-snapshot-row">
            <span>
              <MapPin size={13} /> Latest focus
            </span>
            <strong>{goal?.region.replaceAll('_', ' ') ?? 'Not recorded'}</strong>
          </div>
        </Card>
        <Card
          eyebrow="Visual Progress"
          title="Private photo record"
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={<Camera size={15} />}
              onClick={() => setPhotoOpen(true)}
            >
              Add photo
            </Button>
          }
        >
          {!client.consents.photography ? (
            <div className="locked-state">
              <LockKeyhole size={25} />
              <strong>Photography consent is not active</strong>
              <span>
                Capture and viewing remain unavailable until optional consent is recorded.
              </span>
            </div>
          ) : client.photos.length ? (
            <div className="photo-grid">
              {client.photos.map((photo) => (
                <div key={photo.id} className="photo-placeholder">
                  <span>{photo.view}</span>
                  <div className="photo-silhouette" />
                  <small>{photo.phase}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="locked-state">
              <Camera size={25} />
              <strong>No photographs recorded</strong>
              <span>Alignment assistance and file upload are ready.</span>
            </div>
          )}
        </Card>
        <Card eyebrow="Therapist-only" title="Assessment observations">
          <div className="assessment-table">
            <div className="assessment-table__head">
              <span>Date</span>
              <span>Region</span>
              <span>Stiffness</span>
              <span>ROM</span>
            </div>
            {client.metrics
              .slice(-4)
              .reverse()
              .map((point) => (
                <div key={point.id}>
                  <span>{formatDay(point.recordedAt)}</span>
                  <span>{goal?.region.replaceAll('_', ' ') ?? 'General'}</span>
                  <span>{point.stiffness}/10</span>
                  <span>{point.rom}/10</span>
                </div>
              ))}
          </div>
          <p className="private-note">
            <LockKeyhole size={13} /> Private assessment details are not exposed to the client
            portal.
          </p>
        </Card>
        <Card eyebrow="Appointment history" title={`${sortedAppointments.length} recorded visits`}>
          <div className="history-ribbon">
            {sortedAppointments.map((appointment) => (
              <button
                key={appointment.id}
                title={`${appointment.sessionType}, ${formatFullDate(appointment.startsAt)}`}
                aria-pressed={selectedVisit === appointment.id}
                onClick={() => setSelectedVisit(appointment.id)}
              >
                <i className={`history-dot history-dot--${appointment.status}`} />
                <span>{new Date(appointment.startsAt).getDate()}</span>
                <small>
                  {new Date(appointment.startsAt).toLocaleString('en', { month: 'short' })}
                </small>
              </button>
            ))}
          </div>
          {selectedVisit && (
            <p className="microcopy">
              {sortedAppointments.find((item) => item.id === selectedVisit)?.sessionType} ·{' '}
              {sortedAppointments.find((item) => item.id === selectedVisit)?.status} · scheduling
              detail only
            </p>
          )}
          <div className="session-response">
            <ClipboardCheck size={17} />
            <div>
              <span>Latest Session Response</span>
              <strong>
                {sortedAppointments.find((item) => item.session?.response)?.session?.response ??
                  'Awaiting next-day response'}
              </strong>
            </div>
            <Badge tone={latest && latest.response >= 6 ? 'favourable' : 'attention'}>
              {latest?.response ?? '—'}/10
            </Badge>
          </div>
        </Card>
      </section>
      <HandoffWorkflow client={client} open={handoffOpen} onOpenChange={setHandoffOpen} />
      <PhotoCapture client={client} open={photoOpen} onOpenChange={setPhotoOpen} />
    </div>
  )
}
