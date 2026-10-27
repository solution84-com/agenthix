/**
 * Browsing a location's files crosses the channel. (Opening one is hq's *open*
 * action, `../../files/`.) Against the real
 * test database (projects, membership and the location access rule are real);
 * the site's file store and its workspace read are the stand-ins, and whether
 * the site was asked is part of the behaviour checked.
 *
 *  1. **hq checks entitlement, then asks.** The site cannot know whether the
 *     check happened, so a refused caller must never reach it at all.
 *  2. **A site that is down is never an empty location.** `SiteUnreachableError`
 *     surfaces as itself, with its own status.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LocationFileError } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'

const h = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  listFilesOnSite: vi.fn(),
}))

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../workspaceStore', async () => {
  const actual = await vi.importActual<typeof import('../workspaceStore')>('../workspaceStore')
  return { ...actual, getWorkspace: h.getWorkspace }
})
// Nothing in the store checks who is asking, so a call to it on the way to a
// refusal is an unchecked read.
vi.mock('../locationFileStore', async () => {
  const actual = await vi.importActual<typeof import('../locationFileStore')>('../locationFileStore')
  return { ...actual, listFilesOnSite: h.listFilesOnSite }
})

import { listLocationFilesQuery } from '../queries'
import { SiteUnreachableError } from '../workspaceStore'

const askedTheSite = () => h.listFilesOnSite.mock.calls.length

let me: { id: string }
let loc: { ownerType: 'project'; ownerId: string }

beforeEach(async () => {
  for (const fn of Object.values(h)) fn.mockReset()
  h.listFilesOnSite.mockResolvedValue({ entries: [] })
  me = await createUser()
  const project = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
  loc = { ownerType: 'project', ownerId: project.id }
})

describe('the location access rule at the file listing', () => {
  it("refuses another person's files (403), a project that does not exist (404) and a project the caller is not on, open or private (403), without asking the site", async () => {
    const other = await createUser()
    const secret = await createProject({ accessLevel: 'PRIVATE' })
    const notJoined = await createProject({ accessLevel: 'OPEN' })
    const as = { user: me }

    await expect(listLocationFilesQuery({ target: { ownerType: 'user', ownerId: other.id } }, as)).rejects.toMatchObject({ statusCode: 403 })
    await expect(listLocationFilesQuery({ target: { ownerType: 'project', ownerId: 'nope' } }, as)).rejects.toMatchObject({ statusCode: 404 })
    await expect(listLocationFilesQuery({ target: { ownerType: 'project', ownerId: secret.id } }, as)).rejects.toMatchObject({ statusCode: 403 })
    await expect(listLocationFilesQuery({ target: { ownerType: 'project', ownerId: notJoined.id } }, as)).rejects.toMatchObject({ statusCode: 403 })

    expect(askedTheSite()).toBe(0)
  })

  it('refuses a workspace that belongs to a different owner (400) without asking for its files', async () => {
    h.getWorkspace.mockResolvedValue({ id: 'ws-1', ownerType: 'project', ownerId: 'proj-2' })
    await expect(listLocationFilesQuery({ target: { ...loc, workspaceId: 'ws-1' } }, { user: me })).rejects.toMatchObject({ statusCode: 400 })
    expect(askedTheSite()).toBe(0)
  })

  it("lists the caller's own files, and a private project's for a member", async () => {
    const listed = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: listed.id, userId: me.id } })
    await expect(listLocationFilesQuery({ target: { ownerType: 'user', ownerId: me.id } }, { user: me })).resolves.toEqual({ entries: [] })
    await expect(listLocationFilesQuery({ target: { ownerType: 'project', ownerId: listed.id } }, { user: me })).resolves.toEqual({ entries: [] })
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(listLocationFilesQuery({ target: loc }, {})).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe("listing a location's files", () => {
  it('asks the site that holds the location, passing the subPath through', async () => {
    await listLocationFilesQuery({ target: loc, subPath: 'docs' }, { user: me })
    expect(h.listFilesOnSite).toHaveBeenCalledWith(loc, 'docs')
  })

  it('hides .git from the explorer without asking the site for a shorter listing, and gives each entry its size and time', async () => {
    const at = '2026-01-01T00:00:00.000Z'
    h.listFilesOnSite.mockResolvedValue({
      entries: [
        { name: '.git', kind: 'directory', size: 4096, modifiedAt: at },
        { name: 'docs', kind: 'directory', size: 128, modifiedAt: at },
        { name: 'ROADMAP.md', kind: 'file', size: 12, modifiedAt: '2026-02-03T04:05:06.000Z' },
      ],
    })
    await expect(listLocationFilesQuery({ target: loc }, { user: me })).resolves.toEqual({
      entries: [
        { name: 'docs', isDir: true, size: 128, modifiedAt: at },
        { name: 'ROADMAP.md', isDir: false, size: 12, modifiedAt: '2026-02-03T04:05:06.000Z' },
      ],
    })
    expect(h.listFilesOnSite).toHaveBeenCalledWith(loc, null)
  })

  it('surfaces an unreachable site as itself (503), not as an empty location', async () => {
    h.listFilesOnSite.mockRejectedValue(new SiteUnreachableError('Local site', 'site-1'))
    await expect(listLocationFilesQuery({ target: loc }, { user: me })).rejects.toMatchObject({ statusCode: 503, message: expect.stringMatching(/unreachable/i) })
  })

  it('answers a containment refusal as one (403), not as a fault', async () => {
    h.listFilesOnSite.mockRejectedValue(new LocationFileError('outside', 'location.listFiles ".." is outside project proj-1'))
    await expect(listLocationFilesQuery({ target: loc, subPath: '..' }, { user: me })).rejects.toMatchObject({ statusCode: 403 })
  })
})
