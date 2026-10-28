/**
 * Project Actions — CRUD Operations
 * ===================================
 *
 * Thin Wasp action wrappers: authenticate, then delegate to projectService.
 * Business logic lives in projectService.ts.
 */
import {
  type CreateProject,
  type UpdateProject,
  type DeleteProject,
  type CreateBoard,
  type UpdateBoard,
  type CreateTask,
  type UpdateTask,
  type DeleteTask,
  type MoveTaskToColumn,
  type ReturnTaskToBacklog,
  type RunProject,
  type RunBoard,
  type AddAgentToProject,
  type RemoveAgentFromProject,
  type AddTaskComment,
  type DeleteBoard,
  type RunTask,
} from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import type { Board } from 'wasp/entities'
import type { BoardColumn, ColumnInput } from './boardColumns'
import { MEMBERSHIP_METHODS } from '@agenthix/core'
import type { AddTaskCommentArgs, CreateTaskArgs, MoveTaskToColumnArgs, TaskCommentView, TaskFields } from '@agenthix/core'
import { taskCommentView, taskFields } from './taskWire'
import { checkedTaskModel } from '../models-settings/taskModelChoice'
import { createTaskArgs, requireColumnArg, requireCommentContent } from './taskArgs'
import { taskRunner } from '../agents/TaskRunner'
import { replaceTaskRequests } from '../agents/manifestRequests'
import { requireRole } from '../server/identity/requireRole'
import { requireDefaultSiteRef } from '../sites/localSite'
import { requireProjectAdmin, requireMayWorkInProject, requireMayAssignAgents } from './membership'
import { requireTaskAccess, requireBoardAccess, requireAgentOnProject } from './resourceEntitlement'
import { originByPerson, personQueuer } from './taskOnBehalfOf'
import { askedToStart } from './taskQueueing'
import { rethrowLocationFileErrorAsHttp } from '../storage/httpErrors'
import { findProjectStorageSite, removeProjectStorageOnSite } from './projectStorageRemoval'
import { stopProjectRuns } from './projectRunStop'
import { refuseOnPersonalProject, requireMayDeleteProject } from './personalProject'
import { heldInstructionRows, deliverHeldInstructionsTo } from '../sites/heldInstructions'
import { sitesForProject } from '../sites/membershipEnding'
import { closeProjectConversations, declineWaitingInProject } from '../conversations/closing'
import { notifyBoardsOfTasks } from './boardNotify'
import { LOST_ACCESS_REASON } from './taskOnBehalfOf'
import { LOST_ACCESS_RUN_REFUSAL } from '../agents/taskExecutionReasons'
import { autoQueueChange, changesAutoQueue, applyAutoQueueChange } from './autoQueueColumns'
import { boardTemplateColumns } from '../library/boardTemplateService'
import {
  createProject as createProjectRecord,
  updateProject as updateProjectRecord,
  deleteProject as deleteProjectRecord,
  createBoard as createBoardService,
  updateBoard as updateBoardRecord,
  createTask as createTaskRecord,
  updateTask as updateTaskRecord,
  deleteTask as deleteTaskRecord,
  archiveTask as archiveTaskRecord,
  moveTaskToColumn as moveTaskToColumnRecord,
  returnTaskToBacklog as returnTaskToBacklogRecord,
  addAgentToProject as addAgentToProjectRecord,
  removeAgentFromProject as removeAgentFromProjectRecord,
  createTaskComment,
  deleteBoard as deleteBoardRecord,
} from './projectService'

export const createProject: CreateProject<
  { name: string; description?: string; productId?: string; programId?: string; key?: string; siteId?: string; billingProfileId?: string },
  any
> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Creating a project')
  // With no site registered there is nothing to pick, and the person needs to
  // hear that rather than "pick one" or "that one is not available".
  const defaultSite = await requireDefaultSiteRef()

  // A project's workspace is real bytes on one machine's disk, so the machine is
  // part of what a project is. With none picked, it goes on hq's own default site.
  const site = await prisma.executionSite.findUnique({ where: { siteId: args.siteId ?? defaultSite.siteId } })
  if (!site || site.status === 'REVOKED') {
    throw new HttpError(400, 'That Execution Site is not available')
  }

  const { siteId: _siteId, ...rest } = args
  try {
    return await createProjectRecord({ ...rest, executionSiteId: site.id, createdByUserId: context.user!.id })
  } catch (err) {
    // The project's starter documents are seeded by the site that holds them,
    // so a site that is down or refuses the seed is reported as what it is
    // rather than as a fault in hq.
    rethrowLocationFileErrorAsHttp(err)
  }
}

