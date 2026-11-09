/**
 * What the playground reaches through hq's provider layer, never a key of its own: a model the person may use, as
 * the model picker offers it (models from one place), resolved by the one resolver; and the organisation's text to
 * speech, as the resolver gives it with no agent. Development calls: neither access carries a costing, so nothing
 * is written to the usage report, and a reply's model and speech calls report nothing to the provider's health. The
 * stored phrases are made, kept and reported as hq makes them for any voice (phrases.ts).
 */
import type { ConversationHomeRef, ResolvedAccess } from '../../contract'
import { requireOfferedModel } from '../../modelChoice'
import { talkingRequest } from '../../access/talkingModel'
import { resolve } from '../../../routing/resolver'
import { hqCallAccess } from '../../../routing/reaching'
import { speechAccess } from '../../../voice/speechAccess'
import { inworldTtsAdapter } from '../../../voice/inworldAdapter'
import { DEFAULT_VOICE } from '../../../voice/voiceModels'
import { phraseClips, spokenAs } from '../phrases'
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

export async function playgroundSpeech(userId: string): Promise<PlaygroundSpeech> {
  const answer = await speechAccess('tts', null, { userId })
  if (!answer.ok) return { reason: answer.reason }
  const { apiKey, voice, model, providerId } = answer.access
  const spoken: AgentVoice = { apiKey, voiceId: voice ?? DEFAULT_VOICE, model, providerId }
  return {
    synthesize: (text, signal) => inworldTtsAdapter.synthesizeStream(text, spoken, signal),
    asEncouragement: text => spokenAs(text, spoken),
    phrases: (onClip, stillWanted) => phraseClips(spoken, onClip, stillWanted),
  }
}
