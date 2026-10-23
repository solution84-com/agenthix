/**
 * Task Service
 * ============
 * Pure business logic for tasks: listing, creation, edits and moves between
 * boards and columns. A task is always on exactly one board — Project Tasks
 * when put on no other — and in one of its columns or its Backlog (adr-0097).
 * No auth, no HTTP. Re-exported from `projectService`.
 */
import { prisma } from 'wasp/server'
import { HttpError } from 'wasp/server'
import { Prisma, type TaskPriority, type TaskRunState } from '@prisma/client'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { recordActivity } from '../server/dashboard/activity'
import { boardForNewTask, refuseArchivedBoard, ensureProjectTasks } from './boardService'
import { parseColumns, sortedColumns, findColumn, resolveColumn, stateOfPlace, type BoardColumn } from './boardColumns'
import { sprintForPlace } from './sprintService'
import { nudgeScheduler } from '../automation/schedulerNudge'
import { notifyBoardsOfTasks } from './boardNotify'
import { roundDeleted } from '../automation/routines'
import { refuseBoardAcrossPersonalEdge, refuseMoveAcrossPersonalEdge } from './personalProject'
import { type Queuer, type TaskOrigin } from './taskOnBehalfOf'
import { applyMoveToRunState, queueRunIfNone, withdrawPendingRun } from './taskRunMoves'
import { taskArchived, taskDeleted, taskLeadChanged } from '../conversations/taskThread/lifecycle'

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTask(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      board:   { select: { name: true, kind: true, columns: true } },
      sprint:  { select: { id: true, number: true, name: true, startDate: true, finishDate: true, finishedAt: true } },
      epic:    { select: { id: true, number: true, title: true } },
      milestone: { select: { id: true, name: true, date: true } },
      project: { select: { name: true } },
    },
  })
}

/**
 * `project` is required, not optional: an agent's queue spans every project it
 * is assigned in, so the caller must say which of them the reader may see —
 * `undefined` only for a reader entitled to all of them.
 */
