/**
 * The Automation tool's Now and Later (every screen reviewed spec §3): what is
 * running, what is stuck and its fix, and what will start: start times and
 * routines, the only things that start at a time (adr-0175). Anyone who can see
 * the project can read it.
 */
import { HttpError, prisma } from 'wasp/server'
import type { GetAutomationOutlook } from 'wasp/server/operations'
import { requireProjectMember } from '../projects/membership'
import { LOST_ACCESS_REASON, NO_AGENT_REASON } from '../agents/taskExecutionReasons'
import { laterInOrder, stuckOf, type LaterItem, type StuckItem } from './outlookPlan'

export type RunningTask = { taskId: string; key: string; title: string }

export type AutomationOutlook = {
  /** For links to the project's boards and tasks. */
  projectKey: string
  running: RunningTask[]
  stuck: StuckItem[]
  later: LaterItem[]
  /** How many more will start after the ones listed. */
  laterMore: number
}

const STUCK_LIMIT = 20

export async function projectAutomationOutlook(projectId: string, now: Date = new Date()): Promise<AutomationOutlook> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { key: true } })
  if (!project) throw new HttpError(404, 'Project not found')
  const [running, stuckTasks, routines, scheduled] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, runState: 'RUN_ACTIVE', archived: false },
      select: { id: true, number: true, title: true },
      orderBy: { number: 'asc' },
    }),
    prisma.task.findMany({
      where: {
        projectId,
        archived: false,
        OR: [
          { runState: 'RUN_QUEUED', assignedAgentId: null },
          { runStateReason: NO_AGENT_REASON, assignedAgentId: null },
          { runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON },
        ],
      },
      select: { id: true, number: true, title: true, runState: true, runStateReason: true, assignedAgentId: true },
      orderBy: { number: 'asc' },
      take: STUCK_LIMIT,
    }),
    prisma.routine.findMany({
      where: { projectId },
      select: { id: true, title: true, enabled: true, nextRoundAt: true, pausedReason: true },
    }),
    prisma.task.findMany({
      where: { projectId, archived: false, scheduleNextDueAt: { gte: now } },
      select: { id: true, number: true, title: true, scheduleNextDueAt: true },
    }),
  ])
  const later = laterInOrder({ projectKey: project.key, routines, tasks: scheduled, now })
  return {
    projectKey: project.key,
    running: running.map(t => ({ taskId: t.id, key: `${project.key}-${t.number}`, title: t.title })),
    stuck: stuckOf({
      projectKey: project.key,
      tasks: stuckTasks,
      routines,
      reasons: { lostAccess: LOST_ACCESS_REASON, noAgent: NO_AGENT_REASON },
    }),
    later: later.items,
    laterMore: later.more,
  }
}

export const getAutomationOutlook: GetAutomationOutlook<{ projectId: string }, AutomationOutlook> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  await requireProjectMember(args.projectId, context.user.id, "Reading this project's automation")
  return projectAutomationOutlook(args.projectId)
}
