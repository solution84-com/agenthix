/**
 * Where a task run reads and updates its roadmap — the path the RUN sees, which
 * is the one its prompt prints. It is in the files of the storage the run works
 * in: its project's, or for a task in a personal project its person's own, the
 * only storage such a run has (agents own schedule spec §4).
 *
 * The site derives it because the site is what mounted the project's files:
 * under container isolation the run sees the id-keyed mount
 * (`resolvePrimaryContainerDir`, the same base the mount set is built from);
 * without it the run works on this machine's own disk and sees the host path.
 * The same decision `resolveRunAgenda` makes for the agenda.
 */
import path from 'node:path'
import type { LocationRef, WorkspaceOwnerType } from '@agenthix/core'
import { getFilesDir } from '../../server/storage/paths'
import { resolvePrimaryContainerDir } from './locationResolver'

const ROADMAP_FILE_NAME = 'ROADMAP.md'

export function resolveRunRoadmapPath(owner: { ownerType: WorkspaceOwnerType; ownerId: string }): string {
  if (process.env.AGENT_CONTAINER_ISOLATION !== 'true') {
    return path.join(getFilesDir(owner.ownerType, owner.ownerId), ROADMAP_FILE_NAME)
  }
  const loc: LocationRef = { ownerType: owner.ownerType, ownerId: owner.ownerId }
  return `${resolvePrimaryContainerDir(loc)}/${ROADMAP_FILE_NAME}`
}
