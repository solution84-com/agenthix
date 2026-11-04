import { HttpError } from 'wasp/server'
import { projectRole } from '../projects/membership'
import type { RepoTarget } from './repoAttachmentService'

/**
 * The place's files or the workspace a repository is connected to, read, or disconnected: never a task's folder.
 * A target naming a task is refused, so git cannot be put in a folder the attachment would then call the place's.
 */
export function requireRepoTarget(target: RepoTarget, changing: boolean): RepoTarget {
  if (target.taskId) {
    throw new HttpError(400, `A repository belongs to a place's files or a workspace, not to a task's folder.${changing ? ' Nothing was changed.' : ''}`)
  }
  return target
}

/**
 * Whether the person may connect or disconnect the target's repository: a project's is its administrators', a
 * person's own storage is their own. The screens read it so they offer the buttons only to those who may use them;
 * the actions check the same rule again.
 */
export async function mayAdministerAttachment(target: RepoTarget, userId: string): Promise<boolean> {
  if (target.ownerType !== 'project') return true
  return (await projectRole(target.ownerId, userId)) === 'ADMIN'
}
