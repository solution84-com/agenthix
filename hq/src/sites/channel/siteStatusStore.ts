import { prisma } from 'wasp/server'

/**
 * The registry writes connection state through this, so the registry itself
 * needs no database and can be tested against a real socket. Every write is
 * conditional on the status it may move from — an unconditional one would let
 * a close event that arrives after a revoke resurrect the row.
 */
export interface SiteStatusStore {
  markOnline(siteId: string): Promise<void>
  markOffline(siteId: string): Promise<void>
  touch(siteId: string): Promise<void>
  recordProtocolVersion(siteId: string, version: string): Promise<void>
  /**
   * `attemptedAt` is when the handshake being refused began. The write applies
   * only if the site has shown no sign of life since then — see the
   * implementation for why.
   */
  markVersionMismatch(siteId: string, version: string, attemptedAt: Date): Promise<void>
}

export const prismaSiteStatusStore: SiteStatusStore = {
  async markOnline(siteId) {
    // Anything but REVOKED may go online — including a row already reading
    // ONLINE, left behind by a process that died without closing its sockets.
    // Excluding it would skip the lastSeenAt stamp on exactly that reconnect.
    await prisma.executionSite.updateMany({
      where: { siteId, status: { not: 'REVOKED' } },
      data: { status: 'ONLINE', lastSeenAt: new Date() },
    })
  },

  async markOffline(siteId) {
    await prisma.executionSite.updateMany({
      where: { siteId, status: 'ONLINE' },
      data: { status: 'OFFLINE' },
    })
  },

  async touch(siteId) {
    await prisma.executionSite.updateMany({
      where: { siteId },
      data: { lastSeenAt: new Date() },
    })
  },

  async recordProtocolVersion(siteId, version) {
    await prisma.executionSite.updateMany({
      where: { siteId },
      data: { protocolVersion: version },
    })
  },

  async markVersionMismatch(siteId, version, attemptedAt) {
    // Never over a revoked site: revocation is final, a mismatch is not.
    //
    // And never over a newer sign of life. Two site processes can share one
    // credential, and this write follows an await on the refused handshake: if
    // the other process was marked online (or touched) after this attempt
    // began, this result is stale and would overwrite the ONLINE it lost to.
    // Every path that says a site is alive stamps lastSeenAt, so comparing it
    // with when the attempt began is the compare-and-set.
    await prisma.executionSite.updateMany({
      where: {
        siteId,
        status: { not: 'REVOKED' },
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lte: attemptedAt } }],
      },
      data: { status: 'VERSION_MISMATCH', protocolVersion: version, lastSeenAt: new Date() },
    })
  },
}

/**
 * hq holds its connections in memory, so a restart means nothing is connected.
 * Any ONLINE row is a leftover from the previous process; without this, a crash
 * leaves sites reading ONLINE forever and dispatch would trust it.
 */
export async function markAllOfflineAtBoot(): Promise<void> {
  await prisma.executionSite.updateMany({
    where: { status: 'ONLINE' },
    data: { status: 'OFFLINE' },
  })
}
