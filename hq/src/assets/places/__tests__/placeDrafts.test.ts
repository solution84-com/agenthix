import { describe, it, expect, vi } from 'vitest'

vi.mock('../../content', () => ({
  readContent: vi.fn(async () => []),
  storeContent: vi.fn(async () => 'digest-new'),
  releaseContent: vi.fn(async () => undefined),
}))

import type { PrismaClient } from '@prisma/client'
import { discardPlaceDraft, savePlaceDraft } from '../placeDrafts'
import type { PersonActor } from '../../policy'

const member: PersonActor = { kind: 'person', userId: 'u1', role: 'MEMBER', libraryMaintainer: false, projectRole: 'MEMBER' }
const clash = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
const placeSkill = { id: 's1', placeType: 'project', placeId: 'p1', path: '.agents/skills/seo', group: 'PLACE', agentId: null, workspaceId: null, lastFingerprint: 'fp' }
const md = { path: 'SKILL.md', text: '---\nname: seo\ndescription: Checks a site\n---\nDo it.' }

function fakeDb() {
  const tx = {
    draft: {
      findUnique: vi.fn(async () => ({ id: 'd1', revision: 2, digest: 'dg', revisions: [{ digest: 'dg' }] })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(),
    },
    placeSkillVersion: { count: vi.fn(async () => 1) },
    placeSkill: { delete: vi.fn() },
  }
  const db = {
    placeSkill: { findUnique: vi.fn(async () => placeSkill) },
    project: { findUnique: vi.fn(async () => ({ id: 'p1', personalOwnerId: null, personalSpace: false, fileSkillsDefault: null })) },
    org: { findFirst: vi.fn(async () => ({ fileSkillsDefault: 'OFF' })) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  }
  return { db, tx }
}
const prisma = (db: object) => db as unknown as PrismaClient

describe("discarding a place skill's draft @SC-1624", () => {
  it('deletes only the revision the discarder looked at', async () => {
    const { db, tx } = fakeDb()
    await discardPlaceDraft(prisma(db), member, { placeSkillId: 's1', revision: 2 })
    expect(tx.draft.deleteMany).toHaveBeenCalledWith({ where: { id: 'd1', revision: 2 } })
  })

  it('refuses when a save landed since', async () => {
    const { db, tx } = fakeDb()
    tx.draft.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(discardPlaceDraft(prisma(db), member, { placeSkillId: 's1', revision: 2 })).rejects.toMatchObject({ status: 409 })
  })
})

describe("saving a place skill's draft @SC-1624", () => {
  it('answers the second of two first saves with "someone saved this draft"', async () => {
    const { db, tx } = fakeDb()
    tx.draft.findUnique.mockResolvedValueOnce(null as never)
    tx.draft.create.mockRejectedValueOnce(clash())
    await expect(savePlaceDraft(prisma(db), member, { placeSkillId: 's1', files: [md], revision: null })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Someone saved this draft at the same moment/) })
  })

  it("accepts the skill's own package.json, which the place keeps", async () => {
    const { db, tx } = fakeDb()
    tx.draft.findUnique.mockResolvedValueOnce(null as never)
    tx.draft.create.mockRejectedValueOnce(clash())
    // Reaching the write (and its clash) shows the file list passed the checks.
    await expect(savePlaceDraft(prisma(db), member, { placeSkillId: 's1', files: [md, { path: 'package.json', text: '{"name":"mine"}' }], revision: null }))
      .rejects.toMatchObject({ message: expect.stringMatching(/Someone saved this draft/) })
  })
})
