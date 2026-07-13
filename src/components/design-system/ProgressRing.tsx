export function ProgressRing({
  value,
  label,
  size = 120,
}: {
  value: number
  label: string
  size?: number
}) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="progress-ring__track" cx="50" cy="50" r={radius} />
        <circle
          className="progress-ring__value"
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (clamped / 100) * circumference}
        />
      </svg>
      <span className="progress-ring__number">{Math.round(value)}</span>
      <span className="sr-only">
        {label}: {Math.round(value)} out of 100
      </span>
    </div>
  )
}
