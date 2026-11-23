import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChartSvg, FigureOverlay, LegendSvg } from './drawing'
import { PRINT, legendKinds, type Prims } from './print'
import { chartHeight, chartLayout, figureLayout, type BodyAssets } from './geometry'
import type { ReportChart, ReportFigure, ReportView } from './model'

const font = 'Helvetica, Arial, sans-serif'

const htmlPrims: Prims = {
  Svg: ({ width, height, viewBox, children }: { width: number; height: number; viewBox: string; children: ReactNode }) => (
    <svg viewBox={viewBox} width="100%" style={{ aspectRatio: `${width} / ${height}` }} aria-hidden="true" focusable="false">
      {children}
    </svg>
  ),
  G: 'g',
  Line: 'line',
  Polyline: 'polyline',
  Circle: 'circle',
  Rect: 'rect',
  Polygon: 'polygon',
  Text: 'text',
  regular: { fontFamily: font },
  bold: { fontFamily: font, fontWeight: 700 },
}

/** The print palette, handed to CSS so the screen and the PDF share one set of colours. */
const paperColours = {
  '--p-ink': PRINT.ink,
  '--p-text': PRINT.text,
  '--p-muted': PRINT.muted,
  '--p-line': PRINT.line,
  '--p-grid': PRINT.grid,
  '--p-aqua': PRINT.aqua,
  '--p-aqua-tint': PRINT.aquaTint,
  '--p-gold': PRINT.gold,
  '--p-gold-tint': PRINT.goldTint,
  '--p-paper': PRINT.paper,
} as CSSProperties

/**
 * Drawings are laid out in print points at three quarters of their on-screen width, so a
 * label printed at 8.5 pt reads at about 11 px on a phone instead of shrinking with the page.
 */
