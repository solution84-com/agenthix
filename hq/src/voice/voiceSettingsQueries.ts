import { HttpError } from 'wasp/server'
import { getCachedVoices } from './voiceCache'
import { speechAccess } from './speechAccess'
import { VOICE_TTS_MODEL } from './voiceModels'
import type { Voice } from './ttsAdapter'
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

/**
 * The voices of the text to speech provider named, for any signed-in member: previews are costed to the
 * organisation, and every agent has a voice. The provider's own key lists them, not whichever provider the
 * resolver would give.
 */
export const listInworldVoices = async (args: { providerId: string }, context: any): Promise<Voice[]> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof args?.providerId !== 'string' || !args.providerId) throw new HttpError(400, 'Choose a text to speech provider')
  const answer = await speechAccess('tts', null, { pick: { providerId: args.providerId, model: VOICE_TTS_MODEL } })
  if (!answer.ok) throw new HttpError(503, answer.reason)
  return getCachedVoices(answer.access.providerId, answer.access.apiKey)
}
