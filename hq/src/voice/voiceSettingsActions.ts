import { HttpError } from 'wasp/server'
import { encryptProviderKey } from '../server/providerService'

type SaveVoiceProviderArgs = {
  service: 'stt' | 'tts'
  name: string
  apiKey: string
  config?: Record<string, unknown>
}

/**
 * Verify a voice provider key against its upstream API before persisting.
 * Catches malformed/expired/wrong-tier keys at save time so the UI can
 * surface a real error instead of silently storing an "Active" record
 * that 4xx/5xx's on every actual call.
 */
async function testVoiceProviderKey(
  service: 'stt' | 'tts',
  name: string,
  apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (service === 'tts' && name === 'inworld') {
      const r = await fetch('https://api.inworld.ai/tts/v1/voices', {
        headers: { Authorization: `Basic ${apiKey}` },
      })
      if (!r.ok) {
        const body = await r.text().catch(() => '')
        return { ok: false, error: `Inworld rejected the key (${r.status} ${r.statusText})${body ? ': ' + body.slice(0, 200) : ''}` }
      }
      return { ok: true }
    }
    if (service === 'stt' && name === 'assemblyai') {
      const r = await fetch(
        'https://streaming.assemblyai.com/v3/token?expires_in_seconds=60',
        { headers: { Authorization: apiKey } },
      )
      if (!r.ok) {
        const body = await r.text().catch(() => '')
        return { ok: false, error: `AssemblyAI rejected the key (${r.status} ${r.statusText})${body ? ': ' + body.slice(0, 200) : ''}` }
      }
      return { ok: true }
    }
    // Unknown provider — skip validation rather than block.
    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error'
    return { ok: false, error: `Could not reach upstream service: ${message}` }
  }
}

export const saveVoiceProvider = async (args: SaveVoiceProviderArgs, context: any): Promise<{ id: string }> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const callerSettings = await context.entities.UserSettings.findFirst({
    where: { userId: context.user.id },
  })
  if (callerSettings?.role !== 'ADMIN') throw new HttpError(403, 'Admin access required')
  if (!args.apiKey?.trim() && args.apiKey !== '__keep__') throw new HttpError(400, 'API key is required')

  const existing = await context.entities.Provider.findFirst({
    where: { service: args.service, name: args.name },
  })

  if (args.apiKey === '__keep__') {
    // Config-only update — do not overwrite the stored key
    if (!existing) throw new HttpError(404, 'Provider not found — save an API key first')
    return context.entities.Provider.update({
      where: { id: existing.id },
      data: { config: args.config, isEnabled: true },
    })
  }

  const trimmedKey = args.apiKey.trim()
  const test = await testVoiceProviderKey(args.service, args.name, trimmedKey)
  if (!test.ok) {
    throw new HttpError(400, test.error)
  }

  const data = {
    apiKey: encryptProviderKey(trimmedKey),
    config: args.config,
    isEnabled: true,
  }
  if (existing) {
    return context.entities.Provider.update({ where: { id: existing.id }, data })
  }
  return context.entities.Provider.create({
    data: { service: args.service, name: args.name, ...data },
  })
}

export const deleteVoiceProvider = async (
  args: { service: 'stt' | 'tts'; name: string },
  context: any,
): Promise<void> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const callerSettings = await context.entities.UserSettings.findFirst({
    where: { userId: context.user.id },
  })
  if (callerSettings?.role !== 'ADMIN') throw new HttpError(403, 'Admin access required')
  await context.entities.Provider.deleteMany({
    where: { service: args.service, name: args.name },
  })
}
