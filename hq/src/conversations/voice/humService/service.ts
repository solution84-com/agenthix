/**
 * The listening read in hq (adaptive voice listening, spec §The listening read): a question from the page about once a
 * second while the person speaks, answered by its `seq` with the kind and tone that fit; never words, which the page
 * picks from the hum library. One call at a time for a voice session: a question while one is in flight is dropped
 * unanswered, as the page skips that second. Each call has a time limit; a call that runs out of time, fails, is
 * unreadable, or has no read to ask is answered with no kind and why, and the page keeps the read before it. Its cost
 * is written by the model adapter under `backchannel`.
 *
 * The hum library's sounds (spec §The sound keeper): the page asks for a kind in a tone; hq sends each of the kind's
 * words already made for this voice that it has not sent this voice session (no speech call), and makes one not made
 * yet, so the set fills; asked to warm (`warm`, as voice starts), it makes every one. Only the library's words are
 * ever spoken, never words from the page or a model, and only where the listening read itself would answer. A sound
 * that could not be made is said once.
 *
 * Tone (spec §Tone): with it off, every read's tone is calm, and no voice hint is sent; with it on, the voice hint goes
 * with the question. The laugh is the backchannel's, Tone or not.
 */
import type { VoiceBackchannelKindEvent, VoiceBackchannelSoundEvent } from '@agenthix/core'
import type { ModelAdapter, ResolvedAccess, TurnUsage } from '../../contract'
import { LAUGH_WORDS, isHumKind, isHumTone, soundKey, type HumKind, type HumTone } from '../../voiceClient/backchannel/kinds'
import { HUM_LIBRARY, takesTone, toneFor } from '../../voiceClient/backchannel/library'
import type { StoredSound } from './store'
import { HUM_INSTRUCTIONS, readMessage } from './instructions'
import { parseHum, type HumAnswer } from './parse'

export type HumSession = { conversationId: string; holderId: string }

/** A question from the page; `atPause`: asked as a pause begins; `recent`: its last three sounds' words. */
export type HumQuestion = { seq: number; text: string; atPause?: true; recent?: string[] }

/** A sound to speak: one of the kind's words in a tone. */
export type HumSound = { kind: HumKind; tone: HumTone; words: string }

/** The page asks for a kind's sounds in a tone; `warm`: make every one not made yet. */
export type SoundRequest = { kind: HumKind; tone: HumTone; warm?: true }

export interface HumServiceDeps {
  /** Adaptive voice listening is on for this holder. */
  enabled(holderId: string): Promise<boolean>
  /** The listening read's model, costed; null when none is reached. */
  access(session: HumSession): Promise<ResolvedAccess | null>
  model: Pick<ModelAdapter, 'complete'>
  send(session: HumSession, event: VoiceBackchannelKindEvent): void
  /** Whether the sound is made for this session's voice already: sending it costs no speech call. */
  made(session: HumSession, sound: HumSound): Promise<boolean>
  /** The sound's audio in the agent's voice, with its tone's steering, kept or made now; null when it cannot be made. */
  speak(session: HumSession, sound: HumSound): Promise<StoredSound | null>
  sendSound(session: HumSession, event: VoiceBackchannelSoundEvent): void
  /** Tone for this session: off, every read is calm; its hint, hq's words for how they sound. On with no hint when absent. */
  tone?(session: HumSession): { on: boolean; hint: string | null }
  now(): number
  timeoutMs: number
}

/** The line and room for a stray word: the spike's answers took up to about twenty tokens. */
const MAX_OUTPUT_TOKENS = 30

export const LAUGH: HumSound = { kind: 'amusement', tone: 'bright', words: LAUGH_WORDS }

/** A request the library can answer: a kind and a tone it takes. */
export const soundRequestOf = (kind: unknown, tone: unknown, warm: unknown): SoundRequest | null =>
  isHumKind(kind) && isHumTone(tone) && takesTone(kind, tone) ? { kind, tone, ...(warm === true && { warm: true as const }) } : null

export type HumAsked =
  | { answer: HumAnswer; ms: number; usage: TurnUsage; raw: string }
  | { failed: 'timeout' | 'failed'; ms: number; usage?: TurnUsage; raw?: string }

