/**
 * Who a bearer on hq's /mcp is (adr-0090): a person, through one of their own
 * connections, or nobody. The connection's authority is read fresh on every
 * call — its person's current org role, and its own groups and project list —
 * so a change of role, a revocation or an expiry takes effect on the next call.
 */
import { prisma } from 'wasp/server'
import { credentialMatches, hashCredential } from '../sites/credentials'
import type { ConnectionGrant } from '../server/controlplane/types'
import type { OrgRole } from '../server/identity/rolePolicy'
import type { ConnectionGroup } from '../shared/connections'
import { looksLikeConnectionToken } from './connectionToken'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Connections')

/** Last use is recorded at most this often per connection, so a busy tool is not a write per call. */
export const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000

const ROLES: readonly OrgRole[] = ['ADMIN', 'MEMBER']

export async function authenticateConnection(token: string, now: Date = new Date()): Promise<ConnectionGrant | null> {
  if (!looksLikeConnectionToken(token)) return null
  const row = await prisma.personConnection.findUnique({ where: { tokenHash: hashCredential(token) } })
  // The lookup is by hash; the timing-safe compare is the check itself.
  if (!row || !credentialMatches(token, row.tokenHash)) return null
  if (row.revokedAt !== null) return null
  if (row.expiresAt.getTime() <= now.getTime()) return null

  // The person must still be in the org: a connection never outlives them.
  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { id: true, settings: { select: { role: true } } },
  })
  const role = user?.settings?.role
  if (!user || !role || !ROLES.includes(role as OrgRole)) return null

  recordUse(row.id, row.lastUsedAt, now)
  return {
    connectionId: row.id,
    userId: row.userId,
    role: role as OrgRole,
    groups: groupsOf(row),
    projectIds: row.allProjects ? null : [...row.projectIds],
  }
}

export function groupsOf(row: {
  canRead: boolean
  canChangeTasks: boolean
  canStartWork: boolean
  canManage: boolean
}): ReadonlySet<ConnectionGroup> {
  const groups = new Set<ConnectionGroup>()
  if (row.canRead) groups.add('read')
  if (row.canChangeTasks) groups.add('change_tasks')
  if (row.canStartWork) groups.add('start_work')
  if (row.canManage) groups.add('manage')
  return groups
}

function recordUse(id: string, lastUsedAt: Date | null, now: Date): void {
  const stale = new Date(now.getTime() - LAST_USED_RESOLUTION_MS)
  if (lastUsedAt && lastUsedAt > stale) return
  // Conditional, so concurrent calls write it once; never awaited, so a failed
  // write costs the call nothing.
  void prisma.personConnection
    .updateMany({ where: { id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: stale } }] }, data: { lastUsedAt: now } })
    .catch(err => logger.warn('could not record connection use', err instanceof Error ? err.name : 'unknown'))
}
