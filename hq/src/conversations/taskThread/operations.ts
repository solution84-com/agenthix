/**
 * A task's thread (the overview's task-thread rules, 6 and 7; on-screen spec, A task's thread): at most one per
 * task, created by the first message on the task's page, read by anyone who can see the task and spoken in by
 * anyone who may work in its project. Its lead is the task's agent now; its turns pay on the project's key, then
 * the organisation's (access/homeAccess.ts). The board marks each task that has one with this viewer's unread
 * count, kept as how far they have read.
 */
import { Prisma } from '@prisma/client'
import { HttpError, prisma } from 'wasp/server'
import {
  MESSAGE_MAX_CHARS,
  type MarkConversationReadArgs,
  type StartConversationResult,
  type StartTaskConversationArgs,
  type TaskConversationArgs,
  type TaskConversationView,
  type TaskThreadMark,
  type TaskThreadMarksArgs,
} from '../../shared/conversations/protocol'
import { projectStanding, VIEWER_REFUSAL } from '../../projects/membership'
import { requireProjectVisible, requireTaskVisible } from '../../projects/resourceEntitlement'
import { readConversationAs, requireConversationReader } from '../readingRule'
import { conversationViewFor } from '../conversationQueries'
import { admitMessage } from '../coordinator/admission'
import { appendMessageIn } from '../store/messages'
import { afterMessageAdmitted } from '../afterAdmission'
import { toAgentView } from '../primaryAgent'
import { ASSIGN_AN_AGENT } from './lead'
import { UNREAD_KINDS } from './unread'

type Ctx = { user?: { id: string } | null }

/** The longest client message id taken, as for any message. */
const CLIENT_ID_MAX = 100

export const TALKING_HERE_NEEDS_WORK = `Talking on this task needs the Member or Admin role in its project. ${VIEWER_REFUSAL}`

function requireUser(context: Ctx): string {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user.id
}

function requireTaskId(args: { taskId?: unknown } | undefined): string {
  if (typeof args?.taskId !== 'string' || args.taskId === '') throw new HttpError(400, 'Name the task')
  return args.taskId
}

async function taskOf(taskId: string) {
  return prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { id: true, projectId: true, assignedAgent: { select: { id: true, name: true, handle: true, avatarUrl: true, role: true } } },
  })
}

/** Why this person may not start the task's thread now; null when they may. */
async function startRefusal(task: Awaited<ReturnType<typeof taskOf>>, userId: string): Promise<string | null> {
  if ((await projectStanding(task.projectId, userId)) !== 'works') return TALKING_HERE_NEEDS_WORK
  return task.assignedAgent ? null : ASSIGN_AN_AGENT
}

export const getTaskConversation = async (args: TaskConversationArgs, context: Ctx): Promise<TaskConversationView> => {
  const userId = requireUser(context)
  const taskId = requireTaskId(args)
  await requireTaskVisible(taskId, userId)
  const task = await taskOf(taskId)
  const lead = task.assignedAgent ? toAgentView(task.assignedAgent) : null
  const thread = await prisma.conversation.findUnique({ where: { taskId }, select: { id: true } })
  if (thread) {
    const conversation = await conversationViewFor(thread.id, userId)
    const refusal = conversation.canSpeak ? null : await speakingRefusalOf(thread.id, userId)
    return { conversation, canStart: false, refusal, lead }
  }
  const refusal = await startRefusal(task, userId)
  return { conversation: null, canStart: refusal === null, refusal, lead }
}

async function speakingRefusalOf(conversationId: string, userId: string): Promise<string | null> {
  return (await readConversationAs(conversationId, userId)).speakingRefusal
}

function requireMessage(args: StartTaskConversationArgs): { text: string; clientMessageId: string } {
  const text = typeof args?.text === 'string' ? args.text.trim() : ''
  if (text === '') throw new HttpError(400, 'Write a message to start the conversation')
  if (text.length > MESSAGE_MAX_CHARS) throw new HttpError(400, `A message can be at most ${MESSAGE_MAX_CHARS} characters`)
  const { clientMessageId } = args
  if (typeof clientMessageId !== 'string' || clientMessageId === '' || clientMessageId.length > CLIENT_ID_MAX) {
    throw new HttpError(400, 'A message needs the id its client gave it')
  }
  return { text, clientMessageId }
}

