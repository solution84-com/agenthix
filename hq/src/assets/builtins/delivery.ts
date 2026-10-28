/**
 * The built-in skills a run is given (spec part 1 L1a, part 5 *Delivery per turn*; adr-0156): every built-in not
 * switched off, at the version hq's image installed, at the `builtin` level, so it stages as `platform-<name>` and
 * passes the same staged-name check as every installed skill. A built-in that only applies to some runs is given only
 * to them: `working-with-git` only when the run works in a git repository, which only the site holding the location
 * can say, so it is asked only when that built-in is on.
 */
import { AGENTHIX_PUBLISHER, type InstalledSkillEntry, type LocationRef } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { repoStateOnSite } from '../../storage/repoWorkStore'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('BuiltInSkills')

/** Built-ins staged only where the run works in a git repository. */
export const REPOSITORY_ONLY: ReadonlySet<string> = new Set(['working-with-git'])

/** Whether the run's location is a git repository; false when the site can't say. */
export type RepositoryCheck = () => Promise<boolean>

export async function builtInSkillsFor(db: Db, inRepository: RepositoryCheck): Promise<InstalledSkillEntry[]> {
  const rows = await db.asset.findMany({
    where: { kind: 'SKILL', builtIn: true, switchedOff: false, removedAt: null, publisher: AGENTHIX_PUBLISHER, currentVersionId: { not: null } },
    select: { name: true, currentVersion: { select: { id: true, version: true, digest: true } } },
    orderBy: { name: 'asc' },
  })
  const needsRepository = rows.some(r => REPOSITORY_ONLY.has(r.name))
  const repository = needsRepository ? await inRepository() : false
  return rows
    .filter(r => r.currentVersion && (!REPOSITORY_ONLY.has(r.name) || repository))
    .map(r => {
      const v = r.currentVersion!
      return {
        identity: `${AGENTHIX_PUBLISHER}/${r.name}`, version: v.version, digest: v.digest, level: 'builtin' as const,
        ref: { kind: 'skill' as const, key: v.id, digest: v.digest },
      }
    })
}

/** Asks the site holding the location whether it is a git repository (it has `.git`). */
export function locationIsRepository(siteId: string, loc: LocationRef): RepositoryCheck {
  return async () => {
    try {
      return (await repoStateOnSite(siteId, loc)).isGitRepo
    } catch (err) {
      logger.warn(`could not tell whether ${loc.ownerType} ${loc.ownerId}${loc.workspaceId ? ` workspace ${loc.workspaceId}` : ''} is a repository: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }
}
