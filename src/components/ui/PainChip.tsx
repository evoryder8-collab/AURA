import type { CSSProperties } from 'react'
import { clsx } from 'clsx'

export function painColor(score: number) {
  if (score <= 0) return 'var(--pain-0)'
  if (score <= 3) return 'var(--pain-low)'
  if (score <= 6) return 'var(--pain-mid)'
  if (score <= 8) return 'var(--pain-high)'
  return 'var(--pain-max)'
}

export const painWord = (score: number) =>
  score <= 0 ? 'No pain' : score <= 3 ? 'Mild' : score <= 6 ? 'Moderate' : score <= 8 ? 'Strong' : 'Severe'

/** A pain score with its scale, readable without colour. */
export function PainChip({ score, className, large = false }: { score: number; className?: string; large?: boolean }) {
  return (
    <span
      className={clsx('pain-chip', large && 'pain-chip--large', className)}
      style={{ '--chip': painColor(score) } as CSSProperties}
      aria-label={`${score} out of 10`}
    >
      {score}
      <small aria-hidden="true">/10</small>
    </span>
  )
}
