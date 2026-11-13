/**
 * The Responsible AI Pledge card's server side, against the real test database: which card each person sees, what
 * dismissing keeps, and their own signature for Settings. Whether a linked person signed is stood in for.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'
import type { PledgeStanding } from '../../cloud/pledgeStatus'

const standing = vi.hoisted(() => ({ of: new Map<string, PledgeStanding>() }))

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../cloud', async () => {
  const { parseCloudBaseUrl } = await vi.importActual<typeof import('@agenthix/core')>('@agenthix/core')
  return {
    cloudBaseUrl: () => parseCloudBaseUrl('https://cloud.test'),
    cloudPledgeStatuses: () => ({ of: async (userId: string) => standing.of.get(userId) ?? { kind: 'unknown' } }),
  }
})

import { dismissPledge, getMyPledge, getPledgeCard } from '../pledge'
import { withFeature } from '../../test/withFeature'

const as = (user: { id: string } | null) => ({ user, entities: {} }) as any
const PAGE = 'https://agenthix.com/responsible-ai'
const SIGN = 'https://cloud.test/pledge/sign'

beforeEach(() => standing.of.clear())

describe('the pledge card @SC-1122', () => {
  it('invites each person until they dismiss it, and the dismissal is theirs alone', async () => {
    const dana = await createUser()
    const sam = await createUser()
    expect(await getPledgeCard(undefined, as(dana))).toEqual({ kind: 'invite', pageUrl: PAGE })
    await dismissPledge(undefined, as(dana))
    const kept = (await prisma.user.findUniqueOrThrow({ where: { id: dana.id } })).pledgeDismissedAt
    await dismissPledge(undefined, as(dana))
    expect((await prisma.user.findUniqueOrThrow({ where: { id: dana.id } })).pledgeDismissedAt).toEqual(kept)
    expect(await getPledgeCard(undefined, as(dana))).toEqual({ kind: 'none' })
    expect(await getPledgeCard(undefined, as(sam))).toEqual({ kind: 'invite', pageUrl: PAGE })
  })

  it('needs someone signed in', async () => {
    await expect(getPledgeCard(undefined, as(null))).rejects.toMatchObject({ statusCode: 401 })
    await expect(dismissPledge(undefined, as(null))).rejects.toMatchObject({ statusCode: 401 })
    await expect(getMyPledge(undefined, as(null))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('the pledge card while Agenthix Cloud is off (adr-0189)', () => {
  it('asks Cloud nothing: a linked person gets the plain invitation, and Settings shows no signature', async () => {
    const dana = await createUser()
    standing.of.set(dana.id, { kind: 'signed', version: 1, currentVersion: 2, signerId: 's_1' })
    expect(await getPledgeCard(undefined, as(dana))).toEqual({ kind: 'invite', pageUrl: PAGE })
    expect(await getMyPledge(undefined, as(dana))).toBeNull()
  })
})

withFeature('cloud', () => {
  describe('the pledge card for a linked Agenthix account @SC-1125', () => {
    it('not signed: signing straight on Cloud; withdrawn: the plain invitation', async () => {
      const dana = await createUser()
      standing.of.set(dana.id, { kind: 'notSigned', withdrawn: false, currentVersion: 1 })
      expect(await getPledgeCard(undefined, as(dana))).toEqual({ kind: 'inviteLinked', pageUrl: PAGE, signUrl: SIGN })
      standing.of.set(dana.id, { kind: 'notSigned', withdrawn: true, currentVersion: 1 })
      expect(await getPledgeCard(undefined, as(dana))).toEqual({ kind: 'invite', pageUrl: PAGE })
    })

    it('signed the current version: no card, in any HQ, dismissed or not', async () => {
      const dana = await createUser()
      standing.of.set(dana.id, { kind: 'signed', version: 2, currentVersion: 2, signerId: 's_1' })
      expect(await getPledgeCard(undefined, as(dana))).toEqual({ kind: 'none' })
    })

    it('signed an earlier version: the new version comes back once, even after the invitation was dismissed', async () => {
      const dana = await createUser()
      await dismissPledge(undefined, as(dana))
      standing.of.set(dana.id, { kind: 'signed', version: 1, currentVersion: 2, signerId: 's_1' })
      expect(await getPledgeCard(undefined, as(dana))).toEqual({ kind: 'newVersion', signedVersion: 1, currentVersion: 2, signUrl: SIGN })
      await dismissPledge({ newVersion: 2 }, as(dana))
      expect(await getPledgeCard(undefined, as(dana))).toEqual({ kind: 'none' })
      await dismissPledge({ newVersion: 1 }, as(dana))
      expect((await prisma.user.findUniqueOrThrow({ where: { id: dana.id } })).pledgeVersionDismissed).toBe(2)
      standing.of.set(dana.id, { kind: 'signed', version: 1, currentVersion: 3, signerId: 's_1' })
      expect((await getPledgeCard(undefined, as(dana))).kind).toBe('newVersion')
      await expect(dismissPledge({ newVersion: 0 }, as(dana))).rejects.toMatchObject({ statusCode: 400 })
    })

    it("the person's own signature, for Settings, with their badge; nothing without one", async () => {
      const dana = await createUser()
      expect(await getMyPledge(undefined, as(dana))).toBeNull()
      standing.of.set(dana.id, { kind: 'signed', version: 1, currentVersion: 2, signerId: 's_1' })
      expect(await getMyPledge(undefined, as(dana))).toEqual({ version: 1, currentVersion: 2, badgeUrl: 'https://cloud.test/pledge/s/s_1' })
    })
  })
})
