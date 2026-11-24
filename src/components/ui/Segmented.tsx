import { clsx } from 'clsx'
import { useId, type ReactNode } from 'react'

/** `unavailable` keeps the option focusable but inert, and gives the reason as its description. */
export type SegmentedOption<T extends string> = { value: T; label: ReactNode; ariaLabel?: string; unavailable?: string | undefined }

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
  const id = useId()
  return (
    <div className={clsx('segmented', className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          aria-label={option.ariaLabel}
          aria-disabled={option.unavailable ? true : undefined}
          aria-describedby={option.unavailable ? `${id}-${option.value}` : undefined}
          onClick={() => {
            if (!option.unavailable) onChange(option.value)
          }}
        >
          {option.label}
        </button>
      ))}
      {options.map((option) =>
        option.unavailable ? (
          <span key={option.value} id={`${id}-${option.value}`} className="visually-hidden">
            {option.unavailable}
          </span>
        ) : null,
      )}
    </div>
  )
}