export async function listAgentTasks(agentId: string, project: Prisma.ProjectWhereInput | undefined) {
  return prisma.task.findMany({
    where: {
      assignedAgentId: agentId, runState: { in: ['RUN_QUEUED', 'RUN_THROTTLED'] }, column: { not: null },
      ...(project ? { project } : {}),
    },
    include: { board: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * `project` is a filter like the rest: it narrows the listing to the projects
 * the reader may see — for a person, those they are entitled to, exactly as the
 * browser's own task listing does (`getAllTasks`'s `entitledProjectsFilter`).
 */
export async function listTasks(params: {
  projectId?: string
  boardId?: string
  backlogOnly?: boolean
  assignedAgentId?: string
  runState?: string
  status?: string
  priority?: string
  limit?: number
  project: Prisma.ProjectWhereInput
}) {
  const { projectId, boardId, backlogOnly, assignedAgentId, runState, status, priority, project, limit = 50 } = params
  const where: Record<string, unknown> = { project }
  if (projectId)        where.projectId        = projectId
  if (boardId)          where.boardId          = boardId
  if (backlogOnly)      where.column           = null
  if (assignedAgentId)  where.assignedAgentId  = assignedAgentId
  if (runState)   where.runState   = runState
  if (status)           where.status           = status
  if (priority)         where.priority         = priority
  return prisma.task.findMany({
    where,
    include: { board: { select: { name: true } }, assignedAgent: { select: { id: true, name: true, handle: true } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
}

export async function createTask(params: {
  title: string
  projectId: string
  /** Omitted: Project Tasks. */
  boardId?: string
  /** A column of the board, by name or state; omitted, null or unknown: the board's Backlog. */
  column?: string | null
  assignedAgentId?: string
  description?: string
  labels?: string[]
  priority?: string
  /** The model its runs name (`<providerId>/<model>`), already checked; null follows the default. */
  modelChoice?: string | null
  /** Queue a run of it on creation (it waits for the pulse or a person). */
  queue?: boolean
  /** An agent over its boundary's queue limit: the task lands unqueued even in an auto-queue column. */
  suppressAutoQueue?: boolean
  /** Who the task is done on behalf of, and who is queueing it if it lands queued (adr-0089). */
  origin: TaskOrigin
  /** How deep in a chain of agent-queued work it is queued (adr-0091); 0 for a person. */
  queueDepth?: number
}) {
  const { priority, labels, queue, column: wanted, suppressAutoQueue, origin, queueDepth, boardId: givenBoard, ...rest } = params
  await refuseBoardAcrossPersonalEdge(params.projectId, givenBoard)
  if (givenBoard) await refuseArchivedBoard(givenBoard)
  const boardId = await boardForNewTask(params.projectId, givenBoard)

  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { columns: true } })
  const columns = parseColumns(board?.columns)
  // Work asked to run is put where work runs: a queued task with no column named
  // goes to the board's first column, since the Backlog never starts anything.
  const dest = wanted ? resolveColumn(columns, wanted) : queue ? sortedColumns(columns)[0] : undefined
  const column = dest?.name ?? null
  const status = stateOfPlace(columns, column)
  const sprintId = await sprintForPlace(boardId, column)

  const task = await prisma.$transaction(async (tx) => {
    const agg = await tx.task.aggregate({
      where: { projectId: params.projectId },
      _max: { number: true },
    })
    const number = (agg._max.number ?? 0) + 1
    return tx.task.create({
      data: {
        ...rest,
        boardId,
        column,
        sprintId,
        status,
        ...(status === 'DONE' ? { doneAt: new Date() } : {}),
        priority:       (priority?.toUpperCase() as TaskPriority | undefined) ?? 'MEDIUM',
        labels:         labels ?? [],
        runState: 'RUN_NONE',
        onBehalfOfUserId: origin.onBehalfOfUserId,
        createdByConnectionId: origin.connectionId ?? null,
        number,
      },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  // Queued on arrival when asked, or when it lands in a column that queues
  // automatically — never in a done column, where the work is already decided,
  // and never from the Backlog, which starts nothing.
  const landsDone = status === 'DONE'
  const queues = !landsDone && (queue === true || (!!dest?.autoQueue && !suppressAutoQueue))
  const queued = queues && (await queueRunIfNone(task.id, origin.queuer, queueDepth ?? 0))
  if (queued) {
    await notifyBoardsOfTasks([task.id])
    nudgeScheduler()
  }

  triggerSnapshotPush()

  if (!queued) return task
  const now = await prisma.task.findUnique({ where: { id: task.id }, select: { runState: true, queueDepth: true } })
  return { ...task, ...now }
}

export async function updateTask(params: {
  taskId: string
  title?: string
  description?: string
  assignedAgentId?: string | null
  priority?: string
  labels?: string[]
  modelChoice?: string | null
  status?: string
  /** System use only (a person's Stop, putting a run state back): agents and the person's edit never set it. */
  runState?: TaskRunState
  runStateReason?: string | null
  result?: string | null
}) {
  const { taskId, priority, ...rest } = params
  // The task's thread follows its agent (taskThread/lifecycle.ts): read who it was before the change.
  const before = params.assignedAgentId !== undefined
    ? await prisma.task.findUnique({ where: { id: taskId }, select: { assignedAgentId: true } })
    : null
  const result = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...rest,
      ...(priority !== undefined && { priority: priority.toUpperCase() as any }),
      ...(params.status !== undefined && { doneAt: params.status === 'DONE' ? new Date() : null }),
    } as any,
  })
  if (result.boardId && (params.runState !== undefined || params.status !== undefined)) {
    const { emitTaskUpdated } = await import('../server/socket')
    emitTaskUpdated(result.boardId)
  }

  triggerSnapshotPush()
  if (before && before.assignedAgentId !== result.assignedAgentId) {
    await taskLeadChanged([taskId], before.assignedAgentId, result.assignedAgentId)
  }

  return result
}

export async function deleteTask(taskId: string) {
  const result = await prisma.task.delete({ where: { id: taskId } })
  // A routine's waiting round deleted skips that one time (spec §3).
  await roundDeleted(result)
  await taskDeleted(taskId)
  triggerSnapshotPush()
  return result
}

export async function archiveTask(taskId: string) {
  const result = await prisma.task.update({ where: { id: taskId }, data: { archived: true } })
  await taskArchived(taskId)
  return result
}

/**
 * Moves a task to another board, into that board's Backlog (adr-0097): no
 * column and no sprint there, so a queued or throttled run is withdrawn.
 */
export async function moveTaskToBoard(taskId: string, boardId: string) {
  await refuseMoveAcrossPersonalEdge(taskId, boardId)
  await refuseArchivedBoard(boardId)
  const result = await prisma.task.update({
    where: { id: taskId },
    data: { boardId, column: null, sprintId: null, status: 'TODO', doneAt: null },
  })
  await withdrawPendingRun(taskId)
  const { emitTaskUpdated } = await import('../server/socket')
  emitTaskUpdated(boardId)
  triggerSnapshotPush()
  return result
}

/** The Backlog starts nothing: a queued or throttled run is withdrawn (taskRunMoves.ts). */
export async function returnTaskToBacklog(params: { taskId: string }) {
  const result = await prisma.task.update({
    where: { id: params.taskId },
    data: { column: null, sprintId: null, status: 'TODO', doneAt: null },
  })
  await withdrawPendingRun(params.taskId)
  return result
}

/**
 * Moves a task into a column — of its own board, or of `boardId` when named —
 * or, with `column` null, into that board's Backlog. Its state follows the
 * column; on a sprint board a column puts it in the current sprint.
 */
export async function moveTaskToColumn(params: {
  taskId: string
  column: string | null
  boardId?: string
  /** An agent over its boundary's queue limit: the move does not queue the task even into an auto-queue column. */
  suppressAutoQueue?: boolean
  /** Who is queueing it, when the move lands it in an auto-queue column (adr-0089). */
  queuer?: Queuer | null
  /** How deep in a chain of agent-queued work the move would queue it (adr-0091); 0 for a person. */
  queueDepth?: number
}) {
  await refuseMoveAcrossPersonalEdge(params.taskId, params.boardId)
  const current = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: { boardId: true, projectId: true, status: true, doneAt: true, sprintId: true },
  })
  if (!current) throw new HttpError(404, `Task '${params.taskId}' not found`)
  const targetBoardId = params.boardId ?? current.boardId ?? (await ensureProjectTasks(current.projectId))
  if (targetBoardId !== current.boardId) await refuseArchivedBoard(targetBoardId)

  const board = await prisma.board.findUnique({ where: { id: targetBoardId }, select: { columns: true, kind: true } })
  if (!board) throw new HttpError(404, `Board '${targetBoardId}' not found`)
  const columns: BoardColumn[] = parseColumns(board.columns)
  const dest = findColumn(columns, params.column)
  // Validate the client-supplied column against the board's own (F-010a).
  if (params.column !== null && !dest) throw new HttpError(400, `Invalid column '${params.column}' for this board`)
  if (params.column === null) {
    if (targetBoardId !== current.boardId) return moveTaskToBoard(params.taskId, targetBoardId)
    return returnTaskToBacklog({ taskId: params.taskId })
  }

  const status = stateOfPlace(columns, params.column)
  // On a sprint board a task in a column is in the current sprint; a done task
  // already recorded in a past sprint keeps it while it stays done.
  const keepsSprint = board.kind === 'SPRINTS' && current.boardId === targetBoardId && current.sprintId !== null && status === 'DONE'
  const sprintId = keepsSprint ? current.sprintId : await sprintForPlace(targetBoardId, params.column)
  const data: Prisma.TaskUncheckedUpdateInput = {
    column: params.column,
    status,
    boardId: targetBoardId,
    sprintId,
    // Moving between done columns keeps the time it first finished.
    doneAt: status === 'DONE' ? (current.status === 'DONE' && current.doneAt ? current.doneAt : new Date()) : null,
    ...(status === 'DONE' ? { archived: false } : {}),
  }

  const result = await prisma.task.update({ where: { id: params.taskId }, data })
  // The move itself never changes the run state; the column it lands in may
  // queue a run or withdraw a pending one (taskRunMoves.ts).
  const runChange = await applyMoveToRunState(
    params.taskId,
    { status, autoQueue: dest?.autoQueue ?? false },
    { suppressAutoQueue: params.suppressAutoQueue, queuer: params.queuer ?? null, depth: params.queueDepth ?? 0 },
  )
  if (status === 'DONE' && current.status !== 'DONE') await recordTaskClosed(result)
  const { emitTaskUpdated } = await import('../server/socket')
  emitTaskUpdated(targetBoardId)
  if (runChange === 'queued') nudgeScheduler()
  triggerSnapshotPush()
  return runChange ? { ...result, ...(await prisma.task.findUnique({ where: { id: params.taskId }, select: { runState: true, runStateReason: true } })) } : result
}

/** A move into a done column, by anyone, is the task closing (spec §6). */
async function recordTaskClosed(task: { id: string; projectId: string; number: number }): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: task.projectId }, select: { key: true } })
  recordActivity('task_closed', `${project?.key ?? 'Task'}-${task.number} closed`, task.id, task.projectId)
}
