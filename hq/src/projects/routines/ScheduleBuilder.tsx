import type { ReactNode } from 'react'
import { NativeSelect, ROW_CHOSEN, ROW_ITEM } from '@agenthix/ui/primitives'
import { FIELD, FIELD_BAD } from './routineStyles'
import { FLOOR_HELP, PresetFields, presetLabel } from './PresetFields'
import { whenWords } from './routineWords'
import {
  PRESET_ORDER, choose, draftProblem, readBack, timezones, withCron, withPreset, withTimezone, type ScheduleDraft,
} from './scheduleDraft'

/** The schedule read back in plain words with its next three times; always shown, so a rule can be checked first. */
export function ReadBack({ draft, now }: { draft: Pick<ScheduleDraft, 'cron' | 'timezone'>; now: Date }) {
  const back = readBack(draft, now)
  return (
    <div role="status" className="rounded-lg bg-surface-2 px-3 py-2 text-small text-text-secondary">
      {back ? (
        <>
          <b className="block font-medium text-text-primary">{back.words}</b>
          Next: {back.next.map(at => whenWords(at, now, { timeZone: draft.timezone, withDate: true })).join(' · ') || 'none'}
        </>
      ) : 'The schedule cannot be read yet: fix what is said above.'}
    </div>
  )
}

/**
 * The schedule builder (spec D22; the Routines design keys 9–12, 14): presets in words, each with its fields; Advanced,
 * a cron rule for anything the presets cannot say; the timezone; and the read-back. The whole row picks its preset. A
 * rule more often than every 5 minutes is refused on the control that says it, with why.
 */
export function ScheduleBuilder({ draft, onChange, now, was, footer }: {
  draft: ScheduleDraft
  onChange: (d: ScheduleDraft) => void
  now: Date
  /** The schedule before this change, struck through beside the label while it differs. */
  was?: string | null
  footer?: ReactNode
}) {
  const problem = draftProblem(draft)
  return (
    <div className="flex flex-col gap-2">
      {was && <p className="text-micro text-text-muted">was <s>{was}</s></p>}
      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div role="radiogroup" aria-label="Repeats" className="flex flex-col gap-1">
          {PRESET_ORDER.map(kind => {
            const on = draft.chosen === kind
            const bad = on && problem?.on === 'preset'
            return (
              <div
                key={kind} onClick={() => { if (!on) onChange(choose(draft, kind)) }}
                className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 max-sm:py-1.5 ${on ? ROW_CHOSEN : ROW_ITEM}`}
              >
                <input
                  type="radio" name="repeats" checked={on} aria-label={presetLabel(kind)} onChange={() => onChange(choose(draft, kind))}
                  className="mt-2.5 size-4 shrink-0 cursor-pointer accent-accent max-sm:mt-3.5"
                />
                <div className={`flex min-w-0 flex-wrap items-center gap-2 text-small ${on ? 'text-text-secondary' : 'text-text-muted'}`}>
                  <PresetFields preset={draft.presets[kind]} bad={bad} onChange={p => onChange(withPreset(draft, p))} />
                  {kind === 'everyMinutes' && (
                    <span className={`basis-full text-micro ${bad ? 'text-danger' : 'text-text-muted'}`}>{bad ? problem.text : FLOOR_HELP}</span>
                  )}
                  {bad && kind !== 'everyMinutes' && <span className="basis-full text-micro text-danger">{problem.text}</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-small text-text-secondary">Advanced: cron expression</span>
            <input
              aria-label="Advanced: cron expression" value={draft.cron} spellCheck={false} aria-invalid={problem?.on === 'cron' || undefined}
              onChange={e => onChange(withCron(draft, e.target.value))}
              className={`${FIELD} w-full font-mono ${problem?.on === 'cron' ? FIELD_BAD : ''}`}
            />
            <span className={`text-micro ${problem?.on === 'cron' ? 'text-danger' : 'text-text-muted'}`}>
              {problem?.on === 'cron' ? problem.text : 'Five fields: minute, hour, day of month, month, day of week. Picking a preset fills it in.'}
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-small text-text-secondary">Timezone</span>
            <NativeSelect aria-label="Timezone" value={draft.timezone} onChange={e => onChange(withTimezone(draft, e.target.value))}>
              {timezones(draft.timezone).map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </NativeSelect>
          </label>
          <ReadBack draft={draft} now={now} />
        </div>
      </div>
      {footer && <div className="flex justify-end gap-2 border-t border-border-subtle pt-2">{footer}</div>}
    </div>
  )
}
