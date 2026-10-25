import { describe, it, expect, vi, beforeEach } from 'vitest'

const workspaceFindUnique = vi.hoisted(() => vi.fn())
const workspaceFindMany = vi.hoisted(() => vi.fn())
const workspaceCreate = vi.hoisted(() => vi.fn())
const workspaceUpdate = vi.hoisted(() => vi.fn())
const workspaceDeleteMany = vi.hoisted(() => vi.fn())
const repoFindUnique = vi.hoisted(() => vi.fn())
const repoFindFirst = vi.hoisted(() => vi.fn())
const repoFindMany = vi.hoisted(() => vi.fn())
const repoCreate = vi.hoisted(() => vi.fn())
const repoDelete = vi.hoisted(() => vi.fn())
const siteConfigFindFirst = vi.hoisted(() => vi.fn())

vi.mock('#db', () => ({
  prisma: {
    workspace: {
      findUnique: workspaceFindUnique,
      findMany: workspaceFindMany,
      create: workspaceCreate,
      update: workspaceUpdate,
      deleteMany: workspaceDeleteMany,
    },
    repoAttachment: {
      findUnique: repoFindUnique,
      findFirst: repoFindFirst,
      findMany: repoFindMany,
      create: repoCreate,
      delete: repoDelete,
    },
    siteConfig: { findFirst: siteConfigFindFirst },
  },
}))

import { Prisma } from '@prisma/client'
import * as rows from '../workspaceRows'

beforeEach(() => vi.clearAllMocks())

