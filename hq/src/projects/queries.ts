import {
  type GetProjects,
  type GetProject,
  type GetProjectByKey,
  type GetBoards,
  type GetBoard,
  type GetTasks,
  type GetTask,
  type GetTaskByKey,
  type GetTaskComments,
  type GetTaskAttachments,
  type GetAllBoards,
  type GetAllTasks,
  type GetActiveTaskCount,
  type ValidateRecentItems,
} from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { entitledProjectsFilter, isProjectMember, visibleProjectsFilter } from './membership'
import { requireProjectVisible, requireTaskVisible, requireBoardVisible } from './resourceEntitlement'
import { withDisplayReasons, withDisplayReason } from './taskReasonDisplay'
import { withRunWaitNotes } from '../automation/queueNotes'
import { projectLeadOf } from './projectLead'
import { usernames } from './onBehalfOfOperations'
import type { Prisma } from '@prisma/client'
import type {
  BoardAcrossProjects, BoardFields, BoardView, GetBoardArgs, GetTaskByKeyArgs, GetTasksArgs, ProjectBoardsArgs,
  ProjectDetail, ProjectIdArgs, ProjectKeyArgs, ProjectListItem, ProjectTaskListItem, TaskByKey, TaskCommentListItem,
  TaskIdArgs, TaskListItem,
} from '@agenthix/core'
import { projectTasksFirst } from './boardService'
import { readBoardView } from './boardView'
import { readBoardsAcrossProjects } from './boardsAcrossProjects'
import { WARNED_SITE_SELECT, projectSiteAsShown } from '../sites/resources/projectSiteWarning'
import { boardFields, projectDetail, projectFields, projectListItem } from './projectWire'
import { isTaskState } from './taskArgs'
import { LISTED_TASK_INCLUDE, projectTaskListItem, taskCommentView, taskProjectRef } from './taskWire'

type OpenedRow = Parameters<typeof projectDetail>[0] & {
  executionSite: Parameters<typeof projectSiteAsShown>[0]
}

async function openedProject(project: OpenedRow): Promise<ProjectDetail> {
  return projectDetail(project, {
    tasks: await withDisplayReasons(project.tasks),
    executionSite: projectSiteAsShown(project.executionSite),
    lead: await projectLeadOf(project),
  })
}

export const getProjects: GetProjects<void, Array<ProjectListItem>> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const me = context.user.id
  // A private project the caller is not on is not listed at all: not seeing it
  // is what being private means (spec §6.4). An open one is listed to everyone,
  // marked so a non-member is offered its preview and Join (adr-0099).
  const projects = await context.entities.Project.findMany({
    where: visibleProjectsFilter(me),
    orderBy: { updatedAt: 'desc' },
    include: {
      boards: { select: { id: true } },
      tasks: { select: { id: true, status: true, runState: true } },
      product: { select: { id: true, name: true, slug: true } },
      program: { select: { id: true, name: true, slug: true } },
      members: { where: { userId: me }, select: { role: true } },
    },
  })
  return projects.map(p => projectListItem(
    p,
    p.personalOwnerId ? p.personalOwnerId === me : p.members.length > 0,
    p.members[0]?.role ?? null,
  ))
}

export const getProject: GetProject<ProjectIdArgs, ProjectDetail> = async ({ projectId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireProjectVisible(projectId, context.user.id)
  const project = await context.entities.Project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      boards: { orderBy: { createdAt: 'asc' } },
      tasks: {
        include: { assignedAgent: { select: { id: true, name: true, handle: true } } },
        orderBy: { createdAt: 'desc' },
      },
      agents: {
        include: { agent: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
      },
      product: { select: { id: true, name: true, slug: true } },
      program: { select: { id: true, name: true, slug: true } },
      // Shown in the place's facts (every screen reviewed spec §3).
      executionSite: { select: WARNED_SITE_SELECT },
    },
  })
  return openedProject(project)
}

export const getProjectByKey: GetProjectByKey<ProjectKeyArgs, ProjectDetail> = async ({ key }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const project = await context.entities.Project.findUnique({
    where: { key },
    include: {
      boards: { orderBy: { createdAt: 'asc' } },
      tasks: {
        include: { assignedAgent: { select: { id: true, name: true, handle: true } } },
        orderBy: { createdAt: 'desc' },
      },
      agents: {
        include: { agent: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
      },
      product: { select: { id: true, name: true, slug: true } },
      program: { select: { id: true, name: true, slug: true } },
      // Shown in the place's facts (every screen reviewed spec §3).
      executionSite: { select: WARNED_SITE_SELECT },
    },
  })
  // A key is guessable, so a project the caller cannot see must answer exactly
  // as one that does not exist — same status, same message, no key in it.
  // Checked after the lookup because the key, not the id, is what arrives here.
  if (!project || !(await isProjectMember(project.id, context.user.id))) {
    throw new HttpError(404, 'Project not found')
  }
  return openedProject(project)
}

/** The project's boards, Project Tasks first; archived ones only when asked for. */
export const getBoards: GetBoards<ProjectBoardsArgs, BoardFields[]> = async ({ projectId, includeArchived }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireProjectVisible(projectId, context.user.id)
  return projectTasksFirst(await context.entities.Board.findMany({
    where: { projectId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: 'asc' },
  })).map(boardFields)
}

/**
 * One board: its columns and the tasks in them (on a sprint board, the current
 * sprint's), its Backlog, and the other boards' backlogs the reader chose to
 * show beside it (adr-0097).
 */
export const getBoard: GetBoard<GetBoardArgs, BoardView> = async ({ boardId, includeArchived }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireBoardVisible(boardId, context.user.id)
  return readBoardView(boardId, context.user.id, { includeArchivedTasks: !!includeArchived })
}

export const getTasks: GetTasks<GetTasksArgs, ProjectTaskListItem[]> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (args.status !== undefined && !isTaskState(args.status)) throw new HttpError(400, 'status must be TODO, IN_PROGRESS or DONE')
  await requireProjectVisible(args.projectId, context.user.id)
  const where: Prisma.TaskWhereInput = { projectId: args.projectId, ...(args.includeArchived ? {} : { archived: false }) }
  if (args.boardId) where.boardId = args.boardId
  if (args.status) where.status = args.status
  const rows = await withRunWaitNotes(await withDisplayReasons(await context.entities.Task.findMany({
    where,
    include: LISTED_TASK_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })))
  return rows.map(projectTaskListItem)
}

