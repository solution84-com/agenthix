/**
 * When a routine's rounds come (spec §3): every N minutes, hours or days, or at
 * a time of day on chosen weekdays, from a starting time. Times are entered in
 * the viewer's own timezone, which is stored with the routine so a round stays
 * on the wall clock it was set on.
 */

export type ScheduleRuleInput =
  | { kind: 'interval'; every: number; unit: 'minutes' | 'hours' | 'days' }
  | { kind: 'weekly'; time: string; weekdays: number[] }

export interface RoutineScheduleValue {
  rule: ScheduleRuleInput
  /** `datetime-local` value, or '' for now. */
  at: string
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const FIELD_INPUT =
  'bg-surface-2 border border-border rounded-lg px-2 py-1 text-body text-text-primary focus:outline-none focus:border-accent'

export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function describeRule(rule: ScheduleRuleInput | null | undefined): string {
  if (!rule) return ''
  if (rule.kind === 'interval') return `every ${rule.every} ${rule.every === 1 ? rule.unit.replace(/s$/, '') : rule.unit}`
  return `at ${rule.time} on ${rule.weekdays.slice().sort().map(d => DAYS[d]).join(', ')}`
}

export function formatWhen(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

export const DEFAULT_ROUTINE_SCHEDULE: RoutineScheduleValue = { rule: { kind: 'interval', every: 1, unit: 'days' }, at: '' }

export interface RoutineRuleFieldsProps {
  value: RoutineScheduleValue
  onChange: (value: RoutineScheduleValue) => void
}

export function RoutineRuleFields({ value, onChange }: RoutineRuleFieldsProps) {
  const { rule, at } = value
  const interval = rule.kind === 'interval' ? rule : { kind: 'interval' as const, every: 1, unit: 'days' as const }
  const weekly = rule.kind === 'weekly' ? rule : { kind: 'weekly' as const, time: '09:00', weekdays: [1, 2, 3, 4, 5] }
  const set = (r: ScheduleRuleInput) => onChange({ rule: r, at })

  return (
    <div className="space-y-2 text-small text-text-secondary">
      <div className="flex gap-1">
        {(['interval', 'weekly'] as const).map(kind => (
          <button
            key={kind}
            type="button"
            onClick={() => set(kind === 'interval' ? interval : weekly)}
            className={`px-2 py-1 rounded-lg ${rule.kind === kind ? 'bg-accent-subtle text-accent' : 'bg-surface-2 text-text-secondary hover:text-text-primary'}`}
          >
            {kind === 'interval' ? 'Every…' : 'On weekdays'}
          </button>
        ))}
      </div>
      {rule.kind === 'interval' && (
        <div className="flex items-center gap-2">
          Every
          <input
            type="number" min={1} value={interval.every}
            onChange={e => set({ ...interval, every: Number(e.target.value) })}
            className={`${FIELD_INPUT} w-20`}
          />
          <select value={interval.unit} onChange={e => set({ ...interval, unit: e.target.value as typeof interval.unit })} className={FIELD_INPUT}>
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
          <span className="text-text-muted">at least 5 minutes</span>
        </div>
      )}
      {rule.kind === 'weekly' && (
        <div className="space-y-1">
          <label className="flex items-center gap-2">
            At <input type="time" value={weekly.time} onChange={e => set({ ...weekly, time: e.target.value })} className={FIELD_INPUT} />
          </label>
          <div className="flex gap-1">
            {DAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => set({ ...weekly, weekdays: weekly.weekdays.includes(i) ? weekly.weekdays.filter(x => x !== i) : [...weekly.weekdays, i] })}
                className={`px-2 py-1 rounded-lg ${weekly.weekdays.includes(i) ? 'bg-accent-subtle text-accent' : 'bg-surface-2 text-text-muted'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="flex items-center gap-2">
        Starting
        <input type="datetime-local" value={at} onChange={e => onChange({ rule, at: e.target.value })} className={FIELD_INPUT} />
        {!at && <span className="text-text-muted">now</span>}
      </label>
      <div className="text-text-muted">Times are in {localTimezone()}.</div>
    </div>
  )
}

/** The schedule as the server takes it. */
export function scheduleInputOf(value: RoutineScheduleValue): { rule: ScheduleRuleInput; at: string | null; timezone: string } {
  return { rule: value.rule, at: value.at ? new Date(value.at).toISOString() : null, timezone: localTimezone() }
}
