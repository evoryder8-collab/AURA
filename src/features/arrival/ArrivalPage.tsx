import { ArrowLeft, Check, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { Textarea } from '@/components/design-system/FormField'
import { PainChip } from '@/components/ui/PainChip'
import { ScoreScale } from '@/components/ui/ScoreScale'
import { Segmented } from '@/components/ui/Segmented'
import {
  areaKey,
  areaLabel,
  areasToReview,
  getRegion,
  OBSERVATION_SOURCE_LABEL,
  type AnatomicalSide,
  type AreaPoint,
  type RegionId,
} from '@/domain/care'
import { clientObservations, getAppointment, getClient, getTherapist, previousVisit } from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { therapistCanAccessClient } from '@/data/demo/team'
import { useAuth } from '@/features/auth/auth-context'
import { canRunSession } from '@/features/session/sessionAccess'
import { BodyStage, type BodyMarker } from '@/features/body/BodyStage'
import type { FigureFace } from '@/features/body/anchors'
import { dayPhrase, fmtTime, relativeDay, relativeWhen } from '@/lib/formatting/time'
import './arrival.css'

type Decision = { kind: 'confirm' } | { kind: 'update'; pain: number }
type NewArea = { region: RegionId; side: AnatomicalSide; pain: number | null }

export function ArrivalPage() {
  const { appointmentId } = useParams()
  const auth = useAuth()
  const navigate = useNavigate()
  const state = useDemoStore()
  const appointment = getAppointment(state, appointmentId)
  const client = getClient(state, appointment?.clientId)
  const therapist = getTherapist(state, appointment?.therapistId)
  const onPracticeDevice = auth.role === 'therapist'
  const allowed =
    appointment &&
    (onPracticeDevice
      ? therapistCanAccessClient(state, auth.demoTherapistId, appointment.clientId) || appointment.therapistId === auth.demoTherapistId
      : appointment.clientId === auth.demoClientId)

  const review = useMemo<AreaPoint[]>(() => {
    if (!appointment) return []
    const previous = previousVisit(state, appointment)
    return areasToReview(
      clientObservations(state, appointment.clientId),
      new Date(Math.max(Date.now(), new Date(appointment.startsAt).getTime())).toISOString(),
      previous?.session?.finishedAt ?? previous?.startsAt,
      state.confirmations.filter((item) => item.clientId === appointment.clientId),
    )
    // Fixed for this arrival: what was on record when the screen opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment?.id])

  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [added, setAdded] = useState<NewArea[]>([])
  const [face, setFace] = useState<FigureFace>('front')
  const [adding, setAdding] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (!appointment || !client || !allowed) {
    return (
      <main id="main-content" className="arrival">
        <div className="page">
          <p className="empty">This visit isn’t available to you.</p>
        </div>
      </main>
    )
  }

  const backTo = onPracticeDevice ? '/therapist/today' : '/client/home'

  const markers: BodyMarker[] = [
    ...review.map((point) => {
      const decision = decisions[point.area]
      return {
        area: point.area,
        pain: decision?.kind === 'update' ? decision.pain : point.pain,
        label: areaLabel(point.region, point.side),
        tone: decision ? ('default' as const) : ('muted' as const),
      }
    }),
    ...added.map((item) => ({
      area: areaKey(item.region, item.side),
      pain: item.pain ?? 0,
      label: areaLabel(item.region, item.side),
      tone: 'selected' as const,
    })),
  ]

  const submit = () => {
    const undecided = review.find((point) => !decisions[point.area])
    if (undecided) {
      setError(`Is ${areaLabel(undecided.region, undecided.side).toLocaleLowerCase()} still ${undecided.pain}/10? Choose “Still accurate” or “Update”.`)
      return
    }
    const unscored = added.find((item) => item.pain === null)
    if (unscored) {
      setError(`Choose a score for ${areaLabel(unscored.region, unscored.side).toLocaleLowerCase()}.`)
      return
    }
    state.completeArrival({
      appointmentId: appointment.id,
      confirm: review
        .filter((point) => decisions[point.area]?.kind === 'confirm')
        .map((point) => ({ observationId: point.observationId, area: point.area })),
      updates: [
        ...review.flatMap((point) => {
          const decision = decisions[point.area]
          return decision?.kind === 'update' ? [{ region: point.region, side: point.side, pain: decision.pain }] : []
        }),
        ...added.map((item) => ({ region: item.region, side: item.side, pain: item.pain ?? 0 })),
      ],
      ...(note.trim() ? { note: note.trim() } : {}),
    })
    setDone(true)
  }

  if (done) {
    return (
      <main id="main-content" className="arrival arrival--done">
        <div className="arrival__done rise" role="status">
          <span className="arrival__done-mark" aria-hidden="true">
            <Check size={30} strokeWidth={2.4} />
          </span>
          <h1 className="title-lg">Thank you, {client.preferredName}</h1>
          <p className="lead">
            {therapist?.preferredName ?? 'Your therapist'} can see what you confirmed. Make yourself comfortable.
          </p>
          {onPracticeDevice && canRunSession(appointment, auth.demoTherapistId) ? (
            <Button size="lg" fullWidth onClick={() => navigate(`/therapist/session/${appointment.id}`)}>
              Open Session Mode
            </Button>
          ) : onPracticeDevice ? (
            // A colleague can take arrival, but only the booking's therapist runs the session.
            <Button size="lg" fullWidth onClick={() => navigate('/therapist/today')}>
              Back to Today
            </Button>
          ) : (
            <Button size="lg" fullWidth onClick={() => navigate('/client/home')}>
              Done
            </Button>
          )}
        </div>
      </main>
    )
  }

  return (
    <main id="main-content" className="arrival">
      <header className="arrival__top">
        <Link to={backTo} className="back-link">
          <ArrowLeft size={18} aria-hidden="true" /> {onPracticeDevice ? 'Today' : 'Home'}
        </Link>
        {onPracticeDevice ? <p className="arrival__handover">Please hand this screen to {client.preferredName}</p> : null}
      </header>

      <div className="arrival__layout">
        <section className="arrival__intro">
          <p className="eyebrow">
            Arrival check · {relativeDay(appointment.startsAt)} {fmtTime(appointment.startsAt)} with {therapist?.preferredName}
          </p>
          <h1 className="title-lg">Welcome, {client.preferredName}. Is this still how you feel?</h1>
          <div className="arrival__figure">
            <BodyStage face={face} variant="picker" markers={markers} label={`${client.preferredName}'s areas to confirm`} onPick={
              adding
                ? (anchor) => {
                    const region = getRegion(anchor.region)
                    const side = region.sides.includes(anchor.side) ? anchor.side : (region.sides[0] ?? 'centre')
                    const key = areaKey(anchor.region, side)
                    if (review.some((point) => point.area === key) || added.some((item) => areaKey(item.region, item.side) === key)) return
                    setAdded((current) => [...current, { region: anchor.region, side, pain: null }])
                    setAdding(false)
                    setError('')
                  }
                : undefined
            } />
            <div className="arrival__figure-controls">
              <Segmented
                label="Body side shown"
                value={face}
                onChange={setFace}
                options={[
                  { value: 'front', label: 'Front' },
                  { value: 'back', label: 'Back' },
                ]}
              />
            </div>
          </div>
        </section>

        <section className="arrival__review" aria-label="Areas to confirm">
          {review.length ? (
            <>
              <div className="row row--between row--wrap">
                <h2 className="title-md">Your latest record</h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDecisions(Object.fromEntries(review.map((point) => [point.area, { kind: 'confirm' } as Decision])))}
                >
                  All still accurate
                </Button>
              </div>
              {review.map((point) => {
                const decision = decisions[point.area]
                const label = areaLabel(point.region, point.side)
                return (
                  <article key={point.area} className={`arrival-card${decision ? ' is-decided' : ''}`}>
                    <header>
                      <div>
                        <h3>{label}</h3>
                        <p className="small muted">
                          {OBSERVATION_SOURCE_LABEL[point.source]} · {relativeWhen(point.observedAt)}
                        </p>
                      </div>
                      <PainChip score={decision?.kind === 'update' ? decision.pain : point.pain} large />
                    </header>
                    {point.note ? <q>{point.note}</q> : null}
                    <div className="arrival-card__choices" role="group" aria-label={`${label}: still accurate or update`}>
                      <button
                        type="button"
                        aria-pressed={decision?.kind === 'confirm'}
                        onClick={() => {
                          setDecisions((current) => ({ ...current, [point.area]: { kind: 'confirm' } }))
                          setError('')
                        }}
                      >
                        <Check size={18} aria-hidden="true" /> Still accurate
                      </button>
                      <button
                        type="button"
                        aria-pressed={decision?.kind === 'update'}
                        onClick={() => {
                          setDecisions((current) => ({ ...current, [point.area]: { kind: 'update', pain: point.pain } }))
                          setError('')
                        }}
                      >
                        Update
                      </button>
                    </div>
                    {decision?.kind === 'update' ? (
                      <ScoreScale
                        label={`${label} now, 0 to 10`}
                        value={decision.pain}
                        onChange={(pain) => setDecisions((current) => ({ ...current, [point.area]: { kind: 'update', pain } }))}
                      />
                    ) : null}
                    {decision?.kind === 'confirm' ? (
                      <p className="small arrival-card__kept">
                        Kept as recorded {dayPhrase(point.observedAt)} — it stays one entry in your history.
                      </p>
                    ) : null}
                  </article>
                )
              })}
            </>
          ) : (
            <p className="muted">There’s nothing recent on record. Add anything you’d like {therapist?.preferredName} to know.</p>
          )}

          {added.map((item, index) => {
            const label = areaLabel(item.region, item.side)
            return (
              <article key={areaKey(item.region, item.side)} className="arrival-card is-new">
                <header>
                  <div>
                    <p className="eyebrow">New today</p>
                    <h3>{label}</h3>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${label}`}
                    onClick={() => setAdded((current) => current.filter((_, position) => position !== index))}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </header>
                {getRegion(item.region).sides.length > 1 ? (
                  <Segmented
                    label={`Side for ${getRegion(item.region).label}`}
                    value={item.side}
                    onChange={(side) =>
                      setAdded((current) => current.map((entry, position) => (position === index ? { ...entry, side } : entry)))
                    }
                    options={getRegion(item.region).sides.map((side) => ({
                      value: side,
                      label: side === 'left' ? 'Left' : side === 'right' ? 'Right' : 'Centre',
                    }))}
                  />
                ) : null}
                <ScoreScale
                  label={`${label}, 0 to 10`}
                  value={item.pain}
                  onChange={(pain) =>
                    setAdded((current) => current.map((entry, position) => (position === index ? { ...entry, pain } : entry)))
                  }
                />
              </article>
            )
          })}

          <div className="arrival__add">
            {adding ? (
              <p className="arrival__adding" role="status">
                Tap the area on the body{face === 'front' ? ' (use Back for the back of the body)' : ''}.{' '}
                <button type="button" className="link-button" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </p>
            ) : (
              <Button variant="secondary" icon={<Plus size={18} />} onClick={() => setAdding(true)}>
                Something new today
              </Button>
            )}
            <RegionQuickAdd
              onAdd={(region, side) => {
                const key = areaKey(region, side)
                if (review.some((point) => point.area === key) || added.some((entry) => areaKey(entry.region, entry.side) === key)) return
                setAdded((current) => [...current, { region, side, pain: null }])
                setAdding(false)
              }}
            />
          </div>

          <label className="field">
            <span className="field__label">Anything else for {therapist?.preferredName}? (optional)</span>
            <Textarea value={note} rows={2} maxLength={280} onChange={(event) => setNote(event.target.value)} />
          </label>
        </section>
      </div>

      <footer className="arrival__save">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button size="lg" fullWidth onClick={submit}>
          I’m ready
        </Button>
      </footer>
    </main>
  )
}

/** Keyboard- and screen-reader-friendly way to add an area without the figure. */
function RegionQuickAdd({ onAdd }: { onAdd: (region: RegionId, side: AnatomicalSide) => void }) {
  const [region, setRegion] = useState<RegionId | ''>('')
  const [side, setSide] = useState<AnatomicalSide>('left')
  const definition = region ? getRegion(region) : undefined
  return (
    <details className="arrival__quick">
      <summary>Choose from a list instead</summary>
      <div className="arrival__quick-row">
        <label className="field">
          <span className="field__label">Area</span>
          <select
            className="input select"
            value={region}
            onChange={(event) => {
              const next = event.target.value as RegionId
              setRegion(next)
              setSide(getRegion(next).sides[0] ?? 'centre')
            }}
          >
            <option value="">Choose an area</option>
            {(['head', 'neck', 'shoulder', 'shoulder_blade', 'upper_back', 'mid_back', 'lower_back', 'chest', 'abdomen', 'upper_arm', 'elbow', 'forearm', 'hand', 'hip', 'glute', 'thigh_front', 'thigh_back', 'knee', 'shin', 'calf', 'foot'] as const).map((id) => (
              <option key={id} value={id}>
                {getRegion(id).label}
              </option>
            ))}
          </select>
        </label>
        {definition && definition.sides.length > 1 ? (
          <Segmented
            label="Side"
            value={side}
            onChange={setSide}
            options={definition.sides.map((value) => ({ value, label: value === 'left' ? 'Left' : value === 'right' ? 'Right' : 'Centre' }))}
          />
        ) : null}
        <Button variant="secondary" size="sm" disabled={!region} onClick={() => region && onAdd(region, side)}>
          Add
        </Button>
      </div>
    </details>
  )
}
