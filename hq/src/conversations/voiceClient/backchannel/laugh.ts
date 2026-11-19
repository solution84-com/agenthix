/**
 * The voice profile in the backchannel (adaptive voice listening, spec §Hum timing, the laugh):
 *
 * - **Laughter heard** (Tone on). The vocal style `laughing` at `laughConfidence` or more lets the next pause play a laugh back
 *   (`amusement`), a reaction under the reaction spacing, even when the hum service said otherwise or said none; for
 *   `reactionHoldMs`, or until a hum plays or the turn ends. Never after a question and never over the agent: the
 *   trigger's own rules hold it back as any hum, and a reading taken while the agent's audio plays is not heard.
 *
 * The laugh back reads the voice profile, so it comes with Tone on only; a read that says amusement laughs either way.
 */
import type { VoiceEventOf } from '../events'
import type { VoiceSettings } from '../settings'
import { laughing } from '../tone/voiceProfile'
import { toneOn } from '../tone/settings'

/** Until when a laugh heard may be answered; null with none. */
export function laughHeard(e: VoiceEventOf<'tone.voice'>, settings: VoiceSettings, agentAudio: boolean, until: number | null): number | null {
  if (agentAudio || !toneOn(settings) || !laughing(e, settings.tone.laughConfidence)) return until
  return e.t + Math.max(settings.backchannel.reactionHoldMs, settings.backchannel.reactionSpeechMs)
}

export const laughDue = (until: number | null, t: number) => until !== null && t < until
