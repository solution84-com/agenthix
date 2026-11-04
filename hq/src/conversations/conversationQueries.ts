/**
 * What a person reads of their conversations (conversational experience spec, On screen): the list in a home,
 * one conversation, and its messages a page at a time, newest first. Every read passes the reading rule.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Agent, Conversation } from '@prisma/client'
import {
  MESSAGE_PAGE_SIZE,
  type ConversationPage,
  type ConversationSummaryView,
  type ConversationView,
  type GetConversationArgs,
  type GetConversationMessagesArgs,
  type GetConversationsArgs,
} from '../shared/conversations/protocol'
import { projectStanding } from '../projects/membership'
import { CLOSED_WITH_ITS_PROJECT, readConversationAs, requireConversationReader } from './readingRule'
import { readMessages, readWaitingMessages } from './store/messages'
import { toAgentView } from './primaryAgent'
import { choiceValue, resolveTalking } from './access/talkingModel'
import { loadVoiceFacts, voiceStartedAt, voiceView } from './voice/availability'
import { peopleOf } from './people'

type Ctx = { user?: { id: string } | null }

/** How many conversations one list holds: the most recent. */
export const CONVERSATION_LIST_LIMIT = 200

export const AGENT_SELECT = { select: { id: true, name: true, handle: true, avatarUrl: true } } as const
type WithAgent = Conversation & { agent: Pick<Agent, 'id' | 'name' | 'handle' | 'avatarUrl'> | null }

function requireUser(context: Ctx): string {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user.id
}

async function agentRow(agentId: string | null): Promise<WithAgent['agent']> {
  return agentId ? prisma.agent.findUnique({ where: { id: agentId }, ...AGENT_SELECT }) : null
}

export function toSummaryView(row: WithAgent): ConversationSummaryView {
  return {
    id: row.id,
    home: row.home,
    projectId: row.projectId,
    taskId: row.taskId,
    title: row.title,
    status: row.status,
    closedReason: row.closedReason,
    agent: row.agent ? toAgentView(row.agent) : null,
    lastMessageAt: row.lastMessageAt.toISOString(),
  }
}

/** The person's own conversations in their space or in a project, most recent first; archived ones are left out. */
export const getConversations = async (args: GetConversationsArgs, context: Ctx): Promise<ConversationSummaryView[]> => {
  const userId = requireUser(context)
  // Someone no longer on the project still sees the conversations that closed when they left it or it was deleted.
  let onlyClosedWithIt = false
  if (args?.home === 'PROJECT') {
    if (!args.projectId) throw new HttpError(400, 'A project conversation needs its project')
    onlyClosedWithIt = (await projectStanding(args.projectId, userId)) === 'none'
  } else if (args?.home !== 'PERSON') {
    throw new HttpError(400, 'Conversations are listed in your own space or in a project')
  }
  const rows = await prisma.conversation.findMany({
    where: {
      openedById: userId,
      home: args.home,
      ...(args.home === 'PROJECT' ? { projectId: args.projectId } : {}),
      ...(onlyClosedWithIt
        ? { status: 'CLOSED' as const, closedReason: { in: [...CLOSED_WITH_ITS_PROJECT] } }
        : { status: { not: 'ARCHIVED' as const } }),
    },
    include: { agent: AGENT_SELECT },
    orderBy: { lastMessageAt: 'desc' },
    take: CONVERSATION_LIST_LIMIT,
  })
  if (onlyClosedWithIt && rows.length === 0) throw new HttpError(404, 'Project not found')
  return rows.map(toSummaryView)
}

export const getConversation = async (args: GetConversationArgs, context: Ctx): Promise<ConversationView> => {
  return conversationViewFor(args?.conversationId, requireUser(context))
}

/** One conversation as this person sees it, through the reading rule. A task's thread shows its task's agent now. */
export async function conversationViewFor(conversationId: string, userId: string): Promise<ConversationView> {
  const { ref, speakingRefusal } = await readConversationAs(conversationId, userId)
  const found = await prisma.conversation.findUniqueOrThrow({ where: { id: ref.id }, include: { agent: AGENT_SELECT } })
  const row: WithAgent = ref.home === 'TASK' ? { ...found, agent: await agentRow(ref.agentId) } : found
  const access = speakingRefusal === null ? await accessState(ref, userId) : { accessProblem: null, accessOffer: null }
  const [voiceFacts, startedAt, people] = await Promise.all([
    loadVoiceFacts({ agentId: ref.agentId, holderId: row.voiceHolderId, speakingRefusal, accessProblem: access.accessProblem }),
    row.voiceHolderId ? voiceStartedAt(ref.id) : null,
    peopleOf(ref.id),
  ])
  return {
    ...toSummaryView(row),
    openedById: row.openedById,
    talkingModel: row.talkingModel && row.talkingProviderId ? choiceValue({ providerId: row.talkingProviderId, model: row.talkingModel }) : null,
    activeTurnId: row.activeTurnId,
    waiting: await readWaitingMessages(ref.id),
    ...access,
    canSpeak: speakingRefusal === null,
    voice: voiceView(voiceFacts, userId, startedAt),
    people,
    keep: row.keep,
  }
}

/**
 * Whether the conversation can be answered now, and what to do if not (models from one place, part 1, *When a
 * provider fails*): resolved once per view — for the model it talks on once one is fixed, otherwise as its first turn
 * would, so a person is told before they send. A provider that is not working counts as unreachable; the offer is
 * the one switch the person may take.
 */
export async function accessState(
  ref: Awaited<ReturnType<typeof readConversationAs>>['ref'],
  userId: string,
): Promise<Pick<ConversationView, 'accessProblem' | 'accessOffer'>> {
  const { problem, offer } = await resolveTalking(ref, userId)
  return { accessProblem: problem, accessOffer: offer ? { label: offer.label } : null }
}

/** A page of the thread, newest first: `beforeSeq` pages back from there. */
export const getConversationMessages = async (args: GetConversationMessagesArgs, context: Ctx): Promise<ConversationPage> => {
  const userId = requireUser(context)
  const ref = await requireConversationReader(args?.conversationId, userId)
  if (args.limit !== undefined && !Number.isInteger(args.limit)) throw new HttpError(400, 'limit is a number of messages')
  const limit = Math.min(Math.max(args.limit ?? MESSAGE_PAGE_SIZE, 1), MESSAGE_PAGE_SIZE)
  if (args.beforeSeq !== undefined && !Number.isInteger(args.beforeSeq)) throw new HttpError(400, 'beforeSeq is a message number')
  const rows = await readMessages(ref.id, { beforeSeq: args.beforeSeq, limit: limit + 1 })
  return { messages: rows.slice(0, limit), hasMore: rows.length > limit }
}
