/**
 * The agent's memory of a conversation (every screen reviewed, *The agent's
 * memory*). The agent works from its runtime's own copy of the
 * conversation, which the runtime may summarise without our transcript
 * changing, so the figure is always the runtime's, read after each run, and
 * never counted from our transcript.
 *
 * - Claude (Agent SDK): `getContextUsage()` — `totalTokens`, the point it
 *   summarises at (`autoCompactThreshold`, else `maxTokens`) and the model's
 *   window (`rawMaxTokens`); a result's `modelUsage[].contextWindow` when the
 *   call is not answered.
 * - OpenCode: the last step's tokens against the model's `limit.context`, and
 *   the point its overflow check summarises at (`session/overflow.ts`).
 */

export type ContextUse = {
  /** Tokens the runtime's copy of the conversation holds now. */
  tokens: number
  /** Where the runtime summarises on its own, in tokens; null when it did not say, or does not on its own. */
  summarisesAt: number | null
  /** The model's whole window, in tokens. */
  window: number
  /** When it was read, as an ISO string. */
  at: string
}

/**
 * The message a run is dispatched with, hidden, to ask the runtime to
 * summarise its memory now (Summarise now): Claude Code's own `/compact`
 * command, which OpenCode's runtime turns into its session's `summarize` call.
 * A site recognises it only on a hidden message.
 */
export const SUMMARISE_NOW_INPUT = '/compact'

/** How full the memory is, for its colour: the accent under 70%, the warning colour from 70%, the danger colour from 90%. */
export type ContextLevel = 'room' | 'filling' | 'nearly_full'

/** From this share on the conversation shows the "nearly full" notice. */
export const CONTEXT_NEARLY_FULL_PERCENT = 90
const CONTEXT_FILLING_PERCENT = 70

export type ContextShare = {
  /** Share of the window in use, 0–100, rounded. */
  percent: number
  level: ContextLevel
  /** Where the runtime summarises on its own, as a share of the window, rounded; null when unknown. */
  summarisesAtPercent: number | null
}

export function contextShare(use: ContextUse): ContextShare {
  const pct = (n: number) => (use.window > 0 ? Math.min(100, Math.max(0, Math.round((n / use.window) * 100))) : 0)
  const percent = pct(use.tokens)
  const level: ContextLevel =
    percent >= CONTEXT_NEARLY_FULL_PERCENT ? 'nearly_full' : percent >= CONTEXT_FILLING_PERCENT ? 'filling' : 'room'
  return { percent, level, summarisesAtPercent: use.summarisesAt !== null ? pct(use.summarisesAt) : null }
}

/** A stored value read back as a `ContextUse`, or null when it is not one. */
export function parseContextUse(value: unknown): ContextUse | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0
  if (!num(v.tokens) || !num(v.window) || typeof v.at !== 'string') return null
  if (v.summarisesAt != null && !num(v.summarisesAt)) return null
  return { tokens: v.tokens as number, summarisesAt: (v.summarisesAt as number | undefined) ?? null, window: v.window as number, at: v.at }
}
