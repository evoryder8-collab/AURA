/**
 * Body regions shared by check-in, Session Mode, progress charts and the doctor report.
 * Anatomical sides: `left` is always the client's own left, whatever way a figure is turned.
 */
export type BodySurface = 'front' | 'back' | 'edge'
export type AnatomicalSide = 'left' | 'right' | 'centre'
/** What a person may choose. `both` is stored as two entries, one per side. */
export type ChosenSide = AnatomicalSide | 'both'

export const REGION_IDS = [
  'head',
  'neck',
  'shoulder',
  'shoulder_blade',
  'upper_back',
  'mid_back',
  'lower_back',
  'chest',
  'abdomen',
  'upper_arm',
  'elbow',
  'forearm',
  'hand',
  'hip',
  'glute',
  'thigh_front',
  'thigh_back',
  'knee',
  'shin',
  'calf',
  'foot',
] as const

export type RegionId = (typeof REGION_IDS)[number]

export type BodyRegionDefinition = {
  readonly id: RegionId
  readonly label: string
  readonly plural: string
  readonly sides: readonly AnatomicalSide[]
  /** Where the region is seen; `edge` reads from both the front and the back. */
  readonly surface: BodySurface
  /** Overrides `surface` for particular sides (the sides of the neck show from both views). */
  readonly sideSurface?: Partial<Record<AnatomicalSide, BodySurface>>
  readonly group: 'head_neck' | 'upper_body' | 'back' | 'arms' | 'hips_legs'
}

const lateral = ['left', 'right'] as const
const midline = ['centre'] as const
const midlineAndSides = ['centre', 'left', 'right'] as const

export const BODY_REGIONS: readonly BodyRegionDefinition[] = [
  { id: 'head', label: 'Head', plural: 'Head', sides: midline, surface: 'front', group: 'head_neck' },
  { id: 'neck', label: 'Neck', plural: 'Neck', sides: midlineAndSides, surface: 'back', sideSurface: { left: 'edge', right: 'edge' }, group: 'head_neck' },
  { id: 'shoulder', label: 'Shoulder', plural: 'Shoulders', sides: lateral, surface: 'edge', group: 'upper_body' },
  { id: 'shoulder_blade', label: 'Shoulder blade', plural: 'Shoulder blades', sides: lateral, surface: 'back', group: 'back' },
  { id: 'upper_back', label: 'Upper back', plural: 'Upper back', sides: midline, surface: 'back', group: 'back' },
  { id: 'mid_back', label: 'Mid back', plural: 'Mid back', sides: midline, surface: 'back', group: 'back' },
  { id: 'lower_back', label: 'Lower back', plural: 'Lower back', sides: midlineAndSides, surface: 'back', group: 'back' },
  { id: 'chest', label: 'Chest', plural: 'Chest', sides: midlineAndSides, surface: 'front', group: 'upper_body' },
  { id: 'abdomen', label: 'Abdomen', plural: 'Abdomen', sides: midline, surface: 'front', group: 'upper_body' },
  { id: 'upper_arm', label: 'Upper arm', plural: 'Upper arms', sides: lateral, surface: 'edge', group: 'arms' },
  { id: 'elbow', label: 'Elbow', plural: 'Elbows', sides: lateral, surface: 'back', group: 'arms' },
  { id: 'forearm', label: 'Forearm', plural: 'Forearms', sides: lateral, surface: 'front', group: 'arms' },
  { id: 'hand', label: 'Hand and wrist', plural: 'Hands and wrists', sides: lateral, surface: 'front', group: 'arms' },
  { id: 'hip', label: 'Hip', plural: 'Hips', sides: lateral, surface: 'edge', group: 'hips_legs' },
  { id: 'glute', label: 'Glute', plural: 'Glutes', sides: lateral, surface: 'back', group: 'hips_legs' },
  { id: 'thigh_front', label: 'Front of thigh', plural: 'Fronts of thighs', sides: lateral, surface: 'front', group: 'hips_legs' },
  { id: 'thigh_back', label: 'Back of thigh', plural: 'Backs of thighs', sides: lateral, surface: 'back', group: 'hips_legs' },
  { id: 'knee', label: 'Knee', plural: 'Knees', sides: lateral, surface: 'front', group: 'hips_legs' },
  { id: 'shin', label: 'Shin', plural: 'Shins', sides: lateral, surface: 'front', group: 'hips_legs' },
  { id: 'calf', label: 'Calf', plural: 'Calves', sides: lateral, surface: 'back', group: 'hips_legs' },
  { id: 'foot', label: 'Ankle and foot', plural: 'Ankles and feet', sides: lateral, surface: 'front', group: 'hips_legs' },
]

const regionById = new Map(BODY_REGIONS.map((region) => [region.id, region]))

export function isRegionId(value: unknown): value is RegionId {
  return typeof value === 'string' && regionById.has(value as RegionId)
}

export function getRegion(id: RegionId): BodyRegionDefinition {
  const region = regionById.get(id)
  if (!region) throw new RangeError(`Unknown body region: ${id}`)
  return region
}

/** Where one side of a region is seen from. */
export function surfaceOf(region: RegionId, side: AnatomicalSide): BodySurface {
  const definition = getRegion(region)
  return definition.sideSurface?.[side] ?? definition.surface
}

/** A specific place on one side of the body, e.g. `shoulder:left`. */
export type AreaKey = `${RegionId}:${AnatomicalSide}`

export function areaKey(region: RegionId, side: AnatomicalSide): AreaKey {
  return `${region}:${side}`
}

export function parseAreaKey(key: string): { region: RegionId; side: AnatomicalSide } | null {
  const [region, side] = key.split(':')
  if (!isRegionId(region)) return null
  if (side !== 'left' && side !== 'right' && side !== 'centre') return null
  if (!getRegion(region).sides.includes(side)) return null
  return { region, side }
}

export function areaLabel(region: RegionId, side: AnatomicalSide): string {
  const definition = getRegion(region)
  if (side === 'centre') return definition.label
  const sideWord = side === 'left' ? 'Left' : 'Right'
  if (region === 'neck') return `${sideWord} side of neck`
  if (region === 'lower_back') return `${sideWord} lower back`
  if (region === 'chest') return `${sideWord} chest`
  return `${sideWord} ${definition.label.toLocaleLowerCase()}`
}

export function areaKeyLabel(key: AreaKey): string {
  const parsed = parseAreaKey(key)
  return parsed ? areaLabel(parsed.region, parsed.side) : key
}

/** Sides a region can be recorded on, plus `both` for paired regions. */
export function choosableSides(region: RegionId): ChosenSide[] {
  const sides = getRegion(region).sides
  const hasPair = sides.includes('left') && sides.includes('right')
  return hasPair ? [...sides, 'both'] : [...sides]
}

/** Expands a chosen side to the anatomical sides it records. */
export function expandSide(region: RegionId, side: ChosenSide): AnatomicalSide[] {
  const allowed = getRegion(region).sides
  const sides: AnatomicalSide[] = side === 'both' ? ['left', 'right'] : [side]
  for (const value of sides) {
    if (!allowed.includes(value)) {
      throw new RangeError(`${getRegion(region).label} cannot be recorded on side "${value}".`)
    }
  }
  return sides
}
