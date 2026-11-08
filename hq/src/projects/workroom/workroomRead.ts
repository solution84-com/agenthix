/**
 * A Workroom, read (spec D17–D19, RU1–RU4): for each project asked for, its agents as scorecards — what each is at
 * work on now, what waits in its line and why, what it finished today and what that cost, and what waits on a person —
 * and the counts above them. hq's tasks say what is at work, in line and waiting on a person; the sites' runs say what
 * ran today, what it cost, and which replies are going. Nothing here carries a run's content (ADR-0077).
 */
import { prisma } from 'wasp/server'
import type { RunRow } from '@agenthix/core'
import { namesOf } from '../../runs/myRuns'
import { countsOf, lineWhy, needOf, ringOf, waitsOnItsSite } from './workroomRules'
import { isEnded, isGoing, readTodayRuns, runCost, type TodayRuns } from './workroomRuns'
import {
  projectsWithRuns, readyCounts, runNumbers, tasksAtWork, workroomProjects, type WorkTask, type WorkroomAgentRow,
  type WorkroomProjectRow,
} from './workroomTasks'
import type { WorkroomAgent, WorkroomLineItem, WorkroomNeed, WorkroomNow, WorkroomProject } from './workroomTypes'

export type WorkroomReadOptions = { mine: boolean; from: Date; now: Date }

type Names = Awaited<ReturnType<typeof namesOf>>

type Context = {
  me: string
  now: Date
  from: Date
  names: Names
  numbers: Map<string, number>
  runsById: Map<string, RunRow>
  today: TodayRuns
  /** Titles and keys of the tasks today's runs belong to. */
  taskLabels: Map<string, { title: string; key: string }>
}

const taskKey = (projectKey: string, t: { number: number }) => `${projectKey}-${t.number}`

function startedByOf(t: WorkTask, c: Context): string | null {
  switch (t.runStartedBy) {
    case 'person': return t.queuedByUserId === c.me ? 'you' : (t.queuedByUserId && c.names.users.get(t.queuedByUserId)) || null
    case 'agent': return (t.queuedByAgentId && c.names.agents.get(t.queuedByAgentId)) || null
    case 'schedule': return 'its start time'
    default: return null
  }
}

function nowOfTask(t: WorkTask, projectKey: string, c: Context): WorkroomNow {
  const run = t.runId ? c.runsById.get(t.runId) : undefined
  return {
    key: t.id, kind: 'task', title: t.title, taskId: t.id, taskKey: taskKey(projectKey, t), href: `/tasks/${taskKey(projectKey, t)}`,
    sessionId: run?.sessionId ?? null, runNumber: (t.runId && c.numbers.get(t.runId)) || t.runCount || null,
    since: run?.startedAt ?? run?.createdAt ?? null, startedBy: startedByOf(t, c),
  }
}

function replyHref(projectKey: string, conversationId: string | null): string | null {
  return conversationId ? `/projects/${encodeURIComponent(projectKey)}/t/${conversationId}` : null
}

function agentCard(project: WorkroomProjectRow, agent: WorkroomAgentRow, tasks: WorkTask[], ready: number, c: Context): WorkroomAgent {
  const atWork = tasks.filter(t => t.runState === 'RUN_ACTIVE' && !waitsOnItsSite(t))
  const now: WorkroomNow[] = atWork.map(t => nowOfTask(t, project.key, c))
  const runs = c.today.runs.filter(r => r.agentId === agent.agentId && c.today.sessions.get(r.sessionId)?.projectId === project.id)
  for (const r of runs) {
    const session = c.today.sessions.get(r.sessionId)!
    if (session.taskId || !isGoing(r)) continue
    now.push({
      key: r.id, kind: 'reply', title: session.replyTitle, taskId: null, taskKey: null,
      href: replyHref(project.key, session.replyConversationId), sessionId: r.sessionId, runNumber: null,
      since: r.startedAt ?? r.createdAt, startedBy: null,
    })
  }

  const lineTasks = tasks.filter(t => t.runState === 'RUN_QUEUED' || waitsOnItsSite(t)
    || (t.runState === 'RUN_NONE' && !!t.scheduleNextDueAt && t.scheduleNextDueAt.getTime() > c.now.getTime()))
  const line: WorkroomLineItem[] = lineTasks.map((t, i) => ({
    taskId: t.id, taskKey: taskKey(project.key, t), title: t.title, href: `/tasks/${taskKey(project.key, t)}`,
    why: lineWhy(lineTasks, i, atWork[0]?.title ?? null, project.siteName, c.now),
  }))

  const needs: WorkroomNeed[] = tasks.flatMap((t) => {
    const reason = needOf({ ...t, typeKind: t.type?.kind ?? null })
    if (!reason) return []
    return [{
      taskId: t.id, taskKey: taskKey(project.key, t), title: t.title, href: `/tasks/${taskKey(project.key, t)}`, reason,
      detail: t.runStateReason?.trim() || null, runNumber: (t.runId && c.numbers.get(t.runId)) || t.runCount || null,
      since: t.updatedAt.toISOString(),
    }]
  })

  const started = runs.filter(r => new Date(r.createdAt).getTime() >= c.from.getTime())
  const ended = runs
    .filter(r => isEnded(r) && r.endedAt && new Date(r.endedAt).getTime() >= c.from.getTime())
    .sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''))
  const last = ended[0]
  const lastSession = last ? c.today.sessions.get(last.sessionId) : undefined
  const lastTask = last?.taskId ? c.taskLabels.get(last.taskId) : undefined

  return {
    agentId: agent.agentId, name: agent.name, handle: agent.handle, avatarUrl: agent.avatarUrl, role: agent.role,
    ring: ringOf({
      running: now.length,
      asking: needs.filter(n => n.reason !== 'failed').length,
      failed: needs.filter(n => n.reason === 'failed').length,
      waiting: line.length,
    }),
    ready, inLine: line.length, runsToday: started.length,
    spentToday: runs.reduce((sum, r) => sum + runCost(r), 0),
    now, line, needs, finishedToday: ended.length,
    lastFinished: last ? {
      kind: last.taskId ? 'task' : 'reply',
      title: lastTask?.title ?? lastSession?.replyTitle ?? null,
      href: lastTask ? `/tasks/${lastTask.key}` : replyHref(project.key, lastSession?.replyConversationId ?? null),
      at: last.endedAt!,
    } : null,
  }
}

