import { useId, useState, type ReactNode } from 'react'
import { Badge } from '@/components/design-system/Badge'
import { Card } from '@/components/design-system/Card'
import { clientRecovery } from '@/data/demo/selectors'
import type { DemoStore } from '@/data/demo/store'
import { areaKeyLabel, OBSERVATION_SOURCE_LABEL, ROM_METHOD_LABEL, type AreaKey, type RomMethod } from '@/domain/care'
import { PROTOTYPE_V1_CONFIG, type EvidenceStream } from '@/domain/engine'
import { DataTable } from './DataTable'
import {
  dayAfterSeries,
  dayAfterSummary,
  dayAndTime,
  dayLabel,
  goalSeries,
  inWindow,
  lowerFirst,
  measureSummary,
  nb,
  outOf10,
  plural,
  responseLabel,
  romGroups,
  romTitle,
  SOURCE_MARKER,
  signed,
  stiffnessSeries,
  unmeasuredVisits,
  type Audience,
  type TimeWindow,
  type Visit,
} from './model'
import { SourceLabel } from './SourceMarker'
import { TimeChart } from './TimeChart'

type PanelProps = {
  state: DemoStore
  clientId: string
  audience: Audience
  window: TimeWindow
  visits: readonly Visit[]
  Heading: 'h2' | 'h3'
}

function useSelection(ids: readonly string[]) {
  const [chosen, setChosen] = useState<string | null>(null)
  const selected = chosen !== null && ids.includes(chosen) ? chosen : (ids.at(-1) ?? null)
  return [selected, setChosen] as const
}

function Panel({
  Heading,
  title,
  eyebrow,
  badge,
  summary,
  children,
  className,
}: {
  Heading: 'h2' | 'h3' | 'h4'
  title: string
  eyebrow?: string
  badge?: ReactNode
  summary: string
  children?: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <Card as="section" className={`progress-panel ${className ?? ''}`} aria-labelledby={id}>
      <header className="progress-panel__head">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <Heading id={id} className="progress-panel__title">
          {title}
        </Heading>
        {badge}
        <p className="progress-summary">{summary}</p>
      </header>
      {children}
    </Card>
  )
}

const therapistName = (state: DemoStore, therapistId: string) =>
  state.therapists.find((therapist) => therapist.id === therapistId)?.preferredName ?? 'Therapist'

// ---------- Stiffness ----------

export function StiffnessPanel({ area, ...props }: PanelProps & { area: AreaKey }) {
  const { state, clientId, audience, window, visits, Heading } = props
  const detailId = useId()
  const items = stiffnessSeries(
    state.stiffness.filter((item) => item.clientId === clientId),
    area,
    window,
  )
  const [selectedId, select] = useSelection(items.map((item) => item.id))
  const selected = items.find((item) => item.id === selectedId)
  const areaName = lowerFirst(areaKeyLabel(area))
  const title =
    audience === 'client' ? `How stiff did your ${areaName} feel to your therapist?` : `Stiffness by palpation, ${areaName}`
  const gaps = unmeasuredVisits(visits, new Set(items.map((item) => item.appointmentId)), window, items[0]?.at, items.at(-1)?.at)
  return (
    <Panel
      Heading={Heading}
      title={title}
      summary={
        items.length
          ? measureSummary(
              items.map((item) => item.stiffness),
              outOf10,
              'Recorded by touch',
            )
          : `No stiffness recorded for the ${areaName} in this period.`
      }
    >
      {items.length ? (
        <>
          <TimeChart
            label={`Stiffness of the ${areaName}, 0 supple to 10 very stiff`}
            window={window}
            scale={{ min: 0, max: 10, ticks: [0, 5, 10], format: String }}
            data={items.map((item) => ({
              id: item.id,
              at: item.at,
              value: item.stiffness,
              marker: 'dot',
              tone: 'measure',
              label: `${dayLabel(item.at)}, stiffness ${item.stiffness} out of 10, recorded by ${therapistName(state, item.therapistId)}`,
            }))}
            visits={visits}
            gaps={gaps}
            selectedId={selectedId}
            onSelect={select}
            detailId={detailId}
          />
          <p className="progress-axis-note">
            <span>Stiffness out of 10 · 0 supple, 10 very stiff</span>
          </p>
          {selected ? (
            <p id={detailId} className="panel-detail">
              <strong className="num">{outOf10(selected.stiffness)}</strong> {dayLabel(selected.at)} · recorded by{' '}
              {therapistName(state, selected.therapistId)}
              {audience === 'therapist' ? ' by palpation' : ''}
            </p>
          ) : null}
          <DataTable
            caption={`Stiffness of the ${areaName}`}
            head={['When', 'Stiffness', 'Recorded by']}
            rows={items.map((item) => ({
              key: item.id,
              cells: [dayAndTime(item.at), <span key="value" className="num nowrap">{outOf10(item.stiffness)}</span>, therapistName(state, item.therapistId)],
            }))}
          />
        </>
      ) : null}
    </Panel>
  )
}

