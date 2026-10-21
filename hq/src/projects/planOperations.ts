/**
 * A task's plan, its epic and an epic's milestone, and a project's milestones,
 * for the Timeline tool (every screen reviewed spec §3, adr-0098). Changing a
 * plan is a change to the task, under the rule `updateTask` applies — someone
 * who works in its project (adr-0102).
 */
import { HttpError } from 'wasp/server'
import type { Milestone, Task } from 'wasp/entities'
import { requireMayWorkInProject } from './membership'
import { requireProjectVisible, requireTaskAccess } from './resourceEntitlement'
import {
  setTaskPlan, listMilestones, createMilestone as createMilestoneRecord, updateMilestone as updateMilestoneRecord,
  deleteMilestone as deleteMilestoneRecord, projectOfMilestone, type PlanChange,
} from './taskPlanService'

type Ctx = { user?: { id: string } | null }

function userOf(context: Ctx): { id: string } {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user
}

export const updateTaskPlan = async (args: { taskId: string } & PlanChange, context: Ctx): Promise<Task> => {
  const user = userOf(context)
  await requireTaskAccess(args.taskId, user.id, 'Changing this task')
  const { taskId, planStart, planFinish, isEpic, epicId, milestoneId } = args
  return setTaskPlan(taskId, { planStart, planFinish, isEpic, epicId, milestoneId })
}

export type MilestoneView = Milestone & { epics: Array<{ id: string; number: number; title: string }> }

export const getMilestones = async ({ projectId }: { projectId: string }, context: Ctx): Promise<MilestoneView[]> => {
  const user = userOf(context)
  await requireProjectVisible(projectId, user.id)
  return listMilestones(projectId)
}

export const createMilestone = async (
  { projectId, name, date }: { projectId: string; name: string; date: string },
  context: Ctx,
): Promise<Milestone> => {
  await requireMayWorkInProject(projectId, userOf(context).id, 'Adding a milestone to this project')
  return createMilestoneRecord({ projectId, name, date })
}

export const updateMilestone = async (
  { milestoneId, name, date }: { milestoneId: string; name?: string; date?: string },
  context: Ctx,
): Promise<Milestone> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfMilestone(milestoneId), user.id, 'Changing this milestone')
  return updateMilestoneRecord({ milestoneId, name, date })
}

export const deleteMilestone = async ({ milestoneId }: { milestoneId: string }, context: Ctx): Promise<Milestone> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfMilestone(milestoneId), user.id, 'Deleting this milestone')
  return deleteMilestoneRecord(milestoneId)
}