export const updateProject: UpdateProject<
  {
    projectId: string
    name?: string
    description?: string
    key?: string
    productId?: string | null
    programId?: string | null
    defaultAgentId?: string | null
  },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')

  // Two different acts can arrive on this one operation, and each is gated by
  // the person it belongs to (spec §6.4). Which product or programme a project
  // belongs to is the org's structure (ADR-0061) and the org admin's; the
  // project's own fields are its admin's. An org admin who is not a member of a
  // private project must still be able to file it, so filing alone must not
  // demand project admin — and a project admin must not be able to re-file it.
  const filing = args.productId !== undefined || args.programId !== undefined
  const ownFields =
    args.name !== undefined ||
    args.description !== undefined ||
    args.key !== undefined ||
    args.defaultAgentId !== undefined

  if (filing) {
    await requireRole(context, 'ADMIN', 'Filing a project under a product or programme')
    // Filing would list it under a product or programme others can open.
    await refuseOnPersonalProject(args.projectId, 'Filing under a product or programme')
  }
  if (ownFields || !filing) {
    await requireProjectAdmin(args.projectId, context.user.id, 'Changing this project')
  }
  if (args.defaultAgentId) {
    const assigned = await prisma.projectAgent.findUnique({
      where: { projectId_agentId: { projectId: args.projectId, agentId: args.defaultAgentId } },
    })
    if (!assigned) throw new HttpError(400, "The default agent must be one of this project's agents")
  }
  return updateProjectRecord(args)
}

export const deleteProject: DeleteProject<{ projectId: string }, any> = async ({ projectId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // The org admin for an organisation project; the owner for a personal project, never the space.
  await requireMayDeleteProject(context, projectId)
  // The site is read off the project's row, so it is asked for first; the
  // folder goes only once the delete has committed, and never fails it.
  const siteId = await findProjectStorageSite(projectId)
  // Its running and queued work stops first: a run outliving its project keeps
  // its storage and its credentials. Refuses the delete if that is unconfirmed.
  await stopProjectRuns(projectId, siteId)
  // Its homes and containers go too, told to each site that holds any; the
  // instruction is held with the delete, so a site that is down gets it later.
  // Its conversations in hq close with it.
  const instructSites = await sitesForProject(projectId, siteId)
  const result = await deleteProjectRecord(projectId, async tx => {
    await tx.heldSiteInstruction.createMany({
      data: heldInstructionRows(instructSites, { method: MEMBERSHIP_METHODS.projectDeleted, params: { projectId } }),
    })
    await closeProjectConversations(tx, projectId, 'PROJECT_DELETED')
  })
  void deliverHeldInstructionsTo(instructSites)
  void declineWaitingInProject(projectId)
  await removeProjectStorageOnSite(projectId, siteId)
  return result
}

export const createBoard: CreateBoard<
  { projectId: string; name: string; kind?: 'WORKFLOW' | 'SPRINTS'; templateId?: string; columns?: ColumnInput[]; sprintDays?: number },
  Board
> = async ({ projectId, name, kind, templateId, columns, sprintDays }, context) => {
  if (!context.user) throw new HttpError(401)
  await requireMayWorkInProject(projectId, context.user.id, 'Creating a board in this project')
  // A template that isn't in the Library leaves the board on the default columns.
  const template = !columns?.length ? await boardTemplateColumns(templateId) : null
  const resolvedColumns: ColumnInput[] | undefined = template?.columns ?? columns
  return createBoardService({ projectId, name, kind, madeFromVersionId: template?.madeFromVersionId, columns: resolvedColumns, sprintDays })
}

export const updateBoard: UpdateBoard<
  { boardId: string; name?: string; columns?: BoardColumn[] },
  Board
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const projectId = await requireBoardAccess(args.boardId, context.user.id, 'Changing this board')

  // Turning auto-queue on queues every idle task in the column, and turning it
  // off releases them — so it is a change to work, not to the board's layout.
  // The board is changed first, so a refused change (Project Tasks) queues nothing.
  const change = args.columns ? await autoQueueChange(args.boardId, args.columns) : null
  const updated = await updateBoardRecord({ boardId: args.boardId, name: args.name, columns: args.columns })
  if (change && changesAutoQueue(change)) {
    await applyAutoQueueChange(args.boardId, projectId, change, personQueuer(context.user.id))
  }
  return updated
}

