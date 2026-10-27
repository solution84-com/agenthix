/**
 * The Artefacts tool's listing, against the real test database
 * (projects, membership and the location access rule are real); the site's
 * folder store is the stand-in, and whether the site was asked is part of the
 * behaviour checked.
 *
 *  1. **hq checks entitlement, then asks** — the same rule `listLocationFiles`
 *     applies: the person's own storage, or a project they are on.
 *  2. **A site that is down is never an empty folder** (503, as every storage read).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'

const h = vi.hoisted(() => ({
  listArtefactsOnSite: vi.fn(),
}))

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
// Nothing in the store checks who is asking, so a call to it on the way to a
// refusal is an unchecked read.
vi.mock('../ownerFolderStore', () => h)

import { listArtefactsQuery } from '../ownerFolderQueries'
import { SiteUnreachableError } from '../workspaceStore'

const askedTheSite = () => Object.values(h).reduce((n, fn) => n + fn.mock.calls.length, 0)

let me: { id: string }
let project: { ownerType: 'project'; ownerId: string }

beforeEach(async () => {
  for (const fn of Object.values(h)) fn.mockReset()
  h.listArtefactsOnSite.mockResolvedValue({ entries: [] })
  me = await createUser()
  const open = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: open.id, userId: me.id } })
  project = { ownerType: 'project', ownerId: open.id }
})

describe('the location access rule at the listing', () => {
  const calls = (owner: { ownerType: 'user' | 'project'; ownerId: string }, ctx: { user?: { id: string } }) => [
    () => listArtefactsQuery(owner, ctx),
  ]

  it("refuses someone else's own storage and a project the caller is not on, open or private, without asking the site", async () => {
    const other = await createUser()
    const secret = await createProject({ accessLevel: 'PRIVATE' })
    const notJoined = await createProject({ accessLevel: 'OPEN' })
    for (const call of [
      ...calls({ ownerType: 'user', ownerId: other.id }, { user: me }),
      ...calls({ ownerType: 'project', ownerId: secret.id }, { user: me }),
      ...calls({ ownerType: 'project', ownerId: notJoined.id }, { user: me }),
    ]) {
      await expect(call()).rejects.toMatchObject({ statusCode: 403 })
    }
    for (const call of calls({ ownerType: 'project', ownerId: 'nope' }, { user: me })) {
      await expect(call()).rejects.toMatchObject({ statusCode: 404 })
    }
    for (const call of calls(project, {})) await expect(call()).rejects.toMatchObject({ statusCode: 401 })
    expect(askedTheSite()).toBe(0)
  })

  it("serves the caller's own storage and a private project they are on", async () => {
    const listed = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: listed.id, userId: me.id } })
    for (const call of [
      ...calls({ ownerType: 'user', ownerId: me.id }, { user: me }),
      ...calls({ ownerType: 'project', ownerId: listed.id }, { user: me }),
    ]) {
      await expect(call()).resolves.toBeDefined()
    }
  })

  it('answers an unreachable site with 503', async () => {
    const down = new SiteUnreachableError('Local site', 'site-1')
    for (const fn of Object.values(h)) fn.mockRejectedValue(down)
    for (const call of calls(project, { user: me })) {
      await expect(call()).rejects.toMatchObject({ statusCode: 503, message: expect.stringMatching(/unreachable/i) })
    }
  })
})

describe('artefacts', () => {
  it('lists each artefact by name with its size and time, in the order the site gives (newest first)', async () => {
    h.listArtefactsOnSite.mockResolvedValue({
      entries: [
        { path: 'pricing-options.pdf', size: 8, modifiedAt: '2026-02-01T00:00:00.000Z' },
        { path: 'older.md', size: 4, modifiedAt: '2026-01-01T00:00:00.000Z' },
      ],
    })
    await expect(listArtefactsQuery(project, { user: me })).resolves.toEqual({
      entries: [
        { name: 'pricing-options.pdf', size: 8, modifiedAt: '2026-02-01T00:00:00.000Z' },
        { name: 'older.md', size: 4, modifiedAt: '2026-01-01T00:00:00.000Z' },
      ],
    })
    expect(h.listArtefactsOnSite).toHaveBeenCalledWith(project)
  })
})
