import { ArrowRight, CalendarDays, Check, ClipboardCheck, FileText, Gift, MessageCircleHeart, Plus } from 'lucide-react'
import { useMemo, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { PainChip } from '@/components/ui/PainChip'
import { Portrait } from '@/components/ui/Portrait'
import { assetUrl } from '@/components/ui/assets'
import { painColor } from '@/components/ui/pain'
import { areaKeyLabel, areaSeries, latestByArea, recordedAreas, type AreaKey } from '@/domain/care'
import type { DemoState } from '@/data/demo/model'
import { clientAppointments, clientBonus, clientObservations, followUpOpen, getClient, getTherapist, nextAppointment } from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import { daysBetween, fmtLongDay, fmtTime, greeting, minutesLabel, relativeDay, relativeWhen, whenPhrase } from '@/lib/formatting/time'
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
  const followUpDue = appointments.find((item) => followUpOpen(state, item, now))
  const followTherapist = getTherapist(state, followUpDue?.therapistId)
  const arrivalDue = upcoming && !upcoming.arrival && daysBetween(now, upcoming.startsAt) === 0 ? upcoming : undefined
  const sharedRecently = newest && new Date(newest.recordedAt).getTime() > now - 3 * 86_400_000
  const focusArea = areas[0]

  if (!client) return null

  const openLog = (preset?: string) => navigate('/client/log', { state: { from: '/client/home', ...(preset ? { preset } : {}) } })

  return (
    <div className="page home">
      <header className="home__hello rise">
        <p className="home__date">{fmtLongDay(now)}</p>
        <h1 className="title-lg">
          {greeting(now)}, <span className="gradient-text gradient-text--dawn">{client.preferredName}</span>
        </h1>
      </header>

      {pendingReport || arrivalDue || followUpDue ? (
        <div className="home__actions rise">
          {pendingReport ? (
            <Link to={`/client/reports/${pendingReport.id}`} className="next-action">
              <span className="next-action__icon" aria-hidden="true">
                <FileText size={20} />
              </span>
              <span className="next-action__copy">
                <strong>Review your summary for {pendingReport.recipient.toLocaleLowerCase()}</strong>
                <span>{reportAuthor?.preferredName ?? 'Your therapist'} prepared it. Nothing is shared until you agree.</span>
              </span>
              <ArrowRight size={20} aria-hidden="true" />
            </Link>
          ) : null}
          {arrivalDue ? (
            <Link to={`/client/arrival/${arrivalDue.id}`} className="next-action next-action--warm">
              <span className="next-action__icon" aria-hidden="true">
                <ClipboardCheck size={20} />
              </span>
              <span className="next-action__copy">
                <strong>Check in for today at {fmtTime(arrivalDue.startsAt)}</strong>
                <span>Confirm how you feel so {therapist?.preferredName ?? 'your therapist'} is ready for you.</span>
              </span>
              <ArrowRight size={20} aria-hidden="true" />
            </Link>
          ) : null}
          {followUpDue ? (
            <Link to={`/client/follow-up/${followUpDue.id}`} className="next-action">
              <span className="next-action__icon" aria-hidden="true">
                <MessageCircleHeart size={20} />
              </span>
              <span className="next-action__copy">
                <strong>How do you feel after your visit with {followTherapist?.preferredName ?? 'your therapist'}?</strong>
                <span>Two taps. It helps plan your next visit.</span>
              </span>
              <ArrowRight size={20} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="home__grid">
        <div className="home__col">
          {upcoming && therapist ? (
            <section className="visit-hero edge-light rise" aria-labelledby="next-visit-title">
              <div className="visit-hero__copy">
                <p className="eyebrow" id="next-visit-title">
                  Your next visit
                </p>
                <p className="visit-hero__day">{relativeDay(upcoming.startsAt, now)}</p>
                <p className="visit-hero__time">
                  <span className="num gradient-text">{fmtTime(upcoming.startsAt)}</span> with {therapist.preferredName}
                </p>
                <p className="visit-hero__service">
                  {upcoming.sessionType} · {minutesLabel(upcoming.durationMinutes)}
                </p>
                <p className={`visit-hero__shared${sharedRecently ? ' is-shared' : ''}`}>
                  {sharedRecently && newest ? (
                    <>
                      <Check size={16} aria-hidden="true" /> {therapist.preferredName} will see your update from {whenPhrase(newest.observedAt, now)}.
                    </>
                  ) : (
                    <>Log how you feel before you go and {therapist.preferredName} will see it ahead of your visit.</>
                  )}
                </p>
              </div>
              {therapist.portrait ? (
                <img className="visit-hero__portrait" src={assetUrl(therapist.portrait.hero)} alt="" aria-hidden="true" />
              ) : (
                <Portrait name={therapist.displayName} size="xl" className="visit-hero__monogram" />
              )}
            </section>
          ) : (
            <section className="visit-hero visit-hero--empty rise" aria-labelledby="next-visit-title">
              <div className="visit-hero__copy">
                <p className="eyebrow" id="next-visit-title">
                  Your next visit
                </p>
                <p className="visit-hero__day">Nothing booked yet</p>
                <Button variant="secondary" icon={<CalendarDays size={18} />} onClick={() => navigate('/client/visits/book')}>
                  Book a visit
                </Button>
              </div>
            </section>
          )}

          <section className="log-prompt rise" aria-labelledby="log-title">
            <div className="log-prompt__head">
              <h2 id="log-title" className="title-md">
                How do you feel today?
              </h2>
              <p className="muted small">Any day, any area. A missed day is simply a gap.</p>
            </div>
            {areas.length ? (
              <div className="log-prompt__chips" role="group" aria-label="Recently recorded areas">
                {areas.map((area) => {
                  const point = latest.get(area)
                  return (
                    <button key={area} type="button" className="area-chip" onClick={() => openLog(area)}>
                      <span>{areaKeyLabel(area)}</span>
                      {point ? <small>Last {point.pain}/10</small> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
            <Button size="lg" fullWidth icon={<Plus size={20} />} onClick={() => openLog()}>
              Log how I feel
            </Button>
          </section>
        </div>

        <div className="home__col">
          {focusArea ? <TrendCard area={focusArea} state={state} clientId={clientId} now={now} /> : null}

          {bonusCredit && bonusTherapist ? (
            <section className="bonus rise" aria-labelledby="bonus-title">
              <div className="bonus__head">
                <span className="bonus__gift" aria-hidden="true">
                  <Gift size={24} />
                </span>
                <div>
                  <h2 className="bonus__title" id="bonus-title">
                    Free extra care
                  </h2>
                  <p className="bonus__lede">Time added beyond what you booked, at no charge.</p>
                </div>
              </div>
              <p className="bonus__total">
                <span className="visually-hidden">{minutesLabel(bonus.lifetimeMinutes).replace('minute', 'free extra minute')} in all</span>
                <span aria-hidden="true" className="bonus__amount">
                  <span className="bonus__plus num">+{bonus.lifetimeMinutes}</span>
                  <span className="bonus__unit">min</span>
                  <span className="bonus__free">Free</span>
                </span>
              </p>
              <p className="bonus__sentence">{bonusSentence(bonusCredit, bonus, bonusTherapist, now)}</p>
              <ul className="bonus__people" aria-label="Free extra care by therapist">
                {bonus.byTherapist.filter((item) => item.minutes > 0).map((item) => {
                  const person = getTherapist(state, item.therapistId)
                  const share = bonus.lifetimeMinutes ? item.minutes / bonus.lifetimeMinutes : 0
                  return (
                    <li key={item.therapistId} style={{ '--share': share } as CSSProperties}>
                      <Portrait name={person?.displayName ?? ''} portrait={person?.portrait} size="sm" />
                      <span>{person?.preferredName}</span>
                      <strong className="num">+{minutesLabel(item.minutes)}</strong>
                      <span className="bonus__bar" aria-hidden="true" />
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TrendCard({ area, state, clientId, now }: { area: AreaKey; state: DemoState; clientId: string; now: number }) {
  const series = areaSeries(
    clientObservations(state, clientId),
    state.confirmations.filter((item) => item.clientId === clientId),
    area,
    { from: new Date(now - 42 * 86_400_000).toISOString() },
  )
  const last = series.at(-1)
  if (!last || series.length < 2) return null
  const width = 300
  const height = 84
  const start = new Date(series[0]?.observedAt ?? now).getTime()
  const span = Math.max(1, now - start)
  const points = series.map((point) => ({
    x: ((new Date(point.observedAt).getTime() - start) / span) * (width - 12) + 6,
    y: height - 8 - (point.pain / 10) * (height - 16),
    pain: point.pain,
  }))
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const end = points.at(-1)
  return (
    <Link to="/client/progress" className="trend glass rise" aria-label={`${areaKeyLabel(area)}: ${last.pain} out of 10, ${relativeDay(last.observedAt, now)}. Open progress.`}>
      <div className="trend__head">
        <p className="eyebrow">Last six weeks</p>
        <ArrowRight size={18} aria-hidden="true" />
      </div>
      <div className="trend__now">
        <span className="trend__area">{areaKeyLabel(area)}</span>
        <PainChip score={last.pain} large />
      </div>
      <svg className="trend__chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="trend-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#7af7df" />
            <stop offset="1" stopColor="#ffb072" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="url(#trend-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {end ? <circle cx={end.x} cy={end.y} r="5" fill={painColor(end.pain)} /> : null}
      </svg>
      <p className="small muted">
        {series.length} entries · latest {relativeWhen(last.observedAt, now)}
      </p>
    </Link>
  )
}
