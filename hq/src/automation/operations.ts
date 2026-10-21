/**
 * Automation's browser operations (spec §2, §3). The org's values are its
 * admins'; a project's choices are its admins' (for a personal project, its
 * person, who is its admin); a task's schedule is anyone's who may change the
 * task's work.
 */
import { HttpError, prisma } from 'wasp/server'
import type {
  GetOrgAutomation, UpdateOrgAutomation, GetProjectAutomation, UpdateProjectAutomation,
  SetTaskSchedule, ClearTaskSchedule,
} from 'wasp/server/operations'
import { requireRole } from '../server/identity/requireRole'
import { requireProjectAdmin, requireProjectMember } from '../projects/membership'
import { requireTaskAccess } from '../projects/resourceEntitlement'
import {
  orgAutomationProblem, projectAutomationProblem,
  type OrgAutomation, type ProjectAutomationChoice,
} from './automationSettings'
import { loadOrgAutomation, recomputePulseDueTimes, releaseThrottledWhereOff, saveProjectChoice } from './automationStore'
import { projectAutomationStatus, type ProjectAutomationStatus } from './automationStatus'
import {
  NOT_YOURS_TO_SCHEDULE, ScheduleError, clearTaskSchedule as clearSchedule, mayScheduleTask, setTaskSchedule as setSchedule,
} from './taskSchedule'

type SetTaskScheduleArgs = { taskId: string; at?: string | null }
import { nudgeScheduler } from './schedulerNudge'

export const getOrgAutomation: GetOrgAutomation<void, OrgAutomation> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  return loadOrgAutomation()
}

export const updateOrgAutomation: UpdateOrgAutomation<OrgAutomation, OrgAutomation> = async (args, context) => {
  await requireRole(context, 'ADMIN', "Changing the organisation's automation")
  const value: OrgAutomation = {
    allowed: args.allowed, intervalMinutes: args.intervalMinutes, batchSize: args.batchSize,
    queueLimit: args.queueLimit, agentSchedules: args.agentSchedules,
    throttle: args.throttle, maxDepth: args.maxDepth,
  }
  const problem = orgAutomationProblem(value)
  if (problem) throw new HttpError(400, problem)
  const org = await prisma.org.findFirst({ select: { id: true } })
  if (!org) throw new HttpError(409, 'Set up the organisation before its automation')
  await prisma.org.update({
    where: { id: org.id },
    data: {
      automationAllowed: value.allowed,
      automationIntervalMinutes: value.intervalMinutes,
      automationBatchSize: value.batchSize,
      automationQueueLimit: value.queueLimit,
      automationAgentSchedules: value.agentSchedules,
      automationThrottle: value.throttle,
      automationMaxDepth: value.maxDepth,
    },
  })
  // The org's interval narrows every project's at use; the stored due times follow it.
  await recomputePulseDueTimes()
  await releaseThrottledWhereOff(value)
  nudgeScheduler()
  return value
}

export const getProjectAutomation: GetProjectAutomation<{ projectId: string }, ProjectAutomationStatus> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  await requireProjectMember(args.projectId, context.user.id, "Reading this project's automation")
  return projectAutomationStatus(args.projectId)
}

export const updateProjectAutomation: UpdateProjectAutomation<
  { projectId: string } & ProjectAutomationChoice,
  ProjectAutomationStatus
> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  await requireProjectAdmin(args.projectId, context.user.id, "Changing this project's automation")
  const choice: ProjectAutomationChoice = {
    enabled: args.enabled,
    intervalMinutes: args.intervalMinutes ?? null,
    batchSize: args.batchSize ?? null,
    queueLimit: args.queueLimit ?? null,
    agentSchedules: args.agentSchedules,
    throttle: args.throttle ?? false,
    maxDepth: args.maxDepth ?? null,
  }
  const problem = projectAutomationProblem(choice, await loadOrgAutomation())
  if (problem) throw new HttpError(400, problem)
  await saveProjectChoice(args.projectId, choice, context.user.id)
  nudgeScheduler()
  return projectAutomationStatus(args.projectId)
}

/** A schedule makes an agent run on its own, so setting one is a change to work, like queueing. */
async function requireCanScheduleTask(taskId: string, context: { user?: { id: string } | null }): Promise<void> {
  if (!context.user) throw new HttpError(401)
  await requireTaskAccess(taskId, context.user.id, "Changing this task's schedule")
  if (!(await mayScheduleTask(taskId, context.user.id))) throw new HttpError(403, NOT_YOURS_TO_SCHEDULE)
}

export const setTaskSchedule: SetTaskSchedule<SetTaskScheduleArgs, { nextDueAt: string | null }> = async (args, context) => {
  await requireCanScheduleTask(args.taskId, context)
  try {
    const stored = await setSchedule(args.taskId, { at: args.at }, { kind: 'person', userId: context.user!.id })
    return { nextDueAt: stored.scheduleNextDueAt?.toISOString() ?? null }
  } catch (err) {
    if (err instanceof ScheduleError) throw new HttpError(400, err.message)
    throw err
  }
}

export const clearTaskSchedule: ClearTaskSchedule<{ taskId: string }, void> = async (args, context) => {
  await requireCanScheduleTask(args.taskId, context)
  await clearSchedule(args.taskId)
}