// ---------- Range of motion ----------

const METHOD_WORDS: Record<Audience, Record<RomMethod, string>> = {
  client: { goniometer: 'Measured with a goniometer', visual_estimate: 'Estimated by eye' },
  therapist: ROM_METHOD_LABEL,
}

const degrees = (value: number) => `${value}°`

export function RomPanel(props: PanelProps) {
  const { state, clientId, audience, window, Heading } = props
  const groups = romGroups(
    state.rom.filter((item) => item.clientId === clientId),
    window,
  )
  const title = audience === 'client' ? 'How far could you move?' : 'Range of motion'
  const summary = groups.length
    ? `${plural(groups.length, 'movement')} measured in this period. Each chart keeps one movement, side and method together.`
    : 'No range of motion measured in this period.'
  return (
    <Panel Heading={Heading} title={title} summary={summary} className="progress-panel--wide">
      {groups.length ? (
        <div className="rom-groups">
          {groups.map((group) => (
            <RomGroupChart key={group.key} group={group} {...props} Heading={Heading === 'h2' ? 'h3' : 'h4'} />
          ))}
        </div>
      ) : null}
    </Panel>
  )
}

function RomGroupChart({
  group,
  state,
  audience,
  window,
  visits,
  Heading,
}: Omit<PanelProps, 'Heading'> & { group: ReturnType<typeof romGroups>[number]; Heading: 'h3' | 'h4' }) {
  const detailId = useId()
  const [selectedId, select] = useSelection(group.points.map((item) => item.id))
  const selected = group.points.find((item) => item.id === selectedId)
  const values = group.points.map((item) => item.degrees)
  const top = Math.ceil((Math.max(group.typicalDegrees, ...values) * 1.1) / 10) * 10
  const title = romTitle(group)
  const method = METHOD_WORDS[audience][group.method]
  const measuredAt = new Set(group.points.flatMap((item) => (item.appointmentId ? [item.appointmentId] : [])))
  const gaps = unmeasuredVisits(visits, measuredAt, window, group.points[0]?.at, group.points.at(-1)?.at)
  return (
    <section className="rom-group" aria-labelledby={`${detailId}-title`}>
      <Heading id={`${detailId}-title`} className="rom-group__title">
        {title}
      </Heading>
      <p className="rom-group__method">{method}</p>
      <p className="progress-summary">
        {measureSummary(values, degrees, 'Measured')} Typical range reaches {nb(degrees(group.typicalDegrees))}.
      </p>
      <TimeChart
        label={`${title}, ${method.toLocaleLowerCase()}, in degrees`}
        window={window}
        scale={{ min: 0, max: top, ticks: [0, Math.round(group.typicalDegrees / 2), group.typicalDegrees], format: degrees }}
        reference={{ from: 0, to: group.typicalDegrees, label: `Typical ${degrees(group.typicalDegrees)}` }}
        data={group.points.map((item) => ({
          id: item.id,
          at: item.at,
          value: item.degrees,
          marker: 'dot',
          tone: 'measure',
          label: `${dayLabel(item.at)}, ${item.degrees} degrees, measured by ${therapistName(state, item.therapistId)}`,
        }))}
        visits={visits}
        gaps={gaps}
        selectedId={selectedId}
        onSelect={select}
        detailId={detailId}
        height={180}
      />
      {selected ? (
        <p id={detailId} className="panel-detail">
          <strong className="num">{degrees(selected.degrees)}</strong> {dayLabel(selected.at)} · measured by{' '}
          {therapistName(state, selected.therapistId)}
          {audience === 'therapist' ? ` · ${ROM_METHOD_LABEL[selected.method].toLocaleLowerCase()}` : ''}
        </p>
      ) : null}
      <DataTable
        caption={`${title}, ${method.toLocaleLowerCase()}`}
        head={['When', 'Degrees', 'Method', 'Measured by']}
        rows={group.points.map((item) => ({
          key: item.id,
          cells: [
            dayAndTime(item.at),
            <span key="value" className="num nowrap">{degrees(item.degrees)}</span>,
            ROM_METHOD_LABEL[item.method],
            therapistName(state, item.therapistId),
          ],
        }))}
      />
    </section>
  )
}

