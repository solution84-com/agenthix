import { HttpError } from 'wasp/server'
import { getCachedVoices } from './voiceCache'
import { maskProviderKey, decryptProviderKey } from '../server/providerService'
import { assertAdmin } from '../sites/assertAdmin'
import type { VoiceServices } from '../shared/conversations/voice'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

type VoiceProviderSummary = {
  id: string
  service: string
  name: string
  apiKeyPrefix: string
  config: { [key: string]: JsonValue } | null
  isEnabled: boolean
} | null

/**
 * The voice providers' settings, for the settings screen: keyed by vendor, with each masked key prefix and config,
 * so only whoever may change them (an admin, as saving and removing require) may read them. A voice client reads
 * `getVoiceServices` instead.
 */
export const getVoiceProvider = async (
  _args: void,
  context: any,
): Promise<{ assemblyai: VoiceProviderSummary; inworld: VoiceProviderSummary }> => {
  await assertAdmin(context)
  const records = await context.entities.Provider.findMany({
    where: { service: { in: ['stt', 'tts'] } },
  })
  // maskProviderKey decrypts, and decrypting can throw (wrong/rotated
  // SECRETS_MASTER_KEY, a corrupted row). One bad row must not blank this
  // query — the settings page is the one place an operator could come to fix
  // it — and must not hide the other, readable provider either, so the catch
  // is per row rather than around the whole query.
  const safeMask = (apiKey: string): string => {
    try {
      return maskProviderKey(apiKey)
    } catch {
      return 'unreadable — check SECRETS_MASTER_KEY'
    }
  }
  const toSummary = (r: any): VoiceProviderSummary =>
    r
      ? {
          id: r.id,
          service: r.service,
          name: r.name,
          apiKeyPrefix: safeMask(r.apiKey),
          config: r.config ?? null,
          isEnabled: r.isEnabled,
        }
      : null

  return {
    assemblyai: toSummary(records.find((r: any) => r.name === 'assemblyai')),
    inworld: toSummary(records.find((r: any) => r.name === 'inworld')),
  }
}

export const getVoiceServices = async (_args: void, context: any): Promise<VoiceServices> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const records: { service: string; name: string }[] = await context.entities.Provider.findMany({
    where: { service: { in: ['stt', 'tts'] }, isEnabled: true },
    select: { service: true, name: true },
  })
  const of = (service: string) => {
    const r = records.find(p => p.service === service)
    return r ? { provider: r.name } : null
  }
  return { speechToText: of('stt'), textToSpeech: of('tts') }
}

type InworldVoice = {
  voiceId: string
  displayName: string
  description: string
  languages: string[]
  tags: string[]
  isCustom: boolean
}

export const listInworldVoices = async (_args: void, context: any): Promise<InworldVoice[]> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const record = await context.entities.Provider.findFirst({
    where: { service: 'tts', name: 'inworld', isEnabled: true },
  })
  if (!record) throw new HttpError(404, 'No active Inworld TTS provider configured')
  return getCachedVoices(decryptProviderKey(record.apiKey).trim())
}
