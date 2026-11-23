import { useId } from 'react'
import { fmtTime } from '@/lib/formatting/time'
import { formatDayKey } from './slots'
import './slot-picker.css'

export type SlotDay = { readonly key: string; readonly starts: readonly string[] }

/** Day chips, then the free start times on the chosen day. Every choice is a pressed-state button. */
export function SlotPicker({
  days,
  dayKey,
  onDay,
  startsAt,
  onStart,
}: {
  days: readonly SlotDay[]
  dayKey: string | null
  onDay: (key: string) => void
  startsAt: string | null
  onStart: (startsAt: string) => void
}) {
  const dayLabel = useId()
  const timeLabel = useId()
  const day = days.find((item) => item.key === dayKey)
  return (
    <div className="slot-picker">
      <div className="slot-picker__block">
        <p className="slot-picker__label" id={dayLabel}>
          Day
        </p>
        <div className="slot-days" role="group" aria-labelledby={dayLabel}>
          {days.map(({ key, starts }) => {
            const long = formatDayKey(key, { weekday: 'long', day: 'numeric', month: 'long' })
            return (
              <button
                key={key}
                type="button"
                className="slot-day"
                aria-pressed={key === dayKey}
                disabled={!starts.length}
                aria-label={`${long}, ${starts.length ? `${starts.length} ${starts.length === 1 ? 'time' : 'times'} free` : 'fully booked'}`}
                onClick={() => onDay(key)}
              >
                <span className="slot-day__weekday">{formatDayKey(key, { weekday: 'short' })}</span>
                <span className="slot-day__date num">{formatDayKey(key, { day: 'numeric' })}</span>
                <span className="slot-day__month">{starts.length ? formatDayKey(key, { month: 'short' }) : 'Full'}</span>
              </button>
            )
          })}
        </div>
      </div>

      {day ? (
        <div className="slot-picker__block">
          <p className="slot-picker__label" id={timeLabel}>
            Start time · {formatDayKey(day.key)}
          </p>
          <div className="slot-times" role="group" aria-labelledby={timeLabel}>
            {day.starts.map((start) => (
              <button
                key={start}
                type="button"
                className="slot-time num"
                aria-pressed={start === startsAt}
                onClick={() => onStart(start)}
              >
                {fmtTime(start)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
