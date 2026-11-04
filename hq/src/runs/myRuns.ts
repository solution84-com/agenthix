/**
 * A person's runs (every screen reviewed spec §6): the task runs they started or
 * that are done on their behalf (adr-0089, adr-0095), in places they can still
 * see — waiting for them, going now, queued, and finished in the last three days. The Runs panel lists
 * them; its button and Home count the ones going now (`countMyRunsGoing`).
 */
import { prisma } from 'wasp/server'
import { RUN_SESSION_IDS_MAX, type RunRow, type SiteSilence } from '@agenthix/core'
import * as dispatchService from '../agents/dispatchService'
import { readMergedRunFeed } from '../sessions/mergedRunFeed'
import type { SessionLocationFields } from '../storage/primaryLocationService'
import { entitledProjectsFilter } from '../projects/membership'
import { peopleByIds } from '../server/identity/people'
import { withRunWaitNotes } from '../automation/queueNotes'
import { groupOf, isRunning, stateText, wantsApproval, type LatestRun } from './runsView'
import { taskFacts } from './taskFacts'
import type { MyRun } from './myRunTypes'

/** How many sessions the list reaches back for, and how far in time. */
export const SESSION_LIMIT = 50
export const FINISHED_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export const taskSelect = {
  id: true, title: true, number: true, runState: true, runStateReason: true,
  runStartedBy: true, routineId: true, queuedByUserId: true, queuedByAgentId: true,
  onBehalfOfUserId: true, runOnBehalfOfUserId: true,
  project: { select: { key: true, name: true } },
} as const

export const agentSelect = { id: true, name: true, handle: true, avatarUrl: true } as const

/** A session's latest run, as the list needs it. */
export type LatestRunRow = (NonNullable<LatestRun> & { startedAt?: string | null; endedAt?: string | null }) | null

type Session = SessionLocationFields & { id: string; taskId: string | null; agentId: string }

/** The newest runs read for the panel, across the person's sessions: enough to hold each session's latest. */
export const PANEL_RUN_WINDOW = 200

/**
 * Each session's latest run, read with one request per site rather than one per session: the newest runs of all the
 * given sessions, the first seen of each being its latest. A site that cannot be asked leaves its sessions' runs
 * unknown and says so; a session with none in the window has no latest run.
 */
export async function withLatestRuns<S extends Session>(sessions: S[]) {
  if (sessions.length === 0) return []
  const siteOf = new Map<string, string | null>()
  await Promise.all(sessions.map(async (session) => {
    siteOf.set(session.id, await dispatchService.resolveSiteIdForSession(session).catch(() => null))
  }))

  const feed = await readMergedRunFeed({
    limit: PANEL_RUN_WINDOW,
    filter: { sessionIds: sessions.map(s => s.id).slice(0, RUN_SESSION_IDS_MAX) },
  })
  const latestOf = new Map<string, RunRow>()
  for (const run of feed.runs) if (!latestOf.has(run.sessionId)) latestOf.set(run.sessionId, run)
  const silenceOf = new Map(feed.unanswered.map((s): [string, SiteSilence] => [s.siteId, s]))

  return sessions.map((session) => {
    const siteId = siteOf.get(session.id)
    return {
      session,
      latest: (latestOf.get(session.id) ?? null) as LatestRunRow,
      siteSilence: (siteId ? silenceOf.get(siteId) ?? null : null) as SiteSilence | null,
    }
  })
}

/** Started by the person, on their behalf, or this run on their behalf (adr-0095), in a project they can see. */
export function mineWhere(me: string) {
  return {
    OR: [{ onBehalfOfUserId: me }, { queuedByUserId: me }, { runOnBehalfOfUserId: me }],
    project: entitledProjectsFilter(me),
    archived: false,
  }
}

/** People are named as everywhere else: a display name, else the login name, and a former member once they have left. */
export async function namesOf(userIds: Set<string>, agentIds: Set<string>) {
  const [people, agents] = await Promise.all([
    peopleByIds([...userIds]),
    prisma.agent.findMany({ where: { id: { in: [...agentIds] } }, select: { id: true, name: true } }),
  ])
  return {
    users: new Map([...people].map(([id, person]): [string, string] => [id, person.name])),
    agents: new Map(agents.map((a): [string, string] => [a.id, a.name])),
  }
}

export async function listMyRuns(me: string): Promise<MyRun[]> {
  const cutoff = Date.now() - FINISHED_WINDOW_MS
  const [queuedTasks, sessions] = await Promise.all([
    prisma.task.findMany({
      where: { ...mineWhere(me), runState: { in: ['RUN_QUEUED', 'RUN_THROTTLED'] } },
      select: { ...taskSelect, projectId: true, assignedAgentId: true, priority: true, createdAt: true, assignedAgent: { select: agentSelect } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.agentSession.findMany({
      where: { task: mineWhere(me) },
      orderBy: { updatedAt: 'desc' },
      take: SESSION_LIMIT,
      include: { agent: { select: agentSelect }, task: { select: taskSelect } },
    }),
  ])

  const [noted, withLatest] = await Promise.all([withRunWaitNotes(queuedTasks), withLatestRuns(sessions)])
  const queuedIds = new Set(queuedTasks.map(t => t.id))

  const userIds = new Set<string>()
  const agentIds = new Set<string>()
  for (const t of [...queuedTasks, ...sessions.map(s => s.task!)]) {
    userIds.add(t.onBehalfOfUserId)
    if (t.runOnBehalfOfUserId) userIds.add(t.runOnBehalfOfUserId)
    if (t.queuedByUserId) userIds.add(t.queuedByUserId)
    if (t.queuedByAgentId) agentIds.add(t.queuedByAgentId)
  }
  const names = await namesOf(userIds, agentIds)

  type TaskFields = (typeof sessions)[number]['task'] & {}
  const common = (task: TaskFields) => ({
    kind: 'task' as const,
    task: { id: task.id, runState: task.runState },
    ...taskFacts(task, me, names),
  })

  const rows: MyRun[] = []
  for (const t of noted) {
    rows.push({
      key: t.id, group: 'queued', sessionId: null, ...common(t),
      agent: t.assignedAgent, wantsApproval: false, wait: t.runWait, state: t.runStateReason, siteSilence: null,
      startedAt: null, endedAt: null, updatedAt: t.createdAt.toISOString(),
    })
  }

  for (const { session, latest, siteSilence } of withLatest) {
    const task = session.task!
    const group = groupOf(latest, task.runState)
    // A task waiting to run again shows once, as queued — unless it is going now.
    if (group === 'queued' && queuedIds.has(task.id)) continue
    if (group === 'finished' && session.updatedAt.getTime() < cutoff) continue
    const shown = group === 'queued' ? 'finished' : group
    rows.push({
      key: session.id, group: shown, sessionId: session.id, ...common(task),
      agent: session.agent, wantsApproval: shown === 'waiting' && wantsApproval(latest), wait: null,
      state: stateText(shown, latest, task),
      startedAt: latest?.startedAt ?? null, endedAt: latest?.endedAt ?? null,
      updatedAt: session.updatedAt.toISOString(), siteSilence,
    })
  }
  return rows
}

/** The person's runs going now — the Runs panel's Running group — for its button and Home. */
export async function countMyRunsGoing(me: string): Promise<number> {
  const taskSessions = await prisma.agentSession.findMany({ where: { task: { ...mineWhere(me), runState: 'RUN_ACTIVE' } }, take: SESSION_LIMIT })
  const read = await withLatestRuns(taskSessions)
  return read.filter(r => isRunning(r.latest)).length
}
