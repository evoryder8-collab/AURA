import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export type SegmentedOption<T extends string> = { value: T; label: ReactNode; ariaLabel?: string }

/** A single-choice group of buttons; each option is a real button with a pressed state. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={clsx('segmented', className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          aria-label={option.ariaLabel}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
