import type { InputHTMLAttributes } from 'react'
import { CalendarGlyph } from './Glyphs'
import { CONTROL_HEIGHT } from './controlStyles'

export interface DateFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'size'> {
  /** `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` with `withTime`; '' for none. */
  value: string
  withTime?: boolean
  /** What an empty field says. */
  emptyText?: string
  /** Today, for whether the year is said. */
  now?: Date
}

/** "10 Apr", or "10 Apr 2027" in another year: the app's one way of writing a day. */
export function dayLabel(d: Date, now: Date = new Date()): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
}

/** A field's value as `dayLabel` writes it; with the time, "10 Apr, 19:30". */
export function fieldDayText(value: string, withTime: boolean, now: Date = new Date()): string {
  const d = new Date(withTime ? value : `${value}T00:00`)
  if (Number.isNaN(d.getTime())) return value
  const day = dayLabel(d, now)
  if (!withTime) return day
  return `${day}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

const INDICATOR =
  '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0'

/**
 * A day (or a day and time) drawn as every field is: white, bordered, 36 px (44 px on a phone), a calendar at the
 * right, and the day written the app's way ("10 Apr"). The browser's own picker opens on a click anywhere in it; while
 * it has keyboard focus it shows the browser's own editable text.
 */
export function DateField({ value, withTime = false, emptyText = 'Not set', now, className = '', disabled, ...input }: DateFieldProps) {
  return (
    <span className={`relative block ${className}`}>
      <input
        {...input}
        type={withTime ? 'datetime-local' : 'date'}
        value={value}
        disabled={disabled}
        className={`peer ${CONTROL_HEIGHT} relative w-full cursor-pointer rounded-lg border border-border bg-surface-1 pl-2.5 pr-8 text-small text-transparent focus:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${INDICATOR}`}
      />
      <span aria-hidden className={`pointer-events-none absolute inset-y-0 left-2.5 right-8 flex items-center truncate text-small peer-focus:hidden ${value ? 'text-text-primary' : 'text-text-muted'} ${disabled ? 'opacity-60' : ''}`}>
        {value ? fieldDayText(value, withTime, now) : emptyText}
      </span>
      <CalendarGlyph size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
    </span>
  )
}

export interface TimeFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'size'> {
  /** `HH:mm`, 24-hour; '' for none. */
  value: string
}

/**
 * A time of day drawn as every field is (the `DateField` approach): bordered, 36 px (44 px on a phone), the time
 * written the app's way, 24-hour ("09:00"), with no operating-system clock icon. The browser's own picker opens on a
 * click; while it has keyboard focus it shows the browser's own editable text.
 */
export function TimeField({ value, className = '', disabled, ...input }: TimeFieldProps) {
  return (
    <span className={`relative inline-block w-[5.5rem] max-sm:w-24 ${className}`}>
      <input
        {...input}
        type="time"
        value={value}
        disabled={disabled}
        className={`peer ${CONTROL_HEIGHT} relative w-full cursor-pointer rounded-lg border border-border bg-surface-1 px-2.5 text-small tabular-nums text-transparent focus:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger disabled:cursor-not-allowed disabled:opacity-60 ${INDICATOR}`}
      />
      <span aria-hidden className={`pointer-events-none absolute inset-y-0 left-2.5 right-2.5 flex items-center text-small tabular-nums peer-focus:hidden ${value ? 'text-text-primary' : 'text-text-muted'} ${disabled ? 'opacity-60' : ''}`}>
        {value || '--:--'}
      </span>
    </span>
  )
}
