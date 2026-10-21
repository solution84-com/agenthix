/**
 * The talking model and the access it runs on, written to the conversation (model access and policy spec): fixed
 * once, when the first turn resolves them, and changed afterwards only by the person's say, when the access it
 * opened on stops being usable — the switch then recorded in the thread as a notice.
 */
import { HttpError, prisma } from 'wasp/server'
import type { AppendMessage, ConversationHomeRef, ResolvedAccess } from '../contract'
import { policyModelLabel } from '../../model-policy/policyModels'
import { PROVIDER_LABELS } from '../../shared/modelProviders'
import { resolveConversationAccess } from './conversationAccess'
import { payerLabel, type RefusedAccess } from './homeAccess'
import { refusedFromJson, withRefusal } from './refusedAccess'

const talkingFields = (access: ResolvedAccess) => ({
  talkingModel: access.model,
  talkingProvider: access.provider,
  accessOwnerType: access.owner,
  accessKind: access.kind,
})

/**
 * Fixes the talking model and access of a conversation that has none yet. A conversation that already has one
 * keeps it; the result says whether this call fixed it.
 */
export async function fixTalkingAccess(conversationId: string, access: ResolvedAccess): Promise<boolean> {
  const { count } = await prisma.conversation.updateMany({
    where: { id: conversationId, talkingModel: null },
    data: talkingFields(access),
  })
  return count === 1
}

/**
 * Moves a conversation to the access it is offered, on the person's say. The offer is worked out again here, not
 * taken from the caller, so only an access the home's rule allows can be switched to, and only once the one it
 * talks on is gone. The caller has checked that the person may speak in the conversation.
 */
export async function switchToOfferedAccess(
  conversation: ConversationHomeRef,
  byUserId: string,
  appendMessage: AppendMessage,
  /** The key the provider refused, when the conversation's last turn failed with `auth`: switched away from. */
  refused: RefusedAccess | null = null,
): Promise<ResolvedAccess> {
  const row = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    select: { talkingModel: true, talkingProvider: true, accessOwnerType: true, refusedAccess: true },
  })
  if (!row) throw new HttpError(404, 'Conversation not found')
  if (!row.talkingModel || !row.talkingProvider) throw new HttpError(409, 'This conversation has no model to switch from yet')

  const fixed = { model: row.talkingModel, provider: row.talkingProvider, owner: row.accessOwnerType ?? undefined }
  const { access, offer } = await resolveConversationAccess(conversation, fixed, refused)
  if (access) throw new HttpError(409, 'The model access this conversation talks on is still available')
  if (!offer) throw new HttpError(409, 'There is no other model access to continue on')

  // Conditional on the model it talked on, so two people switching at once record one switch. A refused key is
  // stored, so the conversation never goes back to it.
  const { count } = await prisma.conversation.updateMany({
    where: { id: conversation.id, talkingModel: fixed.model, talkingProvider: fixed.provider, accessOwnerType: row.accessOwnerType },
    data: { ...talkingFields(offer), ...(refused && { refusedAccess: withRefusal(refusedFromJson(row.refusedAccess), refused) }) },
  })
  if (count !== 1) throw new HttpError(409, 'This conversation has already been switched')

  // The notice names no one: its author is the person who switched, shown as the screen shows authors.
  await appendMessage({
    conversationId: conversation.id,
    role: 'PLATFORM',
    kind: 'NOTICE',
    authorId: byUserId,
    body: {
      text: (offer.model === fixed.model
        ? `This conversation now talks on ${payerLabel(offer.owner)} ${PROVIDER_LABELS[offer.provider]} key.`
        : `This conversation moved from ${policyModelLabel(fixed.model)} to ${policyModelLabel(offer.model)}, ` +
          `on ${payerLabel(offer.owner)} ${PROVIDER_LABELS[offer.provider]} key.`),
    },
  })
  return offer
}
