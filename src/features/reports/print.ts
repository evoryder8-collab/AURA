import type { ElementType } from 'react'
import type { ObservationSource } from '@/domain/care'

/** The primitives a renderer supplies: react-pdf's SVG components, or plain SVG element names. */
export type Prims = {
  readonly Svg: ElementType
  readonly G: ElementType
  readonly Line: ElementType
  readonly Polyline: ElementType
  readonly Circle: ElementType
  readonly Rect: ElementType
  readonly Polygon: ElementType
  readonly Text: ElementType
  readonly regular: Readonly<Record<string, string | number>>
  readonly bold: Readonly<Record<string, string | number>>
}

/** Print palette: deep ink, a restrained aqua and lantern gold. Every value is also told by shape or text. */
export const PRINT = {
  ink: '#0E2A2F',
  text: '#22312F',
  muted: '#5A6A67',
  faint: '#8A9895',
  line: '#CBD6D3',
  grid: '#E5ECEA',
  aqua: '#2E8C7F',
  aquaTint: '#EEF6F4',
  gold: '#9C6F2A',
  goldTint: '#FBF5EA',
  paper: '#FFFFFF',
} as const

export type MarkerKind = ObservationSource | 'measured'

export const MARKER_LABEL: Record<MarkerKind, string> = {
  home: 'Logged at home',
  arrival: 'Arrival check',
  session: 'Treatment visit',
  follow_up: 'Next-day follow-up',
  measured: 'Measured at a visit',
}

export function legendKinds(points: ReadonlyArray<{ source: MarkerKind }>): MarkerKind[] {
  const present = new Set(points.map((point) => point.source))
  return (['home', 'arrival', 'session', 'follow_up', 'measured'] as const).filter((kind) => present.has(kind))
}

