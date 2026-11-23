import type { CSSProperties } from 'react'
import { clsx } from 'clsx'
import { painColor } from './pain'

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
