/**
 * A resource resolved to the boundary that owns it, and the membership rule
 * applied to that boundary (spec §6.4). Boards, tasks and comments all resolve
 * to one project; this is the single place that says so, so the browser
 * operations cannot each answer it differently.
 *
 * `prisma` rather than `context.entities`: most of the operations that call
 * these declare only the entity they are about, and a rule that made every one
 * of them widen its entity list would be a rule people route around.
 */
import { HttpError, prisma } from 'wasp/server'
import { isProjectMember, requireMayWorkInProject } from './membership'
import { requireId } from './requireId'

/** The `…OrNull` pair is for callers that answer with a boolean rather than an
 *  error — a socket room join, say, which refuses silently. The throwing pair
 *  below is built on it so both answer from one lookup. */
export async function projectOfTaskOrNull(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
  return task?.projectId ?? null
}

export async function projectOfBoardOrNull(boardId: string): Promise<string | null> {
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { projectId: true } })
  return board?.projectId ?? null
}

export async function projectOfTask(taskId: string): Promise<string> {
  const projectId = await projectOfTaskOrNull(taskId)
  if (projectId === null) throw new HttpError(404, 'Task not found')
  return projectId
}

export async function projectOfBoard(boardId: string): Promise<string> {
  const projectId = await projectOfBoardOrNull(boardId)
  if (projectId === null) throw new HttpError(404, 'Board not found')
  return projectId
}

/** The WRITE side: a change to a task or board needs the person to work in its
 *  project (adr-0102) — a Viewer reads it and is refused. */
export async function requireTaskAccess(taskId: string, userId: string, what: string): Promise<string> {
  const projectId = await projectOfTask(taskId)
  await requireMayWorkInProject(projectId, userId, what)
  return projectId
}

export async function requireBoardAccess(boardId: string, userId: string, what: string): Promise<string> {
  const projectId = await projectOfBoard(boardId)
  await requireMayWorkInProject(projectId, userId, what)
  return projectId
}

/**
 * The READ side of the same rule. A write by someone who can see a thing but may
 * not change it is refused with the membership needed (403 above); a read of a
 * thing the caller may not see at all answers exactly as if it did not exist —
 * same status, same wording — so that neither the answer nor its message
 * confirms there is anything there (spec §6.4, SC-397). Ids are unguessable, but
 * that is no reason for the answer to be a tell.
 */
export async function requireProjectVisible(
  projectId: string,
  userId: string,
  notFound = 'Project not found',
): Promise<void> {
  requireId(projectId, 'project')
  if (!(await isProjectMember(projectId, userId))) throw new HttpError(404, notFound)
}

export async function canSeeTask(taskId: string, userId: string): Promise<boolean> {
  const projectId = await projectOfTaskOrNull(taskId)
  return projectId !== null && (await isProjectMember(projectId, userId))
}

export async function requireTaskVisible(taskId: string, userId: string, notFound = 'Task not found'): Promise<string> {
  requireId(taskId, 'task')
  const projectId = await projectOfTaskOrNull(taskId)
  if (projectId === null || !(await isProjectMember(projectId, userId))) throw new HttpError(404, notFound)
  return projectId
}

export async function requireBoardVisible(boardId: string, userId: string, notFound = 'Board not found'): Promise<string> {
  requireId(boardId, 'board')
  const projectId = await projectOfBoardOrNull(boardId)
  if (projectId === null || !(await isProjectMember(projectId, userId))) throw new HttpError(404, notFound)
  return projectId
}

/**
 * A task may name only an agent on its project's roster. Not an authority rule
 * (a run's reach comes from its boundary, ADR-0060, not from which agent it is)
 * but the caller supplies the id, and nothing else confirms it belongs here.
 */
export async function requireAgentOnProject(projectId: string, agentId: string): Promise<void> {
  const assignment = await prisma.projectAgent.findUnique({
    where: { projectId_agentId: { projectId, agentId } },
    select: { agentId: true },
  })
  if (!assignment) throw new HttpError(400, 'That agent is not assigned to this project')
}
