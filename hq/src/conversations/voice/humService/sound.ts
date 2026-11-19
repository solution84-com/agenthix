/**
 * A listening sound as speech (spec §The sound keeper, T1): a word of the hum library with its tone's full steering, on
 * a speech model that takes a direction (calm takes none); a laugh is the bare tag `[laughing]`, which such a model
 * makes as a sound of its own and any other would read aloud, so there it is not made. Without the silence the speech
 * service leaves before and after it, so it plays at once and ends when it sounds like it does. Kept per voice by
 * `./store`.
 */
import { LAUGH_WORDS, SOUND_STEERING, type SteeringChanges } from '../../voiceClient/backchannel/kinds'
import { takesDirection, withoutSilence } from '../phrases'
import type { AgentVoice } from '../speech'
import type { HumSound } from './service'

const LAUGH_TAG = '[laughing]'

/** What the speech service is sent for a sound; null when this voice cannot make it. */
export function soundSaid(sound: HumSound, voice: Pick<AgentVoice, 'model'>, steering: SteeringChanges = {}): string | null {
  const directed = takesDirection(voice)
  if (sound.words === LAUGH_WORDS) return directed ? LAUGH_TAG : null
  const steer = steering[sound.tone]?.trim() || SOUND_STEERING[sound.tone]
  return directed && steer ? `${steer} ${sound.words}` : sound.words
}

/** The sound's audio, trimmed; null when it cannot be made or the speech service gave nothing. */
export async function soundAudio(
  sound: HumSound, voice: AgentVoice, synthesize: (said: string) => AsyncIterable<Buffer | Uint8Array>, steering?: SteeringChanges,
): Promise<Buffer | null> {
  const said = soundSaid(sound, voice, steering)
  if (said === null) return null
  const parts: Buffer[] = []
  for await (const part of synthesize(said)) parts.push(Buffer.from(part))
  const raw = Buffer.concat(parts)
  return raw.length ? withoutSilence(raw) : null
}
