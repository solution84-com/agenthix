/**
 * Every cap and first value of the light model as the playground tunes them (plan task 5.2): hq's own
 * (`LISTENER_SETTINGS`, held within `LISTENER_SETTING_LIMITS`) and the browser's (`ListenerTiming`), grouped for the
 * Tuning panel. hq's schedule of checks is sent with each answer, and the browser's range for it always takes its
 * longest wait. The backchannel's own rules are tuned beside them (`BackchannelTuning`).
 */
import { LISTENER_SETTINGS, LISTENER_SETTING_LIMITS, listenerSettingsWith, type ListenerSettings } from '../../voice/listener/settings'
import { LISTENER_TIMING, type ListenerTiming } from '../listener/settings'

/** The browser's own numbers: the rest of `ListenerTiming` comes from hq's settings. */
export type OwnTiming = Pick<ListenerTiming, 'quietGainDb' | 'noAnswerMs' | 'finishWaitMs' | 'finishWaitStepMs' | 'finishWaitMostMs' | 'falseFinishMs'>

const OWN_KEYS = ['quietGainDb', 'noAnswerMs', 'finishWaitMs', 'finishWaitStepMs', 'finishWaitMostMs', 'falseFinishMs'] as const

export const OWN_TIMING: OwnTiming = Object.fromEntries(OWN_KEYS.map(k => [k, LISTENER_TIMING[k]])) as OwnTiming

export const OWN_TIMING_LIMITS: Record<keyof OwnTiming, { min: number; max: number; whole: boolean }> = {
  quietGainDb: { min: -24, max: 0, whole: true },
  noAnswerMs: { min: 3_000, max: 60_000, whole: true },
  // The sound model's first mark is 0.5 s: a first wait below it changes nothing. The pause cap bounds them all.
  finishWaitMs: { min: 500, max: 3_000, whole: true },
  finishWaitStepMs: { min: 0, max: 1_500, whole: true },
  finishWaitMostMs: { min: 500, max: 3_000, whole: true },
  falseFinishMs: { min: 200, max: 3_000, whole: true },
}

const holdIn = (v: unknown, { min, max, whole }: { min: number; max: number; whole: boolean }, fallback: number) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  const n = Math.min(max, Math.max(min, v))
  return whole ? Math.round(n) : n
}

export function readOwnTiming(value: unknown): OwnTiming {
  const v = (value ?? {}) as Record<string, unknown>
  return Object.fromEntries(OWN_KEYS.map(k => [k, holdIn(v[k], OWN_TIMING_LIMITS[k], OWN_TIMING[k])])) as OwnTiming
}

