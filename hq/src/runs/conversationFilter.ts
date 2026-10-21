/**
 * The Runs screen narrowed to one conversation (on-screen spec, A conversation's runs are found from it): the
 * sessions its workers run on, and the sessions of the tasks it commissioned. Who may see the conversation is the
 * reading rule's; the run itself is still opened through its session's own entitlement.
 */
import { prisma } from 'wasp/server'
import { RUN_SESSION_IDS_MAX } from '@agenthix/core'
import { requireConversationReader } from '../conversations/readingRule'
import { agentSelect } from './myRuns'
import type { SessionFacts } from './screenSessions'

export async function sessionsOfConversation(me: string, conversationId: string): Promise<{ facts: Map<string, SessionFacts>; sessionIds: string[] }> {
  const ref = await requireConversationReader(conversationId, me)
  const [conversation, project, taskOperations] = await Promise.all([
    prisma.conversation.findUniqueOrThrow({ where: { id: ref.id }, select: { title: true } }),
    ref.projectId ? prisma.project.findUnique({ where: { id: ref.projectId }, select: { key: true, name: true } }) : Promise.resolve(null),
    prisma.operation.findMany({ where: { conversationId: ref.id, kind: 'TASK', taskId: { not: null } }, select: { taskId: true } }),
  ])
  const sessions = await prisma.agentSession.findMany({
    where: { OR: [{ conversationId: ref.id }, { taskId: { in: taskOperations.map(o => o.taskId!) } }] },
    orderBy: { updatedAt: 'desc' },
    take: RUN_SESSION_IDS_MAX,
    include: { agent: { select: agentSelect } },
  })
  const href = project ? `/projects/${project.key}/t/${ref.id}` : `/chat/t/${ref.id}`
  const place = project ? { name: project.name, projectKey: project.key } : { name: 'Chat', projectKey: null }
  const facts = new Map<string, SessionFacts>()
  for (const s of sessions) {
    facts.set(s.id, {
      sessionId: s.id, kind: 'conversation', title: conversation.title || 'Conversation', ref: null, href, place, agent: s.agent,
      taskRunState: null, startedByText: null, startedBy: { kind: 'person', name: null }, onBehalfOf: null,
    })
  }
  return { facts, sessionIds: [...facts.keys()] }
}