/**
 * A personal project works with any agent, not a list of its own (spec §7): its Workroom shows the agents that have
 * something there, at work, in line or run today.
 */
async function addPersonalAgents(projects: WorkroomProjectRow[], tasks: WorkTask[], today: TodayRuns): Promise<void> {
  const wanted = new Map<string, Set<string>>()
  for (const p of projects.filter(x => x.personal)) {
    const ids = new Set([
      ...tasks.filter(t => t.projectId === p.id && t.assignedAgentId).map(t => t.assignedAgentId as string),
      ...today.runs.filter(r => today.sessions.get(r.sessionId)?.projectId === p.id).map(r => r.agentId),
    ])
    for (const a of p.agents) ids.delete(a.agentId)
    if (ids.size > 0) wanted.set(p.id, ids)
  }
  if (wanted.size === 0) return
  const rows = await prisma.agent.findMany({
    where: { id: { in: [...new Set([...wanted.values()].flatMap(s => [...s]))] } },
    select: { id: true, name: true, handle: true, avatarUrl: true, role: true },
    orderBy: { name: 'asc' },
  })
  for (const p of projects) {
    const ids = wanted.get(p.id)
    if (!ids) continue
    p.agents.push(...rows.filter(r => ids.has(r.id)).map(r => ({ agentId: r.id, name: r.name, handle: r.handle, avatarUrl: r.avatarUrl, role: r.role })))
  }
}

/** The Workrooms of these projects, in the order given. `me` is the viewer; `mine` narrows to their runs. */
export async function readWorkrooms(projectIds: string[], me: string, opts: WorkroomReadOptions): Promise<WorkroomProject[]> {
  if (projectIds.length === 0) return []
  const me_ = opts.mine ? me : null
  const [projects, tasks, ready, ran, today] = await Promise.all([
    workroomProjects(projectIds),
    tasksAtWork(projectIds, opts.now, me_),
    readyCounts(projectIds, opts.now, me_),
    projectsWithRuns(projectIds),
    readTodayRuns(projectIds, me, opts.mine, opts.from),
  ])

  const userIds = new Set<string>()
  const agentIds = new Set<string>()
  for (const t of tasks) {
    if (t.queuedByUserId) userIds.add(t.queuedByUserId)
    if (t.queuedByAgentId) agentIds.add(t.queuedByAgentId)
  }
  const runTaskIds = [...new Set(today.runs.flatMap(r => (r.taskId ? [r.taskId] : [])))]
  const [names, numbers, labelled] = await Promise.all([
    namesOf(userIds, agentIds),
    runNumbers(tasks.flatMap(t => (t.runId ? [t.runId] : []))),
    prisma.task.findMany({ where: { id: { in: runTaskIds } }, select: { id: true, title: true, number: true, project: { select: { key: true } } } }),
  ])
  const c: Context = {
    me, now: opts.now, from: opts.from, names, numbers, today,
    runsById: new Map(today.runs.map(r => [r.id, r])),
    taskLabels: new Map(labelled.map(t => [t.id, { title: t.title, key: taskKey(t.project.key, t) }])),
  }

  await addPersonalAgents(projects, tasks, today)
  return projects.map((p) => {
    const agents = p.agents.map(a => agentCard(
      p, a, tasks.filter(t => t.projectId === p.id && t.assignedAgentId === a.agentId), ready.get(`${p.id}:${a.agentId}`) ?? 0, c,
    ))
    const ranToday = today.runs.some(r => today.sessions.get(r.sessionId)?.projectId === p.id)
    return {
      projectId: p.id, projectKey: p.key, projectName: p.name, personal: p.personal,
      counts: countsOf(agents), agents,
      nothingYet: !ran.has(p.id) && !ranToday,
      unanswered: p.personal ? today.unanswered : today.unanswered.filter(u => u.label === p.siteLabel),
    }
  })
}