/** hq's settings as kept: anything else falls back to the first values, every number within its limits. */
export function readListener(value: unknown): ListenerSettings {
  return listenerSettingsWith(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
}

/** What the browser's listening runtime runs on, from both. */
export function timingOf(listener: ListenerSettings, own: OwnTiming): ListenerTiming {
  return {
    nextCheck: { ...LISTENER_TIMING.nextCheck, maxSecs: Math.max(LISTENER_TIMING.nextCheck.maxSecs, longestWait(listener)) },
    noAnswerMs: own.noAnswerMs,
    quietGainDb: own.quietGainDb,
    finishWaitMs: own.finishWaitMs,
    finishWaitStepMs: own.finishWaitStepMs,
    finishWaitMostMs: own.finishWaitMostMs,
    falseFinishMs: own.falseFinishMs,
  }
}

/** The longest wait hq's schedule may send, in seconds, so the browser's range never cuts it short. */
function longestWait(listener: ListenerSettings): number {
  const { quietFirst, quietSecond, quietThird, workingFirst, workingEvery } = listener.schedule
  const points = [0, quietFirst, quietSecond, quietThird, listener.notYetMaxSilenceMs / 1000].sort((a, b) => a - b)
  return Math.max(workingFirst, workingEvery, ...points.slice(1).map((p, i) => p - points[i]!))
}

export type TuningRow = {
  /** hq's setting by its path (`caps.hold`), or the browser's own (`own.quietGainDb`). */
  path: string
  label: string
  /** Shown in seconds when kept in milliseconds. */
  unit: 's' | 'dB' | 'words' | 'chars' | ''
  step: number
}

export type TuningGroup = { title: string; rows: TuningRow[] }

export const TUNING_GROUPS: TuningGroup[] = [
  { title: 'When it is asked', rows: [
    { path: 'schedule.quietFirst', label: 'Quiet: first check at', unit: 's', step: 0.5 },
    { path: 'schedule.quietSecond', label: 'Quiet: second check at', unit: 's', step: 0.5 },
    { path: 'schedule.quietThird', label: 'Quiet: last check before the limit at', unit: 's', step: 1 },
    { path: 'schedule.workingFirst', label: 'Working: first check at', unit: 's', step: 0.5 },
    { path: 'schedule.workingEvery', label: 'Working: then every', unit: 's', step: 0.5 },
  ] },
  { title: 'When the sound model\'s finish counts', rows: [
    { path: 'own.finishWaitMs', label: 'READY counts after quiet of', unit: 's', step: 0.1 },
    { path: 'own.finishWaitStepMs', label: 'Each false finish this turn adds', unit: 's', step: 0.1 },
    { path: 'own.finishWaitMostMs', label: 'Waiting at most', unit: 's', step: 0.1 },
    { path: 'own.falseFinishMs', label: 'False finish: you go on within', unit: 's', step: 0.1 },
  ] },
  { title: 'Word caps', rows: [
    { path: 'caps.acknowledge', label: 'Acknowledge', unit: 'words', step: 1 },
    { path: 'caps.invite', label: 'Invite', unit: 'words', step: 1 },
    { path: 'caps.close_turn', label: 'Close the turn', unit: 'words', step: 1 },
    { path: 'caps.hold', label: 'Hold', unit: 'words', step: 1 },
    { path: 'caps.answer', label: 'Answer (never said)', unit: 'words', step: 1 },
  ] },
  { title: 'Time limits and the turn', rows: [
    { path: 'soundsFinishedTimeoutMs', label: 'Sounds finished: limit, then fallback', unit: 's', step: 0.1 },
    { path: 'callTimeoutMs', label: 'Any other call: limit', unit: 's', step: 0.1 },
    { path: 'notYetMaxSilenceMs', label: '"Not yet" for at most', unit: 's', step: 5 },
    { path: 'own.noAnswerMs', label: 'No answer at all: plain voice after', unit: 's', step: 1 },
  ] },
  { title: 'What it reads', rows: [
    { path: 'recentExchanges', label: 'Last messages', unit: '', step: 1 },
    { path: 'recentLines', label: 'Its own last lines', unit: '', step: 1 },
    { path: 'maxMessageChars', label: 'Message so far, at most', unit: 'chars', step: 100 },
    { path: 'maxExchangeChars', label: 'Each message, at most', unit: 'chars', step: 50 },
    { path: 'maxRecapChars', label: 'Recap read, at most', unit: 'chars', step: 50 },
    { path: 'recapMaxWords', label: 'Recap written, at most', unit: 'words', step: 5 },
  ] },
  { title: 'Lines', rows: [
    { path: 'own.quietGainDb', label: 'Acknowledge under a reply', unit: 'dB', step: 1 },
  ] },
]

export function limitsOf(path: string): { min: number; max: number } {
  if (path.startsWith('own.')) return OWN_TIMING_LIMITS[path.slice(4) as keyof OwnTiming]
  return LISTENER_SETTING_LIMITS[path]!
}

/** A row's value, as kept (milliseconds for a time). */
export function valueAt(path: string, listener: ListenerSettings, own: OwnTiming): number {
  if (path.startsWith('own.')) return own[path.slice(4) as keyof OwnTiming]
  return path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], listener) as number
}

/** hq's settings with one number changed, held within its limits. */
export function listenerWith(listener: ListenerSettings, path: string, value: number): ListenerSettings {
  const [a, b] = path.split('.')
  const change = b ? { [a!]: { ...(listener as unknown as Record<string, object>)[a!], [b]: value } } : { [a!]: value }
  return listenerSettingsWith(change, listener)
}

/** Whether a row is kept in milliseconds and shown in seconds; hq's schedule is kept in seconds. */
export const inMs = (row: TuningRow) => row.unit === 's' && !row.path.startsWith('schedule.')

export const FIRST_LISTENER: ListenerSettings = listenerSettingsWith({}, LISTENER_SETTINGS)
