// Which site holds one storage location, against the real test database: a
// workspace by its placement row, a project by its own Execution Site, a person
// by the placement written once at the default site the first time it is asked
// (resolveStorageSite, ensureUserStoragePlacement), and the owner-level answer
// the repo and file reads use (resolveOwnerSiteId).
import { describe, it, expect, vi } from 'vitest'
import crypto from 'node:crypto'
import { prisma } from '../../test/db'
import { createProject, createUser, ensureExecutionSite } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { resolveStorageSite, ensureUserStoragePlacement } from '../storageSite'
import { resolveOwnerSiteId } from '../ownerSite'
import { NO_EXECUTION_SITE_MESSAGE } from '../../shared/noExecutionSite'

const site = (label: string) =>
  prisma.executionSite.create({ data: { siteId: crypto.randomUUID(), label, status: 'ONLINE' } })

describe('resolveStorageSite', () => {
  it('reads a workspace location from its placement row, not from its owner', async () => {
    const ownerSite = await ensureExecutionSite()
    const wsSite = await site('Workspace Site')
    const project = await createProject({ executionSiteId: ownerSite.id })
    await prisma.workspacePlacement.create({ data: { workspaceId: 'ws-1', siteId: wsSite.id } })

    expect(await resolveStorageSite({ ownerType: 'project', ownerId: project.id, workspaceId: 'ws-1' })).toBe(wsSite.siteId)
  })

  it('refuses an unplaced workspace (400, naming it), rather than falling back to its owner', async () => {
    const project = await createProject()
    await expect(resolveStorageSite({ ownerType: 'project', ownerId: project.id, workspaceId: 'ws-unplaced' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('ws-unplaced') })
  })

  it('wraps a placement pointing at a site that no longer exists into the same 400', async () => {
    const project = await createProject()
    await prisma.workspacePlacement.create({ data: { workspaceId: 'ws-dangling', siteId: 'site-pk-gone' } })
    await expect(resolveStorageSite({ ownerType: 'project', ownerId: project.id, workspaceId: 'ws-dangling' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('site-pk-gone') })
  })

  it("reads a project location from the project's own site", async () => {
    const s = await site('Project Site')
    const project = await createProject({ executionSiteId: s.id })
    expect(await resolveStorageSite({ ownerType: 'project', ownerId: project.id })).toBe(s.siteId)
  })

  it('refuses a project that does not exist, distinctly from one with no site (400 each)', async () => {
    const lonely = await createProject({ executionSiteId: null })
    await expect(resolveStorageSite({ ownerType: 'project', ownerId: 'proj-missing' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('not found') })
    await expect(resolveStorageSite({ ownerType: 'project', ownerId: lonely.id }))
      .rejects.toMatchObject({ statusCode: 400, message: `Project ${lonely.id} has no Execution Site` })
  })

  it("places a person's storage at the default site the first time, by the site's logical id, and never moves it", async () => {
    const first = await ensureExecutionSite()
    const user = await createUser()

    expect(await resolveStorageSite({ ownerType: 'user', ownerId: user.id })).toBe(first.siteId)
    expect(await prisma.userStoragePlacement.findUniqueOrThrow({ where: { userId: user.id } })).toMatchObject({ siteId: first.id })

    // Another site becomes the default; the person's storage stays where it was.
    await prisma.executionSite.update({ where: { id: first.id }, data: { isDefault: false } })
    await ensureExecutionSite()
    expect(await ensureUserStoragePlacement(user.id)).toBe(first.siteId)
    expect(await prisma.userStoragePlacement.count()).toBe(1)
  })

  it('lands two simultaneous first resolutions on one placement', async () => {
    const s = await ensureExecutionSite()
    const user = await createUser()
    const answers = await Promise.all([ensureUserStoragePlacement(user.id), ensureUserStoragePlacement(user.id)])
    expect(answers).toEqual([s.siteId, s.siteId])
    expect(await prisma.userStoragePlacement.count()).toBe(1)
  })
})

describe('ensureUserStoragePlacement', () => {
  it('with no Execution Site connected, throws the shared error and writes no placement', async () => {
    const user = await createUser()
    await expect(ensureUserStoragePlacement(user.id)).rejects.toMatchObject({ statusCode: 503, message: NO_EXECUTION_SITE_MESSAGE })
    expect(await prisma.userStoragePlacement.count()).toBe(0)
  })
})

describe("the site that owns an owner's storage", () => {
  it("is a project's own Execution Site, or null for a project with no site", async () => {
    const s = await site('Project Site')
    const placed = await createProject({ executionSiteId: s.id })
    const lonely = await createProject({ executionSiteId: null })
    expect(await resolveOwnerSiteId('project', placed.id)).toBe(s.siteId)
    expect(await resolveOwnerSiteId('project', lonely.id)).toBeNull()
  })

  it('is the default site for a person, and the shared error when no Execution Site is connected', async () => {
    await expect(resolveOwnerSiteId('user', 'u1')).rejects.toThrow(NO_EXECUTION_SITE_MESSAGE)
    const s = await ensureExecutionSite()
    expect(await resolveOwnerSiteId('user', 'u1')).toBe(s.siteId)
  })
})
