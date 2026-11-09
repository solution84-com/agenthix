/**
 * A short-lived token for the browser to stream speech to the service itself, minted with the provider's key, so no
 * audio passes through hq. The key goes no further than the request that mints; the token is all the browser gets.
 *
 * - AssemblyAI: `GET /v3/token`, a token for ten minutes, put in the socket's address.
 * - Inworld: `POST /auth/v1/tokens`, a single-use token, sent as the socket's `bearer_` sub-protocol. Single use, so
 *   each connection attempt needs its own; its lifetime matches AssemblyAI's so the client's freshness holds.
 */
import type { ModelErrorKind } from '../conversations/contract'
import type { SpeechToken } from '../shared/conversations/voice'
import { vendorMessage } from '../providers/secrecy'
import { failureKind, type SpeechAccess } from './speechAccess'
import { PROVIDER_CALL_TIMEOUT_MS } from './providerTimeout'
import { inworldMints } from './mintLimit'

export const TOKEN_TTL_SECONDS = 600

export type Minted = { provider: string; token: string; expiresAt: string; config: SpeechToken['config'] }

/** `kind` is what the failure says about the provider, for its health; null when it says nothing (hq's own limit). */
export type MintFailure = { kind: ModelErrorKind | null; detail: string; message: string }

export type MintAnswer = { ok: true; minted: Minted } | { ok: false; failure: MintFailure }

type Access = Pick<SpeechAccess, 'providerId' | 'providerName' | 'vendor' | 'model' | 'apiKey'>

async function call(access: Access, url: string, init: RequestInit): Promise<{ ok: true; body: unknown } | { ok: false; failure: MintFailure }> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(PROVIDER_CALL_TIMEOUT_MS) })
  } catch (err) {
    const msg = vendorMessage(err instanceof Error ? err.message : 'Network error', access.apiKey)
    return { ok: false, failure: { kind: 'unavailable', detail: msg, message: `Could not reach ${access.providerName}: ${msg}` } }
  }
  if (!res.ok) {
    const said = vendorMessage((await res.text().catch(() => '')).slice(0, 200), access.apiKey)
    return {
      ok: false,
      failure: { kind: failureKind(res.status), detail: said, message: `${access.providerName} rejected token request (${res.status})${said ? ': ' + said : ''}` },
    }
  }
  return { ok: true, body: await res.json().catch(() => null) }
}

const unexpected = (access: Access): MintAnswer =>
  ({ ok: false, failure: { kind: 'unavailable', detail: 'Unexpected response shape', message: `Unexpected response shape from ${access.providerName}` } })

async function mintAssemblyAi(access: Access): Promise<MintAnswer> {
  const got = await call(access, `https://streaming.assemblyai.com/v3/token?expires_in_seconds=${TOKEN_TTL_SECONDS}`, {
    headers: { Authorization: access.apiKey },
  })
  if (!got.ok) return got
  const data = (got.body ?? {}) as { token?: unknown; expires_in_seconds?: unknown }
  if (typeof data.token !== 'string' || !data.token || typeof data.expires_in_seconds !== 'number') return unexpected(access)
  return {
    ok: true,
    minted: {
      provider: 'assemblyai',
      token: data.token,
      expiresAt: new Date(Date.now() + data.expires_in_seconds * 1000).toISOString(),
      config: access.model ? { speech_model: access.model } : {},
    },
  }
}

async function mintInworld(access: Access): Promise<MintAnswer> {
  if (!inworldMints.take(access.providerId)) {
    return { ok: false, failure: { kind: null, detail: '', message: `${access.providerName} has made as many listening tokens as it may this minute` } }
  }
  const got = await call(access, 'https://api.inworld.ai/auth/v1/tokens', {
    method: 'POST',
    headers: { Authorization: `Basic ${access.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ single_use: true, ttl: `${TOKEN_TTL_SECONDS}s` }),
  })
  if (!got.ok) return got
  const data = (got.body ?? {}) as { accessToken?: unknown; expireTime?: unknown }
  if (typeof data.accessToken !== 'string' || !data.accessToken) return unexpected(access)
  const expires = typeof data.expireTime === 'string' && !Number.isNaN(Date.parse(data.expireTime))
    ? new Date(data.expireTime) : new Date(Date.now() + TOKEN_TTL_SECONDS * 1000)
  return {
    ok: true,
    minted: { provider: 'inworld', token: data.accessToken, expiresAt: expires.toISOString(), config: access.model ? { modelId: access.model } : {} },
  }
}

export function mintSpeechToken(access: Access): Promise<MintAnswer> {
  return access.vendor === 'inworld' ? mintInworld(access) : mintAssemblyAi(access)
}