/** One call of the listening read on `access`: the turn's last words, its last sounds, the short instruction; one line back. */
export async function askHum(
  model: Pick<ModelAdapter, 'complete'>, access: ResolvedAccess, text: string,
  options: { timeoutMs: number; cacheKey: string; now?: () => number; atPause?: boolean; recent?: readonly string[]; hint?: string | null },
): Promise<HumAsked> {
  const now = options.now ?? Date.now
  const started = now()
  const timedOut = AbortSignal.timeout(options.timeoutMs)
  try {
    const { text: raw, usage } = await model.complete({
      access,
      system: [{ text: HUM_INSTRUCTIONS, cacheAfter: true }],
      messages: [{ role: 'user', content: readMessage(text, options) }],
      cacheKey: options.cacheKey,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Reasoning off where the provider can turn it off: the answer is wanted at once.
      spoken: true,
      signal: timedOut,
    })
    const answer = parseHum(raw)
    return answer ? { answer, ms: now() - started, usage, raw } : { failed: 'failed', ms: now() - started, usage, raw }
  } catch {
    return { failed: timedOut.aborted ? 'timeout' : 'failed', ms: now() - started }
  }
}

export function createHumService(deps: HumServiceDeps) {
  const inFlight = new WeakSet<HumSession>()
  /** Each voice session's sounds sent, being made or failed: each is sent, made or said failed once. */
  const handled = new WeakMap<HumSession, Set<string>>()

  async function send(session: HumSession, sound: HumSound): Promise<void> {
    const stored = await deps.speak(session, sound).catch(() => null)
    const reply = { conversationId: session.conversationId, ...sound }
    deps.sendSound(session, stored?.audio.length ? { ...reply, audio: stored.audio, made: stored.made } : { ...reply, failed: true })
  }

  return {
    async ask(session: HumSession, question: HumQuestion): Promise<void> {
      if (inFlight.has(session)) return
      inFlight.add(session)
      const answer = (rest: Pick<VoiceBackchannelKindEvent, 'kind' | 'tone' | 'ms' | 'failed'>) =>
        deps.send(session, { conversationId: session.conversationId, seq: question.seq, ...rest })
      try {
        const access = (await deps.enabled(session.holderId)) ? await deps.access(session) : null
        if (!access) return answer({ kind: null, tone: null, ms: 0, failed: 'off' })
        const toneNow = deps.tone?.(session) ?? { on: true, hint: null }
        const hint = toneNow.on ? toneNow.hint : null
        const asked = await askHum(deps.model, access, question.text, {
          timeoutMs: deps.timeoutMs, cacheKey: `hum-${session.conversationId}`, now: deps.now,
          ...(question.atPause && { atPause: true }), ...(question.recent && { recent: question.recent }), ...(hint && { hint }),
        })
        if ('failed' in asked) return answer({ kind: null, tone: null, ms: asked.ms, failed: asked.failed })
        const read = asked.answer
        if (read.kind === 'none') return answer({ kind: 'none', tone: null, ms: asked.ms })
        answer({ kind: read.kind, tone: toneNow.on ? read.tone : toneFor(read.kind, 'calm'), ms: asked.ms })
      } finally {
        inFlight.delete(session)
      }
    },

    /** The page wants a kind's sounds in a tone: those made and not sent yet, and one more made (every one to warm). */
    async speak(session: HumSession, request: SoundRequest): Promise<void> {
      // As the read itself: nothing is made or sent where adaptive voice listening is off for the holder.
      if (!(await deps.enabled(session.holderId).catch(() => false))) return
      const done = handled.get(session) ?? new Set<string>()
      handled.set(session, done)
      let toMake = request.warm ? Infinity : 1
      for (const words of HUM_LIBRARY[request.kind].words) {
        const sound: HumSound = { kind: request.kind, tone: request.tone, words }
        const key = soundKey(words, request.tone)
        if (done.has(key)) continue
        done.add(key)
        if (await deps.made(session, sound).catch(() => false)) await send(session, sound)
        else if (toMake-- > 0) await send(session, sound)
        else done.delete(key)
      }
    },
  }
}
export type HumService = ReturnType<typeof createHumService>
