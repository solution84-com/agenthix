/**
 * Automation's browser operations (adr-0175). Work starts only by an explicit
 * act, so what is left to set: the organisation's limits (its admins'), whether
 * a project lets its agents set start times when asked (its admins'; for a
 * personal project, its person, who is its admin), and a task's start time
 * (anyone's who may change the task's work).
 */
import { HttpError, prisma } from 'wasp/server'
import type {
  GetOrgAutomation, UpdateOrgAutomation, GetProjectAutomation, UpdateProjectAutomation,
  SetTaskSchedule, ClearTaskSchedule,
} from 'wasp/server/operations'
import { requireRole } from '../server/identity/requireRole'
import { requireProjectAdmin, requireProjectMember } from '../projects/membership'
import { requireTaskAccess } from '../projects/resourceEntitlement'
import { agentsMaySchedule, orgAutomationProblem, type OrgAutomation } from './automationSettings'
import { loadOrgAutomation } from './automationStore'
import {
  NOT_YOURS_TO_SCHEDULE, ScheduleError, clearTaskSchedule as clearSchedule, mayScheduleTask, setTaskSchedule as setSchedule,
} from './taskSchedule'

type SetTaskScheduleArgs = { taskId: string; at?: string | null }

/** A project's own rules beside the organisation's limits: what its Rules view shows. */
export type ProjectAutomationStatus = {
  org: OrgAutomation
  /** The project's own choice, kept as chosen; it applies only where the organisation allows it too. */
  agentSchedules: boolean
  /** Whether agents here may set start times now. */
  agentsMaySchedule: boolean
}

async function projectAutomationStatus(projectId: string): Promise<ProjectAutomationStatus> {
  const [org, project] = await Promise.all([
    loadOrgAutomation(),
    prisma.project.findUnique({ where: { id: projectId }, select: { agentSchedules: true } }),
  ])
  if (!project) throw new HttpError(404, 'Project not found')
  return { org, agentSchedules: project.agentSchedules, agentsMaySchedule: agentsMaySchedule(org, project) }
}

export const getOrgAutomation: GetOrgAutomation<void, OrgAutomation> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  return loadOrgAutomation()
}

export const updateOrgAutomation: UpdateOrgAutomation<OrgAutomation, OrgAutomation> = async (args, context) => {
  await requireRole(context, 'ADMIN', "Changing the organisation's automation")
  const value: OrgAutomation = { agentSchedules: args.agentSchedules, maxDepth: args.maxDepth }
  const problem = orgAutomationProblem(value)
  if (problem) throw new HttpError(400, `${problem}. Nothing was changed.`)
  const org = await prisma.org.findFirst({ select: { id: true } })
  if (!org) throw new HttpError(409, 'Set up the organisation before its automation. Nothing was changed.')
  await prisma.org.update({
    where: { id: org.id },
    data: { automationAgentSchedules: value.agentSchedules, automationMaxDepth: value.maxDepth },
  })
  return value
}

export const getProjectAutomation: GetProjectAutomation<{ projectId: string }, ProjectAutomationStatus> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  await requireProjectMember(args.projectId, context.user.id, "Reading this project's automation")
  return projectAutomationStatus(args.projectId)
}

export const updateProjectAutomation: UpdateProjectAutomation<
  { projectId: string; agentSchedules: boolean },
  ProjectAutomationStatus
> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  await requireProjectAdmin(args.projectId, context.user.id, "Changing this project's automation")
  if (typeof args.agentSchedules !== 'boolean') throw new HttpError(400, 'The switch must be on or off. Nothing was changed.')
  if (args.agentSchedules && !(await loadOrgAutomation()).agentSchedules) {
    throw new HttpError(400, 'The organisation does not allow agents to set start times; an org admin can allow it. Nothing was changed.')
  }
  await prisma.project.update({ where: { id: args.projectId }, data: { agentSchedules: args.agentSchedules } })
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
