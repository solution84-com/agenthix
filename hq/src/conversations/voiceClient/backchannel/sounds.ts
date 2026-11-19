/**
 * The sound keeper's audio (spec §The sound keeper): each sound of the hum library hq sent for this voice session, by
 * its key (`./kinds`), in the page's memory only, and the one playing. A sound plays to its end: nothing cuts it, and while it
 * plays everything else waits (`../adapters/speakerSounds`). It is heard for the echo check and is part of no reply.
 * Which sound plays, and when, is the keeper's (`./keeper`); voice ending forgets every one.
 */
import { atGain } from '../adapters/listenerPhrases'
import type { Heard } from '../adapters/standardAcknowledgement'
import type { Playback } from '../playback'

export function createSoundShelf(deps: { createPlayback: () => Playback }) {
  const audio = new Map<string, ArrayBuffer>()
  let playing: { playback: Playback; text: string } | null = null

  return {
    add(key: string, sound: ArrayBuffer) { audio.set(key, sound) },
    has: (key: string) => audio.has(key),
    busy: () => playing !== null,
    /** Plays the sound kept as `key` now, its words shown as `text`: null when it played, else why not. */
    play(gainDb: number, key: string, text: string): string | null {
      if (playing) return 'a sound was already playing'
      const sound = audio.get(key)
      if (!sound) return 'its audio is not here'
      const playback = deps.createPlayback()
      playback.enqueue(0, atGain(sound, gainDb))
      playback.finish()
      playing = { playback, text }
      return null
    },
    /** What of the sound playing is heard since the last tick; null when none plays. */
    tick(): Heard | null {
      if (!playing) return null
      const { playback, text } = playing
      const heard = playback.heardAudio?.() ?? new Int16Array(0)
      if (!playback.idle()) return { text, playing: true, audio: heard }
      playback.close()
      playing = null
      return { text, playing: false, audio: heard }
    },
    /** Voice ended: everything stops and is forgotten. */
    clear() { playing?.playback.close(); playing = null; audio.clear() },
  }
}

export type SoundShelf = ReturnType<typeof createSoundShelf>
