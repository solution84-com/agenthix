/**
 * The Artefacts and Knowledge tools' reads, against the real test database
 * (projects, membership and the location access rule are real); the site's
 * folder store is the stand-in, and whether the site was asked is part of the
 * behaviour checked.
 *
 *  1. **hq checks entitlement, then asks** — the same rule `listLocationFiles`
 *     applies: the person's own storage, or a project they are on.
 *  2. **A site that is down is never an empty folder** (503, as every storage read).
 *  3. **Knowledge is listed from the site's itemiser**: title, description and
 *     tags from each page's front matter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LocationFileError } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'

const h = vi.hoisted(() => ({
  listArtefactsOnSite: vi.fn(),
  readArtefactOnSite: vi.fn(),
  listKnowledgeOnSite: vi.fn(),
  readKnowledgeOnSite: vi.fn(),
}))

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
// Nothing in the store checks who is asking, so a call to it on the way to a
// refusal is an unchecked read.
vi.mock('../ownerFolderStore', () => h)

import {
  listArtefactsQuery,
  getArtefactContentQuery,
  listKnowledgeQuery,
  getKnowledgeContentQuery,
} from '../ownerFolderQueries'
import { SiteUnreachableError } from '../workspaceStore'

const askedTheSite = () => Object.values(h).reduce((n, fn) => n + fn.mock.calls.length, 0)

let me: { id: string }
let project: { ownerType: 'project'; ownerId: string }

beforeEach(async () => {
  for (const fn of Object.values(h)) fn.mockReset()
  h.listArtefactsOnSite.mockResolvedValue({ entries: [] })
  h.listKnowledgeOnSite.mockResolvedValue({ files: [], truncated: false })
  h.readArtefactOnSite.mockResolvedValue(Buffer.from('# Pricing'))
  h.readKnowledgeOnSite.mockResolvedValue(Buffer.from('# Auth'))
  me = await createUser()
  const open = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: open.id, userId: me.id } })
  project = { ownerType: 'project', ownerId: open.id }
})

describe('the location access rule at the four queries', () => {
  const calls = (owner: { ownerType: 'user' | 'project'; ownerId: string }, ctx: { user?: { id: string } }) => [
    () => listArtefactsQuery(owner, ctx),
    () => getArtefactContentQuery({ ...owner, name: 'a.md' }, ctx),
    () => listKnowledgeQuery(owner, ctx),
    () => getKnowledgeContentQuery({ ...owner, path: 'a.md' }, ctx),
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

  it('answers an unreachable site with 503 from every one of them', async () => {
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

  it('opens one in the same shape the file viewer reads, asking for no more than it can show', async () => {
    await expect(getArtefactContentQuery({ ...project, name: 'pricing.md' }, { user: me }))
      .resolves.toEqual({ kind: 'markdown', name: 'pricing.md', text: '# Pricing' })
    expect(h.readArtefactOnSite).toHaveBeenCalledWith(project, 'pricing.md', 1_000_000)
  })

  it('shows a file the site refused as too large as too large, and a missing one as 404', async () => {
    h.readArtefactOnSite.mockRejectedValueOnce(new LocationFileError('too_large', 'location.readArtefact "big.pdf"'))
    await expect(getArtefactContentQuery({ ...project, name: 'big.pdf' }, { user: me }))
      .resolves.toEqual({ kind: 'too-large', name: 'big.pdf' })
    h.readArtefactOnSite.mockRejectedValueOnce(new LocationFileError('not_found', 'location.readArtefact "x.md"'))
    await expect(getArtefactContentQuery({ ...project, name: 'x.md' }, { user: me })).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('knowledge', () => {
  it('lists the pages newest first, with the title, description and tags the itemiser gave', async () => {
    const page = (name: string, title: string, description: string, tags: string[], modifiedAt: string) =>
      ({ page: name, title, description, tags, properties: {}, size: 1, modifiedAt, version: 'v', problems: [] })
    h.listKnowledgeOnSite.mockResolvedValue({
      files: [],
      truncated: false,
      sections: [],
      pages: [
        page('decisions/hosting.md', 'Hosting', 'Where we host', ['ops'], '2026-01-02T00:00:00.000Z'),
        page('auth.md', 'How sign-in works', 'sessions and cookies', [], '2026-01-03T00:00:00.000Z'),
      ],
    })
    await expect(listKnowledgeQuery(project, { user: me })).resolves.toEqual({
      topics: [
        { path: 'auth.md', title: 'How sign-in works', summary: 'sessions and cookies', tags: [], modifiedAt: '2026-01-03T00:00:00.000Z' },
        { path: 'decisions/hosting.md', title: 'Hosting', summary: 'Where we host', tags: ['ops'], modifiedAt: '2026-01-02T00:00:00.000Z' },
      ],
    })
    expect(h.readKnowledgeOnSite).not.toHaveBeenCalled()
  })

  it('lists nothing for a site that gave no pages', async () => {
    h.listKnowledgeOnSite.mockResolvedValue({ files: [], truncated: false })
    await expect(listKnowledgeQuery(project, { user: me })).resolves.toEqual({ topics: [] })
  })

  it('opens a topic by its path, named by its file name', async () => {
    await expect(getKnowledgeContentQuery({ ...project, path: 'decisions/auth.md' }, { user: me }))
      .resolves.toEqual({ kind: 'markdown', name: 'auth.md', text: '# Auth' })
    expect(h.readKnowledgeOnSite).toHaveBeenCalledWith(project, 'decisions/auth.md', 1_000_000)
  })

  it('answers a path that leaves knowledge/ as the containment refusal it is (403)', async () => {
    h.readKnowledgeOnSite.mockRejectedValueOnce(new LocationFileError('outside', 'location.readKnowledge "../files/AGENTS.md" is outside project p knowledge'))
    await expect(getKnowledgeContentQuery({ ...project, path: '../files/AGENTS.md' }, { user: me })).rejects.toMatchObject({ statusCode: 403 })
  })
})
