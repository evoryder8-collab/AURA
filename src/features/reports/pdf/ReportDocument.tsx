import type { ReactNode } from 'react'
import {
  Circle,
  Defs,
  Document,
  G,
  Image,
  Line,
  LinearGradient,
  Page,
  Polygon,
  Polyline,
  Rect,
  Stop,
  StyleSheet,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer'
import { chartHeight, chartLayout, figureLayout, type BodyAssets } from '../geometry'
import { ChartSvg, FigureOverlay, LegendSvg } from '../drawing'
import { PRINT, legendKinds, type Prims } from '../print'
import { fmtMed, type ReportChart, type ReportFigure, type ReportView } from '../model'

/**
 * The exported A4 document. It reads only the shared `ReportView` (built from
 * `buildReportContent()`), so private notes have no way in.
 */

const PAGE_X = 44
const WIDTH = 595.28 - PAGE_X * 2
const HALF = (WIDTH - 18) / 2
const FIGURE_HEIGHT = 318

const pairs = <T,>(items: readonly T[]) => items.flatMap((_item, index) => (index % 2 ? [] : [items.slice(index, index + 2)]))

const prims: Prims = {
  Svg,
  G,
  Line,
  Polyline,
  Circle,
  Rect,
  Polygon,
  Text,
  regular: { fontFamily: 'Helvetica' },
  bold: { fontFamily: 'Helvetica-Bold' },
}

// Line height lives on each text style: set on the Page it hides react-pdf's page numbers.
const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 66,
    paddingHorizontal: PAGE_X,
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: PRINT.text,
    backgroundColor: PRINT.paper,
  },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  wordmark: { fontFamily: 'Helvetica-Bold', fontSize: 12, letterSpacing: 3.2, color: PRINT.ink },
  eyebrow: { fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 1.1, color: PRINT.muted, textTransform: 'uppercase' },
  name: { fontFamily: 'Helvetica-Bold', fontSize: 24, color: PRINT.ink, lineHeight: 1.15, marginTop: 18 },
  born: { fontSize: 9.5, lineHeight: 1.4, color: PRINT.muted, marginTop: 2 },
  facts: { flexDirection: 'row', marginTop: 16, paddingTop: 12, borderTopWidth: 0.8, borderTopColor: PRINT.line },
  fact: { flexGrow: 1, flexBasis: 0, paddingRight: 14 },
  factValue: { fontFamily: 'Helvetica-Bold', fontSize: 10, lineHeight: 1.35, color: PRINT.ink, marginTop: 4 },
  factDetail: { fontSize: 9, lineHeight: 1.4, color: PRINT.text, marginTop: 1 },
  panel: { marginTop: 14, padding: 12, borderRadius: 6, borderWidth: 0.8 },
  recommendation: { backgroundColor: PRINT.goldTint, borderColor: '#E7D6B6' },
  observation: { backgroundColor: PRINT.aquaTint, borderColor: '#CDE2DD' },
  panelText: { fontSize: 12, lineHeight: 1.38, color: PRINT.ink, marginTop: 5 },
  noteText: { fontSize: 10.5, lineHeight: 1.45, color: PRINT.ink, marginTop: 5 },
  attribution: { fontSize: 8.5, lineHeight: 1.35, color: PRINT.muted, marginTop: 6 },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 12.5, lineHeight: 1.3, color: PRINT.ink, marginTop: 18, marginBottom: 2 },
  sectionLead: { fontSize: 8.5, lineHeight: 1.4, color: PRINT.muted, marginBottom: 4 },
  table: { marginTop: 4, borderTopWidth: 0.8, borderTopColor: PRINT.line },
  tr: { flexDirection: 'row', borderBottomWidth: 0.6, borderBottomColor: PRINT.grid, paddingVertical: 5, alignItems: 'center' },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 0.6, lineHeight: 1.3, color: PRINT.muted, textTransform: 'uppercase', paddingRight: 8 },
  td: { fontSize: 9.5, lineHeight: 1.35, color: PRINT.text, paddingRight: 8 },
  tdStrong: { fontFamily: 'Helvetica-Bold', fontSize: 10, lineHeight: 1.35, color: PRINT.ink },
  score: { fontFamily: 'Helvetica-Bold', fontSize: 13, lineHeight: 1.2, color: PRINT.ink },
  trend: { fontSize: 9.5, lineHeight: 1.45, color: PRINT.text, marginTop: 6 },
  quote: { marginTop: 7 },
  quoteText: { fontFamily: 'Times-Italic', fontSize: 11.5, color: PRINT.ink, lineHeight: 1.35 },
  chartBlock: { marginTop: 10 },
  chartTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, lineHeight: 1.3, color: PRINT.ink },
  chartMeta: { fontSize: 8, lineHeight: 1.35, color: PRINT.muted, marginTop: 1, marginBottom: 4 },
  summary: { fontSize: 9, lineHeight: 1.45, color: PRINT.text, marginTop: 4 },
  gap: { fontSize: 8.5, lineHeight: 1.4, color: PRINT.muted, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  caption: { fontSize: 8.5, lineHeight: 1.35, color: PRINT.muted, marginTop: 4, textAlign: 'center' },
  unavailable: { marginTop: 6, padding: 12, borderWidth: 0.8, borderColor: PRINT.line, borderRadius: 6 },
  footerRule: { position: 'absolute', left: PAGE_X, right: PAGE_X, bottom: 50, height: 0.6, backgroundColor: PRINT.line },
  footerText: { position: 'absolute', fontSize: 7.5, color: PRINT.muted },
  photo: { width: HALF, marginTop: 8 },
  about: { fontSize: 8.5, lineHeight: 1.45, color: PRINT.muted, marginTop: 3 },
})