// ---------- Functional goals ----------

export function GoalPanels({ area, ...props }: PanelProps & { area: AreaKey }) {
  const { state, clientId, window } = props
  const series = goalSeries(state.goals, state.goalScores, clientId, area, window)
  return (
    <>
      {series.map((item) => (
        <GoalPanel key={item.goal.id} series={item} {...props} />
      ))}
    </>
  )
}

function GoalPanel({
  series,
  state,
  clientId,
  audience,
  window,
  visits,
  Heading,
}: PanelProps & { series: ReturnType<typeof goalSeries>[number] }) {
  const detailId = useId()
  const { goal, scores } = series
  const [selectedId, select] = useSelection(scores.map((item) => item.id))
  const selected = scores.find((item) => item.id === selectedId)
  const name = state.clients.find((client) => client.id === clientId)?.preferredName ?? 'Client'
  const eyebrow = audience === 'client' ? 'Your goal, in your words' : `Goal in ${name}’s words`
  return (
    <Panel
      Heading={Heading}
      title={`“${goal.wording}”`}
      eyebrow={eyebrow}
      badge={goal.status === 'active' ? null : <Badge tone="favourable">{goal.status === 'achieved' ? 'Achieved' : 'Paused'}</Badge>}
      summary={
        scores.length
          ? measureSummary(
              scores.map((item) => item.score),
              outOf10,
              'Rated',
            )
          : 'Not rated in this period.'
      }
    >
      {scores.length ? (
        <>
          <TimeChart
            label={`How easy: ${goal.wording}, 0 not possible today to 10 easy`}
            window={window}
            scale={{ min: 0, max: 10, ticks: [0, 5, 10], format: String }}
            data={scores.map((item) => ({
              id: item.id,
              at: item.at,
              value: item.score,
              marker: SOURCE_MARKER[item.source],
              tone: item.source,
              label: `${dayLabel(item.at)}, ${item.score} out of 10, ${OBSERVATION_SOURCE_LABEL[item.source]}`,
            }))}
            visits={visits}
            line="dashed"
            selectedId={selectedId}
            onSelect={select}
            detailId={detailId}
          />
          <p className="progress-axis-note">
            <span>Ease out of 10 · 0 not possible today, 10 easy</span>
            <span>Dashed line: occasional ratings, not a daily record</span>
          </p>
          {selected ? (
            <p id={detailId} className="panel-detail">
              <strong className="num">{outOf10(selected.score)}</strong> {dayLabel(selected.at)} ·{' '}
              <SourceLabel source={selected.source} />
            </p>
          ) : null}
          <DataTable
            caption={`Ease of: ${goal.wording}`}
            head={['When', 'Ease', 'Source']}
            rows={scores.map((item) => ({
              key: item.id,
              cells: [dayAndTime(item.at), <span key="value" className="num nowrap">{outOf10(item.score)}</span>, <SourceLabel key="source" source={item.source} />],
            }))}
          />
        </>
      ) : null}
    </Panel>
  )
}

// ---------- The day after each visit ----------

