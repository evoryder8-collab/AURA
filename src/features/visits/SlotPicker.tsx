import { useId, useState } from 'react'
import { Field, Input } from '@/components/design-system/FormField'
import { fmtTime } from '@/lib/formatting/time'
import { clockTime, formatDayKey, OPENING_MINUTES } from './slots'
import './slot-picker.css'

export type SlotDay = { readonly key: string; readonly starts: readonly string[] }

/**
 * Day chips, then the free start times on the chosen day. Every choice is a pressed-state button.
 * With `custom`, a last "Custom" chip opens a time field for any minute (10:15, 11:25); the caller checks it.
 * The field stays open until a grid time is chosen, so a picked custom time is never hidden.
 */
export function SlotPicker({
  days,
  dayKey,
  onDay,
  startsAt,
  onStart,
  custom,
}: {
  days: readonly SlotDay[]
  dayKey: string | null
  onDay: (key: string) => void
  startsAt: string | null
  onStart: (startsAt: string) => void
  custom?: { latest: string; onPick: (time: string, dayKey: string) => void }
}) {
  const dayLabel = useId()
  const timeLabel = useId()
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const day = days.find((item) => item.key === dayKey)
  const earliest = clockTime(OPENING_MINUTES)
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
                onClick={() => {
                  setCustomValue('')
                  onDay(key)
                }}
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
                onClick={() => {
                  setCustomOpen(false)
                  setCustomValue('')
                  onStart(start)
                }}
              >
                {fmtTime(start)}
              </button>
            ))}
            {custom ? (
              <button type="button" className="slot-time slot-time--custom" aria-expanded={customOpen} onClick={() => setCustomOpen(true)}>
                Custom
              </button>
            ) : null}
          </div>
          {custom && customOpen ? (
            <div className="slot-custom">
              <Field label="Custom start time" hint={`Any minute from ${earliest} to ${custom.latest}`}>
                <Input
                  type="time"
                  className="input slot-custom__input num"
                  min={earliest}
                  max={custom.latest}
                  value={customValue}
                  onChange={(event) => {
                    setCustomValue(event.target.value)
                    if (event.target.value) custom.onPick(event.target.value, day.key)
                  }}
                />
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
