import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createWorkspace as createWorkspaceRow, createRepoAttachment as createRepoAttachmentRow } from '../../../test/factories'
import * as rows from '../workspaceRows'

// @SC-320 @SC-324 — the channel methods hq will call for workspace/repo-attachment
// data, proved against a real database (not the mocked-prisma unit tests).
describe('workspace + repo-attachment channel methods (site)', () => {
  beforeEach(async () => {
    await prisma.siteConfig.create({ data: { id: 'singleton', siteId: 'site-under-test' } })
  })

  it('create -> get -> listByOwner(caps) round-trip with allowedTools set via setAllowedTools', async () => {
    const created = await rows.createWorkspace({ name: 'W1', ownerType: 'project', ownerId: 'proj-1' }) as { id: string }
    expect(created).toMatchObject({ name: 'W1', ownerType: 'project', ownerId: 'proj-1', siteId: 'site-under-test' })

    const fetched = await rows.getWorkspace({ id: created.id })
    expect(fetched).toMatchObject({ id: created.id, name: 'W1' })

    await rows.setWorkspaceAllowedTools({ id: created.id, allowedTools: ['bash', 'read'] })

    const caps = await rows.listWorkspacesByOwner({ ownerType: 'project', ownerId: 'proj-1', select: 'caps' }) as { id: string; allowedTools: unknown }[]
    expect(caps).toEqual([{ id: created.id, allowedTools: ['bash', 'read'] }])
  })

  it("delete cascades the workspace's repo attachment", async () => {
    const workspace = await createWorkspaceRow({ siteId: 'site-under-test' })
    const attachment = await createRepoAttachmentRow({
      ownerType: workspace.ownerType,
      ownerId: workspace.ownerId,
      workspaceId: workspace.id,
    })

    await rows.deleteWorkspace({ id: workspace.id })

    const found = await prisma.repoAttachment.findUnique({ where: { id: attachment.id } })
    expect(found).toBeNull()
  })

  it('listByIds returns only the asked-for ids', async () => {
    const a = await createWorkspaceRow({ siteId: 'site-under-test' })
    const b = await createWorkspaceRow({ siteId: 'site-under-test' })
    await createWorkspaceRow({ siteId: 'site-under-test' }) // a third, deliberately not asked for

    const result = await rows.listWorkspacesByIds({ ids: [a.id, b.id], select: 'caps' }) as { id: string }[]
    expect(result.map(r => r.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('repo.getForTarget: workspaceId branch finds by the unique workspace link', async () => {
    const workspace = await createWorkspaceRow({ siteId: 'site-under-test' })
    const attachment = await createRepoAttachmentRow({
      ownerType: workspace.ownerType,
      ownerId: workspace.ownerId,
      workspaceId: workspace.id,
    })

    const found = await rows.getRepoAttachmentForTarget({
      ownerType: workspace.ownerType,
      ownerId: workspace.ownerId,
      workspaceId: workspace.id,
    }) as { id: string } | null
    expect(found?.id).toBe(attachment.id)
  })

  it("repo.getForTarget: owner's-files branch finds by ownerType+ownerId with no workspace", async () => {
    const attachment = await createRepoAttachmentRow({ ownerType: 'user', ownerId: 'user-1' })

    const found = await rows.getRepoAttachmentForTarget({
      ownerType: 'user',
      ownerId: 'user-1',
      workspaceId: null,
    }) as { id: string } | null
    expect(found?.id).toBe(attachment.id)

    const miss = await rows.getRepoAttachmentForTarget({ ownerType: 'user', ownerId: 'someone-else', workspaceId: null })
    expect(miss).toBeNull()
  })

  it('workspace.delete is idempotent on a missing id', async () => {
    await expect(rows.deleteWorkspace({ id: 'does-not-exist' })).resolves.toEqual({ ok: true })
  })
})
