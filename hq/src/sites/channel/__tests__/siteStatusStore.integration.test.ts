import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../../test/db'

// A site's connection state as the registry writes it, against the real test
// database. Every write is conditional on the state it may move from, and what
// these tests check is which rows each write reaches.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  return { prisma }
})

import { prismaSiteStatusStore as store, markAllOfflineAtBoot } from '../siteStatusStore'

const T0 = new Date('2026-01-01T10:00:00.000Z')
const T1 = new Date('2026-01-01T10:00:05.000Z')
const T2 = new Date('2026-01-01T10:00:10.000Z')
const EARLIER = new Date('2026-01-01T09:00:00.000Z')

function site(data: { siteId?: string; status?: string; lastSeenAt?: Date | null; protocolVersion?: string | null } = {}) {
  return prisma.executionSite.create({
    data: { siteId: 's1', label: 'Site', status: 'OFFLINE', lastSeenAt: EARLIER, protocolVersion: '8.1', ...data },
  })
}
const read = (siteId = 's1') => prisma.executionSite.findUniqueOrThrow({ where: { siteId } })

beforeEach(() => {
  // Only the clock the store stamps with; the database driver keeps real timers.
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterEach(() => vi.useRealTimers())

describe('site connection state @SC-292', () => {
  it('goes online and stamps last-seen, for any site that is not revoked — one already reading ONLINE included', async () => {
    for (const [siteId, status] of [['s1', 'REGISTERED'], ['s2', 'ONLINE'], ['s3', 'OFFLINE']]) await site({ siteId, status })
    vi.setSystemTime(T1)
    for (const siteId of ['s1', 's2', 's3']) await store.markOnline(siteId)
    for (const siteId of ['s1', 's2', 's3']) expect(await read(siteId)).toMatchObject({ status: 'ONLINE', lastSeenAt: T1 })
  })

  it('advances last-seen without touching status', async () => {
    await site({ status: 'REGISTERED' })
    vi.setSystemTime(T1)
    await store.touch('s1')
    expect(await read()).toMatchObject({ status: 'REGISTERED', lastSeenAt: T1 })
  })

  it('records the protocol version a site presented, whatever its status', async () => {
    await site({ status: 'REVOKED' })
    await store.recordProtocolVersion('s1', '9.0')
    expect(await read()).toMatchObject({ status: 'REVOKED', protocolVersion: '9.0' })
  })
})

describe('site connection state @SC-293', () => {
  // A site that has never connected reads REGISTERED, which is a different
  // statement from OFFLINE — it has not dropped, it has not arrived. And a
  // site revoked mid-connection must not be walked back by its own close.
  it.each(['REGISTERED', 'REVOKED', 'VERSION_MISMATCH'])('only moves to offline from online: %s stays', async (status) => {
    await site({ status })
    await store.markOffline('s1')
    expect((await read()).status).toBe(status)
  })

  it('moves an online site offline', async () => {
    await site({ status: 'ONLINE' })
    await store.markOffline('s1')
    expect((await read()).status).toBe('OFFLINE')
  })
})

describe('site connection state @SC-294', () => {
  it('marks every online site offline at boot, and only those', async () => {
    await site({ siteId: 's1', status: 'ONLINE' })
    await site({ siteId: 's2', status: 'ONLINE' })
    await site({ siteId: 's3', status: 'REVOKED' })
    await markAllOfflineAtBoot()
    expect((await prisma.executionSite.findMany({ orderBy: { siteId: 'asc' } })).map((s) => s.status)).toEqual(['OFFLINE', 'OFFLINE', 'REVOKED'])
  })
})

describe('markVersionMismatch — a stale write cannot overwrite a newer sign of life (R-035)', () => {
  it('records the mismatch on a site that has shown no life since the attempt began', async () => {
    await site({ status: 'OFFLINE' })
    vi.setSystemTime(T1)

    await store.markVersionMismatch('s1', '7.0', T0)

    expect(await read()).toMatchObject({ status: 'VERSION_MISMATCH', protocolVersion: '7.0', lastSeenAt: T1 })
  })

  it('records it on a site that has never connected, which has no lastSeenAt at all', async () => {
    await site({ status: 'REGISTERED', lastSeenAt: null, protocolVersion: null })

    await store.markVersionMismatch('s1', '7.0', T0)

    expect((await read()).status).toBe('VERSION_MISMATCH')
  })

  it('does not overwrite ONLINE when the other process came online after this attempt began', async () => {
    await site({ status: 'OFFLINE' })
    // Process A's handshake starts at T0; process B, on the same credential and
    // a matching version, is marked online at T1; A's write lands after that.
    vi.setSystemTime(T1)
    await store.markOnline('s1')
    vi.setSystemTime(T2)

    await store.markVersionMismatch('s1', '7.0', T0)

    expect(await read()).toMatchObject({ status: 'ONLINE', protocolVersion: '8.1', lastSeenAt: T1 })
  })

  it('does not overwrite a touch that landed after the attempt began', async () => {
    await site({ status: 'ONLINE' })
    vi.setSystemTime(T1)
    await store.touch('s1')

    await store.markVersionMismatch('s1', '7.0', T0)

    expect((await read()).status).toBe('ONLINE')
  })

  it('still records it when the last sign of life is exactly the moment the attempt began', async () => {
    await site({ status: 'OFFLINE', lastSeenAt: T0 })

    await store.markVersionMismatch('s1', '7.0', T0)

    expect((await read()).status).toBe('VERSION_MISMATCH')
  })

  it('never overwrites a revoked site', async () => {
    await site({ status: 'REVOKED' })

    await store.markVersionMismatch('s1', '7.0', T0)

    expect((await read()).status).toBe('REVOKED')
  })

  it('leaves another site alone', async () => {
    await site({ siteId: 's2', status: 'OFFLINE' })
    await site({ siteId: 's1' })

    await store.markVersionMismatch('s1', '7.0', T0)

    expect((await read('s2')).status).toBe('OFFLINE')
  })
})

describe('the store clears a mismatch when the site comes online (R-036)', () => {
  it('moves a VERSION_MISMATCH site to ONLINE and stamps lastSeenAt', async () => {
    await site({ status: 'VERSION_MISMATCH', protocolVersion: '7.0' })
    vi.setSystemTime(T1)

    await store.markOnline('s1')

    expect(await read()).toMatchObject({ status: 'ONLINE', lastSeenAt: T1 })
  })

  it('does not bring a revoked site online', async () => {
    await site({ status: 'REVOKED' })

    await store.markOnline('s1')

    expect((await read()).status).toBe('REVOKED')
  })
})
