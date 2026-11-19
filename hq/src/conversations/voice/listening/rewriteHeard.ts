/**
 * The stored agent message a skipped line is taken out of (unheard.ts): read and written under the conversation's lock,
 * the edit given the text as stored now, so it never works from a stale copy. Only the text changes.
 */
import { prisma } from 'wasp/server'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import { openJson, sealJson } from '../../sealing'
import { toMessageView } from '../../store/messages'
import type { RewriteTarget } from './unheard'

/** The message as edited, or null when there was none to edit or `edit` left it. */
export async function rewriteAgentText(
  conversationId: string, target: RewriteTarget, edit: (text: string) => string | null,
): Promise<ConversationMessageView | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`
    const row = await tx.conversationMessage.findFirst({
      where: { conversationId, role: 'AGENT', kind: 'TEXT', ...(target.messageId ? { id: target.messageId } : { turnId: target.turnId }) },
      orderBy: { seq: 'asc' },
    })
    if (!row) return null
    const view = toMessageView(row)
    if (view.kind !== 'TEXT') return null
    const next = edit(view.body.text)
    if (next === null || next === view.body.text) return null
    const body = openJson<Record<string, unknown>>(row.body)
    const updated = await tx.conversationMessage.update({ where: { id: row.id }, data: { body: sealJson({ ...body, text: next }) } })
    return toMessageView(updated)
  })
}
