import { HttpError } from 'wasp/server'
import { getCachedPhrase, getCachedAudio, getCachedVoices } from './voiceCache'
import { failureKind, speechAccess } from './speechAccess'
import { isLanguageCode } from './languageCode'
import { VOICE_TTS_MODEL } from './voiceModels'
import { reportCall } from '../routing/resolver'
import { recordTts } from '../billing/sources/voice'

/** A sample of a voice on the provider named, in the language given (`en` when none). The model is always Inworld TTS 2. */
export const previewVoice = async (
  args: { providerId: string; voiceId: string; description?: string; lang?: string },
  context: any,
): Promise<{ audio: string; phrase: string }> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof args?.providerId !== 'string' || !args.providerId) throw new HttpError(400, 'Choose a text to speech provider')
  const lang = args.lang ?? 'en'
  if (!isLanguageCode(lang)) throw new HttpError(400, 'Choose a language by its code, such as en or pt-BR')
  // Synthesising a preview spends the organisation's voice budget. Everyone may
  // talk to agents in their own Chat (adr-0102), so everyone signed in may use voice.
  const answer = await speechAccess('tts', null, {
    userId: context.user.id, pick: { providerId: args.providerId, model: VOICE_TTS_MODEL },
  })
  if (!answer.ok) throw new HttpError(503, answer.reason)
  const { apiKey, providerId, providerName, vendor, costing } = answer.access

  const model = VOICE_TTS_MODEL

  // A bare ▶ knows only the voice's id; its description, which the sample phrase is written from, is in the list.
  const description = args.description ?? (await getCachedVoices(providerId, apiKey).catch(() => [])).find(v => v.voiceId === args.voiceId)?.description ?? ''
  const phrase = await getCachedPhrase(args.voiceId, description, lang)
  try {
    const audio = await getCachedAudio(args.voiceId, lang, phrase, model, apiKey,
      characters => recordTts({ providerId, providerName, vendor, model, costing }, characters, { userId: context.user.id }))
    reportCall(providerId, null)
    return { audio: audio.toString('base64'), phrase }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    reportCall(providerId, failureKind(null, message), message.slice(0, 200))
    throw new HttpError(502, 'Could not make the voice sample')
  }
}
