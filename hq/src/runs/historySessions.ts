/**
 * The sessions the Runs history asks the sites about, and what the list says of each beyond the run itself. A
 * project's Runs: every task's session in it and every reply in its conversations. The organisation's Runs: the
 * person's own, their tasks' sessions (`mineWhere`) and their own replies. Narrowed to one conversation: its replies and
 * the tasks it made. A reply is named by its conversation's title only for the person whose conversation it is
 * (ADR-0077); for anyone else it is "A reply in a conversation", and its run cannot be opened.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { RUN_SESSION_IDS_MAX } from '@agenthix/core'
import { requireConversationReader } from '../conversations/readingRule'
import { requireProjectVisible } from '../projects/resourceEntitlement'
import { needOf } from '../projects/workroom/workroomRules'
import { entitledProjectsFilter } from '../projects/membership'
import { mineWhere, namesOf } from './myRuns'
import { taskKeyOf } from './screenFilters'
import type { RunTaskFacts } from './historyRules'
import type { HistoryFilters } from './historyRules'

export type HistorySession = {
  sessionId: string
  kind: 'task' | 'reply'
  title: string
  taskKey: string | null
  taskId: string | null
  href: string | null
  openable: boolean
  place: { name: string; projectKey: string | null }
  agent: { id: string; name: string; avatarUrl: string | null } | null
  task: RunTaskFacts | null
  /** Whom a run is for when the site kept no one: the task's person, or the reply's. */
  personId: string | null
  /** The agent that last queued the task, by name. */
  starterAgent: string | null
}

export type HistoryScope = {
  sessions: Map<string, HistorySession>
  names: Map<string, string>
  /** What the filters in use name, for their chips. */
  named: { task: string | null; agent: string | null; conversation: string | null; place: string | null }
}

const agentPick = { select: { id: true, name: true, avatarUrl: true } } as const
const taskPick = {
  select: {
    id: true, title: true, number: true, runId: true, runState: true, runStateReason: true, state: true, status: true,
    isEpic: true, onBehalfOfUserId: true, runOnBehalfOfUserId: true, queuedByAgentId: true,
    type: { select: { kind: true } }, project: { select: { key: true, name: true } },
  },
} as const

type Place = { id: string; key: string; name: string; personalOwnerId: string | null }

async function placeOf(key: string, me: string): Promise<Place> {
  const project = await prisma.project.findUnique({ where: { key }, select: { id: true, key: true, name: true, personalOwnerId: true } })
  if (!project) throw new HttpError(404, 'Project not found')
  await requireProjectVisible(project.id, me)
  return project
}

async function taskFilter(f: HistoryFilters): Promise<Prisma.TaskWhereInput> {
  if (!f.taskKey) return {}
  const key = taskKeyOf(f.taskKey)
  return key ? { number: key.number, project: { key: key.key } } : { id: '' }
}

function replyWhere(me: string, project: Place | null, onlyMine: boolean): Prisma.AgentSessionWhereInput {
  const place: Prisma.AgentSessionWhereInput = !project ? {}
    : project.personalOwnerId ? { primaryOwnerType: 'user', primaryOwnerId: project.personalOwnerId }
      : { primaryOwnerType: 'project', primaryOwnerId: project.id }
  return { taskId: null, sessionType: 'chat', ...place, ...(onlyMine ? { userId: me } : {}) }
}

