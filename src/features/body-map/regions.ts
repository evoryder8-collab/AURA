import type { BodySide } from '@/data/demo/model'

export type BodyRegion = {
  id: string
  label: string
  view: 'front' | 'back' | 'both'
  side: BodySide
}

export const bodyRegions: BodyRegion[] = [
  { id: 'head', label: 'Head and neck', view: 'both', side: 'central' },
  { id: 'chest', label: 'Chest', view: 'front', side: 'central' },
  { id: 'abdomen', label: 'Abdomen', view: 'front', side: 'central' },
  { id: 'upper_back', label: 'Upper back', view: 'back', side: 'central' },
  { id: 'lower_back', label: 'Lower back', view: 'back', side: 'central' },
  { id: 'left_shoulder', label: 'Left shoulder', view: 'both', side: 'left' },
  { id: 'right_shoulder', label: 'Right shoulder', view: 'both', side: 'right' },
  { id: 'left_arm', label: 'Left arm', view: 'both', side: 'left' },
  { id: 'right_arm', label: 'Right arm', view: 'both', side: 'right' },
  { id: 'left_hand', label: 'Left hand', view: 'both', side: 'left' },
  { id: 'right_hand', label: 'Right hand', view: 'both', side: 'right' },
  { id: 'left_hip', label: 'Left hip', view: 'both', side: 'left' },
  { id: 'right_hip', label: 'Right hip', view: 'both', side: 'right' },
  { id: 'left_thigh', label: 'Left thigh', view: 'both', side: 'left' },
  { id: 'right_thigh', label: 'Right thigh', view: 'both', side: 'right' },
  { id: 'left_knee', label: 'Left knee', view: 'both', side: 'left' },
  { id: 'right_knee', label: 'Right knee', view: 'both', side: 'right' },
  { id: 'left_lower_leg', label: 'Left lower leg', view: 'both', side: 'left' },
  { id: 'right_lower_leg', label: 'Right lower leg', view: 'both', side: 'right' },
  { id: 'left_foot', label: 'Left foot', view: 'both', side: 'left' },
  { id: 'right_foot', label: 'Right foot', view: 'both', side: 'right' },
]

export const bodyRegionLabel = (id: string) =>
  bodyRegions.find((region) => region.id === id)?.label ?? id.replaceAll('_', ' ')
