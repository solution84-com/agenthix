/**
 * The hum library's sounds, kept per agent voice (spec §The sound keeper): a word in a tone is made the first time it
 * is needed for a voice and kept on hq's disk beside the voice previews and the stored phrases, for every later
 * conversation in that voice. Its file is named by the speech model and exactly what the speech service is sent (the
 * steering included), so a changed steering is a new sound. Two asking for one not made yet share its one making.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { SteeringChanges } from '../../voiceClient/backchannel/kinds'
import type { AgentVoice } from '../speech'
import type { HumSound } from './service'
import { soundAudio, soundSaid } from './sound'

export type Made = 'new' | 'kept'
export type StoredSound = { audio: Buffer; made: Made }

type Voice = Pick<AgentVoice, 'model' | 'voiceId'>

export function createSoundStore(dir: () => string) {
  const making = new Map<string, Promise<StoredSound | null>>()

  const fileOf = (voice: Voice, said: string): string => {
    const hash = crypto.createHash('sha1').update(`${voice.model}|${said}`).digest('hex').slice(0, 16)
    return path.join(dir(), 'hums', voice.voiceId.replace(/[^a-zA-Z0-9_-]/g, '_'), `${hash}.pcm`)
  }

  async function kept(file: string): Promise<Buffer | null> {
    try {
      const audio = await fs.promises.readFile(file)
      return audio.length ? audio : null
    } catch {
      return null
    }
  }

  return {
    /** Whether this sound is made for this voice already: it then costs no speech call. */
    async made(voice: Voice, sound: HumSound, steering?: SteeringChanges): Promise<boolean> {
      const said = soundSaid(sound, voice, steering)
      if (said === null) return false
      try {
        return (await fs.promises.stat(fileOf(voice, said))).size > 0
      } catch {
        return false
      }
    },

    /** The sound's audio: kept, or made now and kept; null when this voice cannot make it or the speech service failed. */
    async sound(
      voice: AgentVoice, sound: HumSound, synthesize: (said: string) => AsyncIterable<Buffer | Uint8Array>, steering?: SteeringChanges,
    ): Promise<StoredSound | null> {
      const said = soundSaid(sound, voice, steering)
      if (said === null) return null
      const file = fileOf(voice, said)
      const pending = making.get(file)
      if (pending) return pending
      const made = (async (): Promise<StoredSound | null> => {
        try {
          const audio = await kept(file)
          if (audio) return { audio, made: 'kept' }
          const fresh = await soundAudio(sound, voice, synthesize, steering)
          if (!fresh) return null
          await fs.promises.mkdir(path.dirname(file), { recursive: true })
          await fs.promises.writeFile(file, fresh)
          return { audio: fresh, made: 'new' }
        } catch {
          return null
        } finally {
          making.delete(file)
        }
      })()
      making.set(file, made)
      return made
    },
  }
}

export type SoundStore = ReturnType<typeof createSoundStore>
