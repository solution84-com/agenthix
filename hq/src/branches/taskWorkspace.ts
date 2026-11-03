/**
 * A task's workspace (live preview spec, *Which work is code work*): one of its project's own workspaces, named by
 * whoever starts the work, on the task's form or by the lead. A code workspace makes the task's runs code work, on a
 * branch of its own. `undefined` leaves it as it is; null takes it off, so the task works in the project's files.
 */
import { HttpError, prisma } from 'wasp/server'
import { storageOfProject } from '../projects/personalProject'
import { locateWorkspace } from './workspaceLocation'
import { rethrowSiteUnreachableAsHttp } from '../storage/httpErrors'
import { requireProjectMember } from '../projects/membership'
import { placeWorkspaces } from './leadWorkspaces'

export async function checkedTaskWorkspace(projectId: string, value: unknown): Promise<string | null | undefined> {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 200) throw new HttpError(400, 'workspaceId must be a workspace\'s id, or null for the project\'s files')
  const storage = await storageOfProject(projectId)
  let ws
  try {
    ws = await locateWorkspace(value)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
  if (!ws || ws.ref.ownerType !== storage.ownerType || ws.ref.ownerId !== storage.ownerId) {
    throw new HttpError(400, "That workspace is not one of this project's. Choose one of the project's workspaces, or none. Nothing was changed.")
  }
  return ws.ref.workspaceId
}

export type TaskWorkspaceChoices = {
  /** The task's workspace now; null for the project's files, and for a task not made yet. */
  current: string | null
  workspaces: { id: string; name: string; git: boolean }[]
}

/** What the task form's *Workspace* offers: the project's workspaces, each marked when it is a code workspace. */
export async function getTaskWorkspaces(args: { projectId: string; taskId?: string | null }, context: { user?: { id: string } | null }): Promise<TaskWorkspaceChoices> {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof args?.projectId !== 'string' || !args.projectId) throw new HttpError(400, 'A project id is required')
  await requireProjectMember(args.projectId, context.user.id, "Reading this project's workspaces")
  let current: string | null = null
  if (args.taskId) {
    const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { projectId: true, workspaceId: true } })
    if (!task || task.projectId !== args.projectId) throw new HttpError(404, 'Task not found')
    current = task.workspaceId
  }
  const storage = await storageOfProject(args.projectId)
  return { current, workspaces: await placeWorkspaces(storage.ownerType, storage.ownerId) }
}
