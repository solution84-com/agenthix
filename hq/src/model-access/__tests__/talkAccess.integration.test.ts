/**
 * Whether a person can talk to agents in their own Chat, asked of the resolver (models from one place, part 4),
 * against the real test database.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'
import { createProvider, setOrgDefaults } from '../../routing/__tests__/routingFixtures'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { getMyModelAccess } from '../talkAccess'

const ctx = (user?: { id: string }) => ({ user }) as any

describe('getMyModelAccess @SC-722', () => {
  it('says nobody can talk while no model provider works, and that the fix is the organisation admins\'', async () => {
    const dana = await createUserWithRole('MEMBER')
    await expect(getMyModelAccess(undefined, ctx(dana))).resolves.toEqual({ canTalk: false, fix: 'org-access', isAdmin: false })
    const avery = await createUserWithRole('ADMIN')
    await expect(getMyModelAccess(undefined, ctx(avery))).resolves.toEqual({ canTalk: false, fix: 'org-access', isAdmin: true })
  })

  it('says everyone can talk once a provider works, and no longer when it stops', async () => {
    const dana = await createUserWithRole('MEMBER')
    const provider = await createProvider({ vendor: 'anthropic' })
    await setOrgDefaults({ conversation: { providerId: provider.id, model: 'claude-sonnet-4-6' } })
    await expect(getMyModelAccess(undefined, ctx(dana))).resolves.toMatchObject({ canTalk: true, fix: null })
    await prisma.aiProvider.update({ where: { id: provider.id }, data: { state: 'key_refused' } })
    expect((await getMyModelAccess(undefined, ctx(dana))).canTalk).toBe(false)
  })

  it('needs a signed-in person', async () => {
    await expect(getMyModelAccess(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})
