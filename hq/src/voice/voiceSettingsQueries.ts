import { HttpError } from 'wasp/server'
import { getCachedVoices } from './voiceCache'
import { speechAccess } from './speechAccess'
import type { VoiceServices } from '../shared/conversations/voice'

/**
 * Which speech services the organisation's defaults resolve to now, for any member: a provider's vendor, nothing
 * secret. Null where no provider of the type works, which a voice client shows as voice being down.
 */
export const getVoiceServices = async (_args: void, context: any): Promise<VoiceServices> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const [stt, tts] = await Promise.all([speechAccess('stt'), speechAccess('tts')])
  return {
    speechToText: stt.ok ? { provider: stt.access.vendor } : null,
    textToSpeech: tts.ok ? { provider: tts.access.vendor } : null,
  }
}

type InworldVoice = {
  voiceId: string
  displayName: string
  description: string
  languages: string[]
  tags: string[]
  isCustom: boolean
}

/** The voices of the text to speech provider the resolver gives (the agent's own when `agentId` is set). */
export const listInworldVoices = async (args: { agentId?: string } | void, context: any): Promise<InworldVoice[]> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const answer = await speechAccess('tts', args?.agentId)
  if (!answer.ok) throw new HttpError(503, answer.reason)
  return getCachedVoices(answer.access.apiKey)
}
