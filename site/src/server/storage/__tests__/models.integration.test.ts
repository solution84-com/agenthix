import { describe, it, expect } from 'vitest'
import { prisma } from '../../../test/db'
import { createWorkspace, createRepoAttachment } from '../../../test/factories'

// @SC-324 — Workspace and RepoAttachment land in site's own database with the
// same shape and cascade behavior they had in hq, minus the ExecutionSite
// relation (site is self-referential via SiteConfig.siteId instead).
describe('Workspace + RepoAttachment (site)', () => {
  it('cascades RepoAttachment deletion when its Workspace is deleted', async () => {
    const workspace = await createWorkspace()
    const attachment = await createRepoAttachment({
      ownerType: workspace.ownerType,
      ownerId: workspace.ownerId,
      workspaceId: workspace.id,
    })

    await prisma.workspace.delete({ where: { id: workspace.id } })

    const found = await prisma.repoAttachment.findUnique({ where: { id: attachment.id } })
    expect(found).toBeNull()
  })

  it('refuses to create a Workspace without siteId', async () => {
    await expect(
      prisma.workspace.create({
        data: {
          name: 'No Site',
          ownerType: 'project',
          ownerId: 'owner-1',
        } as any,
      })
    ).rejects.toThrow()
  })
})