export const getTask: GetTask<TaskIdArgs, TaskListItem | null> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // A caller can transiently invoke this before its route param resolves; guard the
  // undefined id so Prisma doesn't 500 (the client re-queries with the real id).
  if (!taskId) return null
  await requireTaskVisible(taskId, context.user.id)
  const task = await withDisplayReason(await context.entities.Task.findUnique({
    where: { id: taskId },
    include: { ...LISTED_TASK_INCLUDE, project: { select: { id: true, name: true, key: true } } },
  }))
  if (!task) return null
  const [shown] = await withRunWaitNotes([task])
  return { ...projectTaskListItem(shown), project: taskProjectRef(shown.project) }
}

const TASK_NOT_FOUND = 'Task not found'

export const getTaskByKey: GetTaskByKey<GetTaskByKeyArgs, TaskByKey> = async ({ taskKey }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')

  const match = taskKey.match(/^([A-Z]{2,6})-(\d+)$/)
  if (!match) throw new HttpError(400, 'Invalid task key format. Expected e.g. DASH-42')

  const [, projectKey, numberStr] = match
  const number = parseInt(numberStr, 10)

  const project = await context.entities.Project.findUnique({
    where: { key: projectKey },
  })
  // Same rule as getProjectByKey: no project, and a project the caller cannot
  // see, are one answer — and so is a task number that does not exist.
  if (!project || !(await isProjectMember(project.id, context.user.id))) {
    throw new HttpError(404, TASK_NOT_FOUND)
  }

  const task = await context.entities.Task.findFirst({
    where: { projectId: project.id, number },
    include: LISTED_TASK_INCLUDE,
  })
  if (!task) throw new HttpError(404, TASK_NOT_FOUND)

  const [shown] = await withRunWaitNotes([(await withDisplayReason(task))!])
  return { ...projectTaskListItem(shown), taskKey, project: projectFields(project) }
}

export const getTaskComments: GetTaskComments<TaskIdArgs, TaskCommentListItem[]> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireTaskVisible(taskId, context.user.id)
  const comments = await context.entities.TaskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
    include: { agent: { select: { id: true, name: true, handle: true } } },
  })
  // A task is shared, so a person's comment names who wrote it: the reader's own say "You".
  const me = context.user.id
  const names = await usernames(comments.flatMap(c => (c.userId ? [c.userId] : [])))
  return comments.map(c => ({
    ...taskCommentView(c),
    userName: c.userId === null ? null : c.userId === me ? 'You' : names.get(c.userId) ?? 'A removed person',
  }))
}

/**
 * The attachment inventory follows the project's visibility, like the bytes do
 * (plan §8.3b). Being signed in used to be the whole of it, which handed anyone
 * with an account every attachment's name, size and uuid on any task — and the
 * uuid is half the address the serving route is keyed by, so an inventory anyone
 * can read undoes the refusal that route makes.
 *
 * The task is resolved by the shared read rule rather than `context.entities`
 * because the operation declares only `TaskAttachment`. A task the caller may not
 * see answers as a task that does not exist.
 */
export const getTaskAttachments: GetTaskAttachments<{ taskId: string }, any[]> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')

  await requireTaskVisible(taskId, context.user.id)

  return context.entities.TaskAttachment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
  })
}

/** Every board in the person's own projects (the Projects screen's Boards view), each with its counts. */
export const getAllBoards: GetAllBoards<void, BoardAcrossProjects[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return readBoardsAcrossProjects(context.user.id)
}

export const getAllTasks: GetAllTasks<{ includeArchived?: boolean }, any[]> = async ({ includeArchived }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return withDisplayReasons(await context.entities.Task.findMany({
    where: {
      ...(includeArchived ? {} : { archived: false }),
      project: entitledProjectsFilter(context.user.id),
    },
    include: {
      assignedAgent: { select: { id: true, name: true, handle: true } },
      board: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, key: true } },
    },
    orderBy: { createdAt: 'desc' },
  }))
}

export const getActiveTaskCount: GetActiveTaskCount<void, number> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.entities.Task.count({
    where: {
      runState: 'RUN_ACTIVE',
      archived: false,
      project: entitledProjectsFilter(context.user.id),
    },
  })
}

export const validateRecentItems: ValidateRecentItems<
  { projectIds: string[]; boardIds: string[] },
  { projectIds: string[]; boardIds: string[] }
> = async ({ projectIds, boardIds }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const [projects, boards] = await Promise.all([
    projectIds.length > 0
      ? context.entities.Project.findMany({ where: { id: { in: projectIds }, ...entitledProjectsFilter(context.user.id) }, select: { id: true } })
      : [],
    boardIds.length > 0
      ? context.entities.Board.findMany({ where: { id: { in: boardIds }, project: entitledProjectsFilter(context.user.id) }, select: { id: true } })
      : [],
  ])
  return {
    projectIds: projects.map((p: { id: string }) => p.id),
    boardIds: boards.map((b: { id: string }) => b.id),
  }
}
