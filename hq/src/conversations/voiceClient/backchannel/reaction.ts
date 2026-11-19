/**
 * Reaction hums (adaptive voice listening, spec §Hum timing: the *react* and *laugh* classes): a hum that answers what just happened in the
 * telling ("Aw.", "Oh!", a laugh), not one that only says "go on". It belongs to its moment, so:
 *
 * - it needs only `reactionSpeechMs` of the person's speech since the agent's last sound, not `speechMs`; and
 * - once the hum service answers one, it stays held for `reactionHoldMs` or until it plays: a later answer of a plain
 *   kind, or `none`, does not replace it, while a later reaction does. The latest answer is still kept beside it, and
 *   takes over once the reaction has played or its hold has run out. One exception: a `none` that comes after the
 *   pause began, about the words that pause follows, wins for that pause (the trigger's `kindNow`). The service does
 *   not say why it said none; at a pause it means a question to the listener or a plainly cut-off end.
 *
 * - **A read of a reaction is used once.** Once it comes due, played or not, it is spent: it never plays at a later
 *   breath, out of its moment (`spentReaction`).
 * - **Never two in a row** without a listen-class hum, or `reactionGapSpeechMs` of the person's speech, between them
 *   (`reactionTooSoon`), counted from the reaction that played.
 *
 * Realisation ("Ah, I see") is not one: it says the agent now understands, a receipt, not a reaction to the news.
 */
import type { VoiceHumKind } from '@agenthix/core'
import type { HumKind } from './kinds'
import { timingClassOf } from './kinds'

/** A kind of the *react* or *laugh* timing class (`./kinds`). */
export const isReaction = (kind: VoiceHumKind) => { const c = timingClassOf(kind); return c === 'react' || c === 'laugh' }

/** A reaction answer kept until `until`, beside the latest answer. */
export type KeptReaction<H> = { held: H; until: number }

/** After an answer: a reaction starts a hold of its own (none with a hold of 0); any other answer leaves the kept one. */
export function keepReaction<H extends { humKind: VoiceHumKind; fallback?: string }>(
  kept: KeptReaction<H> | null, answer: H, t: number, holdMs: number,
): KeptReaction<H> | null {
  if (answer.fallback || !isReaction(answer.humKind)) return kept
  return holdMs > 0 ? { held: answer, until: t + holdMs } : null
}

/** The kept reaction, while its hold lasts. */
export const liveReaction = <H>(kept: KeptReaction<H> | null, t: number): H | null => (kept && t < kept.until ? kept.held : null)

/** The person's speech since the last reaction played, after a sound of `kind` played: 0 after a reaction, none after any other. */
export const afterSound = (kind: HumKind): number | null => (isReaction(kind) ? 0 : null)

/** Why a reaction may not play yet, as the second in a row; null when it may. */
export function reactionTooSoon(sinceReactionMs: number | null, gapMs: number): string | null {
  if (sinceReactionMs === null || sinceReactionMs >= gapMs) return null
  const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`
  return `a reaction played ${secs(sinceReactionMs)} of speech ago (a second needs a listening hum or ${secs(gapMs)} between)`
}

/** A read of a reaction that already came due: spent, so it never plays at a later breath. */
export const spentReaction = (read: { call: number; humKind: VoiceHumKind }, spent: number | null): boolean =>
  isReaction(read.humKind) && read.call === spent
