import { describe, expect, it } from 'vitest'
import { anchorFor, anchorVisible, nearestAnchor } from './anchors'
import { layoutLabels } from './layout'

describe('body label layout', () => {
  const bounds = { width: 800, height: 600, marginX: 60, marginY: 30 }

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

  it('keeps a long measured label fully inside a narrow phone stage', () => {
    // A 340px stage, as on a phone; "Right hand and wrist" measures 230px wide.
    const narrow = { width: 340, height: 420, marginX: 66, marginY: 34 }
    const input = {
      markers: [{ id: 'hand', x: 60, y: 230 }],
      center: { x: 170, y: 210 },
      axis: { x: 0, y: -1 },
      offset: 105,
      gap: 64,
      bounds: narrow,
    }
    const guessed = layoutLabels(input)[0]
    expect((guessed?.label.x ?? 0) - 115).toBeLessThan(0) // the margin guess alone lets it hang off the left edge
    const measured = layoutLabels({ ...input, sizes: { hand: { width: 230, height: 50 } } })[0]
    expect((measured?.label.x ?? 0) - 115).toBeGreaterThanOrEqual(6)
    expect((measured?.label.x ?? 0) + 115).toBeLessThanOrEqual(340 - 6)
  })

  it('centres a label wider than the stage instead of pushing it off one side', () => {
    const placed = layoutLabels({
      markers: [{ id: 'a', x: 20, y: 100 }],
      center: { x: 100, y: 100 },
      axis: { x: 0, y: -1 },
      offset: 60,
      gap: 40,
      bounds: { width: 200, height: 200, marginX: 40, marginY: 20 },
      sizes: { a: { width: 260, height: 40 } },
    })
    expect(placed[0]?.label.x).toBe(100)
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

  it('keeps every label on the stage when labels crowd one end of the axis', () => {
    const placed = layoutLabels({
      markers: [
        { id: 'a', x: 700, y: 250 },
        { id: 'b', x: 720, y: 255 },
        { id: 'c', x: 740, y: 260 },
      ],
      center: { x: 400, y: 300 },
      axis: { x: 1, y: 0 },
      offset: 150,
      gap: 200,
      bounds,
    })
    for (const item of placed) {
      expect(item.label.x).toBeGreaterThanOrEqual(60)
      expect(item.label.x).toBeLessThanOrEqual(740)
    }
    const xs = placed.map((item) => item.label.x).sort((a, b) => a - b)
    expect((xs[1] ?? 0) - (xs[0] ?? 0)).toBeGreaterThanOrEqual(199)
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
