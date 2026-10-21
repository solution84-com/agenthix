/**
 * Whether a person can talk to agents in their own Chat (getting-in spec), in
 * place of the global banner's check, against the real test database.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { getMyModelAccess } from '../talkAccess'
import { orgKey, storeKey, storeSubscription } from './runCredentialFixtures'

const ctx = (user?: { id: string }) => ({ user }) as any

beforeEach(() => vi.stubEnv('HQ_DEV_SHARED_SUBSCRIPTION', ''))
afterEach(() => vi.unstubAllEnvs())

describe('getMyModelAccess @SC-722', () => {
  it('says a member cannot talk yet, and that the fix is their own login', async () => {
    const dana = await createUserWithRole('MEMBER')
    await expect(getMyModelAccess(undefined, ctx(dana))).resolves.toEqual({ canTalk: false, fix: 'own-login', isAdmin: false })
  })

  it('points an admin at the organisation\'s model access', async () => {
    const avery = await createUserWithRole('ADMIN')
    await expect(getMyModelAccess(undefined, ctx(avery))).resolves.toEqual({ canTalk: false, fix: 'org-access', isAdmin: true })
  })

  it('counts the person\'s own login once its terms are accepted, and their own key', async () => {
    const dana = await createUserWithRole('MEMBER')
    await storeSubscription('user', dana.id, 'oauth', { accepted: false })
    expect((await getMyModelAccess(undefined, ctx(dana))).canTalk).toBe(false)

    const sam = await createUserWithRole('MEMBER')
    await storeSubscription('user', sam.id)
    expect((await getMyModelAccess(undefined, ctx(sam))).canTalk).toBe(true)

    const lee = await createUserWithRole('MEMBER')
    await storeKey('user', lee.id, 'sk-own')
    expect((await getMyModelAccess(undefined, ctx(lee))).canTalk).toBe(true)
  })

  it('counts the organisation\'s API key for everyone', async () => {
    const dana = await createUserWithRole('MEMBER')
    await orgKey('anthropic', 'sk-org')
    await expect(getMyModelAccess(undefined, ctx(dana))).resolves.toMatchObject({ canTalk: true, fix: null })
  })

  it('needs a signed-in person', async () => {
    await expect(getMyModelAccess(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})