export const createTask: CreateTask<CreateTaskArgs, TaskFields> = async (given, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const args = createTaskArgs(given)
  await requireMayWorkInProject(args.projectId, context.user.id, 'Creating a task in this project')
  // `boardId` is a second, independent caller-supplied boundary — checking
  // only `projectId` lets a member of an open project place a task directly
  // onto a private board they were never checked against.
  if (args.boardId) {
    await requireBoardAccess(args.boardId, context.user.id, 'Placing this task on that board')
  }
  if (args.assignedAgentId) await requireAgentOnProject(args.projectId, args.assignedAgentId)
  // The model a task names is not part of the mobile app's contract: it is read off the request here.
  const modelChoice = await checkedTaskModel((given as { modelChoice?: unknown }).modelChoice, { projectId: args.projectId, agentId: args.assignedAgentId, userId: context.user.id })
  return taskFields(await createTaskRecord({ ...args, modelChoice, origin: originByPerson(context.user.id) }))
}

export const updateTask: UpdateTask<
  {
    taskId: string
    title?: string
    description?: string
    assignedAgentId?: string | null
    priority?: string
    labels?: string[]
    modelChoice?: string | null
    status?: string
    result?: string | null
  },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // The run state is not an edit: a person changes it by Run, Stop or Dismiss, which say what they do.
  const projectId = await requireTaskAccess(args.taskId, context.user.id, 'Changing this task')
  if (args.assignedAgentId) await requireAgentOnProject(projectId, args.assignedAgentId)
  const { taskId, title, description, assignedAgentId, priority, labels, status, result } = args
  const modelChoice = args.modelChoice === undefined ? undefined : await checkedTaskModel(args.modelChoice, {
    projectId, userId: context.user.id,
    agentId: assignedAgentId ?? (await prisma.task.findUnique({ where: { id: taskId }, select: { assignedAgentId: true } }))?.assignedAgentId,
  })
  return updateTaskRecord({ taskId, title, description, assignedAgentId, priority, labels, status, result, ...(modelChoice !== undefined ? { modelChoice } : {}) })
}

export const runTask: RunTask<{ taskId: string }, void> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireTaskAccess(taskId, context.user.id, 'Running this task')
  const task = await context.entities.Task.findUnique({ where: { id: taskId } })
  if (!task) throw new HttpError(404, 'Task not found')
  if (!task.assignedAgentId) throw new HttpError(400, 'Task has no assigned agent')
  // Running again would be re-blocked at dispatch: only reassigning releases it (adr-0089).
  if (task.runState === 'RUN_BLOCKED' && task.runStateReason === LOST_ACCESS_REASON) {
    throw new HttpError(409, LOST_ACCESS_RUN_REFUSAL)
  }
  const agent = await context.entities.Agent.findUnique({ where: { id: task.assignedAgentId } })
  if (!agent) throw new HttpError(404, 'Assigned agent not found')
  // TaskRunner.runTask claims a queued run, so queue one first, asked to start
  // by this person (depth 0, adr-0091): from no run pending, or over a failed or
  // blocked one, which running again clears (spec §6) — never over a run
  // already queued, throttled or going.
  const { count } = await context.entities.Task.updateMany({
    where: { id: taskId, runState: { in: ['RUN_NONE', 'RUN_FAILED', 'RUN_BLOCKED'] } },
    data: askedToStart('person', personQueuer(context.user.id), 'queued by user'),
  })
  if (count === 0) throw new HttpError(409, 'A run of this task is already queued or under way')
  await notifyBoardsOfTasks([task.id])
  // Running again replaces a request the last run left unanswered, even while this run waits its turn.
  await replaceTaskRequests(task.id)
  void taskRunner.runTask(task.id, agent, 'person', context.user.id)
}


export const deleteTask: DeleteTask<{ taskId: string }, any> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireTaskAccess(taskId, context.user.id, 'Deleting this task')
  return deleteTaskRecord(taskId)
}

export const archiveTask: any = async ({ taskId }: { taskId: string }, context: any) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireTaskAccess(taskId, context.user.id, 'Archiving this task')
  return archiveTaskRecord(taskId)
}

export const moveTaskToColumn: MoveTaskToColumn<MoveTaskToColumnArgs, TaskFields> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const column = requireColumnArg(args.column)
  await requireTaskAccess(args.taskId, context.user.id, 'Changing this task')
  // `boardId` moves the task onto a second, independent boundary — checking
  // only the task's own project lets a member move their task onto a board
  // in a project they were never checked against.
  if (args.boardId) {
    await requireBoardAccess(args.boardId, context.user.id, 'Moving this task onto that board')
  }
  return taskFields(await moveTaskToColumnRecord({ taskId: args.taskId, column, boardId: args.boardId, queuer: personQueuer(context.user.id) }))
}

export const returnTaskToBacklog: ReturnTaskToBacklog<
  { taskId: string },
  any
> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireTaskAccess(taskId, context.user.id, 'Changing this task')
  return returnTaskToBacklogRecord({ taskId })
}

export const runProject: RunProject<{ projectId: string }, { dispatched: number }> = async ({ projectId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireMayWorkInProject(projectId, context.user.id, 'Running this project')
  const tasks = await context.entities.Task.findMany({
    where: { projectId, runState: { in: ['RUN_QUEUED', 'RUN_THROTTLED'] }, assignedAgentId: { not: null } },
  })
  const agentIds = [...new Set(tasks.map((t: any) => t.assignedAgentId!).filter(Boolean))]
  const agents = await context.entities.Agent.findMany({ where: { id: { in: agentIds } } })
  let dispatched = 0
  for (const agent of agents) {
    const agentTasks = tasks.filter((t: any) => t.assignedAgentId === agent.id)
    for (const task of agentTasks) {
      void taskRunner.runTask(task.id, agent, 'person', context.user.id)
      dispatched++
    }
  }
  return { dispatched }
}

export const runBoard: RunBoard<{ boardId: string }, { dispatched: number }> = async ({ boardId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const projectId = await requireBoardAccess(boardId, context.user.id, 'Running this board')
  // `Task.boardId` and `Task.projectId` are independent foreign keys — nothing
  // enforces that a task on this board actually belongs to the board's own
  // project. Constraining the query by the project the caller was just
  // checked against (rather than trusting that invariant) means a task
  // misfiled onto this board from elsewhere is never dispatched by someone
  // who was only ever checked against this board's project.
  const tasks = await context.entities.Task.findMany({
    where: { boardId, projectId, runState: { in: ['RUN_QUEUED', 'RUN_THROTTLED'] }, assignedAgentId: { not: null } },
  })
  const agentIds = [...new Set(tasks.map((t: any) => t.assignedAgentId!).filter(Boolean))]
  const agents = await context.entities.Agent.findMany({ where: { id: { in: agentIds } } })
  let dispatched = 0
  for (const agent of agents) {
    const agentTasks = tasks.filter((t: any) => t.assignedAgentId === agent.id)
    for (const task of agentTasks) {
      void taskRunner.runTask(task.id, agent, 'person', context.user.id)
      dispatched++
    }
  }
  return { dispatched }
}

export const addAgentToProject: AddAgentToProject<{ projectId: string; agentId: string }, any> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireMayAssignAgents(args.projectId, context.user.id)
  const agent = await prisma.agent.findUnique({ where: { id: args.agentId }, select: { id: true } })
  if (!agent) throw new HttpError(404, 'Agent not found')
  return addAgentToProjectRecord(args)
}

/**
 * `openTasksTo` is required — another agent assigned to the project, or null
 * for none — though optional in the type, so a caller that leaves it out is
 * refused here rather than getting a default (every screen reviewed spec §3).
 */
const isIdOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string'

export const removeAgentFromProject: RemoveAgentFromProject<
  { projectId: string; agentId: string; openTasksTo?: string | null; newDefaultAgentId?: string | null },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireProjectAdmin(args.projectId, context.user.id, 'Unassigning an agent from this project')
  const { openTasksTo, newDefaultAgentId } = args
  if (!isIdOrNull(openTasksTo)) {
    throw new HttpError(400, 'Say what happens to its open tasks here: another agent in the project, or none')
  }
  if (newDefaultAgentId !== undefined && !isIdOrNull(newDefaultAgentId)) {
    throw new HttpError(400, 'The new default agent is another agent in the project, or none')
  }
  return removeAgentFromProjectRecord({ projectId: args.projectId, agentId: args.agentId, openTasksTo, newDefaultAgentId })
}

export const addTaskComment: AddTaskComment<AddTaskCommentArgs, TaskCommentView> = async (
  { taskId, content },
  context,
) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  requireCommentContent(content)
  await requireTaskAccess(taskId, context.user.id, 'Commenting on this task')
  return taskCommentView(await createTaskComment({
    taskId,
    authorType: 'USER',
    userId: context.user.id,
    content,
  }))
}

/** Never Project Tasks; its tasks go to Project Tasks (boardService.ts). */
export const deleteBoard: DeleteBoard<{ boardId: string }, Board> = async ({ boardId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const projectId = await requireBoardAccess(boardId, context.user.id, 'Deleting this board')
  return deleteBoardRecord(boardId, projectId)
}

export { stopTask } from './stopTask'
export { dismissTaskRun } from './dismissTaskRun'
export { clearTaskSession } from './clearTaskSession'
export { uploadTaskAttachment } from './uploadTaskAttachment'
