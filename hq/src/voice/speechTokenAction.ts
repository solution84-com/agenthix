import { HttpError } from 'wasp/server'
import { type GetSpeechToken } from 'wasp/server/operations'
import { reportCall } from '../routing/resolver'
import { sealSttTicket } from '../billing/sources/voice'
import { requireConversationSpeaker } from '../conversations/readingRule'
import type { SpeechScope } from './speechAccess'
import { scopeOfConversation } from './speechScope'
import type { TicketedSpeechToken } from './ticketedToken'
import { hearingWays, hearsOf } from './hearingAccess'
import { mintSpeechToken } from './speechMint'

/**
 * `agentId` picks that agent's own speech to text; without it the organisation's default is used. `conversationId`
 * says where the person is talking, so the session is costed to that place; without it, to the organisation's.
 * `hears` names the services the client can stream to (`inworld`, `assemblyai`); a client that names none is given
 * AssemblyAI only. When a token cannot be minted on one way of hearing, the next is tried.
 */
export const getSpeechToken: GetSpeechToken<{ agentId?: string; conversationId?: string; hears?: string[] } | void, TicketedSpeechToken> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // A token lets the client stream speech to the organisation's speech-to-text account. Everyone may talk to
  // agents in their own Chat (adr-0102), so everyone signed in may have one.

  let scope: SpeechScope = { userId: context.user.id }
  if (args?.conversationId) {
    scope = await scopeOfConversation(await requireConversationSpeaker(args.conversationId, context.user.id), context.user.id)
  }
  const answer = await hearingWays(args?.agentId, scope, hearsOf(args?.hears))
  if (!answer.ok) throw new HttpError(503, answer.reason)

  let last = ''
  for (const access of answer.ways) {
    const got = await mintSpeechToken(access)
    if (!got.ok) {
      if (got.failure.kind) reportCall(access.providerId, got.failure.kind, got.failure.detail)
      last = got.failure.message
      continue
    }
    reportCall(access.providerId, null)
    const { providerId, providerName, vendor, model, costing } = access
    // The browser streams to the speech service itself; the ticket is how hq counts what it streamed.
    const { ticket } = sealSttTicket({ providerId, providerName, vendor, model, costing }, context.user.id, new Date())
    return { ticket, ...got.minted }
  }
  throw new HttpError(502, last)
}
