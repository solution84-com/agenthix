import { describe, it, expect, vi } from 'vitest'

vi.mock('../../content', () => ({ readContent: vi.fn(async () => []), storeContent: vi.fn(async () => 'digest') }))

import type { PrismaClient } from '@prisma/client'
import { addToPlace } from '../addRemove'
import type { PersonActor } from '../../policy'

const member: PersonActor = { kind: 'person', userId: 'u1', role: 'MEMBER', libraryMaintainer: false, projectRole: 'MEMBER' }
const clash = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
const skill = { id: 'a1', kind: 'SKILL', publisher: 'acme', name: 'seo', removedAt: null, builtIn: false, setAsideById: null, currentVersion: { version: '1.0.0', digest: 'd' } }

function fakeDb(asset: object) {
  const db = {
    project: { findUnique: vi.fn(async () => ({ id: 'p1', personalOwnerId: null, personalSpace: false, fileSkillsDefault: null })) },
    org: { findFirst: vi.fn(async () => ({ fileSkillsDefault: 'OFF' })) },
    asset: { findUnique: vi.fn(async () => asset) },
    agent: { findUnique: vi.fn(async () => null) },
    placeSkill: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  }
  return db
}
const add = (db: object) => addToPlace(db as unknown as PrismaClient, member, { projectId: 'p1', assetId: 'a1' })

describe('Add to this place holds on the server what the screen offers @SC-1622', () => {
  it('refuses a built-in skill', async () => {
    await expect(add(fakeDb({ ...skill, builtIn: true }))).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/built into hq.*Nothing was changed\./) })
  })

  it("refuses a skill set aside for the organisation's own copy, and says to add the copy", async () => {
    await expect(add(fakeDb({ ...skill, setAsideById: 'copy' }))).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/set aside.*Add the copy instead.*Nothing was changed\./) })
  })

  it('answers the second of two people adding the same skill at once with "already has", not the database error', async () => {
    const db = fakeDb(skill)
    db.$transaction.mockRejectedValueOnce(clash())
    await expect(add(db)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/already has a skill named seo there.*Nothing was changed\./) })
  })

  it('lets any other database error through', async () => {
    const db = fakeDb(skill)
    const lost = new Error('connection lost')
    db.$transaction.mockRejectedValueOnce(lost)
    await expect(add(db)).rejects.toBe(lost)
  })
})
