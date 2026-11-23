import { anatomicalLeftScreenDirection, type AreaKey, type TableRotation } from '@/domain/care'
import { anchorFor, anchorVisible, type FigureFace } from './anchors'
import type { Point } from './layout'

export type ViewFrame = { left: number; right: number; bottom: number; top: number }
export type BodyViews = { width: number; height: number; front: ViewFrame; back: ViewFrame }

const LEFT: Record<'right' | 'down' | 'left' | 'up', Point> = {
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
}

export function isBodyViews(value: unknown): value is BodyViews {
  const frame = (item: unknown) =>
    typeof item === 'object' && item !== null && ['left', 'right', 'bottom', 'top'].every((key) => typeof (item as Record<string, unknown>)[key] === 'number')
  const record = value as Record<string, unknown> | null
  return Boolean(record && typeof record.width === 'number' && typeof record.height === 'number' && frame(record.front) && frame(record.back))
}

/**
 * Projects anchors onto the print renders exactly as the 3D figure does: the same frame
 * for each face, then a quarter-turn rotation for the table orientation.
 */
export function projectOnRender(input: {
  views: BodyViews
  face: FigureFace
  rotation: TableRotation
  width: number
  height: number
  areas: readonly AreaKey[]
}) {
  const { views, face, rotation, width, height } = input
  const frame = views[face]
  const turned = rotation === 90 || rotation === 270
  const scale = Math.min(width / (turned ? views.height : views.width), height / (turned ? views.width : views.height)) * 0.92
  const angle = (rotation * Math.PI) / 180
  const centre = { x: width / 2, y: height / 2 }
  const place = (u: number, v: number): Point => {
    const dx = (u - views.width / 2) * scale
    const dy = (v - views.height / 2) * scale
    return { x: centre.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: centre.y + dx * Math.sin(angle) + dy * Math.cos(angle) }
  }
  const markers = input.areas.flatMap((area) => {
    const anchor = anchorFor(area)
    if (!anchor) return []
    const [x, y] = anchor.position
    const u = ((x - frame.left) / (frame.right - frame.left)) * views.width
    const v = ((frame.top - y) / (frame.top - frame.bottom)) * views.height
    return [{ area, ...place(u, v), visible: anchorVisible(anchor, face) }]
  })
  const head = { x: Math.sin(angle), y: -Math.cos(angle) }
  return {
    markers,
    center: centre,
    axis: head,
    width,
    height,
    leftDirection: LEFT[anatomicalLeftScreenDirection(face === 'front' ? 'face_up' : 'face_down', rotation)],
    image: { width: views.width * scale, height: views.height * scale, angle: rotation },
  }
}
