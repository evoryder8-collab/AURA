import { describe, expect, it } from 'vitest'
import { projectOnRender, type BodyViews } from './fallback'

const views: BodyViews = {
  width: 1400,
  height: 3000,
  front: { left: -0.487, right: 0.487, bottom: -0.184, top: 1.903 },
  back: { left: 0.487, right: -0.487, bottom: -0.184, top: 1.903 },
}

describe('fallback projection on the print renders', () => {
  const at = (face: 'front' | 'back', rotation: 0 | 90 | 180 | 270) =>
    projectOnRender({ views, face, rotation, width: 600, height: 600, areas: ['shoulder:left'] }).markers[0]

  it('keeps the left shoulder on the anatomical left through flips and turns', () => {
    expect(at('front', 0)?.x).toBeGreaterThan(300)
    expect(at('back', 0)?.x).toBeLessThan(300)
    expect(at('front', 90)?.y).toBeGreaterThan(300)
    expect(at('front', 180)?.x).toBeLessThan(300)
  })

  it('agrees with the left direction it reports for side labels', () => {
    const projection = projectOnRender({ views, face: 'back', rotation: 270, width: 600, height: 600, areas: ['shoulder:left'] })
    const marker = projection.markers[0]
    if (!marker) throw new Error('missing marker')
    const along = (marker.x - 300) * projection.leftDirection.x + (marker.y - 300) * projection.leftDirection.y
    expect(along).toBeGreaterThan(0)
  })
})
