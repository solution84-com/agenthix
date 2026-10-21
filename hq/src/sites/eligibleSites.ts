/**
 * The sites a combined read considers: every one this organisation still has,
 * in a stable order, with everything a caller needs to decide what to do with
 * each — and nothing else. No domain knowledge, no channel, no protocol
 * judgement.
 *
 * This replaces "the oldest-registered credentialed site", an interim answer
 * that warned about itself. Placement is real now: every storage boundary has
 * a site, so a read that belongs to one owner routes there, and only the reads
 * that belong to NO single owner — dashboard statistics, the activity feed,
 * the storage listing, what is running now — come here.
 *
 * One exclusion is made here and one deliberately is not, because they are
 * not the same kind of thing and the difference reaches a person:
 *
 * - A REVOKED site is not part of this organisation any more. It is excluded
 *   in the query, so nothing downstream can ask it or name it — "this site did
 *   not reply" about a site somebody deliberately revoked sends them to fix
 *   nothing.
 * - A site on a protocol this read cannot use IS part of the organisation and
 *   MUST be named, with the version it runs, because an upgrade is the action
 *   that fixes it. So it is returned, carrying `status` and `protocolVersion`,
 *   and `askEverySite` (combinedRead.ts) decides against the floor its caller
 *   stated. A floor is a caller's to state, and this module does not know one.
 *   A site that is merely offline is returned too: it is asked and fails fast,
 *   or asked and times out, and both are named.
 *
 * hq creates no site of its own, so with none registered this is empty — and
 * an empty list means "nobody to ask", which a view says as "No Execution Site
 * is connected", not as a site that failed to answer.
 */
import { prisma } from 'wasp/server'
import { displaySiteName } from '../shared/siteName'

/** @see schema.prisma — the one ExecutionSite.status value this module acts on. */
const REVOKED = 'REVOKED'

export type EligibleSite = {
  /** `ExecutionSite.id` — what Project and placement rows anchor to. */
  id: string
  /** `SiteConfig.siteId` — the logical id the channel keys live connections by. */
  siteId: string
  /** As shown (`displaySiteName`): HQ's own site is "hq-box · HQ's site". */
  label: string
  /** `ExecutionSite.status`; never `REVOKED`, which this query excludes. */
  status: string
  /** The protocol version this site last presented, or null if it never connected. */
  protocolVersion: string | null
}

export async function eligibleSites(): Promise<EligibleSite[]> {
  // Ordered by registration, so a merged view lists its sites the same way on
  // every read. `id` breaks the tie: two rows can share a `registeredAt` —
  // seeded or migrated rows routinely do — and without a second key their
  // order is whatever the query planner chose that time.
  const rows = await prisma.executionSite.findMany({
    where: { status: { not: REVOKED } },
    orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
    select: { id: true, siteId: true, label: true, isDefault: true, status: true, protocolVersion: true },
  })
  return rows.map(({ isDefault, ...site }) => ({ ...site, label: displaySiteName({ label: site.label, isDefault }) }))
}
