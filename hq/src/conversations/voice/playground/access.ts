/**
 * What the playground reaches through hq's provider layer, never a key of its own: a model the person may use, as
 * the model picker offers it (models from one place), resolved by the one resolver; and the organisation's text to
 * speech, as the resolver gives it with no agent. Development calls: neither access carries a costing, so nothing
 * is written to the usage report, and a reply's model and speech calls report nothing to the provider's health. The
 * stored phrases are made, kept and reported as hq makes them for any voice (phrases.ts). The light model is the one
 * named on the page, or hq's own choice for listening (the resolver's purpose `listener`); its lines are made as hq
 * makes them (listening/lines.ts), with no costing, in the direction the page chose.
 */
import type { ConversationHomeRef, ResolvedAccess } from '../../contract'
import { requireOfferedModel } from '../../modelChoice'
import { talkingRequest } from '../../access/talkingModel'
import { resolve } from '../../../routing/resolver'
import { hqCallAccess } from '../../../routing/reaching'
import { speechAccess } from '../../../voice/speechAccess'
import { inworldTtsAdapter } from '../../../voice/inworldAdapter'
import { DEFAULT_VOICE } from '../../../voice/voiceModels'
import { phraseClips, spokenAs, storedPhraseClip } from '../phrases'
import { createSoundStore } from '../humService/store'
import { getVoiceCacheDir } from '../../../server/hqStoragePaths'
import type { LineDirection } from '../../../shared/voicePlaygroundLight'
import type { AgentVoice } from '../speech'
import type { PlaygroundSpeech } from './conversation'

/** The person's own space, with no agent: what the picker offers there is what may run. */
const ownSpace = (userId: string): ConversationHomeRef => ({ id: '', home: 'PERSON', projectId: null, taskId: null, openedById: userId, agentId: null })

export async function playgroundModelAccess(userId: string, value: string): Promise<ResolvedAccess> {
  const ref = ownSpace(userId)
  const { choice } = await requireOfferedModel(ref, value, userId)
  const answer = await resolve({ ...(await talkingRequest(ref, userId)), pick: choice })
  if (!answer.ok) throw new Error(answer.problem.message)
  const access = await hqCallAccess(answer.resolution)
  if (!access) throw new Error('hq cannot call that provider itself. Choose another model.')
  return access
}

/** A fast model for the page's choice: the model it names, or hq's own choice for `purpose`. */
async function fastAccess(userId: string, value: string | null, purpose: 'listener' | 'backchannel', which: string): Promise<ResolvedAccess> {
  if (value) return playgroundModelAccess(userId, value)
  const answer = await resolve(await talkingRequest(ownSpace(userId), userId, purpose))
  if (!answer.ok) throw new Error(answer.problem.message)
  const access = await hqCallAccess(answer.resolution)
  if (!access) throw new Error(`hq cannot call that provider itself. Choose another ${which}.`)
  return access
}

/** The light model for the page's choice: the model it names, or hq's own choice for listening. */
export const playgroundListenerAccess = (userId: string, value: string | null) => fastAccess(userId, value, 'listener', 'light model')

/** The hum service's model for the page's choice: the model it names, or hq's own choice for it. */
export const playgroundHumAccess = (userId: string, value: string | null) => fastAccess(userId, value, 'backchannel', 'model for the hum service')

/** The hum library's sounds, kept per voice on hq's disk as hq keeps them. */
const hums = createSoundStore(getVoiceCacheDir)

async function* lineAudio(said: string, voice: AgentVoice): AsyncIterable<Buffer> {
  for await (const { audio } of inworldTtsAdapter.synthesizeStream(said, voice)) yield Buffer.from(audio)
}

/** The light model's lines: plainly, as hq speaks them, or in the stored phrases' direction to compare (`LineDirection`). */
export async function playgroundSpeech(userId: string): Promise<PlaygroundSpeech> {
  const answer = await speechAccess('tts', null, { userId })
  if (!answer.ok) return { reason: answer.reason }
  const { apiKey, voice, model, providerId } = answer.access
  const spoken: AgentVoice = { apiKey, voiceId: voice ?? DEFAULT_VOICE, model, providerId }
  return {
    synthesize: (text, signal) => inworldTtsAdapter.synthesizeStream(text, spoken, signal),
    asEncouragement: text => spokenAs(text, spoken),
    steered: (text, direction) => spokenAs(text, spoken, direction),
    phrases: (onClip, stillWanted) => phraseClips(spoken, onClip, stillWanted),
    soundMade: (sound, steering) => hums.made(spoken, sound, steering),
    sound: (sound, steering) => hums.sound(spoken, sound, said => lineAudio(said, spoken), steering),
    // A line's turn tone (`steering`) is a direction too, on a model that takes one; the stored direction is for comparing.
    line: (text, direction, steering) => lineAudio(direction === 'stored' ? spokenAs(text, spoken) : steering ? spokenAs(text, spoken, steering) : text, spoken),
    stored: (avoid, pool) => storedPhraseClip(spoken, pool, avoid),
  }
}
