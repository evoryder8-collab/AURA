import { ArrowRight, CalendarDays, ClipboardCheck, FileText, MessageCircleHeart, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { PainChip } from '@/components/ui/PainChip'
import { Portrait } from '@/components/ui/Portrait'
import { areaKeyLabel, latestByArea, recordedAreas, OBSERVATION_SOURCE_LABEL } from '@/domain/care'
import {
  clientAppointments,
  clientBonus,
  clientObservations,
  getClient,
  getTherapist,
  nextAppointment,
} from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import { daysBetween, fmtTime, greeting, minutesLabel, relativeDay, relativeWhen, whenPhrase } from '@/lib/formatting/time'
import { bonusSentence, latestBonusCredit } from './bonusSentence'
import './client-home.css'

export function ClientHomePage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const clientId = auth.demoClientId ?? ''
  const state = useDemoStore()
  const now = Date.now()
  const client = getClient(state, clientId)
  const appointments = useMemo(() => clientAppointments(state, clientId), [state, clientId])
  const observations = useMemo(() => clientObservations(state, clientId), [state, clientId])
  const upcoming = nextAppointment(appointments, now)
  const therapist = getTherapist(state, upcoming?.therapistId)
  const latest = useMemo(() => latestByArea(observations), [observations])
  const areas = recordedAreas(observations).slice(0, 3)
  const newest = [...observations].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]
  const bonus = clientBonus(state, clientId)
  const bonusCredit = latestBonusCredit(bonus)
  const bonusTherapist = getTherapist(state, bonusCredit?.therapistId)
  const pendingReport = state.reports.find((report) => report.clientId === clientId && report.status === 'awaiting_consent')
  const reportAuthor = getTherapist(state, pendingReport?.preparedBy)
  const followUpDue = appointments
    .filter((item) => item.status === 'completed' && item.session?.finishedAt)
    .filter((item) => {
      const days = daysBetween(item.session?.finishedAt ?? item.startsAt, now)
      return days >= 0 && days <= 2
    })
    .find((item) => !state.followUps.some((follow) => follow.appointmentId === item.id))
  const followTherapist = getTherapist(state, followUpDue?.therapistId)
  const arrivalDue = upcoming && !upcoming.arrival && daysBetween(now, upcoming.startsAt) === 0 ? upcoming : undefined

  if (!client) return null

  return (
    <div className="page client-home">
      <header className="client-home__hello rise">
        <p className="eyebrow">{greeting(now)}</p>
        <h1 className="title-xl">{client.preferredName}</h1>
      </header>

      {pendingReport ? (
        <Link to={`/client/reports/${pendingReport.id}`} className="next-action next-action--report rise">
          <span className="next-action__icon" aria-hidden="true">
            <FileText size={22} />
          </span>
          <span className="next-action__copy">
            <strong>Review your summary for {pendingReport.recipient.toLocaleLowerCase()}</strong>
            <span>
              {reportAuthor?.preferredName ?? 'Your therapist'} prepared it. Nothing is shared until you agree.
            </span>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      ) : null}

      {arrivalDue ? (
        <Link to={`/client/arrival/${arrivalDue.id}`} className="next-action rise">
          <span className="next-action__icon" aria-hidden="true">
            <ClipboardCheck size={22} />
          </span>
          <span className="next-action__copy">
            <strong>Check in for today at {fmtTime(arrivalDue.startsAt)}</strong>
            <span>Confirm how you feel so {therapist?.preferredName ?? 'your therapist'} is ready for you.</span>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      ) : null}

      {followUpDue ? (
        <Link to={`/client/follow-up/${followUpDue.id}`} className="next-action next-action--soft rise">
          <span className="next-action__icon" aria-hidden="true">
            <MessageCircleHeart size={22} />
          </span>
          <span className="next-action__copy">
            <strong>How do you feel after your visit with {followTherapist?.preferredName ?? 'your therapist'}?</strong>
            <span>Two taps. It helps plan your next visit.</span>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      ) : null}

      <section className="visit-card rise" aria-labelledby="next-visit-title">
        {upcoming && therapist ? (
          <>
            <Portrait name={therapist.displayName} portrait={therapist.portrait} size="lg" glow />
            <div className="visit-card__copy">
              <p className="eyebrow" id="next-visit-title">
                Next visit
              </p>
              <h2 className="title-md">
                {relativeDay(upcoming.startsAt, now)} at {fmtTime(upcoming.startsAt)} with {therapist.preferredName}
              </h2>
              <p className="muted small">
                {upcoming.sessionType} · {minutesLabel(upcoming.durationMinutes)}
              </p>
              <p className="visit-card__shared">
                {newest && new Date(newest.recordedAt).getTime() > now - 3 * 86_400_000
                  ? `${therapist.preferredName} will see your update from ${whenPhrase(newest.observedAt, now)} before you arrive.`
                  : `Log how you feel before you go and ${therapist.preferredName} will see it ahead of your visit.`}
              </p>
            </div>
          </>
        ) : (
          <div className="visit-card__copy">
            <p className="eyebrow" id="next-visit-title">
              Next visit
            </p>
            <h2 className="title-md">Nothing booked yet</h2>
            <Button variant="secondary" icon={<CalendarDays size={18} />} onClick={() => navigate('/client/visits/book')}>
              Book a visit
            </Button>
          </div>
        )}
      </section>

      <section className="log-prompt rise" aria-labelledby="log-title">
        <div>
          <h2 id="log-title" className="title-md">
            How do you feel today?
          </h2>
          <p className="muted small">Any day, any area. A missed day is just a gap.</p>
        </div>
        <Button size="lg" icon={<Plus size={20} />} onClick={() => navigate('/client/log', { state: { from: '/client/home' } })}>
          Log how I feel
        </Button>
      </section>

      {areas.length ? (
        <section className="latest rise" aria-labelledby="latest-title">
          <div className="row row--between">
            <h2 id="latest-title" className="eyebrow">
              Your latest entries
            </h2>
            <Link to="/client/progress" className="back-link">
              Progress <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <ul className="list latest__list">
            {areas.map((area) => {
              const point = latest.get(area)
              if (!point) return null
              return (
                <li key={area}>
                  <div>
                    <strong>{areaKeyLabel(area)}</strong>
                    <span className="small muted">
                      {relativeWhen(point.observedAt, now)} · {OBSERVATION_SOURCE_LABEL[point.source]}
                    </span>
                    {point.note ? <q className="small">{point.note}</q> : null}
                  </div>
                  <PainChip score={point.pain} />
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {bonusCredit && bonusTherapist ? (
        <section className="bonus rise" aria-labelledby="bonus-title">
          <Portrait name={bonusTherapist.displayName} portrait={bonusTherapist.portrait} size="md" />
          <div className="bonus__copy">
            <h2 id="bonus-title" className="eyebrow">
              Extra care
            </h2>
            <p className="bonus__sentence">{bonusSentence(bonusCredit, bonus, bonusTherapist, now)}</p>
            <p className="small muted">
              {minutesLabel(bonus.lifetimeMinutes)} of extra care in all
              {bonus.byTherapist.length > 1
                ? ` · ${bonus.byTherapist
                    .map((item) => `${getTherapist(state, item.therapistId)?.preferredName ?? 'Therapist'} ${minutesLabel(item.minutes)}`)
                    .join(' · ')}`
                : ''}
            </p>
          </div>
        </section>
      ) : null}
    </div>
  )
}
