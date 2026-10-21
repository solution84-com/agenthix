import type { Prisma } from '@prisma/client'
import { entitledProjectsFilter } from '../../projects/membership'
import type { CallerContext } from './types'
import { actingPerson, confinedProjectId, reachesOwnSpace } from './runPerson'

/**
 * The projects a caller may see: those its person is entitled to (ADR-0062),
 * and of those, only what its boundary reaches (adr-0101) — a run in a project
 * that project alone, a chat in its person's own storage all of them, and a
 * conversation's turn likewise by its place. A person's connection is narrowed to its own project list when it has one
 * (adr-0090). A run on behalf of no one is refused.
 */
export async function projectsVisibleToRun(ctx: CallerContext, what: string): Promise<Prisma.ProjectWhereInput> {
  if (ctx.kind === 'connection') {
    const { userId, projectIds } = ctx.connection
    if (projectIds === null) return entitledProjectsFilter(userId)
    return { AND: [entitledProjectsFilter(userId), { id: { in: [...projectIds] } }] }
  }
  const { userId } = await actingPerson(ctx, what)
  if (reachesOwnSpace(ctx)) return entitledProjectsFilter(userId)
  // A malformed token naming no project matches nothing rather than everything.
  return { AND: [entitledProjectsFilter(userId), { id: confinedProjectId(ctx) ?? { in: [] } }] }
}
