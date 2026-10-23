import { HttpError } from 'wasp/server'
import { getCachedPhrase, getCachedAudio } from './voiceCache'
import { failureKind, speechAccess } from './speechAccess'
import { reportCall } from '../routing/resolver'
import { recordTts } from '../billing/sources/voice'

export const previewVoice = async (
  args: { voiceId: string; description: string; lang?: string; model?: string; agentId?: string },
  context: any,
): Promise<{ audio: string; phrase: string }> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // Synthesising a preview spends the organisation's voice budget. Everyone may
  // talk to agents in their own Chat (adr-0102), so everyone signed in may use voice.
  const answer = await speechAccess('tts', args.agentId)
  if (!answer.ok) throw new HttpError(503, answer.reason)
  const { apiKey, model: providerModel, providerId, providerName, vendor, costing } = answer.access

  const model = args.model ?? providerModel
  const lang = args.lang ?? 'en'

  const phrase = await getCachedPhrase(args.voiceId, args.description, lang)
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