/** The sessions of the scope, and their facts. */
export async function historySessions(me: string, f: HistoryFilters): Promise<HistoryScope> {
  const project = f.projectKey ? await placeOf(f.projectKey, me) : f.place ? await placeOf(f.place, me) : null
  const conversation = f.conversationId ? await requireConversationReader(f.conversationId, me) : null
  // A conversation's runs are everyone's who may read it; otherwise the organisation's Runs are the person's own.
  const mine = !f.projectKey && !conversation
  const commissioned = conversation
    ? (await prisma.operation.findMany({ where: { conversationId: conversation.id, kind: 'TASK', taskId: { not: null } }, select: { taskId: true } })).map(o => o.taskId!)
    : null
  const agentWhere = f.agentId ? { agentId: f.agentId } : {}

  const taskWhere: Prisma.TaskWhereInput = {
    AND: [
      mine ? mineWhere(me) : { project: entitledProjectsFilter(me) },
      project ? { projectId: project.id } : {},
      await taskFilter(f),
      commissioned ? { id: { in: commissioned } } : {},
    ],
  }
  const [taskSessions, replySessions] = await Promise.all([
    f.kind === 'reply' || f.kind === 'routine' ? [] : prisma.agentSession.findMany({
      where: { task: taskWhere, ...agentWhere },
      orderBy: { updatedAt: 'desc' },
      take: RUN_SESSION_IDS_MAX,
      select: { id: true, agent: agentPick, task: taskPick },
    }),
    f.kind === 'task' || f.kind === 'routine' || f.taskKey ? [] : prisma.agentSession.findMany({
      where: { ...replyWhere(me, project, mine), ...agentWhere, ...(conversation ? { conversationId: conversation.id } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: RUN_SESSION_IDS_MAX,
      select: { id: true, userId: true, title: true, conversationId: true, primaryOwnerType: true, primaryOwnerId: true, agent: agentPick },
    }),
  ])

  const ownConversations = replySessions.filter(s => s.userId === me && s.conversationId).map(s => s.conversationId as string)
  const replyProjects = [...new Set(replySessions.filter(s => s.primaryOwnerType === 'project' && s.primaryOwnerId).map(s => s.primaryOwnerId as string))]
  const people = new Set<string>()
  const agentIds = new Set<string>()
  for (const s of taskSessions) {
    people.add(s.task!.onBehalfOfUserId)
    if (s.task!.runOnBehalfOfUserId) people.add(s.task!.runOnBehalfOfUserId)
    if (s.task!.queuedByAgentId) agentIds.add(s.task!.queuedByAgentId)
  }
  for (const s of replySessions) people.add(s.userId)
  const [titles, projects, names] = await Promise.all([
    prisma.conversation.findMany({ where: { id: { in: ownConversations } }, select: { id: true, title: true } }),
    prisma.project.findMany({ where: { id: { in: replyProjects } }, select: { id: true, key: true, name: true } }),
    namesOf(people, agentIds),
  ])
  const titleOf = new Map(titles.map(c => [c.id, c.title]))
  const projectOf = new Map(projects.map(p => [p.id, p]))

  const sessions = new Map<string, HistorySession>()
  for (const s of taskSessions) {
    const t = s.task!
    const key = `${t.project.key}-${t.number}`
    const need = needOf({ state: t.state, status: t.status, runState: t.runState, runStateReason: t.runStateReason, isEpic: t.isEpic, typeKind: t.type?.kind ?? null })
    sessions.set(s.id, {
      sessionId: s.id, kind: 'task', title: t.title, taskKey: key, taskId: t.id, href: `/tasks/${key}`, openable: true,
      place: { name: t.project.name, projectKey: t.project.key }, agent: s.agent,
      task: { latestRunId: t.runId, need }, personId: t.runOnBehalfOfUserId ?? t.onBehalfOfUserId,
      starterAgent: t.queuedByAgentId ? names.agents.get(t.queuedByAgentId) ?? null : null,
    })
  }
  for (const s of replySessions) {
    const own = s.userId === me
    const p = s.primaryOwnerType === 'project' && s.primaryOwnerId ? projectOf.get(s.primaryOwnerId) : null
    const place = p ? { name: p.name, projectKey: p.key } : { name: 'Chat', projectKey: null }
    const title = own ? (s.conversationId ? titleOf.get(s.conversationId) : null) || s.title || 'a conversation' : null
    const href = own && s.conversationId ? `${p ? `/projects/${p.key}` : '/chat'}/t/${s.conversationId}` : null
    sessions.set(s.id, {
      sessionId: s.id, kind: 'reply', title: title ? `A reply in “${title}”` : 'A reply in a conversation', taskKey: null, taskId: null,
      href, openable: own, place, agent: s.agent, task: null, personId: s.userId, starterAgent: null,
    })
  }

  const agentName = f.agentId ? [...sessions.values()].find(s => s.agent?.id === f.agentId)?.agent?.name
    ?? (await prisma.agent.findUnique({ where: { id: f.agentId }, select: { name: true } }))?.name ?? null : null
  const conversationTitle = conversation
    ? (await prisma.conversation.findUnique({ where: { id: conversation.id }, select: { title: true } }))?.title || 'a conversation'
    : null
  return {
    sessions,
    names: names.users,
    named: {
      task: f.taskKey ? taskKeyOf(f.taskKey) ? f.taskKey.toUpperCase() : f.taskKey : null,
      agent: agentName,
      conversation: conversationTitle,
      place: f.place && project ? project.name : null,
    },
  }
}
