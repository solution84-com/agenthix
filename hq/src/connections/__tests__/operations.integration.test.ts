/**
 * A person's own connections (adr-0090): created with a token shown once and
 * only its hash kept, narrow by default, limited only to projects the person
 * reaches, and seen, renewed or revoked by their person alone. Against the real
 * test database.
 */
import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { prisma } from '../../test/db'
import { createProject, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { createConnection, getMyConnections, renewConnection, revokeConnection } from '../operations'

const as = (user?: { id: string }) => ({ user }) as any
const DAY = 86_400_000
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

async function memberOf(userId: string, data: Record<string, unknown> = {}) {
  const project = await createProject({ accessLevel: 'PRIVATE', ...data })
  await prisma.projectMember.create({ data: { projectId: project.id, userId } })
  return project
}

describe('createConnection', () => {
  it('returns the token once and keeps only its hash; read-only, all projects, 90 days by default', async () => {
    const me = await createUserWithRole('MEMBER')
    const before = Date.now()

    const { token, connection } = await createConnection({ name: ' Laptop ', groups: ['read'] }, as(me))

    const row = await prisma.personConnection.findUniqueOrThrow({ where: { id: connection.id } })
    expect(row.tokenHash).toBe(sha256(token))
    expect(JSON.stringify(row)).not.toContain(token)
    expect(JSON.stringify(connection)).not.toContain(token)
    expect(row).toMatchObject({
      userId: me.id, name: 'Laptop', canRead: true, canChangeTasks: false, canStartWork: false, canManage: false,
      allProjects: true, projectIds: [],
    })
    expect(row.expiresAt.getTime() - before).toBeGreaterThanOrEqual(90 * DAY - 1000)
    expect(row.expiresAt.getTime() - before).toBeLessThanOrEqual(90 * DAY + 1000)
    expect(connection).toMatchObject({ groups: ['read'], projects: null })
  })

  it('may be limited to projects its person is a member of, named in the answer', async () => {
    const me = await createUserWithRole('MEMBER')
    const project = await memberOf(me.id, { name: 'Website' })

    const { connection } = await createConnection({ name: 'One', groups: ['read', 'start_work'], projectIds: [project.id, project.id] }, as(me))

    expect(await prisma.personConnection.findUniqueOrThrow({ where: { id: connection.id } }))
      .toMatchObject({ allProjects: false, projectIds: [project.id], canStartWork: true })
    expect(connection).toMatchObject({ groups: ['read', 'start_work'], projects: [{ id: project.id, name: 'Website' }] })
  })

  it('refuses a project its person cannot reach, and an empty list (400), storing nothing', async () => {
    const me = await createUserWithRole('MEMBER')
    const mine = await memberOf(me.id)
    const secret = await createProject({ accessLevel: 'PRIVATE' })

    await expect(createConnection({ name: 'X', groups: ['read'], projectIds: [mine.id, secret.id] }, as(me)))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(createConnection({ name: 'X', groups: ['read'], projectIds: [] }, as(me)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.personConnection.count()).toBe(0)
  })

  it('refuses an unknown group, no group, no name, and an expiry not on offer (400), storing nothing', async () => {
    const me = await createUserWithRole('MEMBER')
    await expect(createConnection({ name: 'X', groups: ['admin' as any] }, as(me))).rejects.toMatchObject({ statusCode: 400 })
    await expect(createConnection({ name: 'X', groups: [] }, as(me))).rejects.toMatchObject({ statusCode: 400 })
    await expect(createConnection({ name: '  ', groups: ['read'] }, as(me))).rejects.toMatchObject({ statusCode: 400 })
    await expect(createConnection({ name: 'X', groups: ['read'], expiresInDays: 10_000 }, as(me))).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.personConnection.count()).toBe(0)
  })

  it('refuses a 26th active connection, counting neither revoked nor expired ones', async () => {
    const me = await createUserWithRole('MEMBER')
    const base = { userId: me.id, name: 'n', tokenPrefix: 'p' }
    await prisma.personConnection.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({ ...base, tokenHash: `active-${i}`, expiresAt: new Date(Date.now() + DAY) })),
    })
    await expect(createConnection({ name: 'X', groups: ['read'] }, as(me))).rejects.toMatchObject({ statusCode: 400 })

    await prisma.personConnection.updateMany({ where: { tokenHash: { in: ['active-0', 'active-1'] } }, data: { revokedAt: new Date() } })
    await expect(createConnection({ name: 'X', groups: ['read'] }, as(me))).resolves.toBeDefined()
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(createConnection({ name: 'X', groups: ['read'] }, as())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('getMyConnections', () => {
  it("lists only the caller's own, newest first, never a token or hash, with the /mcp address", async () => {
    vi.stubEnv('WASP_SERVER_URL', 'https://hq.example')
    const me = await createUserWithRole('MEMBER')
    const other = await createUserWithRole('ADMIN')
    await createConnection({ name: 'First', groups: ['read'] }, as(me))
    await createConnection({ name: 'Second', groups: ['read'] }, as(me))
    await createConnection({ name: 'Theirs', groups: ['read'] }, as(other))

    const { connections, mcpUrl } = await getMyConnections(undefined as never, as(me))

    expect(connections.map((c) => c.name)).toEqual(['Second', 'First'])
    expect(connections[0]).not.toHaveProperty('tokenHash')
    expect(mcpUrl).toBe('https://hq.example/mcp')
    vi.unstubAllEnvs()
  })

  it('keeps a deleted project in the list, so the connection never widens', async () => {
    const me = await createUserWithRole('MEMBER')
    const project = await memberOf(me.id)
    await createConnection({ name: 'One', groups: ['read'], projectIds: [project.id] }, as(me))
    await prisma.projectMember.deleteMany({ where: { projectId: project.id } })
    await prisma.project.delete({ where: { id: project.id } })

    const { connections } = await getMyConnections(undefined as never, as(me))

    expect(connections[0].projects).toEqual([{ id: project.id, name: 'A deleted project' }])
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(getMyConnections(undefined as never, as())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('renewConnection and revokeConnection', () => {
  it('renew moves the expiry out again; revoke ends it at once', async () => {
    const me = await createUserWithRole('MEMBER')
    const { connection } = await createConnection({ name: 'L', groups: ['read'], expiresInDays: 7 }, as(me))

    const renewed = await renewConnection({ id: connection.id }, as(me))
    expect(new Date(renewed.expiresAt).getTime() - Date.now()).toBeGreaterThan(89 * DAY)

    const revoked = await revokeConnection({ id: connection.id }, as(me))
    expect(revoked.revokedAt).not.toBeNull()
    expect((await prisma.personConnection.findUniqueOrThrow({ where: { id: connection.id } })).revokedAt).not.toBeNull()
  })

  it("someone else's connection is not found (404) — an admin's request included — and is left alone", async () => {
    const me = await createUserWithRole('MEMBER')
    const admin = await createUserWithRole('ADMIN')
    const { connection } = await createConnection({ name: 'L', groups: ['read'] }, as(me))

    await expect(renewConnection({ id: connection.id }, as(admin))).rejects.toMatchObject({ statusCode: 404 })
    await expect(revokeConnection({ id: connection.id }, as(admin))).rejects.toMatchObject({ statusCode: 404 })
    await expect(revokeConnection({ id: 'missing' }, as(me))).rejects.toMatchObject({ statusCode: 404 })
    expect((await prisma.personConnection.findUniqueOrThrow({ where: { id: connection.id } })).revokedAt).toBeNull()
  })

  it('a revoked connection cannot be renewed back to life (400), and revoking it again changes nothing', async () => {
    const me = await createUserWithRole('MEMBER')
    const { connection } = await createConnection({ name: 'L', groups: ['read'] }, as(me))
    const first = await revokeConnection({ id: connection.id }, as(me))

    await expect(renewConnection({ id: connection.id }, as(me))).rejects.toMatchObject({ statusCode: 400 })
    expect((await revokeConnection({ id: connection.id }, as(me))).revokedAt).toBe(first.revokedAt)
  })

  it('renewing an expired connection counts against the 25 active ones (400)', async () => {
    const me = await createUserWithRole('MEMBER')
    const { connection } = await createConnection({ name: 'Old', groups: ['read'] }, as(me))
    await prisma.personConnection.update({ where: { id: connection.id }, data: { expiresAt: new Date(Date.now() - DAY) } })
    for (let i = 0; i < 25; i++) await createConnection({ name: `C${i}`, groups: ['read'] }, as(me))

    await expect(renewConnection({ id: connection.id }, as(me))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.personConnection.findUniqueOrThrow({ where: { id: connection.id } })).expiresAt.getTime()).toBeLessThan(Date.now())
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(renewConnection({ id: 'x' }, as())).rejects.toMatchObject({ statusCode: 401 })
    await expect(revokeConnection({ id: 'x' }, as())).rejects.toMatchObject({ statusCode: 401 })
  })
})
