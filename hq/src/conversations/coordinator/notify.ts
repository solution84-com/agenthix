/**
 * The notification a card brings (conversation layer spec, A completion while a reply streams, 4): after the
 * reply that presents it, that reply's first line — the agent's words, not a system line; when no reply can run
 * (the conversation is closed, its access unusable), the card's own line. To the conversation's reader, linked to
 * the conversation, with its conversation and operation set. One per card, however often asked.
 *
 * A task's thread notifies everyone who has spoken in it and the person the task is for (taskThread/recipients.ts),
 * titled with the task's agent now.
 */
import { HttpError, prisma } from 'wasp/server'
import { CONVERSATION_NOTIFICATION_TYPES, taskActionUrl } from '../../notifications/notificationKinds'
import { requireConversationReader } from '../readingRule'
import { toMessageView } from '../store/messages'
import { threadPath } from '../threadPaths'
import type { ConversationMessageView } from '../../shared/conversations/protocol'
import { approvalLine, firstLine, resultLine } from './cards'
import { taskThreadRecipients } from '../taskThread/recipients'
import { notificationsChanged } from '../../server/personEvents'

export const OPEN_CONVERSATION = 'Open the conversation'

type Card = Extract<ConversationMessageView, { kind: 'RESULT' | 'APPROVAL_REQUEST' }>

export interface CardNotice {
  conversationId: string
  card: Card
  /** The line it carries: the reply's first line, or the card's own. */
  line: string
  /** Whether any card it stands for asks for approval. */
  approval: boolean
}

export function cardLine(card: Card): string {
  return card.kind === 'RESULT' ? resultLine(card.body) : approvalLine(card.body)
}

async function readersOf(conversation: { id: string; home: string; openedById: string; taskId: string | null; projectId: string | null }): Promise<string[]> {
  if (conversation.home === 'TASK') return taskThreadRecipients(conversation)
  try {
    await requireConversationReader(conversation.id, conversation.openedById)
    return [conversation.openedById]
  } catch (err) {
    if (err instanceof HttpError) return []
    throw err
  }
}

async function linkOf(conversation: { id: string; home: string; projectId: string | null; taskId: string | null }): Promise<string | null> {
  if (conversation.home === 'PERSON') return threadPath('/chat', conversation.id)
  if (conversation.home === 'PROJECT' && conversation.projectId) {
    const project = await prisma.project.findUnique({ where: { id: conversation.projectId }, select: { key: true, personalOwnerId: true } })
    if (!project) return null
    return project.personalOwnerId ? threadPath('/chat', conversation.id) : threadPath(`/projects/${project.key}`, conversation.id)
  }
  if (conversation.taskId) {
    const task = await prisma.task.findUnique({ where: { id: conversation.taskId }, select: { number: true, project: { select: { key: true } } } })
    return task ? taskActionUrl(`${task.project.key}-${task.number}`) : null
  }
  return null
}

async function taskAgentName(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { assignedAgent: { select: { name: true } } } })
  return task?.assignedAgent?.name ?? null
}

export async function notifyCard(notice: CardNotice): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: notice.conversationId },
    select: { id: true, home: true, openedById: true, projectId: true, taskId: true, agent: { select: { name: true } } },
  })
  if (!conversation) return
  const agentName = conversation.agent?.name ?? (conversation.taskId ? await taskAgentName(conversation.taskId) : null)
  const readers = await readersOf(conversation)
  if (readers.length === 0) return
  const type = notice.approval ? CONVERSATION_NOTIFICATION_TYPES.approval : CONVERSATION_NOTIFICATION_TYPES.result
  const subjectKey = `card:${notice.card.id}`
  const actionUrl = await linkOf(conversation)
  for (const userId of readers) {
    const already = await prisma.notification.findFirst({ where: { userId, subjectKey, type: { in: Object.values(CONVERSATION_NOTIFICATION_TYPES) } }, select: { id: true } })
    if (already) continue
    await prisma.notification.create({
      data: {
        userId,
        type,
        title: agentName ?? notice.card.body.title,
        body: notice.line,
        actionLabel: OPEN_CONVERSATION,
        actionUrl,
        subjectKey,
        conversationId: conversation.id,
        operationId: notice.card.operationId,
      },
    })
    notificationsChanged([userId])
  }
}

/**
 * After a reply that answered no person: its first line, about the first card it took; when it said nothing — it
 * failed, its access unusable — each card's own line.
 */
export async function notifyAfterCardTurn(conversationId: string, turnId: string, text: string | null): Promise<void> {
  const rows = await prisma.conversationMessage.findMany({
    where: { conversationId, turnId, role: 'PLATFORM', kind: { in: ['RESULT', 'APPROVAL_REQUEST'] } },
    orderBy: { seq: 'asc' },
  })
  const cards = rows.map(toMessageView) as Card[]
  const first = cards[0]
  if (!first) return
  const line = firstLine(text)
  if (line) {
    await notifyCard({ conversationId, card: first, line, approval: cards.some(c => c.kind === 'APPROVAL_REQUEST') })
    return
  }
  for (const card of cards) await notifyCard({ conversationId, card, line: cardLine(card), approval: card.kind === 'APPROVAL_REQUEST' })
}
