/**
 * Every cap and first value of the light model (adaptive voice listening, spec §The light model, §When a turn ends and
 * §The recap), in one object: the voice playground changes any of them while the owner tries it
 * (`listenerSettingsWith`, within `LISTENER_SETTING_LIMITS`), and hq runs the first values.
 */
export const LISTENER_SETTINGS = {
  /**
   * How it answers: one JSON object, or one of five tool calls. JSON is the safe default phase 1's measurements took: on
   * DeepSeek Flash it was as safe as tools, used about 1,100 fewer input tokens and was 0.2 s quicker a call.
   */
  format: 'json' as 'json' | 'tools',
  /** Whether `hand_over` carries `answer`: kept, as the spec says, though phase 1 measured no benefit from it. */
  withAnswer: true as boolean,
  /**
   * Whether each call also gives a short reason, written first (`why`). Playground only, for debugging the instructions:
   * the reason travels to the playground's own socket like `answer`, and hq's own settings keep it off.
   */
  withReason: false as boolean,
  /**
   * Most words each spoken tool may say; over the cap the whole line is dropped, never cut. `answer` is never spoken, so
   * over its cap it is kept, cut to the cap.
   */
  caps: { acknowledge: 6, invite: 6, close_turn: 6, hold: 12, answer: 15 },
  /**
   * When hq asks the light model again, in seconds: hq decides when, the light model only what. A turn kept open (a
   * "not yet") at these seconds of quiet, then at the "not yet"
   * limit; while the heavy model works, at `workingFirst` and then every `workingEvery` until the reply is here.
   */
  schedule: { quietFirst: 5, quietSecond: 15, quietThird: 30, workingFirst: 4, workingEvery: 8 },
  /** How many of the last messages it reads, word for word. */
  recentExchanges: 6,
  /** How many of its own last spoken lines, across turns, it reads. */
  recentLines: 5,
  /** A *sounds finished* call with no usable answer by then falls back to the heavy model. */
  soundsFinishedTimeoutMs: 2000,
  /** The longest the light model may keep a turn open after it sounds finished. */
  notYetMaxSilenceMs: 60_000,
  /** A time limit on every call. */
  callTimeoutMs: 2000,
  /** Input size caps: the message so far keeps its end, each earlier message its start. */
  maxMessageChars: 2400,
  maxExchangeChars: 600,
  maxRecapChars: 900,
  /** The recap's most words; a longer one is cut at a sentence, else a word. */
  recapMaxWords: 100,
} as const

type Widen<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends string | boolean ? T[K] : Widen<T[K]> }
export type ListenerSettings = Widen<typeof LISTENER_SETTINGS>

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }
export type ListenerSettingsChange = DeepPartial<ListenerSettings>

/** The range the playground offers each number in, by its path; `whole` numbers are rounded. */
export const LISTENER_SETTING_LIMITS: Record<string, { min: number; max: number; whole: boolean }> = {
  'caps.acknowledge': { min: 1, max: 12, whole: true },
  'caps.invite': { min: 1, max: 12, whole: true },
  'caps.close_turn': { min: 1, max: 12, whole: true },
  'caps.hold': { min: 4, max: 24, whole: true },
  'caps.answer': { min: 5, max: 60, whole: true },
  'schedule.quietFirst': { min: 1, max: 60, whole: false },
  'schedule.quietSecond': { min: 1, max: 120, whole: false },
  'schedule.quietThird': { min: 1, max: 240, whole: false },
  'schedule.workingFirst': { min: 1, max: 30, whole: false },
  'schedule.workingEvery': { min: 1, max: 60, whole: false },
  recentExchanges: { min: 0, max: 20, whole: true },
  recentLines: { min: 0, max: 20, whole: true },
  soundsFinishedTimeoutMs: { min: 500, max: 10_000, whole: true },
  notYetMaxSilenceMs: { min: 5000, max: 300_000, whole: true },
  callTimeoutMs: { min: 500, max: 10_000, whole: true },
  maxMessageChars: { min: 200, max: 10_000, whole: true },
  maxExchangeChars: { min: 50, max: 4000, whole: true },
  maxRecapChars: { min: 100, max: 4000, whole: true },
  recapMaxWords: { min: 20, max: 300, whole: true },
}

function held(path: string, value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const { min, max, whole } = LISTENER_SETTING_LIMITS[path]
  const n = Math.min(max, Math.max(min, value))
  return whole ? Math.round(n) : n
}

function merged(base: Record<string, unknown>, change: Record<string, unknown> | undefined, at: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(base)) {
    const path = at ? `${at}.${key}` : key
    const next = change?.[key]
    if (typeof value === 'number') out[key] = held(path, next, value)
    else if (value && typeof value === 'object') out[key] = merged(value as Record<string, unknown>, next as Record<string, unknown> | undefined, path)
    else out[key] = typeof next === typeof value ? next : value
  }
  return out
}

/** The first values with a change applied: every number within its limits, the quiet's checks in order. */
export function listenerSettingsWith(change: ListenerSettingsChange, base: ListenerSettings = LISTENER_SETTINGS): ListenerSettings {
  const s = merged(base as unknown as Record<string, unknown>, change as Record<string, unknown>, '') as unknown as ListenerSettings
  const [quietFirst, quietSecond, quietThird] = [s.schedule.quietFirst, s.schedule.quietSecond, s.schedule.quietThird].sort((a, b) => a - b)
  s.schedule = { ...s.schedule, quietFirst: quietFirst!, quietSecond: quietSecond!, quietThird: quietThird! }
  return s
}
