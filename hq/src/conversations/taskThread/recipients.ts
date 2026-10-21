/**
 * Who a task's thread notifies (the overview's task-thread rules, 7): everyone who has spoken in it, and the
 * person the task is on behalf of — each only while they can still see the task and are in the organisation.
 */
import { prisma } from 'wasp/server'
import { projectStanding } from '../../projects/membership'

/** The people who have spoken in a thread: the authors of its people's messages and answers, first spoken first. */
export async function speakersOf(conversationId: string): Promise<string[]> {
  const rows = await prisma.conversationMessage.findMany({
    where: { conversationId, role: 'PERSON', authorId: { not: null } },
    select: { authorId: true },
    distinct: ['authorId'],
    orderBy: { seq: 'asc' },
  })
  return rows.map(r => r.authorId!)
}

export async function taskThreadRecipients(conversation: { id: string; taskId: string | null; projectId: string | null }): Promise<string[]> {
  const task = conversation.taskId
    ? await prisma.task.findUnique({ where: { id: conversation.taskId }, select: { projectId: true, onBehalfOfUserId: true } })
    : null
  if (!task) return []
  const candidates = [...new Set([...(await speakersOf(conversation.id)), task.onBehalfOfUserId])]
  const active = await prisma.user.findMany({ where: { id: { in: candidates }, deactivatedAt: null }, select: { id: true } })
  const here = new Set(active.map(u => u.id))
  const recipients: string[] = []
  for (const userId of candidates) {
    if (here.has(userId) && (await projectStanding(task.projectId, userId)) !== 'none') recipients.push(userId)
  }
  return recipients
}
