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
  type CreateTask,
  type UpdateTask,
  type DeleteTask,
  type MoveTaskToColumn,
  type ReturnTaskToBacklog,
  type AddAgentToProject,
  type RemoveAgentFromProject,
  type AddTaskComment,
  type RunTask,
} from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { MEMBERSHIP_METHODS } from '@agenthix/core'
import type { AddTaskCommentArgs, CreateTaskArgs, MoveTaskToColumnArgs, TaskCommentView, TaskFields } from '@agenthix/core'
import { taskCommentView, taskFields } from './taskWire'
import { checkedTaskModel } from '../models-settings/taskModelChoice'
import { createTaskArgs, requireColumnArg, requireCommentContent, updateTaskArgs } from './taskArgs'
import { moveForStatusEdit } from './taskStatusChange'
import { taskRunner } from '../agents/TaskRunner'
import { replaceTaskRequests } from '../agents/manifestRequests'
import { requireRole } from '../server/identity/requireRole'
import { requireDefaultSiteRef } from '../sites/localSite'
import { isOrgAdmin, requireProjectAdmin, requireMayWorkInProject, requireMayAssignAgents } from './membership'
import { requireTaskAccess, requireBoardAccess, requireAgentOnProject } from './resourceEntitlement'
import { originByPerson, personQueuer } from './taskOnBehalfOf'
import { checkedTaskWorkspace } from '../branches/taskWorkspace'
import { askedToStart } from './taskQueueing'
import { rethrowLocationFileErrorAsHttp } from '../storage/httpErrors'
import { findProjectStorageSite, removeProjectStorageOnSite } from './projectStorageRemoval'
import { stopProjectRuns } from './projectRunStop'
import { refuseOnPersonalProject, requireMayDeleteProject } from './personalProject'
import { heldInstructionRows, deliverHeldInstructionsTo } from '../sites/heldInstructions'
import { deleteTaskSessionsOnSites } from '../sessions/taskSessionDeletion'
import { sitesForProject } from '../sites/membershipEnding'
import { closeProjectConversations, closeProjectSessions, declineWaitingInProject } from '../conversations/closing'
import { notifyBoardsOfTasks } from './boardNotify'
import { LOST_ACCESS_REASON } from './taskOnBehalfOf'
import { LOST_ACCESS_RUN_REFUSAL } from '../agents/taskExecutionReasons'
import { personActor } from './taskActivity'
import { refuseRunOfEpic } from './epicRules'
import { moveTask as moveTaskInPlan } from './taskColumnService'
import { refuseWhileRunning } from './taskArchiveActions'
import {
  createProject as createProjectRecord,
  updateProject as updateProjectRecord,
  deleteProject as deleteProjectRecord,
  createTask as createTaskRecord,
  updateTask as updateTaskRecord,
  deleteTask as deleteTaskRecord,
  moveTaskToColumn as moveTaskToColumnRecord,
  returnTaskToBacklog as returnTaskToBacklogRecord,
  addAgentToProject as addAgentToProjectRecord,
  removeAgentFromProject as removeAgentFromProjectRecord,
  createTaskComment,
} from './projectService'

export const createProject: CreateProject<
  { name: string; description?: string; productId?: string; programId?: string; key?: string; siteId?: string; billingProfileId?: string },
  any
