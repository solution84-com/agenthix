/**
 * The one location access rule (ADR-0039 §2, spec §6.4): which storage locations
 * a person may use. Session creation applies it to a session's primary location,
 * and the storage operations apply it to listing and reading files and to a
 * location's repo state, connect and disconnect.
 *
 * Two owner kinds exist (ADR-0061). A `user` owner names one person's files and
 * must be the caller. A `project` owner must exist and the caller must be
 * entitled to it — on its member list, whether it is open or private (adr-0099)
 * — and, for a `work` use, work in it: a project Viewer reads its files and
 * changes nothing (adr-0102).
 *
 * A workspace id must exist and belong to the stated owner: the capability read
 * treats an unknown workspace as having no tool cap, so an unvalidated id would
 * defeat the workspace tool cap.
 *
 * A personal project has no storage of its own: its runs work in its person's
 * own storage (agents own schedule spec §4), so it is refused as a `project`
 * owner here, for its owner too — a session or file read bound to it would
 * mount and act as a project the person's work never runs as.
 *
 * A supplied task must belong to the owning project: a task session works in the
 * task's directory under its project, so pairing one project's location with
 * another project's task would reach that task's files under this caller's entitlement.
 */
import { HttpError, prisma } from 'wasp/server'
import type { WorkspaceOwnerType } from '@prisma/client'
import { getWorkspace } from './workspaceStore'
import { rethrowSiteUnreachableAsHttp } from './httpErrors'
import { requireMayWorkInProject, requireProjectMember } from '../projects/membership'

export type LocationAccessRef = {
  ownerType: WorkspaceOwnerType
  ownerId: string
  workspaceId?: string | null
  taskId?: string | null
}

/** What the caller does with the location: reads its files, or works in it — writes, a run, a session. */
export type LocationUse = 'read' | 'work'

export async function assertLocationAccess(loc: LocationAccessRef, userId: string, use: LocationUse): Promise<void> {
  const { ownerType, ownerId } = loc

  if (ownerType === 'user') {
    if (ownerId !== userId) throw new HttpError(403, 'You can only use your own personal files')
  } else if (ownerType === 'project') {
    const project = await prisma.project.findUnique({ where: { id: ownerId }, select: { id: true, personalOwnerId: true } })
    if (!project) throw new HttpError(404, 'Project not found')
    if (use === 'work') await requireMayWorkInProject(ownerId, userId, "Using this project's storage")
    else await requireProjectMember(ownerId, userId, "Using this project's storage")
    if (project.personalOwnerId) {
      throw new HttpError(400, 'A personal project has no storage of its own; its work is in your own files')
    }
  } else {
    const _exhaustive: never = ownerType
    throw new HttpError(400, `Unknown owner type '${_exhaustive}'`)
  }

  if (loc.taskId) {
    if (ownerType !== 'project') throw new HttpError(400, 'A task belongs to a project, not to personal files')
    const task = await prisma.task.findUnique({ where: { id: loc.taskId }, select: { projectId: true } })
    if (!task) throw new HttpError(404, 'Task not found')
    if (task.projectId !== ownerId) throw new HttpError(400, 'Task does not belong to the selected project')
  }

  if (loc.workspaceId) {
    let workspace
    try {
      workspace = await getWorkspace(loc.workspaceId)
    } catch (err) {
      // Never a silent pass: an unreachable site must not open an unvalidated location.
      rethrowSiteUnreachableAsHttp(err)
    }
    if (!workspace) throw new HttpError(404, 'Workspace not found')
    if (workspace.ownerType !== ownerType || workspace.ownerId !== ownerId) {
      throw new HttpError(400, 'Workspace does not belong to the selected owner')
    }
  }
}
