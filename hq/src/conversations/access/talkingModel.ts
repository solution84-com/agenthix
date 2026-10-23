/**
 * The model a conversation talks on (models from one place, part 4 and part 1, *When a provider fails*), through the
 * one resolver. It is fixed at the first turn — the agent's default, else the organisation's — and changed only by the
 * person: by picking another (modelChoice.ts), or by taking the one offer made when the model it talks on cannot be
 * used now (`switchToOffer`). A provider that stops working never switches a conversation silently, and one that
 * comes back switches nobody back.
 *
 * Titles and summaries are made on the conversation's own model (`purpose`).
 */
import { HttpError, prisma } from 'wasp/server'
import { modelViaProviderLabel, type ModelViaProvider, type ResolveRequest, type Resolution, type UsagePurpose } from '@agenthix/core'
import type { AppendMessage, ConversationHomeRef, ModelOffer, ResolveConversationAccess, ResolvedAccess } from '../contract'
import { conversationOffer, resolve } from '../../routing/resolver'
import { hqCallAccess } from '../../routing/reaching'
import { placeOfConversation } from '../../routing/place'
import { modelLabel } from '../../routing/modelKeys'
import { costingOf } from '../../billing/costing'

/** How a model via a provider is shown: `Claude Sonnet 5 · via Anthropic`. */
export async function choiceLabel(choice: ModelViaProvider): Promise<string> {
  const p = await prisma.aiProvider.findUnique({ where: { id: choice.providerId }, select: { name: true, vendor: true } })
  return p ? modelViaProviderLabel(modelLabel(p.vendor, choice.model), p.name) : choice.model
}

/** A picker's value for a model via a provider: the provider's id, then the model as its vendor names it. */
export const choiceValue = (c: ModelViaProvider) => `${c.providerId}/${c.model}`

export function parseChoiceValue(value: unknown): ModelViaProvider | null {
  if (typeof value !== 'string') return null
  const slash = value.indexOf('/')
  if (slash <= 0 || slash === value.length - 1) return null
  return { providerId: value.slice(0, slash), model: value.slice(slash + 1) }
}

export async function talkingRequest(
  ref: ConversationHomeRef, userId: string | null, purpose: UsagePurpose = 'conversation',
): Promise<ResolveRequest> {
  return {
    purpose,
    place: await placeOfConversation(ref),
    ...(ref.agentId ? { agentId: ref.agentId } : {}),
    ...(userId ? { userId } : {}),
    ...(ref.id ? { conversationId: ref.id } : {}),
  }
}

async function offerOf(req: ResolveRequest): Promise<ModelOffer | null> {
  if (!req.conversationId) return null
  const offer = await conversationOffer({ ...req, conversationId: req.conversationId })
  return offer ? { ...offer, label: await choiceLabel(offer) } : null
}

async function fellBackNotice(r: Resolution): Promise<string | undefined> {
  if (!r.fellBack) return undefined
  return `${await choiceLabel(r.fellBack.from)} isn't available here, so this conversation talks on ${await choiceLabel(r.model)}.`
}

const HQ_CALL_REFUSED = 'This conversation cannot talk through that provider yet. Choose another model.'

/** The access for the conversation's next call: its reply, its title or its summary. */
export async function resolveTalkingFor(
  ref: ConversationHomeRef, userId: string | null, purpose: UsagePurpose,
): ReturnType<ResolveConversationAccess> {
  const req = await talkingRequest(ref, userId, purpose)
  const answer = await resolve(req)
  if (!answer.ok) return { access: null, problem: answer.problem.message, offer: await offerOf(req) }
  const access = await hqCallAccess(answer.resolution)
  if (!access) return { access: null, problem: HQ_CALL_REFUSED, offer: null }
  return { access: { ...access, costing: costingOf(answer.resolution, req) }, problem: null, offer: null, notice: await fellBackNotice(answer.resolution) }
}

export const resolveTalking: ResolveConversationAccess = (ref, userId) => resolveTalkingFor(ref, userId, 'conversation')

/** Fixes the model of a conversation that has none yet; one that has one keeps it. Whether this call fixed it. */
export async function fixTalkingAccess(conversationId: string, access: ResolvedAccess): Promise<boolean> {
  const { count } = await prisma.conversation.updateMany({
    where: { id: conversationId, talkingModel: null },
    data: { talkingModel: access.model, talkingProviderId: access.providerId },
  })
  return count === 1
}

/** The person messages the latest turn took, when it failed: sent again after a switch. */
async function failedInputs(conversationId: string): Promise<string[]> {
  const turn = await prisma.inferenceTurn.findFirst({
    where: { conversationId, endedAt: { not: null } }, orderBy: { endedAt: 'desc' }, select: { id: true, state: true },
  })
  if (!turn || turn.state !== 'FAILED') return []
  const rows = await prisma.conversationMessage.findMany({ where: { turnId: turn.id, role: 'PERSON', kind: 'TEXT' }, select: { id: true } })
  return rows.map(r => r.id)
}

/**
 * Moves a conversation onto the model it is offered, on the person's say, writes *Switched to …* in its thread, and
 * sends the message its failed turn took again. The offer is worked out again here, never taken from the caller, so
 * only what the resolver would offer can be switched to, and only while the model it talks on cannot be used. The
 * caller has checked that the person may speak in the conversation.
 */
export async function switchToOffer(ref: ConversationHomeRef, byUserId: string, appendMessage: AppendMessage): Promise<ModelOffer> {
  const row = await prisma.conversation.findUnique({ where: { id: ref.id }, select: { talkingModel: true, talkingProviderId: true } })
  if (!row) throw new HttpError(404, 'Conversation not found')
  if (!row.talkingModel || !row.talkingProviderId) throw new HttpError(409, 'This conversation has no model to switch from yet')
  const req = await talkingRequest(ref, byUserId)
  if ((await resolve(req)).ok) throw new HttpError(409, 'The model this conversation talks on works')
  const offer = await offerOf(req)
  if (!offer) throw new HttpError(409, 'There is no other model to continue on')

  // Conditional on the model it talked on, so two people switching at once record one switch.
  const { count } = await prisma.conversation.updateMany({
    where: { id: ref.id, talkingModel: row.talkingModel, talkingProviderId: row.talkingProviderId },
    data: { talkingModel: offer.model, talkingProviderId: offer.providerId },
  })
  if (count !== 1) throw new HttpError(409, 'This conversation has already been switched')

  await appendMessage({ conversationId: ref.id, role: 'PLATFORM', kind: 'NOTICE', authorId: byUserId, body: { text: `Switched to ${offer.label}` } })
  const resend = await failedInputs(ref.id)
  if (resend.length > 0) {
    await prisma.conversationMessage.updateMany({ where: { id: { in: resend } }, data: { turnId: null, queueState: null } })
  }
  return offer
}
