import { clsx } from 'clsx'
import { useId, type CSSProperties, type KeyboardEvent } from 'react'
import { painColor } from './PainChip'

/**
 * A 0–10 picker built as a radio group: one tap per score, arrow keys to move,
 * and zero is as easy to reach as any other number.
 */
export function ScoreScale({
  label,
  value,
  onChange,
  lowLabel = 'No pain',
  highLabel = 'Worst',
  tone = 'pain',
  className,
}: {
  label: string
  value: number | null
  onChange: (value: number) => void
  lowLabel?: string
  highLabel?: string
  tone?: 'pain' | 'ease'
  className?: string
}) {
  const id = useId()
  const move = (event: KeyboardEvent<HTMLButtonElement>, score: number) => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const next = Math.min(10, Math.max(0, score + delta))
    onChange(next)
    const target = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-score="${next}"]`)
    target?.focus()
  }
  return (
    <div className={clsx('score-scale', `score-scale--${tone}`, className)}>
      <span className="visually-hidden" id={id}>
        {label}
      </span>
      <div className="score-scale__track" role="radiogroup" aria-labelledby={id}>
        {Array.from({ length: 11 }, (_, score) => {
          const checked = value === score
          return (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${score} out of 10`}
              data-score={score}
              tabIndex={checked || (value === null && score === 0) ? 0 : -1}
              className="score-scale__dot"
              style={{ '--dot': tone === 'pain' ? painColor(score) : 'var(--aqua)' } as CSSProperties}
              onClick={() => onChange(score)}
              onKeyDown={(event) => move(event, score)}
            >
              {score}
            </button>
          )
        })}
      </div>
      <div className="score-scale__ends" aria-hidden="true">
        <span>0 · {lowLabel}</span>
        <span>{highLabel} · 10</span>
      </div>
    </div>
  )
}
