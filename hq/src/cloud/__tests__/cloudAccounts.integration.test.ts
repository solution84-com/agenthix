/**
 * Linked Agenthix accounts against the real test database: one account to one person, found again at sign-in, read
 * for the downtime email, and the people told when the connection ends.
 */
import { describe, expect, it, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { CLOUD_SIGN_IN_ENDED_NOTIFICATION, cloudLinkStore, linkedAccountsAffected, readOwnCloudLink, tellLinkedPeopleSignInEnds, unlinkCloudAccount } from '../cloudAccounts'

const ISSUER = 'https://cloud.test'

describe('linked Agenthix accounts @SC-1094', () => {
  it('links one account to one person, and finds them by it', async () => {
    const dana = await createUser()
    const sam = await createUser()
    expect(await cloudLinkStore.link(dana.id, ISSUER, 'acct_dana')).toBe('linked')
    expect(await cloudLinkStore.link(sam.id, ISSUER, 'acct_dana')).toBe('taken')
    expect(await cloudLinkStore.personWith(ISSUER, 'acct_dana')).toEqual({ userId: dana.id, active: true })
    expect(await cloudLinkStore.personWith('https://elsewhere.test', 'acct_dana')).toBeNull()
    expect(await readOwnCloudLink(dana.id)).toMatchObject({ linkedAt: expect.any(String) })
  })

  it('a person linking again replaces their link; unlinking ends it', async () => {
    const dana = await createUser()
    await cloudLinkStore.link(dana.id, ISSUER, 'acct_old')
    await cloudLinkStore.link(dana.id, ISSUER, 'acct_new')
    expect(await cloudLinkStore.personWith(ISSUER, 'acct_old')).toBeNull()
    expect(await unlinkCloudAccount(dana.id)).toBe(true)
    expect(await cloudLinkStore.personWith(ISSUER, 'acct_new')).toBeNull()
  })

  it('reads someone who has left as not active', async () => {
    const gone = await createUser({ deactivatedAt: new Date() })
    await cloudLinkStore.link(gone.id, ISSUER, 'acct_gone')
    expect(await cloudLinkStore.personWith(ISSUER, 'acct_gone')).toEqual({ userId: gone.id, active: false })
  })

  it('names, for a change to hq itself, the linked accounts of everyone still here @SC-1095', async () => {
    const dana = await createUser()
    const gone = await createUser({ deactivatedAt: new Date() })
    await createUser()
    await cloudLinkStore.link(dana.id, ISSUER, 'acct_dana')
    await cloudLinkStore.link(gone.id, ISSUER, 'acct_gone')
    expect(await linkedAccountsAffected(null)).toEqual(['acct_dana'])
  })

  it('tells each linked person still here that they sign in with their password from now on @SC-1095', async () => {
    const dana = await createUser()
    const other = await createUser()
    await cloudLinkStore.link(dana.id, ISSUER, 'acct_dana')
    await tellLinkedPeopleSignInEnds()
    const told = await prisma.notification.findMany({ where: { type: CLOUD_SIGN_IN_ENDED_NOTIFICATION } })
    expect(told.map(n => n.userId)).toEqual([dana.id])
    expect(told[0].body).toContain('sign in with your username and password')
    expect(await prisma.notification.count({ where: { userId: other.id } })).toBe(0)
  })
})
