/**
 * Task and board (task-facing) operations — control-plane service layer
 * (hq/site split spec §7.2, plan 5b-2 task 3).
 *
 * Ported verbatim from mcpServer.ts's tool handlers, with authorization moved
 * in from the MCP wiring per authorize.ts's contract. Each export takes
 * `(ctx, args)` and returns the plain value the MCP tool used to format —
 * never an MCP-shaped `{ content, isError }` response. Domain/validation
 * errors that used to short-circuit with `mcpError(...)` now throw
 * `ControlPlaneError('invalid', ...)`, letting the transport layer decide
 * how to render an error.
 */
import { prisma } from 'wasp/server'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import nodePath from 'node:path'
import { ControlPlaneError, type CallerContext } from './types'
import { actingAgentId } from './authorize'
import { loadTaskScoped } from './taskScoped'
import { projectsVisibleToRun } from './runProjectScope'
import { readToolTask } from './taskToolShapes'
import { taskCommentsForAgent } from '../../agents/taskCommentsForRun'
import { getTaskAttachmentDir } from '../hqStoragePaths'
import { attachmentFileNameProblem } from '../../shared/attachmentFileName'
import { attachmentReference } from '../../shared/taskReferences'
import {
  listAgentTasks,
  getTask,
  archiveTask,
  deleteTask,
  createTaskComment,
} from '../../projects/projectService'
import { taskFieldValues } from '../../projects/fieldService'
import { withDisplayReason } from '../../projects/taskReasonDisplay'
import { callerActor } from './runOnBehalfOf'

// update_task and create_task live in taskWriteOps.ts, change_tasks in changeTasksOp.ts, list_tasks in taskListOp.ts,
// run_task in runTaskOp.ts (the file-size rule); re-exported so callers keep one door.
export { updateTaskOp, createTaskOp } from './taskWriteOps'
export { changeTasksOp } from './changeTasksOp'
export { listTasksOp } from './taskListOp'
export { runTaskOp } from './runTaskOp'

// ── fetch_my_queued_tasks ────────────────────────────────────────────────────

export async function fetchMyQueuedTasksOp(ctx: CallerContext, args: { agentId?: string }) {
  const agentId = actingAgentId(ctx, args.agentId)
  // The agent names whose queue; the run's authority decides which of its
  // projects the queue may show.
  const tasks = await listAgentTasks(agentId, await projectsVisibleToRun(ctx, 'fetch_my_queued_tasks'))
  return {
    tasks: tasks.map(t => ({
      taskId: t.id, title: t.title, description: t.description,
      priority: t.priority, state: t.state, projectId: t.projectId,
      runState: t.runState, labels: t.labels,
    })),
    source: 'local',
  }
}

// ── get_task_details ─────────────────────────────────────────────────────────

export async function getTaskDetailsOp(ctx: CallerContext, args: { taskId: string }) {
  await loadTaskScoped(ctx, args.taskId, 'get_task_details', 'read')
  const task = await withDisplayReason(await getTask(args.taskId))
  if (!task) throw new ControlPlaneError('not_found', `Task ${args.taskId} not found`)
  const taskKey = `${task.project.key}-${task.number}`
  const [attachments, place, fieldValues] = await Promise.all([
    prisma.taskAttachment.findMany({
      where: { taskId: task.id }, orderBy: { createdAt: 'asc' }, select: { fileName: true, fileSizeBytes: true, label: true },
    }),
    readToolTask(task.id),
    taskFieldValues(task.id),
  ])
  const columns = task.typeId
    ? await prisma.typeColumn.findMany({ where: { typeId: task.typeId }, orderBy: { order: 'asc' }, select: { id: true, name: true, state: true, defaultForState: true } })
    : []
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  return {
    taskId: task.id, taskKey, title: task.title, description: task.description,
    priority: task.priority, projectId: task.projectId, assignedAgentId: task.assignedAgentId,
    // Where it is in the plan: its type and column, so its task state (adr-0174); what an agent is doing with it is
    // its execution state, set by the system.
    type: place.type, typeId: task.typeId, column: place.column, columnId: task.columnId, state: task.state,
    executionState: task.executionState, runStateReason: task.runStateReason,
    // The columns update_task may move it to, in its type's order.
    typeColumns: columns.map(c => ({ columnId: c.id, name: c.name, state: c.state, ...(c.defaultForState ? { defaultForState: true } : {}) })),
    labels: task.labels, createdAt: task.createdAt, updatedAt: task.updatedAt,
    applicationData: task.applicationData ?? null,
    sprint: task.sprint ? { sprintId: task.sprint.id, number: task.sprint.number, name: task.sprint.name, finished: task.sprint.finishedAt !== null } : null,
    fieldValues: Object.fromEntries(fieldValues.map(v => [v.fieldId, v.optionId])),
    // The plan: when the work is meant to happen. Apart from its start time and its runs (adr-0098).
    planStart: day(task.planStart), planFinish: day(task.planFinish),
    epic: task.epic ? { taskId: task.epic.id, number: task.epic.number, title: task.epic.title } : null,
    milestone: task.milestone ? { milestoneId: task.milestone.id, name: task.milestone.name, date: day(task.milestone.date) } : null,
    // Every comment, oldest first: a run is opened with only those new since its last (spec §9).
    comments: await taskCommentsForAgent(args.taskId),
    // Each attachment's reference is what a reply writes to show the file to a person; there is no address to write.
    attachments: attachments.map(a => ({
      name: a.fileName, sizeBytes: a.fileSizeBytes, label: a.label, reference: attachmentReference(taskKey, a.fileName),
    })),
    source: 'local',
  }
}

