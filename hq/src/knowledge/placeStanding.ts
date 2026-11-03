/** A person's standing in a knowledge place, for the service's per-call check (`./standing.ts`). */
import type { KnowledgeOwnerRef } from '@agenthix/core'
import { projectStanding } from '../projects/membership'
import type { PlaceStanding } from './deps'

/** A project's by its member rows (a Viewer reads); a person's own space is theirs alone; the organisation is never a place. */
export async function placeStanding(owner: KnowledgeOwnerRef, userId: string): Promise<PlaceStanding> {
  if (owner.ownerType === 'project') return projectStanding(owner.ownerId, userId)
  if (owner.ownerType === 'user') return owner.ownerId === userId ? 'works' : 'none'
  return 'none'
}