export function DayAfterPanel(props: PanelProps) {
  const { state, clientId, audience, window, visits, Heading } = props
  const detailId = useId()
  const rows = dayAfterSeries(
    state.followUps.filter((item) => item.clientId === clientId),
    visits,
    window,
  )
  const replied = rows.flatMap((row) => (row.response ? [{ visit: row.visit, response: row.response }] : []))
  const [selectedId, select] = useSelection(replied.map((row) => row.response.id))
  const selected = replied.find((row) => row.response.id === selectedId)
  const your = audience === 'client' ? 'your' : 'the'
  const title = audience === 'client' ? 'How did you feel the day after each visit?' : 'Next-day response after each visit'
  return (
    <Panel Heading={Heading} title={title} summary={dayAfterSummary(rows, audience)}>
      {rows.length ? (
        <>
          <TimeChart
            label="Next-day response after each visit, from much worse to much better"
            window={window}
            scale={{ min: -2, max: 2, ticks: [-2, 0, 2], format: signed }}
            data={replied.map(({ visit, response }) => ({
              id: response.id,
              at: visit.at,
              value: response.response,
              marker: 'dot',
              tone: response.response > 0 ? 'better' : response.response < 0 ? 'worse' : 'same',
              label: `Visit ${dayLabel(visit.at)} with ${visit.therapistName}: next day ${responseLabel(response.response)}`,
            }))}
            empty={rows.filter((row) => !row.response).map((row) => ({ id: row.visit.id, at: row.visit.at }))}
            visits={visits}
            bars
            selectedId={selectedId}
            onSelect={select}
            detailId={detailId}
          />
          <p className="progress-axis-note">
            <span>+2 much better · 0 about the same · −2 much worse</span>
          </p>
          {selected ? (
            <p id={detailId} className="panel-detail">
              <strong>{responseLabel(selected.response.response)}</strong>{' '}
              <span className="num">({signed(selected.response.response)})</span> the day after {your} visit with{' '}
              {selected.visit.therapistName} on {dayLabel(selected.visit.at)}
            </p>
          ) : null}
          <DataTable
            caption="Next-day response after each visit"
            head={['Visit', 'With', 'Next day']}
            rows={rows.map((row) => ({
              key: row.visit.id,
              cells: [
                dayLabel(row.visit.at),
                row.visit.therapistName,
                row.response ? `${responseLabel(row.response.response)} (${signed(row.response.response)})` : 'No reply recorded',
              ],
            }))}
          />
        </>
      ) : null}
    </Panel>
  )
}

// ---------- Prototype Recovery Index (engine output, unchanged) ----------

const STREAM_WORDS: Record<EvidenceStream | 'recoveryIndex', string> = {
  recoveryIndex: 'Index',
  pain: 'Pain',
  stiffness: 'Stiffness',
  rom: 'Range of motion',
  functionalAbility: 'Goal ease',
}

const oneDecimal = (value: number) => String(Math.round(value * 10) / 10)
const points = (value: number | null) =>
  value === null ? 'Not enough entries' : nb(`${signed(Math.round(value * 10) / 10)} points`)

