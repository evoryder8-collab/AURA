import { Check, ChevronDown, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { Textarea } from '@/components/design-system/FormField'
import { PainChip } from '@/components/ui/PainChip'
import { ScoreScale } from '@/components/ui/ScoreScale'
import { Segmented } from '@/components/ui/Segmented'
import {
  BODY_REGIONS,
  areaKey,
  areaKeyLabel,
  areaLabel,
  choosableSides,
  expandSide,
  getRegion,
  latestByArea,
  parseAreaKey,
  recordedAreas,
  type ChosenSide,
  type RegionId,
} from '@/domain/care'
import { clientAppointments, clientObservations, getTherapist, nextAppointment } from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import { BodyStage, type BodyMarker } from '@/features/body/BodyStage'
import type { FigureFace } from '@/features/body/anchors'
import { relativeDay, relativeWhen, whenPhrase } from '@/lib/formatting/time'
import './check-in.css'

type Selection = { id: string; region: RegionId; side: ChosenSide; pain: number | null }
type When = 'now' | 'earlier' | 'yesterday'

const GROUP_LABEL: Record<(typeof BODY_REGIONS)[number]['group'], string> = {
  head_neck: 'Head and neck',
  upper_body: 'Shoulders and front',
  back: 'Back',
  arms: 'Arms and hands',
  hips_legs: 'Hips and legs',
}

const SIDE_LABEL: Record<ChosenSide, string> = { left: 'Left', right: 'Right', both: 'Both', centre: 'Centre' }

function observedAtFor(when: When, now: Date) {
  if (when === 'now') return undefined
  const date = new Date(now)
  if (when === 'earlier') date.setHours(Math.max(0, now.getHours() - 3), 0, 0, 0)
  else {
    date.setDate(date.getDate() - 1)
    date.setHours(19, 0, 0, 0)
  }
  return date.toISOString()
}

let selectionCounter = 0
const nextId = () => `sel-${(selectionCounter += 1)}`

export function LogHowIFeelPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const navigationState = location.state as { from?: string; preset?: string } | null
  const from = navigationState?.from ?? '/client/home'
  const clientId = auth.demoClientId ?? ''
  const state = useDemoStore()
  const observations = useMemo(() => clientObservations(state, clientId), [state, clientId])
  const latest = useMemo(() => latestByArea(observations), [observations])
  const recent = useMemo(() => recordedAreas(observations).slice(0, 4), [observations])
  const goal = state.goals.find((item) => item.clientId === clientId && item.status === 'active')
  const upcoming = nextAppointment(clientAppointments(state, clientId), Date.now())
  const upcomingTherapist = getTherapist(state, upcoming?.therapistId)

  const [face, setFace] = useState<FigureFace>('front')
  // Opening from a "recently recorded" chip starts with that area selected.
  const [selections, setSelections] = useState<Selection[]>(() => {
    const preset = navigationState?.preset ? parseAreaKey(navigationState.preset) : null
    return preset ? [{ id: nextId(), region: preset.region, side: preset.side, pain: null }] : []
  })
  const [listOpen, setListOpen] = useState(false)
  const [when, setWhen] = useState<When>('now')
  const [note, setNote] = useState('')
  const [goalScore, setGoalScore] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const selectedAreas = new Set(selections.flatMap((item) => expandSide(item.region, item.side).map((side) => areaKey(item.region, side))))

  const addArea = (region: RegionId, side: ChosenSide, pain: number | null = null) => {
    setError('')
    setSelections((current) => {
      const existing = current.find((item) => item.region === region && (item.side === side || item.side === 'both'))
      if (existing) {
        return pain === null ? current : current.map((item) => (item === existing ? { ...item, pain } : item))
      }
      return [...current, { id: nextId(), region, side, pain }]
    })
  }

  const update = (id: string, patch: Partial<Selection>) =>
    setSelections((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  const remove = (id: string) => setSelections((current) => current.filter((item) => item.id !== id))

  const markers: BodyMarker[] = selections.flatMap((item) =>
    expandSide(item.region, item.side).map((side) => ({
      area: areaKey(item.region, side),
      pain: item.pain ?? 0,
      label: areaLabel(item.region, side),
      tone: item.pain === null ? ('selected' as const) : ('default' as const),
      ...(item.pain === null ? { scoreLabel: '–' } : {}),
    })),
  )

  const ready = selections.length > 0 && selections.every((item) => item.pain !== null)

  const save = () => {
    if (!selections.length) {
      setError('Tap an area on the body or choose one from the list.')
      return
    }
    const missing = selections.find((item) => item.pain === null)
    if (missing) {
      setError(`Choose a score for ${areaLabelFor(missing)}. Zero is fine if it feels fine.`)
      return
    }
    const observedAt = observedAtFor(when, new Date())
    const trimmed = note.trim()
    state.logObservation({
      clientId,
      source: 'home',
      selections: selections.map((item) => ({ region: item.region, side: item.side, pain: item.pain ?? 0 })),
      ...(observedAt ? { observedAt } : {}),
      ...(trimmed ? { note: trimmed } : {}),
      ...(goal && goalScore !== null ? { goalScore: { goalId: goal.id, score: goalScore } } : {}),
    })
    setSaved(true)
  }

  if (saved) {
    return (
      <main id="main-content" className="log log--saved">
        <div className="log__saved rise" role="status">
          <span className="log__saved-mark" aria-hidden="true">
            <Check size={30} strokeWidth={2.4} />
          </span>
          <h1 className="title-lg">Saved to your record</h1>
          <p className="lead">
            {upcoming && upcomingTherapist
              ? `${upcomingTherapist.preferredName} will see this before your visit ${whenPhrase(upcoming.startsAt)}.`
              : 'It will be there for your therapist at your next visit.'}
          </p>
          <ul className="log__saved-list">
            {markers.map((marker) => (
              <li key={marker.area}>
                <span>{marker.label}</span>
                <PainChip score={marker.pain} />
              </li>
            ))}
          </ul>
          <div className="log__saved-actions">
            <Button size="lg" fullWidth onClick={() => navigate('/client/home')}>
              Done
            </Button>
            <Button variant="ghost" fullWidth onClick={() => navigate('/client/progress')}>
              See my progress
            </Button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main id="main-content" className="log">
      <header className="log__top">
        <Link to={from} className="icon-button" aria-label="Close without saving">
          <X size={20} aria-hidden="true" />
        </Link>
        <div className="log__heading">
          <p className="eyebrow">Log how I feel</p>
          <h1 className="title-md">Where do you feel it?</h1>
        </div>
      </header>

      <section className="log__figure" aria-label="Body">
        <BodyStage
          face={face}
          variant="picker"
          markers={markers}
          label={`Body seen from the ${face}. Tap an area to add it`}
          onPick={(anchor) => {
            const region = getRegion(anchor.region)
            const side: ChosenSide = region.sides.includes(anchor.side) ? anchor.side : (region.sides[0] ?? 'centre')
            addArea(anchor.region, side)
          }}
        />
        <div className="log__face">
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
        <p className="log__hint" aria-hidden="true">
          Tap where you feel it
        </p>
      </section>

      <div className="log__sheet">
        {recent.length ? (
          <section className="log__recent" aria-labelledby="recent-title">
            <h2 id="recent-title" className="eyebrow">
              Recently recorded
            </h2>
            <div className="log__chips">
              {recent.map((area) => {
                const point = latest.get(area)
                if (!point) return null
                const chosen = selectedAreas.has(area)
                return (
                  <div key={area} className={`log__chip${chosen ? ' is-chosen' : ''}`}>
                    <button type="button" className="log__chip-main" onClick={() => addArea(point.region, point.side)} aria-pressed={chosen}>
                      <span>{areaKeyLabel(area)}</span>
                      <small>
                        Last {point.pain}/10 · {relativeDay(point.observedAt)}
                      </small>
                    </button>
                    {point.pain > 0 ? (
                      <button type="button" className="log__chip-zero" onClick={() => addArea(point.region, point.side, 0)}>
                        Feels fine now
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        <section className="log__list" aria-labelledby="list-title">
          <button
            type="button"
            className="log__list-toggle"
            aria-expanded={listOpen}
            aria-controls="area-list"
            onClick={() => setListOpen((value) => !value)}
          >
            <span id="list-title">Choose from a list</span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          {listOpen ? (
            <div id="area-list" className="log__groups">
              {(Object.keys(GROUP_LABEL) as Array<keyof typeof GROUP_LABEL>).map((group) => (
                <fieldset key={group} className="log__group">
                  <legend>{GROUP_LABEL[group]}</legend>
                  <div>
                    {BODY_REGIONS.filter((region) => region.group === group).map((region) => {
                      const side: ChosenSide = region.sides.includes('centre') ? 'centre' : 'left'
                      const chosen = selections.some((item) => item.region === region.id)
                      return (
                        <button
                          key={region.id}
                          type="button"
                          aria-pressed={chosen}
                          onClick={() => (chosen ? undefined : addArea(region.id, side))}
                        >
                          {region.label}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          ) : null}
        </section>

        {selections.length ? (
          <section className="log__areas" aria-label="Areas and scores">
            {selections.map((item) => {
              const label = areaLabelFor(item)
              const previous = expandSide(item.region, item.side)
                .map((side) => latest.get(areaKey(item.region, side)))
                .find(Boolean)
              return (
                <article key={item.id} className="log__area">
                  <header>
                    <div>
                      <h3>{label}</h3>
                      {previous ? (
                        <p className="small muted">
                          Last recorded {previous.pain}/10 · {relativeWhen(previous.observedAt)}
                        </p>
                      ) : (
                        <p className="small muted">First time you’ve recorded this area</p>
                      )}
                    </div>
                    <button type="button" className="icon-button" aria-label={`Remove ${label}`} onClick={() => remove(item.id)}>
                      <X size={18} aria-hidden="true" />
                    </button>
                  </header>
                  {choosableSides(item.region).length > 1 ? (
                    <Segmented
                      label={`Side for ${getRegion(item.region).label}`}
                      value={item.side}
                      onChange={(side) => update(item.id, { side })}
                      options={choosableSides(item.region).map((side) => ({ value: side, label: SIDE_LABEL[side] }))}
                    />
                  ) : null}
                  <ScoreScale label={`Pain in ${label}, 0 to 10`} value={item.pain} onChange={(pain) => update(item.id, { pain })} />
                </article>
              )
            })}
          </section>
        ) : (
          <p className="log__empty">Nothing hurts today? Tap an area you were watching and choose 0. Every entry helps.</p>
        )}

        <section className="log__extras" aria-label="Optional details">
          <div className="field">
            <span className="field__label" id="when-label">
              When did you notice it?
            </span>
            <Segmented
              label="When did you notice it?"
              value={when}
              onChange={setWhen}
              options={[
                { value: 'now', label: 'Now' },
                { value: 'earlier', label: 'Earlier today' },
                { value: 'yesterday', label: 'Yesterday' },
              ]}
            />
          </div>
          <label className="field">
            <span className="field__label">Anything to add? (optional)</span>
            <Textarea
              value={note}
              maxLength={280}
              rows={2}
              placeholder="e.g. Turning to look behind the car still hurts."
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {goal ? (
            <div className="field">
              <span className="field__label">{goal.wording} — how easy is it today? (optional)</span>
              <ScoreScale label={`${goal.wording}, ease from 0 to 10`} value={goalScore} onChange={setGoalScore} tone="ease" lowLabel="Not possible" highLabel="Easy" />
            </div>
          ) : null}
        </section>
      </div>

      <footer className="log__save">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button size="lg" fullWidth onClick={save} aria-disabled={!ready}>
          {selections.length > 1 ? `Save ${selections.length} areas` : 'Save'}
        </Button>
      </footer>
    </main>
  )
}

function areaLabelFor(item: { region: RegionId; side: ChosenSide }) {
  if (item.side === 'both') return `${getRegion(item.region).plural} (both sides)`
  return areaLabel(item.region, item.side)
}

