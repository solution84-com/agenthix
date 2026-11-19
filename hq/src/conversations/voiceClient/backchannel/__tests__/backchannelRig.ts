/** A runtime of the floor and the backchannel, with the person's speech and the sound model's verdicts scripted. */
import type { TurnAnswer, VoiceEventBody } from '../../events'
import { floor } from '../../orchestration/floor'
import { KEEPING_UP, rig, silence } from '../../orchestration/__tests__/setup'
import type { VoiceSettings } from '../../settings'
import { backchannel } from '../trigger'

/** The hum service on, as in the product: a hum is of its answer, and with none yet, nothing plays. */
/**
 * Spacing pinned at the 4 s these tests were written for (the default is 6 s since the owner's playtest of 19 Nov),
 * for reactions too, no reaction held over a later answer, and none kept from coming twice in a row:
 * `reactions.test.ts` tests those, at their defaults.
 */
export const WITH_SERVICE: VoiceSettings = {
  ...KEEPING_UP, voiceListener: true, adaptiveVoice: true,
  backchannel: { ...KEEPING_UP.backchannel, speechMs: 4_000, reactionSpeechMs: 4_000, reactionGapSpeechMs: 0, reactionHoldMs: 0 },
}

/** The pause rules alone: the hum service off, so every hum due is a calm continuer. */
export const ON: VoiceSettings = { ...WITH_SERVICE, backchannel: { ...WITH_SERVICE.backchannel, serviceOn: false } }

/** The first values lane 21 built with, before the owner's playtest of 18 Nov. */
export const FIRST_VALUES: VoiceSettings = { ...ON, backchannel: { ...ON.backchannel, pauseMs: 600, latestPauseMs: 800, speechMs: 9_000 } }

export const verdict = (answer: TurnAnswer, silenceMs = 500, confidence = 0.6): VoiceEventBody =>
  ({ kind: 'semantics.decision', answer, confidence, silenceMs, by: 'model' })

/** The sound model ended the turn: the listening runtime asks *sounds finished* (`call`) and sends the words with it. */
export const finished = (call: number, text: string): VoiceEventBody[] => [
  { kind: 'listen.ask', call, moment: 'soundsFinished', text, quietMs: 800 },
  { kind: 'orchestration.send', text, append: false, via: 'listen' },
]

/**
 * hq's answer to `call`: "not yet" with nothing to say, a line of its own (played, or dropped as they spoke again), or a
 * hand over; and the turn it leaves.
 */
export const answer = (call: number, how: 'notYet' | 'line' | 'droppedLine' | 'handedOver'): VoiceEventBody[] => {
  if (how === 'handedOver') {
    return [
      { kind: 'listen.answer', call, action: 'hand_over', nextCheckSecs: 4, turn: 'handedOver', lineId: `L${call}` },
      { kind: 'listen.turn', state: 'handedOver' },
    ]
  }
  if (how === 'line' || how === 'droppedLine') {
    return [
      { kind: 'listen.answer', call, action: 'acknowledge', nextCheckSecs: 5, say: 'Right.', lineId: `L${call}` },
      how === 'line'
        ? { kind: 'listen.play', lineId: `L${call}`, quiet: true }
        : { kind: 'listen.drop', lineId: `L${call}`, call, why: 'you spoke again' },
      { kind: 'listen.turn', state: 'notYet' },
    ]
  }
  return [
    { kind: 'listen.answer', call, action: 'keep_listening', nextCheckSecs: 5 },
    { kind: 'listen.turn', state: 'notYet' },
  ]
}

export function setup(settings: VoiceSettings = ON) {
  const r = rig([floor, backchannel], ['backchannel.hum', 'backchannel.miss'], settings)
  const hums = () => r.of('backchannel.hum').map(({ t, pausedMs, speechMs, verdict: v, notYet }) => ({ t, pausedMs, speechMs, verdict: v, ...(notYet && { notYet }) }))
  const misses = () => r.of('backchannel.miss').map(({ t, why }) => ({ t, why }))
  const all = (at: number, bodies: VoiceEventBody[]) => { for (const b of bodies) r.at(at, b) }
  /** They speak from `from` to `to`, then a pause the sound model calls `answer` at 0.5 s; the words on screen at once. */
  const talk = (from: number, to: number, text = 'and then we walked on', answer: TurnAnswer = 'UNCERTAIN') => {
    r.at(from, silence(false))
    r.at(from + 100, { kind: 'stt.utterance', text })
    r.at(to, silence(true))
    r.tickTo(to + 450)
    r.at(to + 500, verdict(answer))
  }
  return { ...r, hums, misses, all, talk }
}
