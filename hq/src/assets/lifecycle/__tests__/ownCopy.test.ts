import { describe, it, expect, vi } from 'vitest'

vi.mock('../../content', () => ({
  readContent: vi.fn(async () => []),
  storeContent: vi.fn(async () => 'digest-copy'),
}))

import type { PrismaClient } from '@prisma/client'
import { editAsset, moveHolders, switchToCopy, switchToOriginal } from '../ownCopy'
import type { PersonActor } from '../../policy'

const admin: PersonActor = { kind: 'person', userId: 'u1', role: 'ADMIN', libraryMaintainer: false, projectRole: null }
const clash = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
const hqLine = { skill: 'acme-tools/seo', version: '1.0.0', fingerprint: 'd0', copied: '2026-01-01', recorded: 'hq' }
const original = {
  id: 'orig', publisher: 'acme-tools', name: 'seo', kind: 'SKILL', builtIn: false, removedAt: null, suitedTo: [], setAsideById: null,
  currentVersionId: 'v1', currentVersion: { id: 'v1', version: '1.0.0', digest: 'd0', basedOn: [], source: 'UPLOAD', licence: null },
}
const copyRow = { id: 'copy', publisher: 'fern', name: 'seo', kind: 'SKILL', builtIn: false, removedAt: null, setAsideById: null, currentVersion: null }

type Opts = { later: object | null; basedOnOf?: unknown; copyVersions?: number; originRow?: Record<string, unknown> }

function fakeDb({ later, basedOnOf = [hqLine], copyVersions = 3, originRow = {} }: Opts) {
  let lookups = 0
  const grants: { assetId: string; agentId: string }[] = []
  const db = {
    org: { findFirst: vi.fn(async () => ({ id: 'o', name: 'Fern', publisherName: 'fern', outsideInstallers: 'ADMINS' })) },
    asset: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === 'orig') return { ...original, ...originRow }
        if (where.id === 'copy') return copyRow
        if (where.kind_publisher_name) {
          const key = where.kind_publisher_name as { publisher: string }
          if (key.publisher === 'acme-tools') return { ...original, ...originRow }
          return lookups++ === 0 ? null : later
        }
        return null
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      update: vi.fn(async () => ({})),
    },
    assetVersion: {
      findFirst: vi.fn(async () => ({ basedOn: basedOnOf })),
      count: vi.fn(async () => copyVersions),
    },
    assetGrant: { findMany: vi.fn(async () => grants), createMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  }
  return db
}
const asPrisma = (db: object) => db as unknown as PrismaClient

describe('two people pressing Edit on the same skill at once @SC-1621', () => {
  it('answers the second with the copy the first made, when it was made from this original', async () => {
    const db = fakeDb({ later: copyRow })
    db.$transaction.mockRejectedValueOnce(clash())
    await expect(editAsset(asPrisma(db), admin, { assetId: 'orig' }, new Date())).resolves.toEqual({ assetId: 'copy', identity: 'fern/seo', copied: false })
  })

  it('answers with the name-taken refusal when the name went to a skill that is not a copy of this one', async () => {
    const db = fakeDb({ later: copyRow, basedOnOf: [{ ...hqLine, skill: 'other/seo' }] })
    db.asset.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id === 'orig') return original
      const key = where.kind_publisher_name as { publisher: string; name: string } | undefined
      if (key?.publisher === 'acme-tools') return original
      if (key?.publisher === 'other') return null
      return db.$transaction.mock.calls.length === 0 ? null : copyRow
    })
    db.$transaction.mockRejectedValueOnce(clash())
    await expect(editAsset(asPrisma(db), admin, { assetId: 'orig' }, new Date())).rejects.toMatchObject({ status: 409, message: expect.stringContaining('already has fern/seo') })
  })

  it('lets any other database error through', async () => {
    const db = fakeDb({ later: null })
    const lost = new Error('connection lost')
    db.$transaction.mockRejectedValueOnce(lost)
    await expect(editAsset(asPrisma(db), admin, { assetId: 'orig' }, new Date())).rejects.toBe(lost)
  })
})

describe('"Use this copy again" @SC-1621', () => {
  it('is refused for a copy that was never published, which holds only the original\'s older files', async () => {
    const db = fakeDb({ later: null, copyVersions: 1 })
    await expect(switchToCopy(asPrisma(db), admin, 'copy')).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/hasn't been published since it was copied.*Nothing was changed\./) })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('goes ahead for a copy with a published edit', async () => {
    const db = fakeDb({ later: null, copyVersions: 2 })
    await expect(switchToCopy(asPrisma(db), admin, 'copy')).resolves.toEqual({ identity: 'fern/seo' })
  })
})

describe('switching back to the original @SC-1621', () => {
  it('is refused while the original is removed, rather than moving agents onto a skill delivery skips', async () => {
    const db = fakeDb({ later: null, originRow: { setAsideById: 'copy', removedAt: new Date() } })
    await expect(switchToOriginal(asPrisma(db), admin, 'copy')).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/was removed from the Library.*Put it back first/) })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('goes ahead for an original in the Library', async () => {
    const db = fakeDb({ later: null, originRow: { setAsideById: 'copy' } })
    await expect(switchToOriginal(asPrisma(db), admin, 'copy')).resolves.toEqual({ identity: 'acme-tools/seo' })
  })
})

describe('moving the agents between a copy and its original @SC-1621', () => {
  it('reads every-agent inside the transaction, and deletes only the grants it moved', async () => {
    const db = fakeDb({ later: null })
    db.assetGrant.findMany.mockResolvedValueOnce([{ assetId: 'copy', agentId: 'a1' }, { assetId: 'copy', agentId: 'a2' }])
    db.asset.updateMany.mockResolvedValueOnce({ count: 1 })
    await moveHolders(db as never, { id: 'copy' }, 'orig', 'u1')
    expect(db.assetGrant.deleteMany).toHaveBeenCalledWith({ where: { assetId: 'copy', agentId: { in: ['a1', 'a2'] } } })
    expect(db.asset.updateMany).toHaveBeenCalledWith({ where: { id: 'copy', givenToAll: true }, data: { givenToAll: false } })
    expect(db.asset.update).toHaveBeenCalledWith({ where: { id: 'orig' }, data: { givenToAll: true } })
  })

  it('leaves the target alone when the source was not given to every agent', async () => {
    const db = fakeDb({ later: null })
    await moveHolders(db as never, { id: 'copy' }, 'orig', 'u1')
    expect(db.asset.update).not.toHaveBeenCalled()
  })
})