function Hairline() {
  return (
    <Svg width={WIDTH} height={3} viewBox={`0 0 ${WIDTH} 3`} style={{ marginTop: 8 }}>
      <Defs>
        <LinearGradient id="aura-rule" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={PRINT.aqua} />
          <Stop offset="0.65" stopColor="#7DBFB4" />
          <Stop offset="1" stopColor={PRINT.gold} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={WIDTH} height={1.6} fill="url(#aura-rule)" />
    </Svg>
  )
}

/** A section whose heading always travels with its first block, so no heading is left alone at a page foot. */
function Section({ title, lead, blocks, breakBefore = false }: { title: string; lead?: string; blocks: ReactNode[]; breakBefore?: boolean }) {
  const [first, ...rest] = blocks
  return (
    <View break={breakBefore}>
      <View wrap={false}>
        <Text style={s.h2}>{title}</Text>
        {lead ? <Text style={s.sectionLead}>{lead}</Text> : null}
        {first}
      </View>
      {rest}
    </View>
  )
}

function Chart({ chart, from, to, width }: { chart: ReportChart; from: string; to: string; width: number }) {
  const layout = chartLayout(chart, from, to, width, chartHeight(chart))
  return (
    <View style={s.chartBlock} wrap={false}>
      <Text style={s.chartTitle}>{chart.title}</Text>
      <Text style={s.chartMeta}>{chart.attribution}</Text>
      <LegendSvg prims={prims} kinds={legendKinds(chart.points)} width={width} />
      <ChartSvg prims={prims} layout={layout} />
      <Text style={s.summary}>{chart.summary}</Text>
      {chart.gaps.map((gap) => (
        <Text key={gap} style={s.gap}>
          {gap}
        </Text>
      ))}
    </View>
  )
}

function Figure({ figure, body, width }: { figure: ReportFigure; body: BodyAssets | null; width: number }) {
  if (!body) {
    return (
      <View style={[s.unavailable, { width }]} wrap={false}>
        <Text style={s.chartTitle}>{figure.view === 'front' ? 'Front view' : 'Back view'}</Text>
        <Text style={s.about}>The body illustration is not available in this test build. The scores it would show:</Text>
        {figure.markers.map((marker) => (
          <Text key={marker.area} style={s.td}>
            {marker.label} {marker.pain}/10, recorded {fmtMed(marker.observedAt)}
          </Text>
        ))}
      </View>
    )
  }
  const frame = body.views[figure.view]
  const layout = figureLayout({ frame, anchors: body.anchors, markers: figure.markers, width, height: FIGURE_HEIGHT })
  return (
    <View style={{ width }} wrap={false}>
      <View style={{ width, height: layout.height, position: 'relative' }}>
        <Image
          src={frame.src}
          style={{ position: 'absolute', left: layout.image.x, top: layout.image.y, width: layout.image.width, height: layout.image.height }}
        />
        <View style={{ position: 'absolute', left: 0, top: 0 }}>
          <FigureOverlay prims={prims} layout={layout} />
        </View>
      </View>
      <Text style={s.caption}>{figure.caption}</Text>
      {layout.missing.map((marker) => (
        <Text key={marker.area} style={s.caption}>
          {marker.label} {marker.pain}/10 cannot be placed on this drawing.
        </Text>
      ))}
    </View>
  )
}