function useDesignWidth(max: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(max)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const px = entry?.contentRect.width ?? 0
      if (px > 0) setWidth(Math.min(max, Math.round(px * 0.75)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [max])
  return { ref, width }
}

function Chart({ chart, from, to }: { chart: ReportChart; from: string; to: string }) {
  const { ref, width } = useDesignWidth(507)
  const layout = chartLayout(chart, from, to, width, chartHeight(chart))
  return (
    <figure className="paper__chart" ref={ref}>
      <figcaption>
        <strong>{chart.title}</strong>
        <span>{chart.attribution}</span>
      </figcaption>
      <LegendSvg prims={htmlPrims} kinds={legendKinds(chart.points)} width={width} />
      <ChartSvg prims={htmlPrims} layout={layout} />
      <p>{chart.summary}</p>
      {chart.gaps.map((gap) => (
        <p key={gap} className="paper__muted">
          {gap}
        </p>
      ))}
    </figure>
  )
}

function Figure({ figure, body, max }: { figure: ReportFigure; body: BodyAssets | null | undefined; max: number }) {
  const { ref, width } = useDesignWidth(max)
  if (!body) {
    return (
      <figure className="paper__figure paper__figure--text" ref={ref}>
        <strong>{figure.view === 'front' ? 'Front view' : 'Back view'}</strong>
        <p className="paper__muted">
          {body === undefined ? 'Loading the body illustration…' : 'The body illustration is not available in this test build. The scores it would show:'}
        </p>
        <ul>
          {figure.markers.map((marker) => (
            <li key={marker.area}>
              {marker.label} {marker.pain}/10
            </li>
          ))}
        </ul>
        <figcaption>{figure.caption}</figcaption>
      </figure>
    )
  }
  const frame = body.views[figure.view]
  // On a phone the drawing keeps a readable height instead of shrinking with the column.
  const height = Math.round(Math.min(318, Math.max(width * 0.63, 260)))
  const layout = figureLayout({ frame, anchors: body.anchors, markers: figure.markers, width, height })
  const pct = (value: number, of: number) => `${(value / of) * 100}%`
  const imageStyle: CSSProperties = {
    left: pct(layout.image.x, layout.width),
    top: pct(layout.image.y, layout.height),
    width: pct(layout.image.width, layout.width),
    height: pct(layout.image.height, layout.height),
  }
  return (
    <figure className="paper__figure" ref={ref}>
      <div className="paper__body" style={{ aspectRatio: `${layout.width} / ${layout.height}` }}>
        <img src={frame.src} alt="" style={imageStyle} />
        <FigureOverlay prims={htmlPrims} layout={layout} />
      </div>
      <figcaption>{figure.caption}</figcaption>
      <ul className="visually-hidden">
        {layout.markers.map((item) => (
          <li key={item.marker.area}>
            {item.marker.label} {item.marker.pain} out of 10, recorded {item.detail.replace('recorded ', '')}
          </li>
        ))}
      </ul>
    </figure>
  )
}

function Quote({ text, attribution }: { text: string; attribution: string }) {
  return (
    <blockquote className="paper__quote">
      <p>“{text}”</p>
      <footer>{attribution}</footer>
    </blockquote>
  )
}

/** The document exactly as it will be shared, from the same view as the PDF. */
export function ReportPreview({ view, body, label = 'Report preview' }: { view: ReportView; body: BodyAssets | null | undefined; label?: string }) {
  const { from, to } = view.range
  const figures = view.figures ?? []
  return (
    <article className="paper" aria-label={label} style={paperColours}>
      <header className="paper__brand">
        <span className="paper__wordmark">AURA</span>
        <span className="paper__eyebrow">Report for a doctor · {view.preparedOn}</span>
      </header>
      <div className="paper__rule" aria-hidden="true" />
      <h2 className="paper__name">{view.clientName}</h2>
      {view.clientBorn ? <p className="paper__muted">Born {view.clientBorn}</p> : null}

      <dl className="paper__facts">
        <div>
          <dt>Prepared by</dt>
          <dd>
            <strong>{view.preparedBy}</strong>
            <span>{view.preparedByTitle}</span>
          </dd>
        </div>
        <div>
          <dt>Prepared for</dt>
          <dd>
            <strong>{view.recipient}</strong>
            <span>{view.purpose}</span>
          </dd>
        </div>
        <div>
          <dt>Period covered</dt>
          <dd>
            <strong>{view.period}</strong>
            <span>{view.periodDetail}</span>
          </dd>
        </div>
      </dl>

      <section className="paper__panel paper__panel--gold" aria-label="Recommendation">
        <p className="paper__eyebrow">Recommendation</p>
        <p className="paper__lead">{view.recommendation}</p>
        <p className="paper__muted">
          {view.preparedBy}, {view.preparedByTitle.toLocaleLowerCase()}, {view.preparedOn}
        </p>
      </section>

      <section>
        <h3>Affected areas</h3>
        <p className="paper__muted">Pain scores reported by the client, 0 = no pain, 10 = worst imaginable</p>
        <div className="paper__table-wrap">
          <table className="paper__table paper__table--areas">
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col">Latest</th>
                <th scope="col">Recorded</th>
                <th scope="col">Range in period</th>
                <th scope="col">Scores</th>
              </tr>
            </thead>
            <tbody>
              {view.areas.map((area) => (
                <tr key={area.area}>
                  <th scope="row">{area.label}</th>
                  <td className="paper__score" data-label="Latest">
                    {area.latest}
                  </td>
                  <td data-label="Recorded">{area.recorded}</td>
                  <td data-label="Range in period">{area.range}</td>
                  <td data-label="Scores">{area.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {view.areas.map((area) => (
          <p key={area.area}>{area.trend}</p>
        ))}
      </section>

      {view.therapistNote ? (
        <section className="paper__panel paper__panel--aqua" aria-label="Therapist observation">
          <p className="paper__eyebrow">Therapist observation</p>
          <p className="paper__note">{view.therapistNote.text}</p>
          <p className="paper__muted">{view.therapistNote.attribution}</p>
        </section>
      ) : null}

      {view.recentWords.length ? (
        <section>
          <h3>In the client’s own words</h3>
          {view.recentWords.map((quote) => (
            <Quote key={quote.attribution + quote.text} {...quote} />
          ))}
        </section>
      ) : null}

      {figures.length ? (
        <section className="paper__page-break">
          <h3>Body map</h3>
          <p className="paper__muted">The same anatomical model used during visits. R and L are the client’s own right and left.</p>
          <div className={figures.length > 1 ? 'paper__figures paper__figures--pair' : 'paper__figures'}>
            {figures.map((figure) => (
              <Figure key={figure.view} figure={figure} body={body} max={figures.length > 1 ? 245 : 507} />
            ))}
          </div>
        </section>
      ) : null}

      {view.painCharts?.length ? (
        <section>
          <h3>Pain over time</h3>
          {view.painCharts.map((chart) => (
            <Chart key={chart.key} chart={chart} from={from} to={to} />
          ))}
        </section>
      ) : null}

      {view.romCharts?.length ? (
        <section>
          <h3>Range of motion</h3>
          <p className="paper__muted">Recorded measurements, in degrees, with the typical range for comparison</p>
          <div className="paper__pair">
            {view.romCharts.map((chart) => (
              <Chart key={chart.key} chart={chart} from={from} to={to} />
            ))}
          </div>
        </section>
      ) : null}

      {view.goalCharts?.length ? (
        <section>
          <h3>Everyday goals</h3>
          {view.goalCharts.map((chart) => (
            <Chart key={chart.key} chart={chart} from={from} to={to} />
          ))}
        </section>
      ) : null}

      {view.visits ? (
        <section>
          <h3>Visits</h3>
          <p className="paper__muted">{view.visits.summary}</p>
          <div className="paper__table-wrap">
            <table className="paper__table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Therapist</th>
                  {view.visits.columns.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.visits.rows.map((row) => (
                  <tr key={row.date + row.therapist}>
                    <th scope="row">{row.date}</th>
                    <td>{row.therapist}</td>
                    {row.cells.map((cell, index) => (
                      <td key={view.visits?.columns[index] ?? index}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view.visits.footnotes.map((note) => (
            <p key={note} className="paper__muted">
              {note}
            </p>
          ))}
        </section>
      ) : null}

      {view.earlierWords.length ? (
        <section>
          <h3>Earlier, in the client’s own words</h3>
          {view.earlierWords.map((quote) => (
            <Quote key={quote.attribution + quote.text} {...quote} />
          ))}
        </section>
      ) : null}

      {view.photos ? (
        <section>
          <h3>Photographs</h3>
          {view.photos.length ? (
            <div className="paper__pair">
              {view.photos.map((photo) => (
                <figure key={photo.src.slice(-24)} className="paper__photo">
                  <img src={photo.src} alt={photo.caption} />
                  <figcaption>{photo.caption}</figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="paper__muted">No photographs were taken in this period.</p>
          )}
        </section>
      ) : null}

      <section>
        <h3>About this report</h3>
        {view.consent ? <p>{view.consent}</p> : null}
        {view.about.map((line) => (
          <p key={line} className="paper__muted">
            {line}
          </p>
        ))}
      </section>
      <footer className="paper__footer">Prepared with AURA · synthetic demo data</footer>
    </article>
  )
}