// ── archive_task / delete_task (spec §H5: as in the browser) ──

export async function archiveTaskOp(ctx: CallerContext, args: { taskId: string }) {
  const task = await loadTaskScoped(ctx, args.taskId, 'archive_task', 'work')
  if (task.runState === 'RUN_ACTIVE') {
    throw new ControlPlaneError('invalid', 'Cannot archive a task that is currently running')
  }
  await archiveTask(args.taskId, callerActor(ctx))
  return { success: true, taskId: args.taskId, source: 'local' }
}

export async function deleteTaskOp(ctx: CallerContext, args: { taskId: string }) {
  const task = await loadTaskScoped(ctx, args.taskId, 'delete_task', 'work')
  if (task.runState === 'RUN_ACTIVE') {
    throw new ControlPlaneError('invalid', 'Cannot delete a task that is currently running')
  }
  await deleteTask(args.taskId)
  return { success: true, taskId: args.taskId, source: 'local' }
}

// ── tick_subtask (DEPRECATED) ────────────────────────────────────────────────

export async function tickSubtaskOp(): Promise<never> {
  throw new ControlPlaneError('invalid', 'tick_subtask is deprecated — use update_task instead.')
}

// ── attach_file ───────────────────────────────────────────────────────────────

interface AttachFileArgs {
  agentId?: string
  taskId: string
  name?: string
  filename: string
  content: string
  label?: string
}

export async function attachFileOp(ctx: CallerContext, args: AttachFileArgs) {
  // Confinement check MUST happen before any filesystem write — a fabricated
  // taskId must 404 rather than land bytes for a task that doesn't exist.
  //
  // Membership, not role alone: the browser's own upload asks for it
  // (projects/actions.ts), and a chat caller is a person's authority carried
  // into a run, not a way past the rule that person is held to. Without it any
  // signed-in person could attach a file to any task in the org, private
  // projects included — which is why every task operation above now asks for
  // the same thing.
  const task = await loadTaskScoped(ctx, args.taskId, 'attach_file', 'work')

  const nameProblem = attachmentFileNameProblem(args.filename)
  if (nameProblem) throw new ControlPlaneError('invalid', nameProblem)

  const uuid = randomUUID()
  const dir = getTaskAttachmentDir(task.id, uuid)
  await fs.mkdir(dir, { recursive: true })
  const filePath = nodePath.join(dir, args.filename)
  await fs.writeFile(filePath, args.content, 'utf-8')
  const attachment = await prisma.taskAttachment.create({
    data: { taskId: task.id, uuid, fileName: args.filename, label: args.label ?? null, fileSizeBytes: Buffer.byteLength(args.content, 'utf-8') },
  })
  const named = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, select: { number: true, project: { select: { key: true } } } })

  // No URL and no path: an agent carries a run capability, not a browser
  // session, so a link would answer 401, and hq's disk path means nothing to it.
  // The reference is what its reply writes to show the file to a person.
  return {
    success: true, attachmentId: attachment.id, fileName: args.filename,
    reference: attachmentReference(`${named.project.key}-${named.number}`, args.filename),
  }
}

// ── add_comment ───────────────────────────────────────────────────────────────

export async function addCommentOp(
  ctx: CallerContext,
  args: { taskId: string; agentId?: string; runId?: string; content: string },
) {
  await loadTaskScoped(ctx, args.taskId, 'add_comment', 'work')
  // A connection writes as its person, never as an agent it names (adr-0090).
  if (ctx.kind === 'connection') {
    const { userId, connectionId } = ctx.connection
    const comment = await createTaskComment({ taskId: args.taskId, authorType: 'USER', userId, connectionId, content: args.content })
    return { success: true, commentId: comment.id, source: 'local' }
  }
  const agentId = actingAgentId(ctx, args.agentId)
  // A turn is no run: a run id it names would attribute the comment to work it did not do.
  const runId = ctx.kind === 'turn' ? undefined : args.runId
  const comment = await createTaskComment({ taskId: args.taskId, authorType: 'AGENT', agentId, runId, content: args.content })
  return { success: true, commentId: comment.id, source: 'local' }
}
