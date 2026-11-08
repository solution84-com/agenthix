import { Plus, X } from 'lucide-react'
import { NativeSelect, Tooltip } from '@agenthix/ui/primitives'
import type { SchedulePreset } from '@agenthix/core'
import { FIELD, FIELD_BAD, ICON_BUTTON, LINK_BUTTON } from './routineStyles'
import { oneMoreTime, type PresetKind } from './scheduleDraft'

const DAY_LETTERS = [['M', 'Monday', 1], ['T', 'Tuesday', 2], ['W', 'Wednesday', 3], ['T', 'Thursday', 4], ['F', 'Friday', 5], ['S', 'Saturday', 6], ['S', 'Sunday', 0]] as const
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function NumberField({ label, value, bad, onChange }: { label: string; value: number; bad: boolean; onChange: (n: number) => void }) {
  return (
    <input
      type="number" inputMode="numeric" aria-label={label} value={Number.isFinite(value) ? value : ''} aria-invalid={bad || undefined}
      onChange={e => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      className={`${FIELD} w-16 text-center ${bad ? FIELD_BAD : ''}`}
    />
  )
}

/** The times of a preset; daily and weekdays take more than one ("+ time"), which share their minutes. */
function TimesField({ times, more, bad, onChange }: { times: string[]; more: boolean; bad: boolean; onChange: (t: string[]) => void }) {
  return (
    <>
      {times.map((t, i) => (
        <span key={i} className="inline-flex items-center">
          <input
            type="time" aria-label={times.length > 1 ? `Time ${i + 1}` : 'Time'} value={t} aria-invalid={bad || undefined}
            onChange={e => onChange(times.map((x, j) => (j === i ? e.target.value : x)))}
            className={`${FIELD} w-[6.5rem] ${bad ? FIELD_BAD : ''}`}
          />
          {i > 0 && (
            <Tooltip label={`Remove ${t}`}>
              <button type="button" aria-label={`Remove ${t}`} className={ICON_BUTTON} onClick={() => onChange(times.filter((_, j) => j !== i))}>
                <X size={14} aria-hidden />
              </button>
            </Tooltip>
          )}
        </span>
      ))}
      {more && <button type="button" className={LINK_BUTTON} onClick={() => onChange(oneMoreTime(times))}><Plus size={14} aria-hidden />time</button>}
    </>
  )
}

function DayChips({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
  return (
    <span role="group" aria-label="Days of the week" className="inline-flex gap-1">
      {DAY_LETTERS.map(([letter, name, d]) => {
        const on = days.includes(d)
        return (
          <button
            key={name} type="button" aria-pressed={on} aria-label={name} title={name}
            onClick={() => onChange(on ? days.filter(x => x !== d) : [...days, d])}
            className={`inline-flex size-9 items-center justify-center rounded-lg border text-small max-sm:size-11 ${on ? 'border-transparent bg-selected font-semibold text-accent' : 'border-border bg-surface-1 text-text-secondary hover:bg-surface-hover'}`}
          >
            {letter}
          </button>
        )
      })}
    </span>
  )
}

/** The words and fields of one preset, as its row in the builder reads: "Weekly on M T W … at 09:00". */
export function PresetFields({ preset, bad, onChange }: { preset: SchedulePreset; bad: boolean; onChange: (p: SchedulePreset) => void }) {
  switch (preset.kind) {
    case 'everyMinutes':
      return <>Every <NumberField label="Minutes" value={preset.every} bad={bad} onChange={every => onChange({ ...preset, every })} /> minutes</>
    case 'everyHours':
      return <>Every <NumberField label="Hours" value={preset.every} bad={bad} onChange={every => onChange({ ...preset, every })} /> hours</>
    case 'daily':
    case 'weekdays':
      return <>{preset.kind === 'daily' ? 'Daily at' : 'Weekdays at'} <TimesField times={preset.times} more bad={bad} onChange={times => onChange({ ...preset, times })} /></>
    case 'weekly':
      return <>Weekly on <DayChips days={preset.days} onChange={days => onChange({ ...preset, days })} /> at <TimesField times={preset.times} more={false} bad={bad} onChange={times => onChange({ ...preset, times })} /></>
    case 'monthlyDay':
      return <>Monthly on day <NumberField label="Day of the month" value={preset.day} bad={bad} onChange={day => onChange({ ...preset, day })} /> at <TimesField times={preset.times} more={false} bad={bad} onChange={times => onChange({ ...preset, times })} /></>
    case 'monthlyWeekday':
      return (
        <>
          Monthly on the
          <NativeSelect size="sm" aria-label="First or last" className="w-24" value={preset.which} onChange={e => onChange({ ...preset, which: e.target.value as 'first' | 'last' })}>
            <option value="first">first</option><option value="last">last</option>
          </NativeSelect>
          <NativeSelect size="sm" aria-label="Day of the week" className="w-32" value={preset.weekday} onChange={e => onChange({ ...preset, weekday: Number(e.target.value) })}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </NativeSelect>
          at <TimesField times={preset.times} more={false} bad={bad} onChange={times => onChange({ ...preset, times })} />
        </>
      )
  }
}

/** Under Every N minutes, always: the floor, said on the control (a refusal known in advance). */
export const FLOOR_HELP = "At least 5: more often than every 5 minutes isn't allowed."

export const presetLabel = (kind: PresetKind): string => ({
  everyMinutes: 'Every N minutes', everyHours: 'Every N hours', daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly',
  monthlyDay: 'Monthly on a day', monthlyWeekday: 'Monthly on the first or last weekday',
})[kind]
