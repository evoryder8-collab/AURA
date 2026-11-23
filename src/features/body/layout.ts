export type Point = { readonly x: number; readonly y: number }

export type PlacedLabel = {
  readonly id: string
  readonly marker: Point
  readonly label: Point
  /** Which side of the body's long axis the label sits on. */
  readonly side: 1 | -1
}

/**
 * Places marker labels outside the figure, on whichever side of the body's long axis the
 * marker lies, then spreads labels along that axis so none overlap. Works for any table
 * rotation because it only uses the on-screen head direction.
 */
export function layoutLabels(input: {
  readonly markers: ReadonlyArray<{ id: string; x: number; y: number }>
  readonly center: Point
  /** Unit vector pointing from the feet to the head, in screen space. */
  readonly axis: Point
  /** Distance from the long axis to the label centres, in px. */
  readonly offset: number
  /** Minimum distance between neighbouring label centres along the axis, in px. */
  readonly gap: number
  /** `marginX` and `marginY` are half a label's width and height plus breathing room. */
  readonly bounds: { readonly width: number; readonly height: number; readonly marginX: number; readonly marginY: number }
}): PlacedLabel[] {
  const { center, axis, offset, gap, bounds } = input
  const perp: Point = { x: -axis.y, y: axis.x }
  const projected = input.markers.map((marker) => {
    const dx = marker.x - center.x
    const dy = marker.y - center.y
    return { marker, along: dx * axis.x + dy * axis.y, across: dx * perp.x + dy * perp.y }
  })
  const counts = { 1: 0, [-1]: 0 } as Record<1 | -1, number>
  const withSide = projected
    .sort((a, b) => Math.abs(b.across) - Math.abs(a.across))
    .map((item) => {
      let side: 1 | -1 = item.across >= 0 ? 1 : -1
      // Markers on the midline go to the emptier side.
      if (Math.abs(item.across) < 6) side = counts[1] <= counts[-1] ? 1 : -1
      counts[side] += 1
      return { ...item, side }
    })

  const placed: PlacedLabel[] = []
  for (const side of [1, -1] as const) {
    const group = withSide.filter((item) => item.side === side).sort((a, b) => a.along - b.along)
    const positions = group.map((item) => item.along)
    // The stretch of the axis a label centre may occupy without leaving the stage.
    const horizontal = Math.abs(axis.x) >= Math.abs(axis.y)
    const [low, high] = horizontal
      ? [(bounds.marginX - center.x) / axis.x, (bounds.width - bounds.marginX - center.x) / axis.x]
      : [(bounds.marginY - center.y) / axis.y, (bounds.height - bounds.marginY - center.y) / axis.y]
    const minAlong = Math.min(low, high)
    const maxAlong = Math.max(low, high)
    for (let pass = 0; pass < 32; pass += 1) {
      for (let index = 1; index < positions.length; index += 1) {
        const previous = positions[index - 1] as number
        const current = positions[index] as number
        if (current - previous < gap) {
          const push = (gap - (current - previous)) / 2
          positions[index - 1] = previous - push
          positions[index] = current + push
        }
      }
      for (let index = 0; index < positions.length; index += 1) {
        positions[index] = Math.min(maxAlong, Math.max(minAlong, positions[index] as number))
      }
    }
    group.forEach((item, index) => {
      const along = positions[index] ?? item.along
      const x = center.x + axis.x * along + perp.x * offset * side
      const y = center.y + axis.y * along + perp.y * offset * side
      placed.push({
        id: item.marker.id,
        marker: { x: item.marker.x, y: item.marker.y },
        label: {
          x: Math.min(bounds.width - bounds.marginX, Math.max(bounds.marginX, x)),
          y: Math.min(bounds.height - bounds.marginY, Math.max(bounds.marginY, y)),
        },
        side,
      })
    })
  }
  return placed
}
