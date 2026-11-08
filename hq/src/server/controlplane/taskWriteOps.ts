/**
 * create_task and update_task — control-plane service layer, split from taskOps.ts (see its header for the shared
 * conventions).
 *
 * A task has a type and is in one of its type's columns, so in a task state (adr-0174). A new one starts in Backlog,
 * last in the project's order, unless a column or a state is named. Each change goes through the service the screens
 * use, as the person the call is for, and none starts, stops or queues a run (adr-0175): creating, moving or assigning
 * a task starts nothing. The one explicit act here is create_task asked to start (`queue`), through the start gate
 * (startGate.ts), as run_task is.
 */
import { prisma, HttpError } from 'wasp/server'
import type { TaskState } from '@prisma/client'
import { ControlPlaneError, type CallerContext } from './types'
import { requireProjectEntitlement } from './authorize'
import { originOfRun, callerActor, callerQueuer } from './runOnBehalfOf'
import { loadTaskScoped } from './taskScoped'
import { asControlPlane } from './asControlPlane'
import { createTask, updateTask } from '../../projects/projectService'
import { setTaskPlan, hasPlanChange, type PlanChange } from '../../projects/taskPlanService'
import { requireAgentOnProject } from '../../projects/resourceEntitlement'
import { checkedTaskWorkspace } from '../../branches/taskWorkspace'
import { optionalTaskIdOf, readToolTask } from './taskToolShapes'
import { applyArchived, applyFieldValues, applyPlace, applySprint, hasPlace, refusalAfter } from './taskToolWrites'
import { startGate } from './startGate'
import { startByTool } from './startByTool'
import { refuseOwnTaskMoveWhileAsking } from './ownTaskWhileAsking'

type Priority = 'low' | 'medium' | 'high'

/** What create_task and update_task share (core's TASK_FIELDS). */
interface TaskFieldArgs {
  title?: string
  description?: string
  typeId?: string
  columnId?: string
  state?: TaskState
  sprintId?: string | null
  epicId?: string | null
  assignedAgentId?: string | null
  priority?: Priority
  labels?: string[]
  planStart?: string | null
  planFinish?: string | null
  milestoneId?: string | null
  workspaceId?: string | null
  fieldValues?: Record<string, string>
}

async function checkedAgent(projectId: string, agentId: string | null | undefined): Promise<void> {
  if (agentId) await asControlPlane(() => requireAgentOnProject(projectId, agentId))
}

const planOf = (a: TaskFieldArgs & { epicId?: string | null }): PlanChange =>
  ({ planStart: a.planStart, planFinish: a.planFinish, epicId: a.epicId, milestoneId: a.milestoneId })

// ── update_task ───────────────────────────────────────────────────────────────

interface UpdateTaskArgs extends TaskFieldArgs {
  taskId: string
  afterTaskId?: string
  beforeTaskId?: string
  archived?: boolean
}

export async function updateTaskOp(ctx: CallerContext, args: UpdateTaskArgs) {
  const task = await loadTaskScoped(ctx, args.taskId, 'update_task', 'work')
  refuseOwnTaskMoveWhileAsking(ctx, [task.id], [args.typeId, args.columnId, args.state].some(v => v !== undefined))
  const actor = callerActor(ctx)
  const epicId = await optionalTaskIdOf(args.epicId)
  const place = {
    typeId: args.typeId, columnId: args.columnId, state: args.state,
    afterTaskId: (await optionalTaskIdOf(args.afterTaskId)) ?? undefined,
    beforeTaskId: (await optionalTaskIdOf(args.beforeTaskId)) ?? undefined,
  }
  const plan = planOf({ ...args, epicId })
  const content = Object.fromEntries(Object.entries({
    title: args.title, description: args.description, labels: args.labels, priority: args.priority,
    assignedAgentId: args.assignedAgentId,
  }).filter(([, v]) => v !== undefined))
  const fields = args.fieldValues && Object.keys(args.fieldValues).length > 0 ? args.fieldValues : null
  const asked = hasPlace(place) || hasPlanChange(plan) || Object.keys(content).length > 0 || args.workspaceId !== undefined ||
    args.sprintId !== undefined || fields !== null || args.archived !== undefined
  if (!asked) throw new ControlPlaneError('invalid', 'Name at least one thing to change. Nothing was changed.')

  await checkedAgent(task.projectId, args.assignedAgentId)
  const workspaceId = await asControlPlane(() => checkedTaskWorkspace(task.projectId, args.workspaceId))

  // The changes most often refused go first, so a refusal usually leaves the task as it was.
  const done: string[] = []
  try {
    if (hasPlace(place)) { await applyPlace(task.id, place, actor); done.push('its place') }
    if (hasPlanChange(plan)) { await asControlPlane(() => setTaskPlan(task.id, plan, actor)); done.push('its plan or epic') }
    if (args.sprintId !== undefined) { await applySprint(task.projectId, [task.id], args.sprintId, actor); done.push('its sprint') }
    if (fields) { await applyFieldValues(task.id, fields, actor); done.push('its field values') }
    if (Object.keys(content).length > 0 || workspaceId !== undefined) {
      await updateTask({ taskId: task.id, ...content, ...(workspaceId !== undefined ? { workspaceId } : {}), actor })
      done.push('its details')
    }
    if (args.archived !== undefined) await applyArchived(task, args.archived, actor)
  } catch (err) {
    throw refusalAfter(err, done)
  }
  return { success: true, taskId: task.id, task: await readToolTask(task.id) }
}

