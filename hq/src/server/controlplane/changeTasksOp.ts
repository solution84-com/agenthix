/**
 * change_tasks — the same change to several tasks of one project, as the Tasks screen's actions on ticked tasks make
 * it (spec T4, the phone's selection mode): to a task state, into a sprint or out of one, to an epic or an agent, or
 * archived. A sprint is planned for all of them at once, or for none; every other change is made task by task, and the
 * answer names the tasks it did not reach and why. Nothing here starts, stops or queues a run.
 */
import { prisma } from 'wasp/server'
import { CHANGE_TASKS_MAX } from '@agenthix/core'
import type { TaskState } from '@prisma/client'
import { ControlPlaneError, type CallerContext } from './types'
import { requireProjectEntitlement } from './authorize'
import { callerActor } from './runOnBehalfOf'
import { asControlPlane } from './asControlPlane'
import { taskIdFor } from './taskKey'
import { optionalTaskIdOf } from './taskToolShapes'
import { applyArchived, applyPlace, applySprint, refusalAfter } from './taskToolWrites'
import { updateTask } from '../../projects/projectService'
import { setTaskPlan } from '../../projects/taskPlanService'
import { requireAgentOnProject } from '../../projects/resourceEntitlement'

interface ChangeTasksArgs {
  taskIds: string[]
  state?: TaskState
  sprintId?: string | null
  epicId?: string | null
  assignedAgentId?: string | null
  archived?: boolean
}

type NotChanged = { task: string; reason: string }

const NOTHING_ASKED = 'Name what to change: a state, a sprint, an epic, an agent, or archived. Nothing was changed.'

export async function changeTasksOp(ctx: CallerContext, args: ChangeTasksArgs) {
  const asked = [args.state, args.sprintId, args.epicId, args.assignedAgentId, args.archived].some(v => v !== undefined)
  if (!asked) throw new ControlPlaneError('invalid', NOTHING_ASKED)
  if (!Array.isArray(args.taskIds) || args.taskIds.length === 0) throw new ControlPlaneError('invalid', 'Name the tasks to change. Nothing was changed.')
  if (args.taskIds.length > CHANGE_TASKS_MAX) throw new ControlPlaneError('invalid', `At most ${CHANGE_TASKS_MAX} tasks at once. Nothing was changed.`)

  const notChanged: NotChanged[] = []
  const ids: string[] = []
  for (const words of args.taskIds) {
    const found = await taskIdFor(words)
    if ('refusal' in found) notChanged.push({ task: words, reason: found.refusal })
    else if (!ids.includes(found.taskId)) ids.push(found.taskId)
  }
  const tasks = await prisma.task.findMany({
    where: { id: { in: ids } },
    select: { id: true, projectId: true, runState: true, number: true, project: { select: { key: true } } },
  })
  const projects = new Set(tasks.map(t => t.projectId))
  if (projects.size > 1) throw new ControlPlaneError('invalid', 'The tasks are in more than one project: change one project\'s at a time. Nothing was changed.')
  if (tasks.length === 0) throw new ControlPlaneError('not_found', `None of those tasks was found: ${notChanged.map(n => n.reason).join('; ')}`)
  const projectId = tasks[0]!.projectId
  await requireProjectEntitlement(ctx, projectId, 'change_tasks', 'work')
  if (args.assignedAgentId) await asControlPlane(() => requireAgentOnProject(projectId, args.assignedAgentId!))
  const epicId = await optionalTaskIdOf(args.epicId)
  const actor = callerActor(ctx)

  // All of them into the sprint, or none: planning refuses the whole set when one task cannot go (an epic, say).
  if (args.sprintId !== undefined) await applySprint(projectId, tasks.map(t => t.id), args.sprintId, actor)

  const changed: string[] = []
  for (const task of tasks) {
    const key = `${task.project.key}-${task.number}`
    const done: string[] = args.sprintId !== undefined ? ['its sprint'] : []
    try {
      if (args.state) { await applyPlace(task.id, { state: args.state }, actor); done.push('its state') }
      if (epicId !== undefined) { await asControlPlane(() => setTaskPlan(task.id, { epicId }, actor)); done.push('its epic') }
      if (args.assignedAgentId !== undefined) { await updateTask({ taskId: task.id, assignedAgentId: args.assignedAgentId, actor }); done.push('its agent') }
      if (args.archived !== undefined) await applyArchived(task, args.archived, actor)
      changed.push(key)
    } catch (err) {
      if (!(err instanceof ControlPlaneError)) throw err
      notChanged.push({ task: key, reason: (refusalAfter(err, done) as ControlPlaneError).message })
    }
  }
  return { success: notChanged.length === 0, changed, notChanged }
}
