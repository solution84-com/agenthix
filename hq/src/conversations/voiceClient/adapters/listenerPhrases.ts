/**
 * The listening family's player (voice that stays in the conversation, spec §3): the stored clips the agent plays
 * while the person holds the floor, in its own voice, in three tiers (hums, acknowledging words, invitations). hq
 * sends them as voice starts, with the stored wait phrases; until then, and for a tier whose clips are not made yet,
 * there are none, and nothing plays.
 *
 * Orchestration says which tiers a sound may come from (`./../orchestration/listening`); this picks the clip: none of
 * the last `recent` played, across all tiers, and when every one that fits is that recent, none. Two takes of the
 * same sound are two clips. Every clip plays at `gainDb` to the reply. One plays at a time, and only while nothing
 * else does; the person speaking stops it at once. Like the standard acknowledgement, it is heard for the echo check
 * and is part of no reply.
 */
import type { ListeningTier } from '../orchestration/listeningTiers'
import type { Playback } from '../playback'
import type { VoiceSettings } from '../settings'
import type { Heard } from './standardAcknowledgement'

export type ListenerClip = { text: string; audio: ArrayBuffer; tier: ListeningTier }

/** `audio`, PCM16, at `gainDb`. */
function atGain(audio: ArrayBuffer, gainDb: number): ArrayBuffer {
  const factor = 10 ** (gainDb / 20)
  const samples = new Int16Array(audio.slice(0))
  for (let i = 0; i < samples.length; i++) samples[i] = Math.round(samples[i]! * factor)
  return samples.buffer
}

export function createListenerPhrases(deps: { createPlayback: () => Playback; random?: () => number }) {
  const random = deps.random ?? Math.random
  let clips: ListenerClip[] = []
  /** The clips played last, the latest first. */
  let recent: ListenerClip[] = []
  let playing: { playback: Playback; text: string; tier: ListeningTier } | null = null

  const stop = () => {
    playing?.playback.close()
    playing = null
  }

  return {
    add(clip: ListenerClip) { clips = [...clips, clip] },
    clear() { clips = []; recent = []; stop() },
    busy: () => playing !== null,
    /** How many clips are stored, and how many of `tiers` are not among the recent ones: why a request may play nothing. */
    available(tiers: readonly ListeningTier[], settings: VoiceSettings['listening']) {
      const fresh = recent.slice(0, settings.recent)
      return { stored: clips.length, fits: clips.filter(c => tiers.includes(c.tier) && !fresh.some(f => f === c || f.text === c.text)).length }
    },
    /** Plays one clip of `tiers` now, if one may; what it played, or null. */
    play(tiers: readonly ListeningTier[], settings: VoiceSettings['listening']): string | null {
      if (playing) return null
      const fresh = recent.slice(0, settings.recent)
      const choices = clips.filter(c => tiers.includes(c.tier) && !fresh.some(f => f === c || f.text === c.text))
      const clip = choices[Math.floor(random() * choices.length)]
      if (!clip) return null
      const playback = deps.createPlayback()
      playback.enqueue(0, atGain(clip.audio, settings.gainDb))
      playback.finish()
      playing = { playback, text: clip.text, tier: clip.tier }
      recent = [clip, ...recent.filter(c => c !== clip)]
      return clip.text
    },
    /**
     * Voice ended, or the person spoke over an invitation: it stops at once; what was playing, or null. With
     * `invitationsOnly`, a hum or an acknowledging word is left to finish: it is half a second, said under the person.
     */
    cancel(invitationsOnly = false): string | null {
      if (invitationsOnly && playing?.tier !== 'invitation') return null
      const text = playing?.text ?? null
      stop()
      return text
    },
    /** What of the one playing is heard since the last tick; null when none plays. */
    tick(): Heard | null {
      if (!playing) return null
      const { playback, text } = playing
      const audio = playback.heardAudio?.() ?? new Int16Array(0)
      if (!playback.idle()) return { text, playing: true, audio }
      stop()
      return { text, playing: false, audio }
    },
  }
}

export type ListenerPhrases = ReturnType<typeof createListenerPhrases>
