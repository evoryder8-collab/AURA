import { format, formatDistanceToNowStrict } from 'date-fns'
import type { PatternType } from '@/data/demo/model'

export const patternLabel: Record<PatternType, string> = {
  building_baseline: 'Building baseline',
  improving: 'Improving pattern',
  mixed: 'Mixed pattern',
  limited_change: 'Limited change',
  maintenance: 'Maintenance',
  sustained_worsening: 'Sustained worsening',
  medical_review_consideration: 'Medical review consideration',
}

export const formatTime = (value: string) => format(new Date(value), 'HH:mm')
export const formatDay = (value: string | Date) => format(new Date(value), 'EEE, d MMM')
export const formatFullDate = (value: string | Date) => format(new Date(value), 'd MMMM yyyy')
export const timeAgo = (value: string) =>
  formatDistanceToNowStrict(new Date(value), { addSuffix: true })

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
