/**
 * The schedule builder's state (spec D22, the Routines design keys 9–12): the preset chosen, each preset's own
 * fields, and the cron rule and timezone they write. Choosing a preset, or typing in one, writes its rule into
 * Advanced; typing a rule that a preset says selects that preset. Pure, so the builder and its tests share it.
 */
import {
  cronOfPreset, describeSchedule, nextCronTimes, parseCron, presetOfCron, presetProblem, routineScheduleProblem,
  type SchedulePreset,
} from '@agenthix/core'

export type PresetKind = SchedulePreset['kind']
type PresetOf<K extends PresetKind> = Extract<SchedulePreset, { kind: K }>
export type Presets = { [K in PresetKind]: PresetOf<K> }

export const PRESET_ORDER: PresetKind[] = ['everyMinutes', 'everyHours', 'daily', 'weekdays', 'weekly', 'monthlyDay', 'monthlyWeekday']

export const DEFAULT_PRESETS: Presets = {
  everyMinutes: { kind: 'everyMinutes', every: 5 },
  everyHours: { kind: 'everyHours', every: 1, minute: 0 },
  daily: { kind: 'daily', times: ['09:00'] },
  weekdays: { kind: 'weekdays', times: ['09:00'] },
  weekly: { kind: 'weekly', days: [1], times: ['09:00'] },
  monthlyDay: { kind: 'monthlyDay', day: 1, times: ['07:00'] },
  monthlyWeekday: { kind: 'monthlyWeekday', which: 'first', weekday: 1, times: ['09:00'] },
}

/** A new routine's schedule: weekdays at 09:00, in the viewer's own timezone. */
export const NEW_ROUTINE_CRON = '0 9 * * 1-5'

export type ScheduleDraft = {
  /** The preset the rule is built with; null when only Advanced can say it. */
  chosen: PresetKind | null
  presets: Presets
  cron: string
  timezone: string
}

export function draftOf(cron: string, timezone: string): ScheduleDraft {
  const preset = presetOfCron(cron)
  return {
    chosen: preset?.kind ?? null,
    presets: preset ? { ...DEFAULT_PRESETS, [preset.kind]: preset } : DEFAULT_PRESETS,
    cron,
    timezone,
  }
}

/** A preset chosen or changed: it is chosen, and its rule (when it can be saved) is written into Advanced. */
export function withPreset(d: ScheduleDraft, preset: SchedulePreset): ScheduleDraft {
  return { ...d, chosen: preset.kind, presets: { ...d.presets, [preset.kind]: preset }, cron: cronOfPreset(preset) ?? d.cron }
}

export const choose = (d: ScheduleDraft, kind: PresetKind): ScheduleDraft => withPreset(d, d.presets[kind])

/** A rule typed under Advanced: the preset that says it is chosen, with its fields filled from the rule. */
export function withCron(d: ScheduleDraft, cron: string): ScheduleDraft {
  const preset = presetOfCron(cron)
  return { ...d, cron, chosen: preset?.kind ?? null, presets: preset ? { ...d.presets, [preset.kind]: preset } : d.presets }
}

export const withTimezone = (d: ScheduleDraft, timezone: string): ScheduleDraft => ({ ...d, timezone })

/** Why it cannot be saved, said on the control that has it: the chosen preset's fields, or the cron rule. */
export function draftProblem(d: ScheduleDraft): { on: 'preset' | 'cron'; text: string } | null {
  if (d.chosen) {
    const p = presetProblem(d.presets[d.chosen])
    if (p) return { on: 'preset', text: `${p}.` }
  }
  const c = routineScheduleProblem(d.cron, d.timezone)
  return c ? { on: 'cron', text: c } : null
}

/** The read-back: the rule in plain words and its next three times; null while it cannot be read. */
export function readBack(d: Pick<ScheduleDraft, 'cron' | 'timezone'>, now: Date): { words: string; next: Date[] } | null {
  const parsed = parseCron(d.cron)
  if (!parsed.ok || routineScheduleProblem(d.cron, d.timezone)) return null
  const words = describeSchedule(d.cron, d.timezone)
  return words ? { words, next: nextCronTimes(parsed.rule, d.timezone, now, 3) } : null
}

/** The viewer's own timezone, a new routine's default. */
export const ownTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/** The timezones offered, the routine's own among them. */
export function timezones(current: string): string[] {
  const all: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC']
  return all.includes(current) ? all : [current, ...all]
}

/** Times a preset with more than one time keeps: one more, an hour after the last. */
export function oneMoreTime(times: string[]): string[] {
  const last = times[times.length - 1] ?? '09:00'
  const hour = (Number(last.slice(0, 2)) + 1) % 24
  return [...times, `${String(hour).padStart(2, '0')}:${last.slice(3)}`]
}
