/**
 * update_task and create_task — control-plane service layer, split from
 * taskOps.ts (see its header for the shared conventions).
 *
 * A task is always on a board — Project Tasks when none is named — in one of
 * its columns or its Backlog (adr-0097). Its plan, epic and milestone
 * (adr-0098) are set here under the same rules as its other fields, and never
 * start, stop or queue a run.
 */
import { prisma, HttpError } from 'wasp/server'
import { ControlPlaneError, type CallerContext } from './types'
import { requireProjectEntitlement } from './authorize'
import { originOfRun, callerQueuer } from './runOnBehalfOf'
import { loadTaskScoped } from './taskScoped'
import { asControlPlane } from './boardOps'
import { queueGate } from './queueGate'
import { createTask, updateTask, moveTaskToBoard, moveTaskToColumn, parseColumns, findColumn } from '../../projects/projectService'
import { setTaskPlan, hasPlanChange, type PlanChange } from '../../projects/taskPlanService'
import { landsInAutoQueueColumn } from '../../projects/autoQueueColumns'
import { checkedTaskWorkspace } from '../../branches/taskWorkspace'

type PlanArgs = {
  planStart?: string | null
  planFinish?: string | null
  isEpic?: boolean
  epicId?: string | null
  milestoneId?: string | null
}

function planOf(args: PlanArgs): PlanChange {
  const { planStart, planFinish, isEpic, epicId, milestoneId } = args
  return { planStart, planFinish, isEpic, epicId, milestoneId }
}

// ── update_task ───────────────────────────────────────────────────────────────

interface UpdateTaskArgs extends PlanArgs {
  taskId: string
  title?: string
  description?: string
  subtasks?: Array<{ title: string; done: boolean }>
  labels?: string[]
  priority?: 'low' | 'medium' | 'high'
  boardId?: string
  /** A column of its board (or of `boardId`'s); null for the Backlog. */
  column?: string | null
  /** One of the project's workspaces, or null for the project's files. */
  workspaceId?: string | null
}

export async function updateTaskOp(ctx: CallerContext, args: UpdateTaskArgs) {
  const { taskId, title, description, labels, priority, subtasks, boardId, column } = args
  await loadTaskScoped(ctx, taskId, 'update_task', 'work')
  const workspaceId = args.workspaceId === undefined ? undefined : await asControlPlane(async () => {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
    if (!task) throw new ControlPlaneError('not_found', `Task ${taskId} not found`)
    return checkedTaskWorkspace(task.projectId, args.workspaceId)
  })

  const contentFields = { title, description, labels, priority, subtasks, workspaceId }
  const contentProvided = Object.fromEntries(
    Object.entries(contentFields).filter(([, v]) => v !== undefined)
  )
  const plan = planOf(args)

  if (Object.keys(contentProvided).length === 0 && column === undefined && boardId === undefined && !hasPlanChange(plan)) {
    throw new ControlPlaneError('invalid', 'At least one field must be provided to update')
  }

  let notQueued: string | null = null

  // Board assignment — cross-project moves fail closed: the destination board
  // must itself be inside the caller's project scope, not just the source task.
  if (boardId !== undefined) {
    const targetBoard = await prisma.board.findUnique({ where: { id: boardId }, select: { projectId: true } })
    if (!targetBoard) throw new ControlPlaneError('not_found', `Board ${boardId} not found`)
    await requireProjectEntitlement(ctx, targetBoard.projectId, 'update_task', 'work')
    // Into the board's Backlog, unless a column is named too (below).
    if (column === undefined) await asControlPlane(() => moveTaskToBoard(taskId, boardId))
  }

  if (column !== undefined) {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { boardId: true, projectId: true } })
    const onBoard = boardId ?? task?.boardId
    if (!onBoard || !task) throw new ControlPlaneError('invalid', 'Task is not on a board')
    const board = await prisma.board.findUnique({ where: { id: onBoard }, select: { columns: true } })
    const columns = parseColumns(board?.columns)
    const target = column === null ? null : findColumn(columns, column)
    if (column !== null && !target) {
      throw new ControlPlaneError('invalid', `Column '${column}' not found. Available: ${columns.map(c => c.name).join(', ')}, or null for the Backlog`)
    }
    // An agent moving a task into an auto-queue column queues it — a finished
    // one moved back included — so the same depth and queue limit as
    // create_task apply: otherwise create-then-move, or recycling an old task,
    // would pass around them (adr-0091).
    const gate = target?.autoQueue ? await queueGate(ctx, task.projectId) : { depth: 0, refusal: null }
    await asControlPlane(() => moveTaskToColumn({
      taskId, column, boardId: onBoard,
      queuer: callerQueuer(ctx),
      queueDepth: gate.depth,
      ...(gate.refusal ? { suppressAutoQueue: true } : {}),
    }))
    notQueued = gate.refusal
  }

  if (Object.keys(contentProvided).length > 0) {
    await updateTask({ taskId, ...contentProvided })
  }
  if (hasPlanChange(plan)) await asControlPlane(() => setTaskPlan(taskId, plan))

  const updatedFields = [
    ...Object.keys(contentProvided),
    ...(column !== undefined ? ['column'] : []),
    ...(boardId !== undefined ? ['boardId'] : []),
    ...Object.entries(plan).filter(([, v]) => v !== undefined).map(([k]) => k),
  ]
  return { success: true, taskId, updated: updatedFields, ...(notQueued ? { queued: false, note: notQueued } : {}), source: 'local' }
}