> = async (args, context) => {
  // Every member of the organisation may make one, and becomes its first admin. Who pays for it, and which
  // product or programme it is filed under, stay an organisation admin's, as they are once it exists.
  await requireRole(context, 'MEMBER', 'Creating a project')
  if ((args.billingProfileId || args.productId || args.programId) && !(await isOrgAdmin(context.user!.id))) {
    throw new HttpError(
      403,
      'Choosing the billing profile, product or programme of a new project is for an organisation admin. ' +
        'Leave them out: the project bills to the default profile, and an organisation admin can change it in Settings. Nothing was changed.',
    )
  }
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
  // Its tasks' conversations are deleted on their sites; hq's copies go with the project below.
  await deleteTaskSessionsOnSites({ projectId }, siteId)
  // Its homes and containers go too, told to each site that holds any; the
  // instruction is held with the delete, so a site that is down gets it later.
  // Its conversations in hq close with it.
  const instructSites = await sitesForProject(projectId, siteId)
  const result = await deleteProjectRecord(projectId, async tx => {
    await tx.heldSiteInstruction.createMany({
      data: heldInstructionRows(instructSites, { method: MEMBERSHIP_METHODS.projectDeleted, params: { projectId } }),
    })
    await closeProjectConversations(tx, projectId, 'PROJECT_DELETED')
    await closeProjectSessions(tx, projectId)
  })
  void deliverHeldInstructionsTo(instructSites)
  void declineWaitingInProject(projectId)
  await removeProjectStorageOnSite(projectId, siteId)
  return result
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
  // So is its workspace (live preview spec, part 2): read off the request, and checked to be one of the project's.
  const workspaceId = await checkedTaskWorkspace(args.projectId, (given as { workspaceId?: unknown }).workspaceId)
  return taskFields(await createTaskRecord({ ...args, modelChoice, ...(workspaceId ? { workspaceId } : {}), origin: originByPerson(context.user.id) }))
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
    /** One of the project's workspaces, or null for the project's files. */
    workspaceId?: string | null
    status?: string
  },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // Wasp hands the operation whatever the request carried: each field is checked, and only these are kept.
  const { taskId, title, description, assignedAgentId, priority, labels, status } = updateTaskArgs(args)
  // The run state is not an edit: a person changes it by Run, Stop or Dismiss, which say what they do.
  const projectId = await requireTaskAccess(taskId, context.user.id, 'Changing this task')
  if (assignedAgentId) await requireAgentOnProject(projectId, assignedAgentId)
  const modelChoice = args.modelChoice === undefined ? undefined : await checkedTaskModel(args.modelChoice, {
    projectId, userId: context.user.id,
    agentId: assignedAgentId ?? (await prisma.task.findUnique({ where: { id: taskId }, select: { assignedAgentId: true } }))?.assignedAgentId,
  })
  const workspaceId = await checkedTaskWorkspace(projectId, args.workspaceId)
  // A state is a place: it is reached by a move into a column, so the column rules and the run state follow it.
  const move = status === undefined ? null : await moveForStatusEdit(taskId, status)
  const updated = await updateTaskRecord({
    taskId, title, description, assignedAgentId, priority, labels, actor: personActor(context.user.id),
    ...(modelChoice !== undefined ? { modelChoice } : {}), ...(workspaceId !== undefined ? { workspaceId } : {}),
  })
  if (!move) return updated
  return moveTaskToColumnRecord({ taskId, column: move.column, queuer: personQueuer(context.user.id) })
}

export const runTask: RunTask<{ taskId: string }, void> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireTaskAccess(taskId, context.user.id, 'Running this task')
  const task = await context.entities.Task.findUnique({ where: { id: taskId } })
  if (!task) throw new HttpError(404, 'Task not found')
  refuseRunOfEpic(task)
  if (!task.assignedAgentId) throw new HttpError(400, 'Task has no assigned agent')
  // Running again would be re-blocked at dispatch: only reassigning releases it (adr-0089).
  if (task.runState === 'RUN_BLOCKED' && task.runStateReason === LOST_ACCESS_REASON) {
    throw new HttpError(409, LOST_ACCESS_RUN_REFUSAL)
  }
  const agent = await context.entities.Agent.findUnique({ where: { id: task.assignedAgentId } })
  if (!agent) throw new HttpError(404, 'Assigned agent not found')
  // TaskRunner.runTask claims a queued run, so put it in its agent's line first,
  // started by this person (depth 0, adr-0091): from no run pending, or over a
  // failed or blocked one, which running again clears (spec §6) — never over a
  // run already queued or going.
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
  await refuseWhileRunning(taskId, 'delete')
  return deleteTaskRecord(taskId)
}

export const moveTaskToColumn: MoveTaskToColumn<MoveTaskToColumnArgs, TaskFields> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // One of its type's columns (since 1.16): the move is the task model's, and `column` is not read.
  if (args.columnId !== undefined) {
    if (typeof args.columnId !== 'string' || !args.columnId) throw new HttpError(400, 'columnId must be a column id')
    await requireTaskAccess(args.taskId, context.user.id, 'Changing this task')
    return taskFields(await moveTaskInPlan(args.taskId, { columnId: args.columnId }, personActor(context.user.id)))
  }
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
  return returnTaskToBacklogRecord({ taskId, actor: personActor(context.user.id) })
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
  { taskId, content, parentId, savedFromConversation },
  context,
) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  requireCommentContent(content)
  if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') throw new HttpError(400, 'A reply names the comment it replies to by its id')
  await requireTaskAccess(taskId, context.user.id, 'Commenting on this task')
  return taskCommentView(await createTaskComment({
    taskId,
    authorType: 'USER',
    userId: context.user.id,
    content,
    parentId: parentId ?? undefined,
    savedFromConversation: savedFromConversation === true,
  }))
}

export { stopTask } from './stopTask'
export { dismissTaskRun } from './dismissTaskRun'
export { archiveTask, unarchiveTask } from './taskArchiveActions'
export { uploadTaskAttachment } from './uploadTaskAttachment'
