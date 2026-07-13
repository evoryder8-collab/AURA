import {
  Circle,
  Document,
  Line,
  Page,
  Polyline,
  StyleSheet,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer'
import type {
  ContextEvent,
  DemoAppointment,
  DemoClient,
  DemoHandoff,
  MetricPoint,
} from '@/data/demo/model'
import { deriveClientMetrics } from '@/data/demo/derive'
import { patternLabel } from '@/lib/formatting/labels'

const styles = StyleSheet.create({
  page: { padding: 46, fontFamily: 'Helvetica', fontSize: 9, color: '#1e2924', lineHeight: 1.5 },
  cover: { backgroundColor: '#17231e', color: '#f6f1e8', padding: 54 },
  wordmark: { fontSize: 11, letterSpacing: 6, color: '#d6b46d', marginBottom: 100 },
  eyebrow: {
    fontSize: 7,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: '#7b867f',
    marginBottom: 7,
  },
  coverEyebrow: {
    fontSize: 7,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: '#b8c2bc',
    marginBottom: 10,
  },
  coverTitle: { fontFamily: 'Times-Roman', fontSize: 35, lineHeight: 1.05, marginBottom: 16 },
  coverMeta: { color: '#c9d0cc', fontSize: 9, maxWidth: 360 },
  goldLine: { width: 60, height: 2, backgroundColor: '#c7a458', marginVertical: 28 },
  footer: {
    position: 'absolute',
    left: 54,
    right: 54,
    bottom: 35,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#89958e',
    fontSize: 7,
  },
  title: { fontFamily: 'Times-Roman', fontSize: 25, marginBottom: 18 },
  section: { marginBottom: 22 },
  grid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stat: { flexGrow: 1, padding: 12, border: '1 solid #dfe2de', borderRadius: 6 },
  statLabel: { color: '#727d77', fontSize: 7, marginBottom: 4 },
  statValue: { fontFamily: 'Times-Roman', fontSize: 17 },
  body: { fontSize: 9, color: '#3f4a44' },
  muted: { fontSize: 8, color: '#69736e' },
  table: { border: '1 solid #dfe2de', borderRadius: 6, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    borderBottom: '1 solid #e7e9e6',
    paddingVertical: 7,
    paddingHorizontal: 9,
  },
  rowHead: { backgroundColor: '#edf1ed', fontSize: 7, fontWeight: 700 },
  cellDate: { width: '22%' },
  cell: { width: '15%' },
  cellWide: { width: '33%' },
  notice: {
    padding: 13,
    backgroundColor: '#eef3f5',
    borderLeft: '3 solid #426b84',
    fontSize: 8,
    color: '#385267',
  },
  disclaimer: {
    marginTop: 22,
    paddingTop: 12,
    borderTop: '1 solid #dfe2de',
    color: '#69736e',
    fontSize: 7,
  },
  graph: { marginBottom: 18, padding: 11, border: '1 solid #dfe2de', borderRadius: 6 },
  graphHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  graphLabel: { fontFamily: 'Times-Roman', fontSize: 14 },
  graphMeta: { fontSize: 7, color: '#69736e' },
  record: { marginBottom: 10, padding: 10, backgroundColor: '#f5f6f3', borderRadius: 5 },
  recordTitle: { fontSize: 9, fontWeight: 700, marginBottom: 3 },
  consent: { marginTop: 12, padding: 13, backgroundColor: '#edf1ed', borderRadius: 6 },
})

type MetricKey = 'pain' | 'stiffness' | 'rom' | 'function' | 'response'

function MetricGraph({
  label,
  metric,
  points,
}: {
  label: string
  metric: MetricKey
  points: MetricPoint[]
}) {
  const width = 470
  const height = 92
  const padding = 12
  const usableWidth = width - padding * 2
  const usableHeight = height - padding * 2
  const coordinates = points.map((point, index) => {
    const x =
      padding + (points.length <= 1 ? usableWidth / 2 : (index / (points.length - 1)) * usableWidth)
    const y = height - padding - (point[metric] / 10) * usableHeight
    return { x, y }
  })
  const latest = points.at(-1)?.[metric]
  const first = points[0]?.[metric]
  const change = latest != null && first != null ? latest - first : null
  return (
    <View style={styles.graph} wrap={false}>
      <View style={styles.graphHead}>
        <Text style={styles.graphLabel}>{label}</Text>
        <Text style={styles.graphMeta}>
          {points.length} observation{points.length === 1 ? '' : 's'} · latest {latest ?? '—'}/10 ·
          change {change == null ? '—' : `${change > 0 ? '+' : ''}${change}`}
        </Text>
      </View>
      {coordinates.length > 0 ? (
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <Line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="#c8ceca"
            strokeWidth={1}
          />
          <Line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={height - padding}
            stroke="#c8ceca"
            strokeWidth={1}
          />
          <Polyline
            points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')}
            fill="none"
            stroke="#4e7b67"
            strokeWidth={2.5}
          />
          {coordinates.map(({ x, y }, index) => (
            <Circle key={`${metric}-${index}`} cx={x} cy={y} r={3.1} fill="#c39c51" />
          ))}
        </Svg>
      ) : (
        <Text style={styles.muted}>No comparable observations in the approved date range.</Text>
      )}
    </View>
  )
}

function inDateRange(value: string, handoff: DemoHandoff) {
  const date = value.slice(0, 10)
  return date >= handoff.dateFrom && date <= handoff.dateTo
}

export function HandoffDocument({
  client,
  handoff,
  appointments,
  events,
}: {
  client: DemoClient
  handoff: DemoHandoff
  appointments: DemoAppointment[]
  events: ContextEvent[]
}) {
  const included = new Set(handoff.includedSections)
  const goal = client.goals[0]
  const derived = deriveClientMetrics(client)
  const metrics = client.metrics.filter((point) => inDateRange(point.recordedAt, handoff))
  const rangedAppointments = appointments.filter((appointment) =>
    inDateRange(appointment.startsAt, handoff),
  )
  const rangedEvents = events.filter((event) => inDateRange(event.occurredAt, handoff))
  const hasGraphs = [
    'Pain graph',
    'Stiffness graph',
    'ROM graph',
    'Function graph',
    'Session response',
  ].some((section) => included.has(section))
  const hasRecords =
    ['Body-map timeline', 'Recorded interventions', 'Context events', 'Therapist note'].some(
      (section) => included.has(section),
    ) || handoff.includePhotos

  return (
    <Document title="AURA professional handoff" author="AURA synthetic test build">
      <Page size="A4" style={styles.cover}>
        <Text style={styles.wordmark}>AURA</Text>
        <Text style={styles.coverEyebrow}>Therapist-reviewed professional handoff</Text>
        <Text style={styles.coverTitle}>
          {client.preferredName}
          {'\n'}Progress summary
        </Text>
        <View style={styles.goldLine} />
        <Text style={styles.coverMeta}>
          Prepared for {handoff.recipientName || 'the named recipient'} at{' '}
          {handoff.recipientOrganization || 'the recipient organization'} · {handoff.purpose}
        </Text>
        <Text style={[styles.coverMeta, { marginTop: 12 }]}>
          Approved scope: {new Date(handoff.dateFrom).toLocaleDateString('en-GB')} –{' '}
          {new Date(handoff.dateTo).toLocaleDateString('en-GB')} · expires{' '}
          {new Date(handoff.expiresAt).toLocaleDateString('en-GB')}
        </Text>
        <View style={styles.footer}>
          <Text>SYNTHETIC TEST DOCUMENT</Text>
          <Text>Powered by AURA</Text>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>Approved summary</Text>
        <Text style={styles.title}>Recorded progress at a glance</Text>
        {included.has('Progress overview') && (
          <View style={styles.grid}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>RECOVERY INDEX</Text>
              <Text style={styles.statValue}>{derived.recoveryIndex}/100</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>CONFIDENCE</Text>
              <Text style={styles.statValue}>{derived.confidence}%</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>OBSERVATIONS IN RANGE</Text>
              <Text style={styles.statValue}>{metrics.length}</Text>
            </View>
          </View>
        )}
        {included.has('Pattern observation') && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>Exact AURA pattern observation</Text>
            <Text style={styles.body}>
              {patternLabel[derived.pattern]}. {client.insight.therapist}
            </Text>
            <Text style={styles.muted}>{client.insight.evidence}</Text>
          </View>
        )}
        {included.has('Functional goals') && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>Functional goal</Text>
            <Text style={styles.body}>
              {goal?.wording ?? 'No active goal recorded'} · baseline {goal?.baseline ?? '—'}/10 ·
              latest {goal?.current ?? '—'}/10
            </Text>
          </View>
        )}
        <View style={styles.notice}>
          <Text>
            Recorded context is shown by proximity only. AURA does not claim that a contextual event
            caused a change.
          </Text>
        </View>
        <View style={styles.consent}>
          <Text style={styles.eyebrow}>Exact approved scope</Text>
          <Text style={styles.body}>
            Recipient: {handoff.recipientName} · Purpose: {handoff.purpose}
          </Text>
          <Text style={styles.body}>Sections: {handoff.includedSections.join(' · ')}</Text>
          <Text style={styles.body}>
            Photography: {handoff.includePhotos ? 'explicitly included' : 'not included'} · Expiry:{' '}
            {new Date(handoff.expiresAt).toLocaleString('en-GB')}
          </Text>
        </View>
        <Text style={styles.disclaimer}>
          SCOPE: This document presents recorded observations and a deterministic prototype pattern.
          It is not a diagnosis, causal finding, medical-necessity decision, structural-healing
          claim, or guaranteed outcome. The receiving professional must apply independent judgment.
        </Text>
      </Page>

      {hasGraphs && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.eyebrow}>Selected progress graphs</Text>
          <Text style={styles.title}>Comparable observations</Text>
          {included.has('Pain graph') && (
            <MetricGraph label="Pain" metric="pain" points={metrics} />
          )}
          {included.has('Stiffness graph') && (
            <MetricGraph label="Stiffness" metric="stiffness" points={metrics} />
          )}
          {included.has('ROM graph') && (
            <MetricGraph label="Range of motion" metric="rom" points={metrics} />
          )}
          {included.has('Function graph') && (
            <MetricGraph label="Functional-goal ability" metric="function" points={metrics} />
          )}
          {included.has('Session response') && (
            <MetricGraph label="Session response" metric="response" points={metrics} />
          )}
          <Text style={styles.disclaimer}>
            Higher values mean different things across streams. Read each labelled graph in its
            recorded scale and context.
          </Text>
        </Page>
      )}

      {hasRecords && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.eyebrow}>Selected record detail</Text>
          <Text style={styles.title}>Approved context</Text>
          {included.has('Body-map timeline') && (
            <View style={styles.section}>
              <Text style={styles.eyebrow}>Body-map timeline</Text>
              {metrics.map((point) => (
                <View key={point.id} style={styles.record}>
                  <Text style={styles.recordTitle}>
                    {new Date(point.recordedAt).toLocaleDateString('en-GB')} ·{' '}
                    {goal?.region.replaceAll('_', ' ') ?? 'Recorded focus'}
                  </Text>
                  <Text style={styles.body}>
                    Pain {point.pain}/10 · stiffness {point.stiffness}/10 · range of motion{' '}
                    {point.rom}/10
                  </Text>
                </View>
              ))}
            </View>
          )}
          {included.has('Recorded interventions') && (
            <View style={styles.section}>
              <Text style={styles.eyebrow}>Recorded interventions</Text>
              {rangedAppointments
                .filter(
                  (appointment) =>
                    appointment.session?.areas?.length || appointment.session?.approaches?.length,
                )
                .map((appointment) => (
                  <View key={appointment.id} style={styles.record}>
                    <Text style={styles.recordTitle}>
                      {new Date(appointment.startsAt).toLocaleDateString('en-GB')} ·{' '}
                      {appointment.sessionType}
                    </Text>
                    <Text style={styles.body}>
                      Areas: {appointment.session?.areas?.join(', ') || 'Not recorded'}
                    </Text>
                    <Text style={styles.body}>
                      Approaches: {appointment.session?.approaches?.join(', ') || 'Not recorded'} ·
                      pressure {appointment.session?.pressure ?? 'not recorded'}
                    </Text>
                  </View>
                ))}
            </View>
          )}
          {included.has('Context events') && (
            <View style={styles.section}>
              <Text style={styles.eyebrow}>Context events</Text>
              {rangedEvents.map((event) => (
                <View key={event.id} style={styles.record}>
                  <Text style={styles.recordTitle}>
                    {new Date(event.occurredAt).toLocaleDateString('en-GB')} ·{' '}
                    {event.type.replaceAll('_', ' ')}
                  </Text>
                  <Text style={styles.body}>{event.description}</Text>
                </View>
              ))}
            </View>
          )}
          {included.has('Therapist note') && (
            <View style={styles.section}>
              <Text style={styles.eyebrow}>Therapist-reviewed context note</Text>
              <Text style={styles.body}>
                {handoff.therapistNote || 'No additional therapist note was included.'}
              </Text>
            </View>
          )}
          {handoff.includePhotos && (
            <View style={styles.section}>
              <Text style={styles.eyebrow}>Consent-approved progress photography register</Text>
              {client.photos.map((photo) => (
                <View key={photo.id} style={styles.record}>
                  <Text style={styles.body}>
                    {photo.phase} · {photo.view} view · private synthetic asset reference
                  </Text>
                </View>
              ))}
              <Text style={styles.muted}>
                The synthetic fixture contains photo metadata only; no invented photograph is
                embedded.
              </Text>
            </View>
          )}
          <Text style={styles.disclaimer}>
            Only the categories approved for this handoff are present. Private therapist data
            outside the selected scope remains excluded.
          </Text>
        </Page>
      )}

      {included.has('Progress overview') && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.eyebrow}>Recorded values</Text>
          <Text style={styles.title}>Observation table</Text>
          <View style={styles.table}>
            <View style={[styles.row, styles.rowHead]}>
              <Text style={styles.cellDate}>DATE</Text>
              <Text style={styles.cell}>PAIN</Text>
              <Text style={styles.cell}>STIFFNESS</Text>
              <Text style={styles.cell}>ROM</Text>
              <Text style={styles.cell}>FUNCTION</Text>
              <Text style={styles.cellWide}>CONTEXT</Text>
            </View>
            {metrics.map((point) => (
              <View style={styles.row} key={point.id}>
                <Text style={styles.cellDate}>
                  {new Date(point.recordedAt).toLocaleDateString('en-GB')}
                </Text>
                <Text style={styles.cell}>{point.pain}/10</Text>
                <Text style={styles.cell}>{point.stiffness}/10</Text>
                <Text style={styles.cell}>{point.rom}/10</Text>
                <Text style={styles.cell}>{point.function}/10</Text>
                <Text style={styles.cellWide}>{point.events?.join(', ') || '—'}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.disclaimer}>
            Generated by the AURA synthetic test build. Therapist branding and final professional
            context must be reviewed before any real-world use.
          </Text>
        </Page>
      )}
    </Document>
  )
}
