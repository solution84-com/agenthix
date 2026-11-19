/**
 * The voice hint (adaptive voice listening, spec §Tone, T2): how the person sounds now, from the voice profile's latest
 * reading (`./voiceProfile`), as a label hq puts in its own words for the light model and the listening read. It
 * changes only when a reading says something else, and a reading with no label at the bar clears it; a reading taken
 * while the agent's own audio plays is ignored, since it may be the agent's sound heard back. With Tone off it is none,
 * said once. In memory only.
 */
import type { VoiceHint } from '@agenthix/core'
import type { VoiceEventInput } from '../events'
import type { Component } from '../runtime/types'
import { toneOn } from './settings'
import { hintOf } from './voiceProfile'

export type VoiceHintState = { hint: VoiceHint | null; replyPlaying: boolean; soundPlaying: boolean }

export const VOICE_HINT_START: VoiceHintState = { hint: null, replyPlaying: false, soundPlaying: false }

export const voiceHint: Component<VoiceHintState> = {
  name: 'voiceHint',
  accepts: ['tone.voice', 'playback.at', 'phrase.at'],
  init: () => VOICE_HINT_START,
  step(state, event, settings) {
    const keep = (patch: Partial<VoiceHintState> = {}) => ({ state: { ...state, ...patch }, emit: [] as VoiceEventInput[] })
    const set = (hint: VoiceHint | null, patch: Partial<VoiceHintState> = {}) => hint === state.hint ? keep(patch)
      : { state: { ...state, ...patch, hint }, emit: [{ kind: 'tone.hint', hint, t: event.t }] as VoiceEventInput[] }
    if (!toneOn(settings)) return set(null)
    switch (event.kind) {
      case 'playback.at': return keep({ replyPlaying: event.playing })
      case 'phrase.at': return keep({ soundPlaying: event.playing })
      case 'tone.voice':
        if (state.replyPlaying || state.soundPlaying) return keep()
        return set(hintOf(event, settings.tone.voiceConfidence))
      default: return keep()
    }
  },
}
