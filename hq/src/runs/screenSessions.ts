/**
 * The sessions the Runs screen asks the sites about: the tasks' sessions that are the person's doing or done on their
 * behalf — the same the panel reads (`myRuns.ts`), reaching back through all of them, narrowed by who, where, which
 * agent and the search; or, narrowed to one conversation, its workers' and its tasks' sessions (`conversationFilter.ts`). The sites are then asked once each
 * for the runs of these sessions; who may see what is decided here, never by a site.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { RUN_SESSION_IDS_MAX } from '@agenthix/core'
import { withRunWaitNotes } from '../automation/queueNotes'
import { agentSelect, mineWhere, namesOf, taskSelect } from './myRuns'
import { taskKeyOf } from './screenFilters'
import { taskFacts } from './taskFacts'
import { sessionsOfConversation } from './conversationFilter'
import type { RunStarter } from './runsView'
import type { RunsFilters } from './screenTypes'

type Agent = { id: string; name: string; handle: string; avatarUrl: string | null }

/** What the list says about a run beyond the run itself: the task or conversation it belongs to. */
export type SessionFacts = {
  sessionId: string
  kind: 'task' | 'conversation'
  title: string
  ref: string | null
  href: string
  place: { name: string; projectKey: string | null }
  agent: Agent | null
  taskRunState: string | null
  startedByText: string | null
  startedBy: RunStarter
  onBehalfOf: { id: string; name: string } | null
}

export type QueuedFacts = Omit<SessionFacts, 'sessionId'> & { taskId: string; wait: Awaited<ReturnType<typeof withRunWaitNotes>>[number]['runWait']; at: string }

function relationWhere(me: string, relation: RunsFilters['relation']): Prisma.TaskWhereInput {
  if (relation === 'started') return { queuedByUserId: me, runStartedBy: 'person' }
  if (relation === 'behalf') return { OR: [{ runOnBehalfOfUserId: me }, { runOnBehalfOfUserId: null, onBehalfOfUserId: me }] }
  return {}
}

function placeWhere(place: string | undefined): Prisma.TaskWhereInput {
  return place ? { project: { key: place } } : {}
}

function searchTaskWhere(search: string | undefined): Prisma.TaskWhereInput {
  if (!search) return {}
  const key = taskKeyOf(search)
  return {
    OR: [
      { title: { contains: search, mode: 'insensitive' } },
      ...(key ? [{ number: key.number, project: { key: key.key } }] : []),
    ],
  }
}

function taskWhere(me: string, f: RunsFilters): Prisma.TaskWhereInput {
  return { AND: [mineWhere(me), relationWhere(me, f.relation), placeWhere(f.place)] }
}

/** The tasks' sessions, as the list needs to describe their runs. */
export async function sessionsForScreen(me: string, f: RunsFilters) {
  if (f.conversationId) return sessionsOfConversation(me, f.conversationId)
  const taskSessions = await prisma.agentSession.findMany({
    where: {
      task: taskWhere(me, f),
      ...(f.agentId ? { agentId: f.agentId } : {}),
      ...(f.search ? { OR: [{ task: searchTaskWhere(f.search) }, { agent: { name: { contains: f.search, mode: 'insensitive' } } }] } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: RUN_SESSION_IDS_MAX,
    include: { agent: { select: agentSelect }, task: { select: taskSelect } },
  })

  const userIds = new Set<string>()
  const agentIds = new Set<string>()
  for (const { task } of taskSessions) {
    userIds.add(task!.onBehalfOfUserId)
    if (task!.runOnBehalfOfUserId) userIds.add(task!.runOnBehalfOfUserId)
    if (task!.queuedByUserId) userIds.add(task!.queuedByUserId)
    if (task!.queuedByAgentId) agentIds.add(task!.queuedByAgentId)
  }
  const names = await namesOf(userIds, agentIds)

  const facts = new Map<string, SessionFacts>()
  for (const s of taskSessions) {
    const task = s.task!
    const t = taskFacts(task, me, names)
    facts.set(s.id, {
      sessionId: s.id, kind: 'task', title: t.title, ref: t.ref, href: t.href, place: t.place, agent: s.agent,
      taskRunState: task.runState, startedByText: t.startedByText, startedBy: t.startedBy, onBehalfOf: t.onBehalfOf,
    })
  }
  return { facts, sessionIds: [...facts.keys()].slice(0, RUN_SESSION_IDS_MAX) }
}

/** Tasks waiting in a queue, which have no run yet; the top of the list shows them. */
export async function queuedForScreen(me: string, f: RunsFilters): Promise<QueuedFacts[]> {
  if (f.conversationId) return []
  const queued = await prisma.task.findMany({
    where: {
      AND: [
        taskWhere(me, f),
        { runState: { in: ['RUN_QUEUED', 'RUN_THROTTLED'] } },
        ...(f.agentId ? [{ assignedAgentId: f.agentId }] : []),
        ...(f.search ? [{ OR: [searchTaskWhere(f.search), { assignedAgent: { name: { contains: f.search, mode: 'insensitive' as const } } }] }] : []),
      ],
    },
    select: { ...taskSelect, projectId: true, assignedAgentId: true, priority: true, createdAt: true, assignedAgent: { select: agentSelect } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
  if (queued.length === 0) return []
  const userIds = new Set<string>()
  const agentIds = new Set<string>()
  for (const t of queued) {
    userIds.add(t.onBehalfOfUserId)
    if (t.runOnBehalfOfUserId) userIds.add(t.runOnBehalfOfUserId)
    if (t.queuedByUserId) userIds.add(t.queuedByUserId)
    if (t.queuedByAgentId) agentIds.add(t.queuedByAgentId)
  }
  const [noted, names] = await Promise.all([withRunWaitNotes(queued), namesOf(userIds, agentIds)])
  return noted.map((t) => {
    const facts = taskFacts(t, me, names)
    return {
      taskId: t.id, kind: 'task' as const, title: facts.title, ref: facts.ref, href: facts.href, place: facts.place,
      agent: t.assignedAgent, taskRunState: t.runState, startedByText: facts.startedByText, startedBy: facts.startedBy,
      onBehalfOf: facts.onBehalfOf, wait: t.runWait, at: t.createdAt.toISOString(),
    }
  })
}
