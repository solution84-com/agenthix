import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

// A person's connection against the real test DB (adr-0090): found by the hash
// of its token through the unique index, refused once revoked or expired, and
// gone with its person.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})

import { authenticateConnection, LAST_USED_RESOLUTION_MS } from '../connectionAuth'
import { generateConnectionToken } from '../connectionToken'

async function connectionFor(userId: string, over: Record<string, unknown> = {}) {
  const { token, tokenHash, tokenPrefix } = generateConnectionToken()
  const row = await prisma.personConnection.create({
    data: { userId, name: 'Laptop', tokenHash, tokenPrefix, expiresAt: new Date(Date.now() + 86_400_000), ...over },
  })
  return { token, row }
}

describe('authenticateConnection against the database', () => {
  it("finds a connection by its token's hash and acts as its person", async () => {
    const user = await createUserWithRole('MEMBER')
    const { token, row } = await connectionFor(user.id, { canChangeTasks: true, allProjects: false, projectIds: ['p1'] })
    const grant = await authenticateConnection(token)
    expect(grant).toMatchObject({ connectionId: row.id, userId: user.id, role: 'MEMBER', projectIds: ['p1'] })
    expect([...grant!.groups].sort()).toEqual(['change_tasks', 'read'])
  })

  it('stores no token, only its hash', async () => {
    const user = await createUserWithRole('MEMBER')
    const { token, row } = await connectionFor(user.id)
    const stored = await prisma.personConnection.findUniqueOrThrow({ where: { id: row.id } })
    expect(JSON.stringify(stored)).not.toContain(token)
  })

  it('refuses a revoked or expired connection', async () => {
    const user = await createUserWithRole('ADMIN')
    const revoked = await connectionFor(user.id, { revokedAt: new Date() })
    const expired = await connectionFor(user.id, { expiresAt: new Date(Date.now() - 1000) })
    expect(await authenticateConnection(revoked.token)).toBeNull()
    expect(await authenticateConnection(expired.token)).toBeNull()
  })

  it('goes with its person', async () => {
    const user = await createUserWithRole('ADMIN')
    const { token, row } = await connectionFor(user.id)
    await prisma.userSettings.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } })
    expect(await prisma.personConnection.findUnique({ where: { id: row.id } })).toBeNull()
    expect(await authenticateConnection(token)).toBeNull()
  })
})

describe('authenticateConnection — what a connection carries and when it is refused', () => {
  it('carries its project list when it has one, and every project when it has none', async () => {
    const user = await createUserWithRole('MEMBER')
    const all = await connectionFor(user.id)
    const some = await connectionFor(user.id, { allProjects: false, projectIds: ['p1', 'p2'] })
    expect((await authenticateConnection(all.token))?.projectIds).toBeNull()
    expect((await authenticateConnection(some.token))?.projectIds).toEqual(['p1', 'p2'])
  })

  it("reads its person's role at the call, so a demotion applies at once", async () => {
    const user = await createUserWithRole('ADMIN')
    const { token } = await connectionFor(user.id)
    await prisma.userSettings.update({ where: { userId: user.id }, data: { role: 'MEMBER' } })
    expect((await authenticateConnection(token))?.role).toBe('MEMBER')
  })

  it('refuses an unknown token, and anything without the prefix — the retired org key included', async () => {
    const user = await createUserWithRole('ADMIN')
    await connectionFor(user.id)
    expect(await authenticateConnection(generateConnectionToken().token)).toBeNull()
    expect(await authenticateConnection('sk_mcp_abcd_0123456789')).toBeNull()
  })

  it('refuses a connection expiring this instant', async () => {
    const user = await createUserWithRole('ADMIN')
    const expiresAt = new Date(Date.now() + 60_000)
    const { token } = await connectionFor(user.id, { expiresAt })
    expect(await authenticateConnection(token, expiresAt)).toBeNull()
  })

  it('refuses a connection whose person has no org role', async () => {
    const user = await createUserWithRole('MEMBER')
    const { token } = await connectionFor(user.id)
    await prisma.userSettings.delete({ where: { userId: user.id } })
    expect(await authenticateConnection(token)).toBeNull()
  })
})

describe('authenticateConnection — last use', () => {
  const lastUsed = async (id: string) => (await prisma.personConnection.findUniqueOrThrow({ where: { id } })).lastUsedAt

  it('is recorded on first use, and not on a refusal', async () => {
    const user = await createUserWithRole('MEMBER')
    const used = await connectionFor(user.id)
    const revoked = await connectionFor(user.id, { revokedAt: new Date() })
    const now = new Date('2026-10-03T12:00:00Z')

    await authenticateConnection(used.token, new Date(now))
    await authenticateConnection(revoked.token, new Date(now))

    await vi.waitFor(async () => expect(await lastUsed(used.row.id)).toEqual(now))
    expect(await lastUsed(revoked.row.id)).toBeNull()
  })

  it('is not written again within the resolution, and is once it is older', async () => {
    const user = await createUserWithRole('MEMBER')
    const recent = new Date(Date.now() - LAST_USED_RESOLUTION_MS + 60_000)
    const old = new Date(Date.now() - LAST_USED_RESOLUTION_MS - 1)
    const fresh = await connectionFor(user.id, { lastUsedAt: recent })
    const stale = await connectionFor(user.id, { lastUsedAt: old })

    const now = new Date()
    await authenticateConnection(fresh.token, now)
    await authenticateConnection(stale.token, now)

    await vi.waitFor(async () => expect(await lastUsed(stale.row.id)).toEqual(now))
    expect(await lastUsed(fresh.row.id)).toEqual(recent)
  })
})