describe('workspace row params @SC-320', () => {
  it('get refuses a missing id', async () => {
    await expect(rows.getWorkspace({})).rejects.toThrow()
    expect(workspaceFindUnique).not.toHaveBeenCalled()
  })

  it('list ignores extra keys @SC-1153', async () => {
    workspaceFindMany.mockResolvedValue([])
    await rows.listWorkspaces({ bogus: true })
    expect(workspaceFindMany).toHaveBeenCalled()
  })

  it('listByOwner refuses an unknown ownerType', async () => {
    await expect(rows.listWorkspacesByOwner({ ownerType: 'nonsense', ownerId: 'o1' })).rejects.toThrow()
    expect(workspaceFindMany).not.toHaveBeenCalled()
  })

  it("listByOwner projects 'caps' to id+allowedTools", async () => {
    workspaceFindMany.mockResolvedValue([])
    await rows.listWorkspacesByOwner({ ownerType: 'project', ownerId: 'o1', select: 'caps' })
    expect(workspaceFindMany).toHaveBeenCalledWith({
      where: { ownerType: 'project', ownerId: 'o1' },
      select: { id: true, allowedTools: true },
    })
  })

  it("listByOwner projects 'names' to id+name", async () => {
    workspaceFindMany.mockResolvedValue([])
    await rows.listWorkspacesByOwner({ ownerType: 'project', ownerId: 'o1', select: 'names' })
    expect(workspaceFindMany).toHaveBeenCalledWith({
      where: { ownerType: 'project', ownerId: 'o1' },
      select: { id: true, name: true },
    })
  })

  it('listByOwner with no select returns full rows (no projection)', async () => {
    workspaceFindMany.mockResolvedValue([])
    await rows.listWorkspacesByOwner({ ownerType: 'project', ownerId: 'o1' })
    expect(workspaceFindMany).toHaveBeenCalledWith({ where: { ownerType: 'project', ownerId: 'o1' } })
  })

  it('listByIds refuses a non-array ids', async () => {
    await expect(rows.listWorkspacesByIds({ ids: 'not-an-array', select: 'caps' })).rejects.toThrow()
    expect(workspaceFindMany).not.toHaveBeenCalled()
  })

  it("listByIds requires select 'caps' — anything else is refused", async () => {
    await expect(rows.listWorkspacesByIds({ ids: ['a', 'b'] })).rejects.toThrow()
    await expect(rows.listWorkspacesByIds({ ids: ['a', 'b'], select: 'names' })).rejects.toThrow()
  })

  it('listByIds asks only for id+allowedTools of the given ids', async () => {
    workspaceFindMany.mockResolvedValue([])
    await rows.listWorkspacesByIds({ ids: ['a', 'b'], select: 'caps' })
    expect(workspaceFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      select: { id: true, allowedTools: true },
    })
  })

  it('create refuses when this site has no SiteConfig', async () => {
    siteConfigFindFirst.mockResolvedValue(null)
    await expect(
      rows.createWorkspace({ name: 'W', ownerType: 'user', ownerId: 'u1' })
    ).rejects.toThrow(/SiteConfig/i)
    expect(workspaceCreate).not.toHaveBeenCalled()
  })

  it("create fills siteId from this installation's own SiteConfig", async () => {
    siteConfigFindFirst.mockResolvedValue({ siteId: 'site-1' })
    workspaceCreate.mockResolvedValue({ id: 'w1' })
    await rows.createWorkspace({ name: 'W', ownerType: 'user', ownerId: 'u1' })
    expect(workspaceCreate).toHaveBeenCalledWith({
      data: { name: 'W', ownerType: 'user', ownerId: 'u1', siteId: 'site-1' },
    })
  })

  it('create refuses a missing name', async () => {
    await expect(rows.createWorkspace({ ownerType: 'user', ownerId: 'u1' })).rejects.toThrow()
    expect(siteConfigFindFirst).not.toHaveBeenCalled()
  })

  it('create refuses a whitespace-only name', async () => {
    await expect(rows.createWorkspace({ name: '  ', ownerType: 'user', ownerId: 'u1' })).rejects.toThrow()
    expect(siteConfigFindFirst).not.toHaveBeenCalled()
  })

  it('create trims the name before storing it', async () => {
    siteConfigFindFirst.mockResolvedValue({ siteId: 'site-1' })
    workspaceCreate.mockResolvedValue({ id: 'w1' })
    await rows.createWorkspace({ name: ' x ', ownerType: 'user', ownerId: 'u1' })
    expect(workspaceCreate).toHaveBeenCalledWith({
      data: { name: 'x', ownerType: 'user', ownerId: 'u1', siteId: 'site-1' },
    })
  })

  it('setAllowedTools refuses the legacy ToolPermission[] object shape', async () => {
    await expect(
      rows.setWorkspaceAllowedTools({ id: 'w1', allowedTools: [{ name: 'bash', state: 'always' }] })
    ).rejects.toThrow(/tool names/i)
    expect(workspaceFindUnique).not.toHaveBeenCalled()
  })

  it('setAllowedTools refuses a non-array, non-null value', async () => {
    await expect(rows.setWorkspaceAllowedTools({ id: 'w1', allowedTools: 'bash' })).rejects.toThrow()
    expect(workspaceFindUnique).not.toHaveBeenCalled()
  })

  it('setAllowedTools refuses an absent allowedTools key with an honest required-field error', async () => {
    await expect(rows.setWorkspaceAllowedTools({ id: 'w1' })).rejects.toThrow()
    expect(workspaceFindUnique).not.toHaveBeenCalled()
  })

  it('setAllowedTools errors on a workspace that does not exist', async () => {
    workspaceFindUnique.mockResolvedValue(null)
    await expect(rows.setWorkspaceAllowedTools({ id: 'missing', allowedTools: null })).rejects.toThrow(/not found/i)
    expect(workspaceUpdate).not.toHaveBeenCalled()
  })

  it('setAllowedTools accepts null and a valid string list', async () => {
    workspaceFindUnique.mockResolvedValue({ id: 'w1' })
    workspaceUpdate.mockResolvedValue({})
    await expect(rows.setWorkspaceAllowedTools({ id: 'w1', allowedTools: ['bash', 'read'] })).resolves.toEqual({ ok: true })
    expect(workspaceUpdate).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { allowedTools: ['bash', 'read'] } })
  })

  // IMPORTANT 7 (plan 5c task 12 review): the null → Prisma.JsonNull mapping
  // (workspaceRows.ts) had no pin on either side of the hq↔site boundary — hq
  // stopped writing this column directly once the row moved here, so this is
  // now the only place a regression to a literal `null` (which Prisma would
  // silently treat as "leave the column unchanged", not "clear the cap") gets
  // caught.
  it('setAllowedTools writes a null allowedTools as Prisma.JsonNull, the marker Prisma requires to store a JSON null in a nullable Json column', async () => {
    workspaceFindUnique.mockResolvedValue({ id: 'w1' })
    workspaceUpdate.mockResolvedValue({})
    await expect(rows.setWorkspaceAllowedTools({ id: 'w1', allowedTools: null })).resolves.toEqual({ ok: true })
    expect(workspaceUpdate).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { allowedTools: Prisma.JsonNull } })
  })

  it('delete is idempotent — a missing id still returns ok', async () => {
    workspaceDeleteMany.mockResolvedValue({ count: 0 })
    await expect(rows.deleteWorkspace({ id: 'missing' })).resolves.toEqual({ ok: true })
  })
})