// ── create_task ───────────────────────────────────────────────────────────────

interface CreateTaskArgs extends PlanArgs {
  title: string
  projectId: string
  /** Omitted: Project Tasks. */
  boardId?: string
  /** A column of the board, by name or state; omitted: its Backlog (its first column when queued). */
  column?: string
  assignedAgentId?: string
  description?: string
  labels?: string[]
  priority?: 'low' | 'medium' | 'high'
  /** Queue a run of it: it waits for the project's pulse, or a person. */
  queue?: boolean
  /** One of the project's workspaces for it to work in. */
  workspaceId?: string
}

export async function createTaskOp(ctx: CallerContext, args: CreateTaskArgs) {
  await requireProjectEntitlement(ctx, args.projectId, 'create_task', 'work')
  // A destination board must itself sit inside the caller's project scope —
  // otherwise an unattended run confined to p1 could create a task straight
  // onto a board in p2 (createTask spreads boardId into task.create verbatim).
  if (args.boardId) {
    const board = await prisma.board.findUnique({ where: { id: args.boardId }, select: { projectId: true } })
    if (!board) throw new ControlPlaneError('not_found', `Board ${args.boardId} not found`)
    await requireProjectEntitlement(ctx, board.projectId, 'create_task', 'work')
  }
  const workspaceId = await asControlPlane(() => checkedTaskWorkspace(args.projectId, args.workspaceId))
  const origin = await originOfRun(ctx, args.projectId, 'create_task')
  // The depth and the queue limit (spec §2) apply to agents only: past either,
  // the task is still created, but not queued, and the result says so.
  const wouldQueue = args.queue === true || (await landsInAutoQueueColumn(args.boardId, args.column))
  const gate = wouldQueue ? await queueGate(ctx, args.projectId) : { depth: 0, refusal: null }
  try {
    const task = await createTask({
      title: args.title, projectId: args.projectId, boardId: args.boardId, column: args.column,
      assignedAgentId: args.assignedAgentId, description: args.description, labels: args.labels,
      priority: args.priority, ...(workspaceId ? { workspaceId } : {}),
      queue: !gate.refusal && args.queue === true,
      origin,
      queueDepth: gate.depth,
      ...(gate.refusal ? { suppressAutoQueue: true } : {}),
    })
    const plan = planOf(args)
    // A plan that breaks a rule leaves no task behind: the call is refused whole.
    if (hasPlanChange(plan)) await setTaskPlan(task.id, plan).catch(async (err) => {
      await prisma.task.delete({ where: { id: task.id } })
      throw err
    })
    const out = { success: true, taskId: task.id, boardId: task.boardId, column: task.column, source: 'local' }
    if (gate.refusal) return { ...out, queued: false, note: gate.refusal }
    return out
  } catch (err) {
    // A refusal of the task's own (an archived board, a plan or epic that
    // breaks a rule) reads as what it is; anything else propagates uncaught
    // into dataApi's opaque 500 / MCP's JSON-RPC InternalError (ADR-0047).
    if (err instanceof HttpError && err.statusCode < 500) throw new ControlPlaneError(err.statusCode === 404 ? 'not_found' : 'invalid', err.message)
    throw err
  }
}
