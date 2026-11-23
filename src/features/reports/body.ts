import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { AreaKey } from '@/domain/care'
import { BODY_ANCHORS } from '@/features/body/anchors'
import type { BodyAssets, BodyFrame } from './geometry'

/**
 * The print figure: the anatomical model's renders (`public/body/views.json`, `front.png`,
 * `back.png`) plus the same surface anchors the session screen uses. The views file is a build
 * asset, still checked here: a malformed one yields no figure, never a marker in the wrong place.
 */

/** Orthographic frame of one view: model x at the image's left and right edges, model y at its top and bottom. */
const frameSchema = z.object({ left: z.number(), right: z.number(), top: z.number(), bottom: z.number() })

const viewsSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  front: frameSchema,
  back: frameSchema,
})

const anchors: ReadonlyMap<AreaKey, readonly [number, number]> = new Map(
  BODY_ANCHORS.map((anchor) => [anchor.area, [anchor.position[0], anchor.position[1]] as const]),
)

/** `resolveImage` turns `front.png` / `back.png` (beside views.json) into a URL or file path. */
export function parseBodyViews(views: unknown, resolveImage: (file: string) => string): BodyAssets | null {
  const parsed = viewsSchema.safeParse(views)
  if (!parsed.success) return null
  const { width, height } = parsed.data
  const frame = (view: 'front' | 'back'): BodyFrame | null => {
    const value = parsed.data[view]
    if (value.left === value.right || value.top <= value.bottom) return null
    return { src: resolveImage(`${view}.png`), width, height, ...value }
  }
  const front = frame('front')
  const back = frame('back')
  return front && back ? { views: { front, back }, anchors } : null
}

/** Browser loader; absolute image URLs so the PDF renderer can fetch them too. */
export async function loadBodyAssets(): Promise<BodyAssets | null> {
  const base = new URL(`${import.meta.env.BASE_URL}body/`, window.location.href)
  try {
    const response = await fetch(new URL('views.json', base))
    if (!response.ok) return null
    return parseBodyViews(await response.json(), (file) => new URL(file, base).href)
  } catch {
    return null
  }
}

let bodyPromise: Promise<BodyAssets | null> | null = null

/** The print renders, loaded once per visit: `undefined` while loading, `null` when unavailable. */
export function useBodyAssets() {
  const [body, setBody] = useState<BodyAssets | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    bodyPromise ??= loadBodyAssets()
    void bodyPromise.then((value) => live && setBody(value))
    return () => {
      live = false
    }
  }, [])
  return body
}