describe('repo attachment row params @SC-320', () => {
  it('getForTarget uses findUnique when workspaceId is set', async () => {
    repoFindUnique.mockResolvedValue(null)
    await rows.getRepoAttachmentForTarget({ ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' })
    expect(repoFindUnique).toHaveBeenCalledWith({ where: { workspaceId: 'w1' } })
    expect(repoFindFirst).not.toHaveBeenCalled()
  })

  it('getForTarget uses findFirst by owner when workspaceId is null/absent', async () => {
    repoFindFirst.mockResolvedValue(null)
    await rows.getRepoAttachmentForTarget({ ownerType: 'project', ownerId: 'p1', workspaceId: null })
    expect(repoFindFirst).toHaveBeenCalledWith({ where: { ownerType: 'project', ownerId: 'p1', workspaceId: null } })

    repoFindFirst.mockClear()
    await rows.getRepoAttachmentForTarget({ ownerType: 'project', ownerId: 'p1' })
    expect(repoFindFirst).toHaveBeenCalledWith({ where: { ownerType: 'project', ownerId: 'p1', workspaceId: null } })
  })

  it('findByUrl refuses a missing repoUrl', async () => {
    await expect(rows.findRepoAttachmentByUrl({})).rejects.toThrow()
  })

  // R-091: rows linked before the canonical form was enforced keep the pasted URL.
  it('findByUrl finds a row stored in a pre-canonical form', async () => {
    repoFindMany.mockResolvedValue([
      { id: 'r0', repoUrl: 'https://github.com/acme/other', ownerType: 'project', ownerId: 'p0', workspaceId: null },
      { id: 'r1', repoUrl: 'http://www.github.com/Acme/Widgets.git', ownerType: 'project', ownerId: 'p1', workspaceId: null },
    ])
    const found = await rows.findRepoAttachmentByUrl({ repoUrl: 'https://github.com/acme/widgets' })
    expect(found?.id).toBe('r1')
    expect(repoFindMany).toHaveBeenCalledWith({
      where: { repoUrl: { contains: 'acme/widgets', mode: 'insensitive' } },
    })
  })

  it('findByUrl finds a row stored canonically, and looks up a non-canonical request by its canonical form', async () => {
    repoFindMany.mockResolvedValue([{ id: 'r2', repoUrl: 'https://github.com/acme/widgets' }])
    expect((await rows.findRepoAttachmentByUrl({ repoUrl: 'https://github.com/acme/widgets.git' }))?.id).toBe('r2')
  })

  it('findByUrl does not match a repo whose name merely contains the requested one', async () => {
    repoFindMany.mockResolvedValue([{ id: 'r3', repoUrl: 'https://github.com/acme/widgets-extra' }])
    expect(await rows.findRepoAttachmentByUrl({ repoUrl: 'https://github.com/acme/widgets' })).toBeNull()
  })

  it('findByUrl returns null for a URL that is not a github.com repo, without querying', async () => {
    expect(await rows.findRepoAttachmentByUrl({ repoUrl: 'https://evil.example/acme/widgets' })).toBeNull()
    expect(repoFindMany).not.toHaveBeenCalled()
  })

  it('list asks only for the 4 fields getMyStorage uses', async () => {
    repoFindMany.mockResolvedValue([])
    await rows.listRepoAttachments({})
    expect(repoFindMany).toHaveBeenCalledWith({
      select: { workspaceId: true, ownerType: true, ownerId: true, repoUrl: true },
    })
  })

  it('create refuses an unknown ownerType', async () => {
    await expect(
      rows.createRepoAttachment({ ownerType: 'nonsense', ownerId: 'o1', workspaceId: null, repoUrl: 'https://x' })
    ).rejects.toThrow()
    expect(repoCreate).not.toHaveBeenCalled()
  })

  it('create stores GitHub\'s ids, and answers them as numbers the channel can carry @SC-1359', async () => {
    repoCreate.mockImplementation(async ({ data }) => ({ id: 'r9', createdAt: new Date(0), ...data }))
    const row = await rows.createRepoAttachment({
      ownerType: 'project', ownerId: 'p1', workspaceId: 'w1', repoUrl: 'https://github.com/acme/widgets',
      installationId: 11, repositoryId: 4_000_000_001, accountId: 22, accountLogin: 'acme',
    })
    expect(repoCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ installationId: 11, repositoryId: 4_000_000_001n, accountId: 22n, accountLogin: 'acme' }) })
    expect(row).toMatchObject({ repositoryId: 4_000_000_001, accountId: 22 })
    expect(() => JSON.stringify(row)).not.toThrow()
  })

  it('create without ids stores none, which the mint gate refuses @SC-1359', async () => {
    repoCreate.mockImplementation(async ({ data }) => ({ id: 'r9', createdAt: new Date(0), ...data }))
    const row = await rows.createRepoAttachment({ ownerType: 'project', ownerId: 'p1', workspaceId: null, repoUrl: 'https://github.com/acme/widgets' })
    expect(row).toMatchObject({ installationId: null, repositoryId: null, accountId: null, accountLogin: null })
  })

  it('getForTarget answers a stored row\'s BigInt ids as numbers @SC-1359', async () => {
    repoFindUnique.mockResolvedValue({ id: 'r1', workspaceId: 'w1', installationId: 3, repositoryId: 77n, accountId: 8n, accountLogin: 'acme' })
    const row = await rows.getRepoAttachmentForTarget({ ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' })
    expect(row).toMatchObject({ repositoryId: 77, accountId: 8 })
    expect(() => JSON.stringify(row)).not.toThrow()
  })

  it('delete errors on an attachment that does not exist', async () => {
    repoFindUnique.mockResolvedValue(null)
    await expect(rows.deleteRepoAttachment({ id: 'missing' })).rejects.toThrow(/not found/i)
    expect(repoDelete).not.toHaveBeenCalled()
  })

  it('delete removes an existing attachment', async () => {
    repoFindUnique.mockResolvedValue({ id: 'r1' })
    repoDelete.mockResolvedValue({})
    await expect(rows.deleteRepoAttachment({ id: 'r1' })).resolves.toEqual({ ok: true })
    expect(repoDelete).toHaveBeenCalledWith({ where: { id: 'r1' } })
  })
})
