import {
  areaKey,
  isRegionId,
  type AnatomicalSide,
  type AreaKey,
  type BodySurface,
  type RegionId,
} from '@/domain/care'
import raw from './anchors.json'

export type Vec3 = readonly [number, number, number]

/** A surface point on the body model. Model space: +Y up, figure faces +Z, anatomical left is +X. */
export type BodyAnchor = {
  readonly region: RegionId
  readonly side: AnatomicalSide
  readonly area: AreaKey
  readonly position: Vec3
  readonly normal: Vec3
  readonly surface: BodySurface
}

const isVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number' && Number.isFinite(item))

function parseAnchors(input: unknown): BodyAnchor[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return []
    const record = item as Record<string, unknown>
    const { region, side, position, normal, surface } = record
    if (!isRegionId(region)) return []
    if (side !== 'left' && side !== 'right' && side !== 'centre') return []
    if (surface !== 'front' && surface !== 'back' && surface !== 'edge') return []
    if (!isVec3(position) || !isVec3(normal)) return []
    return [{ region, side, area: areaKey(region, side), position, normal, surface }]
  })
}

export const BODY_ANCHORS: readonly BodyAnchor[] = parseAnchors(raw)

const byArea = new Map(BODY_ANCHORS.map((anchor) => [anchor.area, anchor]))

export function anchorFor(area: AreaKey): BodyAnchor | undefined {
  return byArea.get(area)
}

export type FigureFace = 'front' | 'back'

/** Whether an anchor faces the viewer when the figure shows `face` to them. */
export function anchorVisible(anchor: Pick<BodyAnchor, 'surface'>, face: FigureFace) {
  return anchor.surface === 'edge' || anchor.surface === face
}

/** The anchor nearest to a point on the model, among anchors visible from this face. */
export function nearestAnchor(point: Vec3, face: FigureFace): BodyAnchor | undefined {
  let best: BodyAnchor | undefined
  let bestDistance = Infinity
  for (const anchor of BODY_ANCHORS) {
    if (!anchorVisible(anchor, face)) continue
    const dx = anchor.position[0] - point[0]
    const dy = anchor.position[1] - point[1]
    const dz = anchor.position[2] - point[2]
    const distance = dx * dx + dy * dy * 1.4 + dz * dz * 0.25
    if (distance < bestDistance) {
      bestDistance = distance
      best = anchor
    }
  }
  return best
}
