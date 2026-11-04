import { describe, it, expect, vi } from 'vitest'

vi.mock('../../content', () => ({
  readContent: vi.fn(async () => []),
  storeContent: vi.fn(async () => 'digest-new'),
  releaseContent: vi.fn(async () => undefined),
}))

import type { PrismaClient } from '@prisma/client'
import { createNewSkill, discardDraft, saveDraft } from '../draftStore'
import type { PersonActor } from '../../policy'

const admin: PersonActor = { kind: 'person', userId: 'u1', role: 'ADMIN', libraryMaintainer: false, projectRole: null }
const clash = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
const asset = { id: 'a1', kind: 'SKILL', publisher: 'fern', name: 'seo', builtIn: false, removedAt: null, currentVersionId: 'v1', currentVersion: { digest: 'old' } }
const files = [{ path: 'SKILL.md', text: '---\nname: seo\ndescription: Checks a site\n---\nDo it.' }]

function fakeDb() {
  const tx = {
    draft: {
      findUnique: vi.fn(async () => ({ id: 'd1', revision: 4, digest: 'dg', revisions: [{ digest: 'dg' }] })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    assetVersion: { count: vi.fn(async () => 1) },
    asset: { delete: vi.fn() },
  }
  const db = {
    org: { findFirst: vi.fn(async () => ({ id: 'o', name: 'Fern', publisherName: 'fern', outsideInstallers: 'ADMINS' })) },
    asset: { findUnique: vi.fn(async () => asset) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  }
  return { db, tx }
}
const prisma = (db: object) => db as unknown as PrismaClient

describe('discarding a draft @SC-1624', () => {
  it('deletes only the revision the discarder looked at, in the delete itself', async () => {
    const { db, tx } = fakeDb()
    await discardDraft(prisma(db), admin, { assetId: 'a1', revision: 4 })
    expect(tx.draft.deleteMany).toHaveBeenCalledWith({ where: { id: 'd1', revision: 4 } })
  })

  it('refuses, and discards nothing, when a save landed between the read and the delete', async () => {
    const { db, tx } = fakeDb()
    tx.draft.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(discardDraft(prisma(db), admin, { assetId: 'a1', revision: 4 })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/changed as you discarded it.*Nothing was changed\./) })
    expect(tx.asset.delete).not.toHaveBeenCalled()
  })
})

describe('two people making the first save of a draft, or the same new skill, at once @SC-1624', () => {
  it('answers the second first save with "someone saved this draft"', async () => {
    const { db, tx } = fakeDb()
    tx.draft.findUnique.mockResolvedValueOnce(null as never)
    ;(tx as Record<string, unknown>).draft = { ...tx.draft, create: vi.fn().mockRejectedValue(clash()) }
    await expect(saveDraft(prisma(db), admin, { assetId: 'a1', files, revision: null })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Someone saved this draft at the same moment/) })
  })

  it('answers the second new skill of one name with "already has"', async () => {
    const { db } = fakeDb()
    db.asset.findUnique.mockResolvedValue(null as never)
    db.$transaction.mockRejectedValueOnce(clash())
    await expect(createNewSkill(prisma(db), admin, { name: 'seo', description: 'Checks a site' })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/already has fern\/seo.*Nothing was changed\./) })
  })
})