// ── create_task ───────────────────────────────────────────────────────────────

interface CreateTaskArgs extends TaskFieldArgs {
  title: string
  projectId: string
  /** Start a run of it once created: only through the start gate (startGate.ts); refused, it is created, not started. */
  queue?: boolean
}

export async function createTaskOp(ctx: CallerContext, args: CreateTaskArgs) {
  await requireProjectEntitlement(ctx, args.projectId, 'create_task', 'work')
  await checkedAgent(args.projectId, args.assignedAgentId)
  const workspaceId = await asControlPlane(() => checkedTaskWorkspace(args.projectId, args.workspaceId))
  const epicId = await optionalTaskIdOf(args.epicId)
  const origin = await originOfRun(ctx, args.projectId, 'create_task')
  const actor = callerActor(ctx)
  // Who may start it, and at what depth: refused, the task is still created, but not started, and the result says so.
  const gate = args.queue === true ? await startGate(ctx) : null
  const task = await asControlPlane(() => createTask({
    title: args.title, projectId: args.projectId,
    typeId: args.typeId, columnId: args.columnId, state: args.state,
    assignedAgentId: args.assignedAgentId ?? undefined, description: args.description, labels: args.labels,
    priority: args.priority, ...(workspaceId ? { workspaceId } : {}),
    origin,
  }))
  // A plan, sprint or field value that breaks a rule leaves no task behind: the call is refused whole.
  try {
    const plan = planOf({ ...args, epicId })
    if (hasPlanChange(plan)) await asControlPlane(() => setTaskPlan(task.id, plan))
    if (args.sprintId) await applySprint(args.projectId, [task.id], args.sprintId, actor)
    if (args.fieldValues) await applyFieldValues(task.id, args.fieldValues, actor)
  } catch (err) {
    await prisma.task.delete({ where: { id: task.id } })
    if (err instanceof HttpError && err.statusCode < 500) throw new ControlPlaneError('invalid', err.message)
    throw err
  }
  const started = !gate ? {} : gate.refusal !== null ? { queued: false, note: gate.refusal } : await startCreated(task.id, args.projectId, gate, callerQueuer(ctx))
  return { success: true, taskId: task.id, task: await readToolTask(task.id), ...started }
}

/** A task create_task was asked to start: started now, or next in its agent's line, or why not. */
async function startCreated(
  taskId: string,
  projectId: string,
  gate: Parameters<typeof startByTool>[2],
  queuer: Parameters<typeof startByTool>[3],
): Promise<{ queued: boolean; note?: string }> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { assignedAgent: true, type: { select: { kind: true } } } })
  if (task?.type?.kind === 'EPIC') return { queued: false, note: 'The task was not started: an epic is never run. Run its tasks instead.' }
  if (!task?.assignedAgent) return { queued: false, note: 'The task was not started: it has no agent to do it. Assign one with update_task, then start it with run_task.' }
  const result = await startByTool({ id: taskId, projectId }, task.assignedAgent, gate, queuer)
  if (!result || result.outcome === 'skipped') return { queued: false, note: 'The task was not started: something else changed it first.' }
  if (result.outcome === 'failed') return { queued: true, note: `It did not start: ${result.reason}` }
  return { queued: true }
}