/** Into the thread that exists: the message is admitted as any sent message is, the same id stored once. */
async function sendInto(conversationId: string, text: string, clientMessageId: string, userId: string): Promise<StartConversationResult> {
  const { messageId } = await admitMessage({ conversationId, text, clientMessageId }, userId)
  return { conversationId, messageId }
}

/**
 * The first message on a task's page: creates the task's thread with it, or — when someone else started it
 * meanwhile — sends it into that one. Its talking model is fixed at its first turn from the project's policy, as
 * every conversation's is; nobody picks one here.
 */
export const startTaskConversation = async (args: StartTaskConversationArgs, context: Ctx): Promise<StartConversationResult> => {
  const userId = requireUser(context)
  const taskId = requireTaskId(args)
  const { text, clientMessageId } = requireMessage(args)
  await requireTaskVisible(taskId, userId)

  const existing = await prisma.conversation.findUnique({ where: { taskId }, select: { id: true } })
  if (existing) return sendInto(existing.id, text, clientMessageId, userId)

  const task = await taskOf(taskId)
  const refusal = await startRefusal(task, userId)
  if (refusal) throw new HttpError(task.assignedAgent ? 403 : 409, refusal)

  let created: { conversationId: string; message: Awaited<ReturnType<typeof appendMessageIn>>['message'] }
  try {
    created = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: { home: 'TASK', taskId, projectId: task.projectId, openedById: userId, agentId: null },
        select: { id: true },
      })
      const { message } = await appendMessageIn(tx, {
        conversationId: conversation.id, role: 'PERSON', kind: 'TEXT', body: { text }, authorId: userId, clientMessageId,
      })
      return { conversationId: conversation.id, message }
    })
  } catch (err) {
    // Two first messages at once: the one that lost the race goes into the thread the other made.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.conversation.findUnique({ where: { taskId }, select: { id: true } })
      if (winner) return sendInto(winner.id, text, clientMessageId, userId)
    }
    throw err
  }
  await afterMessageAdmitted(created.conversationId, created.message)
  return { conversationId: created.conversationId, messageId: created.message.id }
}

/** The board's thread marks: each task in the project with a thread, and how much of it this viewer has not read. */
export const getTaskThreadMarks = async (args: TaskThreadMarksArgs, context: Ctx): Promise<TaskThreadMark[]> => {
  const userId = requireUser(context)
  if (typeof args?.projectId !== 'string' || args.projectId === '') throw new HttpError(400, 'Name the project')
  await requireProjectVisible(args.projectId, userId)
  const threads = await prisma.conversation.findMany({
    where: { home: 'TASK', projectId: args.projectId, status: { not: 'CLOSED' }, taskId: { not: null } },
    select: { id: true, taskId: true, readers: { where: { userId }, select: { lastReadSeq: true } } },
  })
  return Promise.all(threads.map(async (t) => ({
    taskId: t.taskId!,
    conversationId: t.id,
    unread: await prisma.conversationMessage.count({
      where: {
        conversationId: t.id,
        seq: { gt: t.readers[0]?.lastReadSeq ?? 0 },
        kind: { in: [...UNREAD_KINDS] },
        OR: [{ authorId: null }, { authorId: { not: userId } }],
      },
    }),
  })))
}

/** This person has read the conversation up to `throughSeq`: never backwards, never past its last message. */
export const markConversationRead = async (args: MarkConversationReadArgs, context: Ctx): Promise<void> => {
  const userId = requireUser(context)
  const ref = await requireConversationReader(args?.conversationId, userId)
  if (!Number.isInteger(args.throughSeq) || args.throughSeq < 0) throw new HttpError(400, 'throughSeq is a message number')
  const { lastSeq } = await prisma.conversation.findUniqueOrThrow({ where: { id: ref.id }, select: { lastSeq: true } })
  const through = Math.min(args.throughSeq, lastSeq)
  await prisma.conversationReader.upsert({
    where: { conversationId_userId: { conversationId: ref.id, userId } },
    create: { conversationId: ref.id, userId, lastReadSeq: through },
    update: {},
  })
  await prisma.conversationReader.updateMany({
    where: { conversationId: ref.id, userId, lastReadSeq: { lt: through } },
    data: { lastReadSeq: through },
  })
}
