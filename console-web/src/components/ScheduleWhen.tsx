import { FormField, Input } from '@agenthix/ui/primitives'
import { later, type WhenChoice } from './scheduleChoice'

/** What members see of work at a time, in one line, unless the form says it otherwise. */
export const LATER_HINT = 'Members whose work it affects see a notice from now; a few minutes before, runs pause after their step. ' +
  'At 02:00, the nightly backup’s time, an upgrade, move or erase waits for that backup to finish first.'

const Part = ({ name, checked, onChoose, children }: { name: string; checked: boolean; onChoose: () => void; children: string }) => (
  <label className={`flex-1 cursor-pointer px-3 py-1.5 text-center text-small has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent ${checked ? 'bg-selected font-semibold text-text-primary' : 'text-text-secondary hover:bg-surface-hover'}`}>
    <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChoose} />
    {children}
  </label>
)

/**
 * *When* — now, or at a time (board *Changes flow*, proposal; spec §14): a switch of two, then one line saying what
 * happens and what members see. Work at a time is held by the host service of the machine it affects, and HQ tells
 * the members whose work it affects from then.
 */
export function ScheduleWhen({ value, onChange, error, disabled = false, idPrefix = 'when', nowHint, laterHint = LATER_HINT }: {
  value: WhenChoice
  onChange: (value: WhenChoice) => void
  error?: string
  disabled?: boolean
  idPrefix?: string
  /** What *Now* does for this work, in one line. */
  nowHint?: string
  /** What *At a time…* means for members; null when the form says it itself. */
  laterHint?: string | null
}) {
  const choose = (mode: WhenChoice['mode']) => {
    if (mode === value.mode) return
    onChange(mode === 'now' ? { mode: 'now', at: value.at } : value.at ? { mode: 'later', at: value.at } : later(new Date()))
  }
  const hint = value.mode === 'now' ? nowHint ?? 'It starts as soon as you confirm.' : laterHint
  return (
    <fieldset className="mb-3" disabled={disabled}>
      <legend className="mb-1.5 text-small font-semibold text-text-primary">When</legend>
      <div className="flex max-w-xs overflow-hidden rounded-lg border border-border bg-card">
        <Part name={`${idPrefix}-mode`} checked={value.mode === 'now'} onChoose={() => choose('now')}>Now</Part>
        <span aria-hidden className="w-px bg-border" />
        <Part name={`${idPrefix}-mode`} checked={value.mode === 'later'} onChoose={() => choose('later')}>At a time…</Part>
      </div>
      {value.mode === 'later' && (
        <div className="mt-3 max-w-xs">
          <FormField label="Date and time" htmlFor={`${idPrefix}-at`} error={error} hint="In your browser's time.">
            <Input id={`${idPrefix}-at`} type="datetime-local" value={value.at} onChange={e => onChange({ mode: 'later', at: e.target.value })} />
          </FormField>
        </div>
      )}
      {hint && <p className="mt-2 text-small text-text-muted">{hint}</p>}
    </fieldset>
  )
}
