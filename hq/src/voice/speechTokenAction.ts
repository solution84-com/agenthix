import { HttpError } from 'wasp/server'
import { type GetSpeechToken } from 'wasp/server/operations'
import { reportCall } from '../routing/resolver'
import type { SpeechToken } from '../shared/conversations/voice'
import { sealSttTicket } from '../billing/sources/voice'
import { requireConversationSpeaker } from '../conversations/readingRule'
import { failureKind, speechAccess, type SpeechScope } from './speechAccess'
import { scopeOfConversation } from './speechScope'
import type { TicketedSpeechToken } from './ticketedToken'

const TOKEN_TTL_SECONDS = 600

/**
 * `agentId` picks that agent's own speech to text; without it the organisation's default is used. `conversationId`
 * says where the person is talking, so the session is costed to that place; without it, to the organisation's.
 */
export const getSpeechToken: GetSpeechToken<{ agentId?: string; conversationId?: string } | void, TicketedSpeechToken> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // A token lets the client stream speech to the organisation's speech-to-text account. Everyone may talk to
  // agents in their own Chat (adr-0102), so everyone signed in may have one.

  let scope: SpeechScope = { userId: context.user.id }
  if (args?.conversationId) {
    scope = await scopeOfConversation(await requireConversationSpeaker(args.conversationId, context.user.id), context.user.id)
  }
  const answer = await speechAccess('stt', args?.agentId, scope)
  if (!answer.ok) throw new HttpError(503, answer.reason)
  const { providerId, providerName, apiKey, model, vendor, costing } = answer.access

  let upstream: Response
  try {
    upstream = await fetch(
      `https://streaming.assemblyai.com/v3/token?expires_in_seconds=${TOKEN_TTL_SECONDS}`,
      { headers: { Authorization: apiKey } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    reportCall(providerId, 'unavailable', msg)
    throw new HttpError(502, `Could not reach ${providerName}: ${msg}`)
  }

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '')
    reportCall(providerId, failureKind(upstream.status), body.slice(0, 200))
    throw new HttpError(502, `${providerName} rejected token request (${upstream.status})${body ? ': ' + body.slice(0, 200) : ''}`)
  }

  const data = await upstream.json() as { token?: string; expires_in_seconds?: number }
  if (!data.token || typeof data.expires_in_seconds !== 'number') {
    reportCall(providerId, 'unavailable', 'Unexpected response shape')
    throw new HttpError(502, `Unexpected response shape from ${providerName}`)
  }

  reportCall(providerId, null)
  const expiresAt = new Date(Date.now() + data.expires_in_seconds * 1000).toISOString()
  // The browser streams to the speech service itself; the ticket is how hq counts what it streamed.
  const { ticket } = sealSttTicket({ providerId, providerName, vendor, model, costing }, context.user.id, new Date())
  return {
    ticket,
    provider: 'assemblyai',
    token: data.token,
    expiresAt,
    config: (model ? { speech_model: model } : {}) as SpeechToken['config'],
  }
}
