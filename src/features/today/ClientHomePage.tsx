import { format } from 'date-fns'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gift,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { StatusStrip } from '@/components/feedback/StatusStrip'
import { TherapistPortrait } from '@/components/identity/TherapistPortrait'
import { useDemoStore } from '@/data/demo/store'
import { deriveClientMetrics } from '@/data/demo/derive'
import { useAuth } from '@/features/auth/auth-context'
import { FollowUpModal } from '@/features/follow-up/FollowUpModal'
import { IntakeFlow } from '@/features/intake/IntakeFlow'
import { patternLabel } from '@/lib/formatting/labels'

export function ClientHomePage() {
  const auth = useAuth()
  const client = useDemoStore((state) =>
    state.clients.find((item) => item.id === auth.demoClientId),
  )
  const allAppointments = useDemoStore((state) => state.appointments)
  const therapists = useDemoStore((state) => state.therapists)
  const appointments = allAppointments.filter((item) => item.clientId === auth.demoClientId)
  const navigate = useNavigate()
  const [followupOpen, setFollowupOpen] = useState(false)
  const [intakeOpen, setIntakeOpen] = useState(false)
  if (!client)
    return (
      <Card>
        <h1>Demo client unavailable</h1>
      </Card>
    )
  const upcoming = appointments
    .filter(
      (item) =>
        new Date(item.startsAt) >= new Date() && !['cancelled', 'declined'].includes(item.status),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]
  const followupAppointment = [...appointments]
    .reverse()
    .find((item) => item.status === 'completed' && item.session && !client.lastFollowUpAt)
  const goal = client.goals[0]
  const derived = deriveClientMetrics(client)
  const upcomingTherapist = therapists.find((therapist) => therapist.id === upcoming?.therapistId)

  return (
    <div className="client-home">
      <header className="client-welcome">
        <div>
          <p className="eyebrow">Your private AURA</p>
          <h1>Welcome, {client.preferredName}.</h1>
          <p>A simple view of what is next and what you have chosen to record.</p>
        </div>
        <div className="client-welcome__mark">
          <Sparkles size={24} />
        </div>
      </header>
      {followupAppointment && (
        <StatusStrip
          tone="info"
          title="Your next-day reflection is ready"
          action={
            <Button size="sm" onClick={() => setFollowupOpen(true)}>
              Check in now
            </Button>
          }
        >
          About 30 seconds · a missing response is never treated as negative.
        </StatusStrip>
      )}
      {client.intakeStatus !== 'complete' && (
        <StatusStrip
          tone="caution"
          title="Your first-visit intake is waiting"
          action={
            <Button size="sm" onClick={() => setIntakeOpen(true)}>
              Continue intake
            </Button>
          }
        >
          Complete the card flow before your appointment. You can save and resume.
        </StatusStrip>
      )}
      <section className="client-home-grid">
        <Card
          tone="dark"
          className="next-visit-card"
          eyebrow="Next appointment"
          title={
            upcoming ? format(new Date(upcoming.startsAt), 'EEEE, d MMMM') : 'Nothing booked yet'
          }
        >
          {upcoming ? (
            <>
              <div className="next-visit-time">
                <Clock3 size={19} />
                <strong>{format(new Date(upcoming.startsAt), 'HH:mm')}</strong>
                <span>
                  {upcoming.durationMinutes} minutes · {upcoming.sessionType}
                </span>
              </div>
              {upcomingTherapist && (
                <div className="next-visit-provider">
                  <TherapistPortrait
                    therapist={upcomingTherapist}
                    className="next-visit-provider__portrait"
                  />
                  <span>
                    <small>Your therapist</small>
                    <strong>
                      {upcomingTherapist.displayName.replace(' — fictional demo', '')}
                    </strong>
                  </span>
                </div>
              )}
              {upcoming.intakeStatus === 'complete' ? (
                <Button
                  variant="gold"
                  iconAfter={<ArrowRight size={16} />}
                  onClick={() => navigate(`/client/check-in/${upcoming.id}`)}
                >
                  Start returning check-in
                </Button>
              ) : (
                <Button variant="gold" onClick={() => setIntakeOpen(true)}>
                  Complete first-visit intake
                </Button>
              )}
            </>
          ) : (
            <Button variant="gold" onClick={() => navigate('/client/appointments')}>
              Request an appointment
            </Button>
          )}
        </Card>
        <Card tone="gold" className="client-goal-card">
          <Target size={23} />
          <p className="eyebrow">Your current goal</p>
          <h2>{goal?.wording ?? 'Choose a meaningful goal in your intake'}</h2>
          <div>
            <span>
              Baseline <strong>{goal?.baseline ?? '—'}</strong>
            </span>
            <i />
            <span>
              Now <strong>{goal?.current ?? '—'}</strong>
            </span>
          </div>
        </Card>
        <Card
          className="approved-progress"
          eyebrow="Approved progress summary"
          title={
            client.insight.status === 'approved'
              ? patternLabel[derived.pattern]
              : 'Building your summary'
          }
        >
          {client.insight.status === 'approved' ? (
            <>
              <p>{client.insight.client}</p>
              <Badge tone={client.reviewProgress ? 'attention' : 'favourable'}>
                {derived.confidence}% confidence
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                iconAfter={<ArrowRight size={14} />}
                onClick={() => navigate('/client/progress')}
              >
                View your progress
              </Button>
            </>
          ) : (
            <p className="muted">
              Your therapist has not approved a client-safe narration yet. Raw notes and draft
              output stay private.
            </p>
          )}
        </Card>
        <Card className="bonus-card">
          <div className="bonus-card__icon">
            <Gift size={23} />
          </div>
          <p className="eyebrow">Bonus Care Minutes</p>
          <h2>+{client.bonusMinutesLifetime}</h2>
          <p>Confirmed lifetime care beyond booked time. This never displays a negative value.</p>
        </Card>
        <Card eyebrow="Consent status" title="Your choices">
          <div className="consent-summary">
            <span>
              <ShieldCheck size={16} /> Health data{' '}
              <strong>{client.consents.healthData ? 'Granted' : 'Review'}</strong>
            </span>
            <span>
              <CalendarDays size={16} /> Reminders{' '}
              <strong>{client.consents.reminders ? 'On' : 'Off'}</strong>
            </span>
            <span>
              <HeartHandshake size={16} /> Handoff{' '}
              <strong>{client.consents.handoff ? 'Granted' : 'Per request'}</strong>
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate('/client/consents')}>
            Review consent choices
          </Button>
        </Card>
        <Card
          tone="soft"
          eyebrow="Latest session"
          title={
            appointments.some((item) => item.status === 'completed')
              ? 'Record complete'
              : 'Building history'
          }
        >
          <div className="session-safe-summary">
            <CheckCircle2 size={22} />
            <div>
              <strong>Client-safe information only</strong>
              <span>Private therapist notes and unapproved assessments are never shown here.</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/client/history')}>
            View history
          </Button>
        </Card>
      </section>
      {followupAppointment && (
        <FollowUpModal
          clientId={client.id}
          appointmentId={followupAppointment.id}
          open={followupOpen}
          onOpenChange={setFollowupOpen}
        />
      )}
      <IntakeFlow clientId={client.id} open={intakeOpen} onOpenChange={setIntakeOpen} />
    </div>
  )
}
