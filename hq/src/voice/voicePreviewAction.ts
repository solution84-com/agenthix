import { HttpError } from 'wasp/server'
import { getCachedPhrase, getCachedAudio } from './voiceCache'
import { decryptProviderKey } from '../server/providerService'

export const previewVoice = async (
  args: { voiceId: string; description: string; lang?: string; model?: string },
  context: any,
): Promise<{ audio: string; phrase: string }> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // Synthesising a preview spends the organisation's voice budget. Everyone may
  // talk to agents in their own Chat (adr-0102), so everyone signed in may use voice.
  const record = await context.entities.Provider.findFirst({
    where: { service: 'tts', name: 'inworld', isEnabled: true },
  })
  if (!record) throw new HttpError(404, 'No active voice provider configured')

  const model = args.model ?? 'inworld-tts-2'
  const lang = args.lang ?? 'en'
  const apiKey = decryptProviderKey(record.apiKey).trim()

  const phrase = await getCachedPhrase(args.voiceId, args.description, lang)
  const audio = await getCachedAudio(args.voiceId, lang, phrase, model, apiKey)

  return { audio: audio.toString('base64'), phrase }
}
