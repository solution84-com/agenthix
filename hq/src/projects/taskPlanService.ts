/**
 * A task's plan, its epic and an epic's milestone, and a project's milestones
 * (adr-0098). A plan is when the work is meant to happen, kept apart from the
 * start time and the runs: **nothing here starts, stops or queues a run** — no
 * write below touches a run state, a start time or a column.
 */
import { prisma, HttpError } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { planDates, refuseEpicRules, refuseInvertedPlan } from './planSpan'

export type PlanChange = {
  /** `YYYY-MM-DD`; null clears it. */
  planStart?: string | null
  planFinish?: string | null
  isEpic?: boolean
  /** The epic it belongs to; null takes it out of one. */
  epicId?: string | null
  /** An epic's milestone; null clears it. */
  milestoneId?: string | null
}

export function hasPlanChange(change: PlanChange): boolean {
  return ['planStart', 'planFinish', 'isEpic', 'epicId', 'milestoneId'].some(k => change[k as keyof PlanChange] !== undefined)
}

export async function setTaskPlan(taskId: string, change: PlanChange) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, boardId: true, isEpic: true, epicId: true, milestoneId: true, planStart: true, planFinish: true, _count: { select: { epicTasks: true } } },
  })
  if (!task) throw new HttpError(404, 'Task not found')
  const dates = planDates(change)
  refuseInvertedPlan({ planStart: dates.planStart !== undefined ? dates.planStart : task.planStart, planFinish: dates.planFinish !== undefined ? dates.planFinish : task.planFinish })

  // undefined leaves it as it is, null clears it, an id must name one.
  let epic: { id: string; projectId: string; isEpic: boolean } | null | undefined = change.epicId === undefined ? undefined : null
  if (change.epicId) {
    epic = await prisma.task.findUnique({ where: { id: change.epicId }, select: { id: true, projectId: true, isEpic: true } })
    if (!epic) throw new HttpError(404, 'Epic not found')
  }
  let milestone: { projectId: string } | null | undefined = change.milestoneId === undefined ? undefined : null
  if (change.milestoneId) {
    milestone = await prisma.milestone.findUnique({ where: { id: change.milestoneId }, select: { projectId: true } })
    if (!milestone) throw new HttpError(404, 'Milestone not found')
  }
  refuseEpicRules(
    { id: task.id, projectId: task.projectId, isEpic: task.isEpic, epicId: task.epicId, hasTasks: task._count.epicTasks > 0 },
    { isEpic: change.isEpic, epic, milestone },
  )

  const data: Prisma.TaskUncheckedUpdateInput = { ...dates }
  if (change.isEpic !== undefined) data.isEpic = change.isEpic
  if (change.epicId !== undefined) data.epicId = change.epicId
  if (change.milestoneId !== undefined) data.milestoneId = change.milestoneId
  // A task that stops being an epic keeps no milestone: only an epic has one.
  if (change.isEpic === false) data.milestoneId = null
  const result = await prisma.task.update({ where: { id: taskId }, data })
  if (result.boardId) {
    const { emitTaskUpdated } = await import('../server/socket')
    emitTaskUpdated(result.boardId)
  }
  triggerSnapshotPush()
  return result
}

// ── Milestones ────────────────────────────────────────────────────────────────

function milestoneName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new HttpError(400, 'A milestone needs a name')
  if (trimmed.length > 200) throw new HttpError(400, "A milestone's name is at most 200 characters")
  return trimmed
}

function milestoneDate(date: string): Date {
  const { planStart } = planDates({ planStart: date })
  return planStart!
}

export async function listMilestones(projectId: string) {
  const milestones = await prisma.milestone.findMany({
    where: { projectId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    include: { epics: { select: { id: true, number: true, title: true } } },
  })
  return milestones
}

export async function createMilestone(params: { projectId: string; name: string; date: string }) {
  return prisma.milestone.create({ data: { projectId: params.projectId, name: milestoneName(params.name), date: milestoneDate(params.date) } })
}

export async function updateMilestone(params: { milestoneId: string; name?: string; date?: string }) {
  const data: Prisma.MilestoneUpdateInput = {}
  if (params.name !== undefined) data.name = milestoneName(params.name)
  if (params.date !== undefined) data.date = milestoneDate(params.date)
  return prisma.milestone.update({ where: { id: params.milestoneId }, data })
}

/** Its epics stay; they just belong to no milestone. */
export async function deleteMilestone(milestoneId: string) {
  return prisma.milestone.delete({ where: { id: milestoneId } })
}

export async function projectOfMilestone(milestoneId: string): Promise<string> {
  const m = await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } })
  if (!m) throw new HttpError(404, 'Milestone not found')
  return m.projectId
}
