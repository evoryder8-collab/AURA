import { Check, RotateCcw } from 'lucide-react'

export function FlowerPicker({
  value,
  onChange,
  label = 'Pain intensity',
}: {
  value: number
  onChange: (value: number) => void
  label?: string
}) {
  return (
    <fieldset className="flower-picker">
      <legend>{label}</legend>
      <p>Choose the number that best matches this moment.</p>
      <div className="flower-picker__grid">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((number) => (
          <button
            key={number}
            type="button"
            className={`flower${value === number ? ' is-selected' : ''}`}
            aria-label={`${label}: ${number} out of 10`}
            aria-pressed={value === number}
            onClick={() => onChange(number)}
          >
            <span className="flower__petals" aria-hidden="true">
              ✣
            </span>
            <span className="flower__number">{number}</span>
            {value === number && <Check className="flower__check" size={13} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`resolved-control${value === 0 ? ' is-selected' : ''}`}
        onClick={() => onChange(0)}
        aria-pressed={value === 0}
      >
        <RotateCcw size={16} /> Zero · resolved today
      </button>
    </fieldset>
  )
}
