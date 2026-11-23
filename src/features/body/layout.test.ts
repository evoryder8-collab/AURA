import { describe, expect, it } from 'vitest'
import { anchorFor, anchorVisible, nearestAnchor } from './anchors'
import { layoutLabels } from './layout'

describe('body label layout', () => {
  const bounds = { width: 800, height: 600, margin: 40 }

  it('puts labels beside the side of the body their marker is on, without overlaps', () => {
    const placed = layoutLabels({
      markers: [
        { id: 'a', x: 430, y: 200 },
        { id: 'b', x: 432, y: 205 },
        { id: 'c', x: 360, y: 450 },
      ],
      center: { x: 400, y: 300 },
      axis: { x: 0, y: -1 },
      offset: 200,
      gap: 60,
      bounds,
    })
    const a = placed.find((item) => item.id === 'a')
    const b = placed.find((item) => item.id === 'b')
    const c = placed.find((item) => item.id === 'c')
    expect(a?.label.x).toBeGreaterThan(400)
    expect(c?.label.x).toBeLessThan(400)
    expect(Math.abs((a?.label.y ?? 0) - (b?.label.y ?? 0))).toBeGreaterThanOrEqual(59.9)
  })

  it('places labels above and below when the table runs left to right', () => {
    const placed = layoutLabels({
      markers: [{ id: 'a', x: 300, y: 260 }],
      center: { x: 400, y: 300 },
      axis: { x: -1, y: 0 },
      offset: 150,
      gap: 150,
      bounds,
    })
    expect(placed[0]?.label.y).toBeLessThan(300)
  })
})

describe('anchors', () => {
  it('keeps anatomical left on +X and right on -X', () => {
    expect(anchorFor('shoulder:left')?.position[0]).toBeGreaterThan(0)
    expect(anchorFor('calf:right')?.position[0]).toBeLessThan(0)
  })

  it('flags a calf as hidden from the front and visible from the back', () => {
    const calf = anchorFor('calf:right')
    if (!calf) throw new Error('missing calf anchor')
    expect(anchorVisible(calf, 'front')).toBe(false)
    expect(anchorVisible(calf, 'back')).toBe(true)
  })

  it('picks the nearest visible anchor for a tap on the model', () => {
    const shoulder = anchorFor('shoulder:left')
    if (!shoulder) throw new Error('missing shoulder anchor')
    expect(nearestAnchor(shoulder.position, 'front')?.area).toBe('shoulder:left')
  })
})
