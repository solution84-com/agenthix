/**
 * The phrases the agent says while the person holds the floor (adaptive voice spec, Orchestration §5), in its own
 * voice: an active listening phrase ("Mm-hm.") quieter than the reply, with a chance of none, and an encouragement
 * phrase ("Yes?") after the person stopped it with a stop word. Never the same twice in a row. hq sends them as voice
 * starts, with the filler phrases; until then there are none.
 *
 * One plays at a time, and only while nothing else does; the person speaking stops it at once. Like a filler phrase,
 * it is heard for the echo check and is part of no reply.
 */
import type { Playback } from '../playback'
import type { VoiceSettings } from '../settings'
import type { Heard } from './fillerPhrases'

export type ListenerPhraseKind = 'active-listening' | 'encouragement'
export type ListenerClip = { text: string; audio: ArrayBuffer; use: ListenerPhraseKind }

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
  let lastText: string | null = null
  let playing: { playback: Playback; text: string } | null = null

  const stop = () => {
    playing?.playback.close()
    playing = null
  }

  return {
    add(clip: ListenerClip) { clips = [...clips, clip] },
    clear() { clips = []; lastText = null; stop() },
    busy: () => playing !== null,
    /** Plays one of `kind` now, if one may; an active listening phrase draws its chance of none first. */
    play(kind: ListenerPhraseKind, settings: Pick<VoiceSettings, 'activeListening'>) {
      if (playing) return
      const listening = kind === 'active-listening'
      if (listening && random() < settings.activeListening.skipChance) return
      const choices = clips.filter(c => c.use === kind && c.text !== lastText)
      const clip = choices[Math.floor(random() * choices.length)]
      if (!clip) return
      const playback = deps.createPlayback()
      playback.enqueue(0, listening ? atGain(clip.audio, settings.activeListening.gainDb) : clip.audio.slice(0))
      playback.finish()
      playing = { playback, text: clip.text }
      lastText = clip.text
    },
    /** The person spoke, or voice ended: it stops at once; what was playing, or null. */
    cancel(): string | null {
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