export function RecoveryPanel(props: PanelProps) {
  const { state, clientId, audience, window, visits, Heading } = props
  const detailId = useId()
  const { result } = clientRecovery(state, clientId)
  const included = result.evidence.includedPoints
    .map((point) => ({ ...point, at: Date.parse(point.observedAt), visit: visits.find((visit) => visit.id === point.observationId) }))
    .filter((point) => inWindow(point.at, window))
  const [selectedId, select] = useSelection(included.map((point) => point.observationId))
  const selected = included.find((point) => point.observationId === selectedId)
  const { explanation, confidence } = result
  const first = included[0]
  const last = included.at(-1)
  const summary =
    first && last && first !== last
      ? `${oneDecimal(first.recoveryIndex)} of 100 at the visit ${dayLabel(first.at)}, ${oneDecimal(last.recoveryIndex)} of 100 at the visit ${dayLabel(last.at)}.`
      : last
        ? `${oneDecimal(last.recoveryIndex)} of 100 at the visit ${dayLabel(last.at)}.`
        : 'No visits with enough measures in this period.'
  const deltaStreams = audience === 'client' ? (['recoveryIndex'] as const) : (['recoveryIndex', 'pain', 'stiffness', 'rom', 'functionalAbility'] as const)
  const deltaKey = { recoveryIndex: 'recoveryIndexDelta', pain: 'painDelta', stiffness: 'stiffnessDelta', rom: 'romDelta', functionalAbility: 'functionalAbilityDelta' } as const
  const weights = PROTOTYPE_V1_CONFIG.recoveryWeights

  return (
    <Panel
      Heading={Heading}
      title="Recovery Index"
      badge={<Badge tone="attention">Prototype · not clinically validated</Badge>}
      summary={summary}
    >
      {included.length ? (
        <>
          <TimeChart
            label="Prototype Recovery Index at each visit, 0 to 100"
            window={window}
            scale={{ min: 0, max: 100, ticks: [0, 50, 100], format: String }}
            data={included.map((point) => ({
              id: point.observationId,
              at: point.at,
              value: point.recoveryIndex,
              marker: 'dot',
              tone: 'index',
              label: `Visit ${dayLabel(point.at)}, index ${oneDecimal(point.recoveryIndex)} of 100`,
            }))}
            visits={visits}
            selectedId={selectedId}
            onSelect={select}
            detailId={detailId}
          />
          <p className="progress-axis-note">
            <span>Index out of 100 · higher is more favourable</span>
          </p>
          {selected ? (
            <p id={detailId} className="panel-detail">
              <strong className="num">{nb(`${oneDecimal(selected.recoveryIndex)} of 100`)}</strong> at the visit{' '}
              {dayLabel(selected.at)}
              {selected.visit ? ` with ${selected.visit.therapistName}` : ''} · from{' '}
              {[
                selected.rawScores.pain !== null ? `pain ${outOf10(selected.rawScores.pain)}` : null,
                selected.rawScores.stiffness !== null ? `stiffness ${outOf10(selected.rawScores.stiffness)}` : null,
                selected.rawScores.rom !== null ? `range of motion ${nb(`${Math.round(selected.rawScores.rom * 10)}%`)} of typical` : null,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
          ) : null}
        </>
      ) : null}

      <dl className="engine-facts">
        {audience === 'therapist' ? (
          // The pattern label is a professional prompt; clients see the recorded index, not the classification.
          <div>
            <dt>Pattern across all {plural(explanation.facts.includedObservationCount, 'visit')}</dt>
            <dd>{explanation.patternLabel}</dd>
          </div>
        ) : null}
        <div>
          <dt>Confidence</dt>
          <dd>
            {confidence.level.charAt(0).toLocaleUpperCase() + confidence.level.slice(1)} ·{' '}
            <span className="num">{nb(`${Math.round(confidence.score)}/100`)}</span>
          </dd>
        </div>
        {deltaStreams.map((stream) => (
          <div key={stream}>
            <dt>{STREAM_WORDS[stream]}, first to last visit</dt>
            <dd className="num">{points(explanation.facts[deltaKey[stream]])}</dd>
          </div>
        ))}
        {explanation.facts.excludedPointCount ? (
          <div>
            <dt>Left out</dt>
            <dd>{plural(explanation.facts.excludedPointCount, 'measure')} that could not be compared</dd>
          </div>
        ) : null}
        {audience === 'therapist' ? (
          <>
            <div>
              <dt>Rule</dt>
              <dd className="engine-facts__code">{explanation.triggeredRule}</dd>
            </div>
            <div>
              <dt>Weights</dt>
              <dd className="num">
                Pain {nb(`${weights.pain * 100}%`)} · stiffness {nb(`${weights.stiffness * 100}%`)} · range of motion{' '}
                {nb(`${weights.rom * 100}%`)}
              </dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>Version</dt>
          <dd className="engine-facts__code">
            {result.engineVersion} · {result.ruleVersion}
          </dd>
        </div>
      </dl>
      <p className="progress-axis-note">
        <span>{explanation.thresholdLabel} A pattern is a prompt for conversation and requires professional judgment.</span>
      </p>

      {included.length ? (
        <DataTable
          caption="Prototype Recovery Index at each visit"
          head={['Visit', 'Index', 'Pain', 'Stiffness', 'Range of motion']}
          rows={included.map((point) => ({
            key: point.observationId,
            cells: [
              dayLabel(point.at),
              <span key="value" className="num nowrap">{nb(`${oneDecimal(point.recoveryIndex)} of 100`)}</span>,
              point.rawScores.pain === null ? '—' : outOf10(point.rawScores.pain),
              point.rawScores.stiffness === null ? '—' : outOf10(point.rawScores.stiffness),
              point.rawScores.rom === null ? '—' : nb(`${Math.round(point.rawScores.rom * 10)}% of typical`),
            ],
          }))}
        />
      ) : null}
    </Panel>
  )
}