function Quote({ text, attribution }: { text: string; attribution: string }) {
  return (
    <View style={s.quote} wrap={false}>
      <Text style={s.quoteText}>“{text}”</Text>
      <Text style={s.attribution}>{attribution}</Text>
    </View>
  )
}

export function ReportDocument({ view, body }: { view: ReportView; body: BodyAssets | null }) {
  const { from, to } = view.range
  const figures = view.figures ?? []
  const paired = figures.length > 1
  return (
    <Document
      title={`Report for a doctor — ${view.clientName}`}
      author={view.preparedBy}
      subject={view.purpose}
      creator="AURA"
      producer="AURA · synthetic demo data"
      language="en-GB"
    >
      <Page size="A4" style={s.page}>
        <View style={s.footerRule} fixed />
        <Text style={[s.footerText, { left: PAGE_X, bottom: 36 }]} fixed>
          {view.clientName}
          {view.clientBorn ? `, born ${view.clientBorn}` : ''} · Report for {view.recipient}
        </Text>
        <Text
          style={[s.footerText, { right: PAGE_X, bottom: 36, width: 100, textAlign: 'right' }]}
          fixed
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
        <Text style={[s.footerText, { left: PAGE_X, bottom: 24 }]} fixed>
          Prepared with AURA · synthetic demo data
        </Text>

        <View style={s.brandRow}>
          <Text style={s.wordmark}>AURA</Text>
          <Text style={s.eyebrow}>Report for a doctor · {view.preparedOn}</Text>
        </View>
        <Hairline />

        <Text style={s.name}>{view.clientName}</Text>
        {view.clientBorn ? <Text style={s.born}>Born {view.clientBorn}</Text> : null}

        <View style={s.facts}>
          <View style={s.fact}>
            <Text style={s.eyebrow}>Prepared by</Text>
            <Text style={s.factValue}>{view.preparedBy}</Text>
            <Text style={s.factDetail}>{view.preparedByTitle}</Text>
          </View>
          <View style={s.fact}>
            <Text style={s.eyebrow}>Prepared for</Text>
            <Text style={s.factValue}>{view.recipient}</Text>
            <Text style={s.factDetail}>{view.purpose}</Text>
          </View>
          <View style={[s.fact, { paddingRight: 0 }]}>
            <Text style={s.eyebrow}>Period covered</Text>
            <Text style={s.factValue}>{view.period}</Text>
            <Text style={s.factDetail}>{view.periodDetail}</Text>
          </View>
        </View>

        <View style={[s.panel, s.recommendation]} wrap={false}>
          <Text style={[s.eyebrow, { color: PRINT.gold }]}>Recommendation</Text>
          <Text style={s.panelText}>{view.recommendation}</Text>
          <Text style={s.attribution}>
            {view.preparedBy}, {view.preparedByTitle.toLocaleLowerCase()}, {view.preparedOn}
          </Text>
        </View>

        <View wrap={false}>
          <Text style={s.h2}>Affected areas</Text>
          <Text style={s.sectionLead}>Pain scores reported by the client, 0 = no pain, 10 = worst imaginable</Text>
          <View style={s.table}>
            <View style={s.tr}>
              <Text style={[s.th, { width: '26%' }]}>Area</Text>
              <Text style={[s.th, { width: '14%' }]}>Latest</Text>
              <Text style={[s.th, { width: '30%' }]}>Recorded</Text>
              <Text style={[s.th, { width: '18%' }]}>Range in period</Text>
              <Text style={[s.th, { width: '12%', textAlign: 'right' }]}>Scores</Text>
            </View>
            {view.areas.map((area) => (
              <View key={area.area} style={s.tr}>
                <Text style={[s.tdStrong, { width: '26%' }]}>{area.label}</Text>
                <Text style={[s.score, { width: '14%' }]}>{area.latest}</Text>
                <Text style={[s.td, { width: '30%' }]}>{area.recorded}</Text>
                <Text style={[s.td, { width: '18%' }]}>{area.range}</Text>
                <Text style={[s.td, { width: '12%', textAlign: 'right' }]}>{area.count}</Text>
              </View>
            ))}
          </View>
          {view.areas.map((area) => (
            <Text key={area.area} style={s.trend}>
              {area.trend}
            </Text>
          ))}
        </View>

        {view.therapistNote ? (
          <View style={[s.panel, s.observation]} wrap={false}>
            <Text style={[s.eyebrow, { color: PRINT.aqua }]}>Therapist observation</Text>
            <Text style={s.noteText}>{view.therapistNote.text}</Text>
            <Text style={s.attribution}>{view.therapistNote.attribution}</Text>
          </View>
        ) : null}

        {view.recentWords.length ? (
          <Section title="In the client’s own words" blocks={view.recentWords.map((quote) => <Quote key={quote.attribution + quote.text} {...quote} />)} />
        ) : null}

        {figures.length ? (
          <Section
            breakBefore
            title="Body map"
            lead="The same anatomical model used during visits. R and L are the client’s own right and left."
            blocks={[
              <View key="figures" style={paired ? [s.row, { marginTop: 4 }] : { marginTop: 4 }}>
                {figures.map((figure) => (
                  <Figure key={figure.view} figure={figure} body={body} width={paired ? HALF : WIDTH} />
                ))}
              </View>,
            ]}
          />
        ) : null}

        {view.painCharts?.length ? (
          <Section
            breakBefore={!figures.length}
            title="Pain over time"
            blocks={view.painCharts.map((chart) => (
              <Chart key={chart.key} chart={chart} from={from} to={to} width={WIDTH} />
            ))}
          />
        ) : null}

        {view.romCharts?.length ? (
          <Section
            title="Range of motion"
            lead="Recorded measurements, in degrees, with the typical range for comparison"
            blocks={pairs(view.romCharts).map((row) => (
              <View key={row.map((chart) => chart.key).join()} style={s.row} wrap={false}>
                {row.map((chart) => (
                  <View key={chart.key} style={{ width: HALF }}>
                    <Chart chart={chart} from={from} to={to} width={HALF} />
                  </View>
                ))}
              </View>
            ))}
          />
        ) : null}

        {view.goalCharts?.length ? (
          <Section
            title="Everyday goals"
            blocks={view.goalCharts.map((chart) => (
              <Chart key={chart.key} chart={chart} from={from} to={to} width={WIDTH} />
            ))}
          />
        ) : null}

        {view.visits ? (
          <Section
            title="Visits"
            lead={view.visits.summary}
            blocks={[
              <View key="table" wrap={false}>
                <View style={s.table}>
                  <View style={s.tr}>
                    <Text style={[s.th, { width: 74 }]}>Date</Text>
                    <Text style={[s.th, { width: 118 }]}>Therapist</Text>
                    {view.visits.columns.map((column) => (
                      <Text key={column} style={[s.th, { flexGrow: 1, flexBasis: 0 }]}>
                        {column}
                      </Text>
                    ))}
                  </View>
                  {view.visits.rows.map((row) => (
                    <View key={row.date + row.therapist} style={s.tr}>
                      <Text style={[s.td, { width: 74 }]}>{row.date}</Text>
                      <Text style={[s.td, { width: 118 }]}>{row.therapist}</Text>
                      {row.cells.map((cell, index) => (
                        <Text key={`${view.visits?.columns[index] ?? index}`} style={[s.td, { flexGrow: 1, flexBasis: 0 }]}>
                          {cell}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
                {view.visits.footnotes.map((note) => (
                  <Text key={note} style={s.about}>
                    {note}
                  </Text>
                ))}
              </View>,
            ]}
          />
        ) : null}

        {view.earlierWords.length ? (
          <Section
            title="Earlier, in the client’s own words"
            blocks={view.earlierWords.map((quote) => <Quote key={quote.attribution + quote.text} {...quote} />)}
          />
        ) : null}

        {view.photos ? (
          <Section
            title="Photographs"
            lead="Included with the client’s explicit agreement."
            blocks={
              view.photos.length
                ? pairs(view.photos).map((row) => (
                    <View key={row.map((photo) => photo.src.slice(-24)).join()} style={s.row} wrap={false}>
                      {row.map((photo) => (
                        <View key={photo.src.slice(-24)} style={s.photo}>
                          <Image src={photo.src} style={{ width: HALF, borderRadius: 4 }} />
                          <Text style={s.caption}>{photo.caption}</Text>
                        </View>
                      ))}
                    </View>
                  ))
                : [<Text key="none" style={s.about}>No photographs were taken in this period.</Text>]
            }
          />
        ) : null}

        <Section
          title="About this report"
          blocks={[
            <View key="about">
              {view.consent ? <Text style={[s.about, { color: PRINT.text }]}>{view.consent}</Text> : null}
              {view.about.map((line) => (
                <Text key={line} style={s.about}>
                  {line}
                </Text>
              ))}
            </View>,
          ]}
        />
      </Page>
    </Document>
  )
}
