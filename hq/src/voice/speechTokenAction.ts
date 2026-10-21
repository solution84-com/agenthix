import { HttpError } from 'wasp/server'
import { type GetSpeechToken } from 'wasp/server/operations'
import { decryptProviderKey } from '../server/providerService'
import type { SpeechToken } from '../shared/conversations/voice'

const TOKEN_TTL_SECONDS = 600
const PROVIDER = 'assemblyai'

export const getSpeechToken: GetSpeechToken<void, SpeechToken> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // A token lets the client stream speech to the organisation's speech-to-text
  // account. Everyone may talk to agents in their own Chat (adr-0102), so everyone
  // signed in may have one.

  const record = await context.entities.Provider.findFirst({
    where: { service: 'stt', name: PROVIDER, isEnabled: true },
  })
  if (!record) {
    throw new HttpError(404, 'Speech to text is not set up. Add it in Settings › Voice.')
  }
  const apiKey = decryptProviderKey(record.apiKey).trim()
  if (!apiKey) {
    throw new HttpError(500, 'The speech-to-text key is present but empty. Reconfigure it in Settings › Voice.')
  }

  let upstream: Response
  try {
    upstream = await fetch(
      `https://streaming.assemblyai.com/v3/token?expires_in_seconds=${TOKEN_TTL_SECONDS}`,
      { headers: { Authorization: apiKey } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    throw new HttpError(502, `Could not reach AssemblyAI: ${msg}`)
  }

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '')
    throw new HttpError(502, `AssemblyAI rejected token request (${upstream.status})${body ? ': ' + body.slice(0, 200) : ''}`)
  }

  const data = await upstream.json() as { token?: string; expires_in_seconds?: number }
  if (!data.token || typeof data.expires_in_seconds !== 'number') {
    throw new HttpError(502, 'Unexpected response shape from AssemblyAI')
  }

  const expiresAt = new Date(Date.now() + data.expires_in_seconds * 1000).toISOString()
  return {
    provider: PROVIDER,
    token: data.token,
    expiresAt,
    config: (record.config ?? {}) as SpeechToken['config'],
  }
}
