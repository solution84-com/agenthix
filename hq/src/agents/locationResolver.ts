/**
 * Owner-slug resolution (ADR-0039 §2, §9) — trimmed survivor of
 * `agents/runtime/locationResolver.ts` (plan 5d-2 task 10 "shed"). The mount-set
 * builder (`resolveAccessibleLocations`) and workspace-slug helper moved to
 * site with the rest of the container-prep pipeline; `ownerSlug`/
 * `fetchPrimaryOwnerSlug` stayed on hq because dispatchService.ts still needs
 * them to build the `run.dispatch` payload it sends across the channel.
 */
import { prisma } from 'wasp/server'
import type { LocationRef } from '@agenthix/core'

/**
 * Derives the container-side slug for an owner. Two kinds own storage (ADR-0061).
 * - project → project.slug if set, else first 8 chars of id
 * - user    → 'personal' (single user today; host still uses users/{id})
 */
export function ownerSlug(ownerType: LocationRef['ownerType'], ownerId: string, rawSlug: string | null | undefined): string {
  if (ownerType === 'user') return 'personal'
  if (rawSlug) return rawSlug
  return ownerId.slice(0, 8)
}

/**
 * Fetches the slug for the primary location's owner from the DB.
 * Returns the resolved slug string (using fallbacks when the DB field is null).
 */
export async function fetchPrimaryOwnerSlug(loc: LocationRef): Promise<string> {
  switch (loc.ownerType) {
    case 'user':
      return 'personal'
    case 'project': {
      const project = await prisma.project.findUnique({
        where: { id: loc.ownerId },
        select: { slug: true },
      })
      return ownerSlug('project', loc.ownerId, project?.slug)
    }
  }
}
