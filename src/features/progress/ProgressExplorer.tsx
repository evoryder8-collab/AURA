import { useId, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/design-system/Card'
import { Spinner } from '@/components/design-system/Spinner'
import { PainChip, painWord } from '@/components/ui/PainChip'
import { getClient, clientObservations } from '@/data/demo/selectors'
import { useDemoStore, type DemoStore } from '@/data/demo/store'
import { areaKeyLabel, OBSERVATION_SOURCE_LABEL, recordedAreas, type AreaKey } from '@/domain/care'
import { fmtTime } from '@/lib/formatting/time'
import { DataTable } from './DataTable'
import {
  completedVisits,
  dayAndTime,
  dayLabel,
  endsEarly,
  findGaps,
  lowerFirst,
  onDay,
  outOf10,
  painAnswer,
  painSeries,
  RANGE_KEYS,
  SOURCE_MARKER,
  SOURCES,
  rangePhrase,
  rangeWindow,
  shortDate,
  type Audience,
  type PainPoint,
  type RangeKey,
  type TimeWindow,
  type Visit,
} from './model'
import { DayAfterPanel, GoalPanels, RecoveryPanel, RomPanel, StiffnessPanel } from './Panels'
import { SourceLabel } from './SourceMarker'
import { TimeChart } from './TimeChart'
import './progress.css'

export function ProgressExplorer({ clientId, audience }: { clientId: string; audience: Audience }) {
  const hydrated = useDemoStore((state) => state.hydrated)
  if (!hydrated) return <Spinner label="Opening progress" />
  return <Explorer clientId={clientId} audience={audience} />
}

function Explorer({ clientId, audience }: { clientId: string; audience: Audience }) {
  const state = useDemoStore()
  const [now] = useState(() => Date.now())
  const [chosenArea, setChosenArea] = useState<AreaKey | null>(null)
  const visits = completedVisits(state.appointments, state.therapists, clientId)
  const [range, setRange] = useState<RangeKey>(visits.length > 1 ? 'visits' : 'all')
  const observations = clientObservations(state, clientId)
  const areas = recordedAreas(observations)
  const area = chosenArea && areas.includes(chosenArea) ? chosenArea : areas[0]
  const clientName = getClient(state, clientId)?.preferredName ?? 'Client'
  const Heading = audience === 'client' ? 'h1' : 'h2'

  const recordTimes = [...observations.map((item) => Date.parse(item.observedAt)), ...visits.map((visit) => visit.at)]
  const firstRecordAt = recordTimes.length ? Math.min(...recordTimes) : undefined
  const window = rangeWindow(range, visits, firstRecordAt, now)
  const ranges = RANGE_KEYS.filter((key) => key !== 'visits' || visits.length > 1)

  if (!area) {
    return (
      <Card as="section" className="progress-panel progress-panel--lead">
        <Heading className="progress-question">
          {audience === 'client' ? 'How have I been feeling?' : `How has ${clientName} been feeling?`}
        </Heading>
        <p className="progress-answer">
          {audience === 'client'
            ? 'Nothing recorded yet. When you log how you feel, your entries will appear here.'
            : `${clientName} has not recorded anything yet.`}
        </p>
      </Card>
    )
  }

  const phrase = rangePhrase(range, audience, visits.length)
  const areaName = lowerFirst(areaKeyLabel(area))
  // Spoken name of the headline; plain spaces, the visible text keeps its no-break spaces.
  const question = `How has ${audience === 'client' ? 'my' : `${clientName}’s`} ${areaName} felt ${phrase}?`.replace(/\u00a0/g, ' ')
  const subHeading = audience === 'client' ? 'h2' : 'h3'

  return (
    <div className={`progress progress--${audience}`}>
      <PainPanel
        key={`${area}|${range}`}
        Heading={Heading}
        question={question}
        picker={
          <>
            How has {audience === 'client' ? 'my' : `${clientName}’s`}{' '}
            {areas.length > 1 ? (
              <Picker
                label="Body area"
                text={areaName}
                value={area}
                options={areas.map((key) => ({ value: key, label: lowerFirst(areaKeyLabel(key)) }))}
                onChange={(value) => setChosenArea(value as AreaKey)}
              />
            ) : (
              areaName
            )}{' '}
            felt{' '}
            <Picker
              label="Time range"
              text={phrase}
              after="?"
              value={range}
              options={ranges.map((key) => ({ value: key, label: rangePhrase(key, audience, visits.length) }))}
              onChange={(value) => setRange(value as RangeKey)}
            />
          </>
        }
        state={state}
        clientId={clientId}
        clientName={clientName}
        audience={audience}
        area={area}
        phrase={phrase}
        window={window}
        visits={visits}
        now={now}
      />

      <div className="progress__grid">
        <GoalPanels state={state} clientId={clientId} audience={audience} area={area} window={window} visits={visits} Heading={subHeading} />
        <DayAfterPanel state={state} clientId={clientId} audience={audience} window={window} visits={visits} Heading={subHeading} />
        <StiffnessPanel state={state} clientId={clientId} audience={audience} area={area} window={window} visits={visits} Heading={subHeading} />
        <RecoveryPanel state={state} clientId={clientId} audience={audience} window={window} visits={visits} Heading={subHeading} />
      </div>
      <RomPanel state={state} clientId={clientId} audience={audience} window={window} visits={visits} Heading={subHeading} />
    </div>
  )
}

/**
 * A word in the question that is also a picker: the visible text wraps like the rest of
 * the headline while a native select on top keeps keyboard, touch and screen-reader support.
 */
function Picker({
  label,
  text,
  after,
  value,
  options,
  onChange,
}: {
  label: string
  text: string
  /** Punctuation that must stay on the picker's last line. */
  after?: string
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <span className="picker">
      <span aria-hidden="true">
        <span className="picker__text">{text}</span>
        <ChevronDown className="picker__chevron" size={18} strokeWidth={2.2} />
        {after}
      </span>
      <select className="picker__select" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  )
}

function PainPanel({
  Heading,
  question,
  picker,
  state,
  clientId,
  clientName,
  audience,
  area,
  phrase,
  window,
  visits,
  now,
}: {
  Heading: 'h1' | 'h2'
  question: string
  picker: ReactNode
  state: DemoStore
  clientId: string
  clientName: string
  audience: Audience
  area: AreaKey
  phrase: string
  window: TimeWindow
  visits: readonly Visit[]
  now: number
}) {
  const detailId = useId()
  const headingId = useId()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const observations = clientObservations(state, clientId)
  const confirmations = state.confirmations.filter((item) => item.clientId === clientId)
  const points = painSeries(observations, confirmations, area, window, visits)
  const everything = painSeries(observations, confirmations, area, { from: 0, to: now, startsAtFirstEntry: false }, visits)
  const earlier = everything.filter((point) => point.at < window.from).at(-1)
  const { answer, summary } = painAnswer({ points, area, visits, window, phrase, audience, clientName, now, earlier })
  const gaps = findGaps(
    points.map((point) => point.at),
    window,
  )
  const stopped = endsEarly(points.at(-1)?.at, window)
  const selected = points.find((point) => point.key === selectedKey) ?? points.at(-1)
  const selectedIndex = selected ? points.indexOf(selected) : -1
  const sources = SOURCES.filter((source) => points.some((point) => point.source === source))
  const areaName = areaKeyLabel(area)
  const recorder = (point: PainPoint) => recordedByName(point, state, clientId, clientName, audience)

  const notes = [
    stopped ? `${stopped}.` : null,
    window.startsAtFirstEntry ? `The first entry was on ${shortDate(window.from)}.` : null,
  ].filter(Boolean)

  return (
    <Card as="section" className="progress-panel progress-panel--lead" aria-labelledby={headingId}>
      <Heading id={headingId} className="progress-question" aria-label={question}>
        {picker}
      </Heading>
      <p className="progress-answer" aria-live="polite">
        {answer}
      </p>
      {summary ? <p className="progress-summary">{summary}</p> : null}

      {points.length ? (
        <>
          <ul className="progress-legend" aria-label="Key">
            {sources.map((source) => (
              <li key={source}>
                <SourceLabel source={source} />
              </li>
            ))}
            <li>
              <span className="legend-swatch legend-swatch--visit" aria-hidden="true" />
              Visit
            </li>
            {gaps.length ? (
              <li>
                <span className="legend-swatch legend-swatch--gap" aria-hidden="true" />
                No entries for 5+&nbsp;days
              </li>
            ) : null}
          </ul>

          <TimeChart
            label={`${areaName}, pain from 0 to 10, ${phrase}`}
            window={window}
            scale={{ min: 0, max: 10, ticks: [0, 5, 10], format: String }}
            data={points.map((point) => ({
              id: point.key,
              at: point.at,
              value: point.pain,
              marker: SOURCE_MARKER[point.source],
              tone: point.source,
              label: [
                dayAndTime(point.at),
                `${point.pain} out of 10`,
                OBSERVATION_SOURCE_LABEL[point.source],
                point.note ? 'with a note' : null,
                point.confirmations.length ? 'confirmed at arrival' : null,
              ]
                .filter(Boolean)
                .join(', '),
            }))}
            visits={visits}
            gaps={gaps}
            showVisitNames
            selectedId={selected?.key ?? null}
            onSelect={setSelectedKey}
            detailId={detailId}
            height={250}
          />
          <p className="progress-axis-note">
            <span>Pain out of 10</span>
            {notes.map((note) => (
              <span key={note}>{note}</span>
            ))}
          </p>

          {selected ? (
            <PainDetail
              id={detailId}
              point={selected}
              audience={audience}
              clientName={clientName}
              recorder={recorder(selected)}
              now={now}
              hasPrevious={selectedIndex > 0}
              hasNext={selectedIndex < points.length - 1}
              onStep={(step) => {
                const next = points[selectedIndex + step]
                if (next) setSelectedKey(next.key)
              }}
            />
          ) : null}

          <DataTable
            caption={`${areaName}: every entry ${phrase}`}
            head={['When', 'Score', 'Source', 'Recorded by', 'Note', 'Confirmed']}
            rows={points.map((point) => ({
              key: point.key,
              cells: [
                dayAndTime(point.at),
                <span key="score" className="num nowrap">{outOf10(point.pain)}</span>,
                <SourceLabel key="source" source={point.source} />,
                recorder(point) ?? '—',
                point.note ?? '—',
                point.confirmations.length
                  ? point.confirmations.map((item) => `Still accurate at arrival ${dayLabel(item.at)}`).join('; ')
                  : '—',
              ],
            }))}
          />
        </>
      ) : null}
    </Card>
  )
}

function recordedByName(point: PainPoint, state: DemoStore, clientId: string, clientName: string, audience: Audience) {
  const by = point.recordedBy
  if (!by) return null
  if (by.role === 'client') return by.id === clientId ? (audience === 'client' ? 'You' : clientName) : null
  return state.therapists.find((therapist) => therapist.id === by.id)?.preferredName ?? 'Therapist'
}

function PainDetail({
  id,
  point,
  audience,
  clientName,
  recorder,
  now,
  hasPrevious,
  hasNext,
  onStep,
}: {
  id: string
  point: PainPoint
  audience: Audience
  clientName: string
  recorder: string | null
  now: number
  hasPrevious: boolean
  hasNext: boolean
  onStep: (step: -1 | 1) => void
}) {
  const your = audience === 'client' ? 'your' : 'the'
  const context = point.visit
    ? point.source === 'follow_up'
      ? `The day after ${your} visit with ${point.visit.therapistName}`
      : point.source === 'home'
        ? null
        : `At ${your} visit with ${point.visit.therapistName}`
    : point.source === 'home'
      ? 'Between visits'
      : null
  const noteBy =
    recorder === 'You' ? 'Your note' : recorder ? `${recorder}’s note` : audience === 'client' ? 'Your note' : `${clientName}’s note`
  return (
    <section id={id} className="pain-detail" aria-label="Selected entry">
      <div className="pain-detail__top">
        <div className="pain-detail__score">
          <PainChip score={point.pain} large />
          <span className="muted pain-detail__word">{painWord(point.pain)}</span>
        </div>
        <div className="pain-detail__step">
          <button type="button" className="icon-button" aria-label="Previous entry" disabled={!hasPrevious} onClick={() => onStep(-1)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" aria-label="Next entry" disabled={!hasNext} onClick={() => onStep(1)}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <dl className="pain-detail__facts">
        <div>
          <dt>When</dt>
          <dd>
            {dayLabel(point.at)} · <span className="num">{fmtTime(point.at)}</span>
            {daysAgo(point.at, now)}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            <SourceLabel source={point.source} />
            {context ? <span className="muted"> · {context}</span> : null}
          </dd>
        </div>
        {recorder ? (
          <div>
            <dt>Recorded by</dt>
            <dd>
              {recorder}
              {audience === 'therapist' && point.recordedAt !== point.observedAt ? (
                <span className="muted"> · entered {fmtTime(point.recordedAt)}</span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
      {point.note ? (
        <figure className="pain-detail__note">
          <blockquote>“{point.note}”</blockquote>
          <figcaption>{noteBy}</figcaption>
        </figure>
      ) : null}
      {point.confirmations.map((item) => (
        <p key={item.at} className="pain-detail__confirmed">
          <Check size={16} strokeWidth={2.4} aria-hidden="true" />
          <span>
            Confirmed as still accurate {audience === 'client' ? 'when you arrived' : 'at arrival'}
            {item.visit ? ` for ${your} visit with ${item.visit.therapistName}` : ''} {onDay(item.at, now)}
          </span>
        </p>
      ))}
    </section>
  )
}

function daysAgo(at: number, now: number) {
  const phrase = onDay(at, now)
  return /^on\s/.test(phrase) ? null : <span className="muted"> · {phrase}</span>
}
