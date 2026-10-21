/**
 * Who may read a conversation, and who may speak in it (conversational experience spec, Where a conversation's
 * record lives; adr-0096). Decided in hq from the conversation's home, before anything is read:
 *
 * - A PERSON or PROJECT home is the person who opened it, alone, whatever their role — anyone else is told it
 *   does not exist, as a chat is today (adr-0041). A PROJECT home also needs them still on its project: someone
 *   who left is told the same — unless it was closed because they left or the project was deleted, which its
 *   opener still reads — and a project's Viewer may read it but not speak in it (adr-0102).
 * - A TASK home is the team's (the overview's task-thread rules, 6): anyone who can see the task — any member of
 *   its project — reads it, and anyone who may work there speaks in it; a Viewer reads only. Its lead is the
 *   task's agent now, filled into the ref; an unassigned task's thread is read and not spoken in. Once its task
 *   is deleted it is closed, and its project's members still read it.
 * - A CLOSED conversation may be read and not spoken in.
 */
import { HttpError, prisma } from 'wasp/server'
import { projectStanding, VIEWER_REFUSAL } from '../projects/membership'
import type { ConversationHomeRef, RequireConversationReader, RequireConversationSpeaker } from './contract'
import { ASSIGN_AN_AGENT } from './taskThread/lead'

export const CONVERSATION_NOT_FOUND = 'Conversation not found'

const CLOSED_BECAUSE: Record<string, string> = {
  LEFT_PROJECT: 'you are no longer a member of its project',
  LEFT_ORGANISATION: 'you are no longer a member of the organisation',
  PROJECT_DELETED: 'its project was deleted',
  TASK_DELETED: 'its task was deleted',
}

export function closedConversationMessage(reason: string | null): string {
  const why = reason ? CLOSED_BECAUSE[reason] : undefined
  return why
    ? `This conversation is closed because ${why}. Its history stays here to read; start a new conversation to keep going.`
    : 'This conversation is closed. Its history stays here to read; start a new conversation to keep going.'
}

type Standing = 'works' | 'reads'

type Row = { id: string; home: ConversationHomeRef['home']; projectId: string | null; taskId: string | null; openedById: string; agentId: string | null; status: string; closedReason: string | null }

/** A task's thread, read by its task's project's members; its lead read from the task. */
async function readableTaskThread(row: Row, userId: string) {
  const task = row.taskId
    ? await prisma.task.findUnique({ where: { id: row.taskId }, select: { projectId: true, assignedAgentId: true } })
    : null
  const projectId = task?.projectId ?? row.projectId
  const now = projectId ? await projectStanding(projectId, userId) : 'none'
  if (now === 'none') throw new HttpError(404, CONVERSATION_NOT_FOUND)
  const ref: ConversationHomeRef = {
    id: row.id, home: row.home, projectId, taskId: row.taskId, openedById: row.openedById, agentId: task?.assignedAgentId ?? null,
  }
  return { ref, standing: now as Standing, status: row.status, closedReason: row.closedReason }
}

/**
 * Closed because its opener left the project, or the project was deleted: still its opener's to read, as their
 * old chats are, though they are no longer on the project. CLOSED, so never spoken in.
 */
export const CLOSED_WITH_ITS_PROJECT = ['LEFT_PROJECT', 'PROJECT_DELETED'] as const

function closedWithItsProject(row: { status: string; closedReason: string | null }): boolean {
  return row.status === 'CLOSED' && (CLOSED_WITH_ITS_PROJECT as readonly string[]).includes(row.closedReason ?? '')
}

async function readable(conversationId: string, userId: string) {
  if (typeof conversationId !== 'string' || conversationId === '') throw new HttpError(404, CONVERSATION_NOT_FOUND)
  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, home: true, projectId: true, taskId: true, openedById: true, agentId: true, status: true, closedReason: true },
  })
  if (!row) throw new HttpError(404, CONVERSATION_NOT_FOUND)
  if (row.home === 'TASK') return readableTaskThread(row, userId)
  if (row.openedById !== userId) throw new HttpError(404, CONVERSATION_NOT_FOUND)

  let standing: Standing = 'works'
  if (row.home === 'PROJECT') {
    const now = row.projectId ? await projectStanding(row.projectId, userId) : 'none'
    if (now === 'none' && !closedWithItsProject(row)) throw new HttpError(404, CONVERSATION_NOT_FOUND)
    standing = now === 'none' ? 'reads' : now
  }
  const ref: ConversationHomeRef = {
    id: row.id, home: row.home, projectId: row.projectId, taskId: row.taskId, openedById: row.openedById, agentId: row.agentId,
  }
  return { ref, standing, status: row.status, closedReason: row.closedReason }
}

/** The conversation as its reader sees it, and why they may not speak in it now — null when they may. */
export async function readConversationAs(conversationId: string, userId: string): Promise<{ ref: ConversationHomeRef; speakingRefusal: string | null }> {
  const found = await readable(conversationId, userId)
  let speakingRefusal: string | null = null
  if (found.status === 'CLOSED') speakingRefusal = closedConversationMessage(found.closedReason)
  else if (found.standing === 'reads') speakingRefusal = `Talking to this project's agents needs the Member or Admin role in it. ${VIEWER_REFUSAL}`
  else if (found.ref.home === 'TASK' && !found.ref.agentId) speakingRefusal = ASSIGN_AN_AGENT
  return { ref: found.ref, speakingRefusal }
}

export const requireConversationReader: RequireConversationReader = async (conversationId, userId) => {
  return (await readable(conversationId, userId)).ref
}

export const requireConversationSpeaker: RequireConversationSpeaker = async (conversationId, userId) => {
  const { ref, speakingRefusal } = await readConversationAs(conversationId, userId)
  if (speakingRefusal) throw new HttpError(409, speakingRefusal)
  return ref
}
