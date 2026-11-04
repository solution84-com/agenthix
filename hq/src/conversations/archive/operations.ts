/**
 * Archive and finding a conversation's runs (on-screen spec, Archive; A conversation's runs are found from it).
 * Only the person who opened a conversation keeps, reopens or searches it; the reading rule decides who that is.
 * Keeping and reopening change it, so they need the standing to talk in it: a Viewer of a project reads a task's thread and does neither.
 */
import { HttpError, prisma } from 'wasp/server'
import { displaySiteName } from '../../shared/siteName'
import * as siteRuntimeStore from '../../sessions/siteRuntimeStore'
import { projectStanding } from '../../projects/membership'
import type {
  ArchivedConversationsView,
  ConversationRunHits,
  GetArchivedConversationsArgs,
  ReopenConversationArgs,
  SearchConversationRunsArgs,
  SetConversationKeepArgs,
} from '../../shared/conversations/protocol'
import { requireConversationSpeaker } from '../readingRule'
import { openText } from '../sealing'
import { archivedConversations } from './archivedList'
import { RUN_SEARCH_MAX_RUNS, searchRuns } from './runSearch'

type Ctx = { user?: { id: string } | null }

function requireUser(context: Ctx): string {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user.id
}

export const setConversationKeep = async (args: SetConversationKeepArgs, context: Ctx): Promise<void> => {
  const userId = requireUser(context)
  if (typeof args?.keep !== 'boolean') throw new HttpError(400, 'Say whether to keep it out of archiving')
  const ref = await requireConversationSpeaker(args.conversationId, userId)
  await prisma.conversation.update({ where: { id: ref.id }, data: { keep: args.keep } })
}

/** An archived conversation is open again; it is not archived again until it has been idle for the whole period. */
export const reopenConversation = async (args: ReopenConversationArgs, context: Ctx): Promise<void> => {
  const userId = requireUser(context)
  const ref = await requireConversationSpeaker(args?.conversationId, userId)
  const { count } = await prisma.conversation.updateMany({ where: { id: ref.id, status: 'ARCHIVED' }, data: { status: 'ACTIVE', archivedAt: null } })
  if (count === 0) throw new HttpError(409, 'Only an archived conversation can be reopened')
}

export const getArchivedConversations = async (args: GetArchivedConversationsArgs, context: Ctx): Promise<ArchivedConversationsView> => {
  const userId = requireUser(context)
  if (args?.home === 'PROJECT') {
    if (!args.projectId) throw new HttpError(400, 'A project conversation needs its project')
    if ((await projectStanding(args.projectId, userId)) === 'none') throw new HttpError(404, 'Project not found')
  } else if (args?.home !== 'PERSON') {
    throw new HttpError(400, 'Conversations are listed in your own space or in a project')
  }
  const query = typeof args.query === 'string' ? args.query.slice(0, 100) : undefined
  const conversations = await archivedConversations(
    { openedById: userId, home: args.home, ...(args.home === 'PROJECT' ? { projectId: args.projectId } : {}) },
    query,
  )
  return { conversations }
}

/** What the conversation's runs said, asked of their sites only now; a site that cannot answer is named. */
export const searchConversationRuns = async (args: SearchConversationRunsArgs, context: Ctx): Promise<ConversationRunHits> => {
  const userId = requireUser(context)
  const ref = await requireConversationSpeaker(args?.conversationId, userId)
  const query = typeof args.query === 'string' ? args.query.trim().slice(0, 100) : ''
  if (!query) return { hits: [], unavailable: [] }
  const rows = await prisma.operation.findMany({
    where: { conversationId: ref.id, siteId: { not: null }, runId: { not: null } },
    select: { siteId: true, runId: true, title: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: RUN_SEARCH_MAX_RUNS,
  })
  const operations = rows.map(r => ({ siteId: r.siteId!, runId: r.runId!, title: openText(r.title), at: r.createdAt }))
  return searchRuns(operations, query, {
    getRun: siteRuntimeStore.getRun,
    siteName: async (siteId) => {
      const site = await prisma.executionSite.findUnique({ where: { siteId }, select: { label: true, isDefault: true } }).catch(() => null)
      return site ? displaySiteName(site) : siteId
    },
  })
}
