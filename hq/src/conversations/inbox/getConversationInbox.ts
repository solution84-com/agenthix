/**
 * The chat's bar and its Conversations list (design pass, the chat panel): every conversation the signed-in person
 * can open — their own, in their space and in their projects — newest first, each with what is going on in it, and
 * the totals the bar's badge shows. Read with the same rule as the conversation lists (`getConversations`): the
 * person's own, a project's only while they are on it, archived ones left out. A task's thread is the task's and is
 * not listed here. The Chat page's search is over the title, the agent, the place and the last line, which are
 * already in the rows: message bodies are sealed, and a search does not open them in bulk.
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import type { ConversationInbox } from '../../shared/conversations/inbox'
import { inboxTotals } from '../../shared/conversations/inbox'
import { OUTSTANDING_OPERATION_STATES } from '../../shared/conversations/work'
import { projectStanding } from '../../projects/membership'
import { AGENT_SELECT, CONVERSATION_LIST_LIMIT } from '../conversationQueries'
import { toAgentView } from '../primaryAgent'
import { openJson } from '../sealing'
import { UNREAD_KINDS } from '../taskThread/unread'
import { inboxConversationOf, inboxStatusWhere, mayOpen, type InboxFacts, type InboxSource, type Standing } from './inboxRows'

type Ctx = { user?: { id: string } | null }

/** `archived` asks for the archived ones instead (the Chat page's filter), in the same scope. */
export type ConversationInboxArgs = { archived?: boolean } | undefined

export const getConversationInbox = async (args: ConversationInboxArgs, context: Ctx): Promise<ConversationInbox> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const rows = await prisma.conversation.findMany({
    where: { openedById: userId, home: { in: ['PERSON', 'PROJECT'] }, ...inboxStatusWhere(args?.archived === true) },
    select: {
      id: true, home: true, projectId: true, status: true, closedReason: true, title: true, lastSeq: true, lastMessageAt: true,
      activeTurnId: true, agent: AGENT_SELECT,
    },
    orderBy: { lastMessageAt: 'desc' },
    take: CONVERSATION_LIST_LIMIT,
  })
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((id): id is string => id !== null))]
  const [standings, projects] = await Promise.all([
    Promise.all(projectIds.map(async (id) => [id, await projectStanding(id, userId)] as const)),
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, key: true, name: true, personalSpace: true } }),
  ])
  const standingOf = new Map<string, Standing>(standings)
  const projectOf = new Map(projects.map((p) => [p.id, p]))
  const sources: InboxSource[] = rows
    .map((r) => ({ ...r, agent: r.agent ? toAgentView(r.agent) : null, project: r.projectId ? projectOf.get(r.projectId) ?? null : null }))
    .filter((r) => mayOpen(r, (id) => standingOf.get(id) ?? 'none'))
  const facts = await factsOf(sources.map((s) => s.id), userId)
  const conversations = sources.map((s) => inboxConversationOf(s, facts.get(s.id) ?? NO_FACTS))
  return { conversations, ...inboxTotals(conversations) }
}

const NO_FACTS: InboxFacts = { unread: 0, needsYou: 0, otherLiveWork: false, lastText: null }

/** Unread counts, waiting requests, live work and the last line, for every listed conversation in four reads. */
async function factsOf(ids: string[], userId: string): Promise<Map<string, InboxFacts>> {
  const out = new Map<string, InboxFacts>()
  if (ids.length === 0) return out
  const fact = (id: string) => {
    let f = out.get(id)
    if (!f) { f = { ...NO_FACTS }; out.set(id, f) }
    return f
  }
  const inIds = Prisma.join(ids)
  const [unread, work, last] = await Promise.all([
    // What someone else said or what came back since the person's last read (as a task's thread counts it).
    prisma.$queryRaw<{ conversationId: string; unread: number }[]>`
      SELECT m."conversationId", COUNT(*)::int AS unread
      FROM "ConversationMessage" m
      LEFT JOIN "ConversationReader" r ON r."conversationId" = m."conversationId" AND r."userId" = ${userId}
      WHERE m."conversationId" IN (${inIds})
        AND m.seq > COALESCE(r."lastReadSeq", 0)
        AND m.kind::text IN (${Prisma.join(UNREAD_KINDS)})
        AND (m."authorId" IS NULL OR m."authorId" <> ${userId})
      GROUP BY m."conversationId"`,
    prisma.operation.groupBy({
      by: ['conversationId', 'state'],
      where: { conversationId: { in: ids }, state: { in: [...OUTSTANDING_OPERATION_STATES] } },
      _count: { _all: true },
    }),
    // The newest message written by the person or the agent, one per conversation.
    prisma.$queryRaw<{ conversationId: string; role: string; body: string }[]>`
      SELECT DISTINCT ON (m."conversationId") m."conversationId", m.role::text AS role, m.body
      FROM "ConversationMessage" m
      WHERE m."conversationId" IN (${inIds}) AND m.kind::text = 'TEXT' AND m.withdrawn = false
      ORDER BY m."conversationId", m.seq DESC`,
  ])
  for (const u of unread) fact(u.conversationId).unread = u.unread
  for (const w of work) {
    if (w.state === 'WAITING_FOR_APPROVAL') fact(w.conversationId).needsYou += w._count._all
    else fact(w.conversationId).otherLiveWork = true
  }
  for (const l of last) {
    const text = textOf(l.body)
    if (text) fact(l.conversationId).lastText = { byPerson: l.role === 'PERSON', text }
  }
  return out
}

function textOf(sealed: string): string | null {
  try {
    const body = openJson<{ text?: unknown }>(sealed)
    return typeof body?.text === 'string' ? body.text : null
  } catch {
    return null
  }
}
