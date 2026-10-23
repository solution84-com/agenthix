// The storage listing (@SC-247): every owner a person may reach, grouped —
// Personal, then each project they are entitled to — with the workspaces every
// site holds for them. Against the real test database: projects, membership
// and entitlement are real rows. What the sites hold, and which of them
// answered, is the stand-in (`askEverySite` and the workspace store's reads);
// what the combined read does with a slow or absent site is its own suite's
// subject.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SiteSilence } from '@agenthix/core'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'

const h = vi.hoisted(() => ({
  askEverySite: vi.fn(),
  listAllWorkspaces: vi.fn(),
  listAllRepos: vi.fn(),
}))

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../workspaceStore', async () => {
  const actual = await vi.importActual<typeof import('../workspaceStore')>('../workspaceStore')
  return { ...actual, listAllWorkspaces: h.listAllWorkspaces, listAllRepos: h.listAllRepos }
})
vi.mock('../../sites/combinedRead', () => ({ askEverySite: h.askEverySite }))

import { getMyStorageQuery } from '../queries'

const workspace = (id: string, name: string, ownerType: string, ownerId: string, siteId: string) => ({
  id, name, ownerType, ownerId, siteId, allowedTools: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})

const offline = (siteId: string, label: string): SiteSilence => ({
  siteId, label, reason: 'offline', detail: `${label} is not connected to hq.`,
})

/** What the combined read hands back when these sites answer with these holdings. */
function answers(rows: { siteId: string; workspaces: unknown[]; repos: unknown[] }[], unanswered: SiteSilence[] = []) {
  h.askEverySite.mockResolvedValue({
    answers: rows.map((r) => ({ siteId: r.siteId, value: { workspaces: r.workspaces, repos: r.repos, siteLabel: r.siteId } })),
    unanswered,
  })
}

/** The combined read putting the question to one site, through the real per-site call. */
function oneSiteAsked(siteId: string) {
  h.askEverySite.mockImplementation(async (call: (s: unknown) => Promise<unknown>) => ({
    answers: [{ siteId, value: await call({ id: `es-${siteId}`, siteId, label: siteId, status: 'ONLINE', protocolVersion: SITE_PROTOCOL_VERSION }) }],
    unanswered: [],
  }))
}

const ctx = (user?: { id: string }) => ({ user }) as any

beforeEach(() => {
  h.askEverySite.mockReset()
  h.listAllWorkspaces.mockReset().mockResolvedValue([])
  h.listAllRepos.mockReset().mockResolvedValue([])
  answers([])
})

describe('getMyStorage @SC-247', () => {
  it('groups by owner — Personal first, then each project; workspaces with their repo', async () => {
    const me = await createUser()
    const project = await createProject({ name: 'Project1' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
    oneSiteAsked('site-local')
    h.listAllWorkspaces.mockResolvedValue([
      workspace('ws1', 'web', 'project', project.id, 'site-local'),
      workspace('ws2', 'helloapp', 'user', me.id, 'site-local'),
    ])
    h.listAllRepos.mockResolvedValue([{ workspaceId: 'ws1', ownerType: 'project', ownerId: project.id, repoUrl: 'https://github.com/org/web' }])

    const { groups } = await getMyStorageQuery(undefined, ctx(me))

    expect(groups[0]).toMatchObject({ ownerType: 'user', label: 'Personal', workspaces: [{ id: 'ws2', name: 'helloapp', repoUrl: null }] })
    const proj = groups.find((g: any) => g.key === `project:${project.id}`)!
    expect(proj.label).toBe('Project · Project1')
    expect(proj.workspaces).toEqual([{ id: 'ws1', name: 'web', repoUrl: 'https://github.com/org/web', siteLabel: 'site-local' }])
    // The project's key and name, for the address and the place filter; the person's own space has neither.
    expect(proj.place).toEqual({ key: project.key, name: 'Project1' })
    expect(groups[0].place).toBeNull()
    // Asked by the id the channel keys connections by, both reads together.
    expect(h.listAllWorkspaces).toHaveBeenCalledWith('site-local')
    expect(h.listAllRepos).toHaveBeenCalledWith('site-local')
  })

  it("names a files folder's own repo on its group", async () => {
    const me = await createUser()
    oneSiteAsked('site-local')
    h.listAllRepos.mockResolvedValue([{ workspaceId: null, ownerType: 'user', ownerId: me.id, repoUrl: 'https://github.com/me/notes' }])

    const { groups } = await getMyStorageQuery(undefined, ctx(me))

    expect(groups[0].filesRepoUrl).toBe('https://github.com/me/notes')
  })

  it('an organisation with no site at all: empty workspace lists, still returns owner groups', async () => {
    const me = await createUser()
    const { groups } = await getMyStorageQuery(undefined, ctx(me))
    expect(groups[0]).toMatchObject({ ownerType: 'user', label: 'Personal', workspaces: [] })
  })

  // SKIPPED, not changed. The listing no longer fails when a site cannot be
  // asked: failing the whole view because one site is asleep would take every
  // person's storage page away over one sleeping laptop, and the owner groups
  // come from hq's own database and are true regardless. This case asserts the
  // behaviour that change removed on purpose. Its assertions and title are
  // untouched: the scenario it sits under says "every REACHABLE storage
  // location", so whether the contract should now say what happens to an
  // unreachable one is the QA audit's decision, not a thing to quietly rewrite
  // here. What replaced it is covered, untagged, below — "does not fail the
  // whole listing when one site is down" and "names a site that did not answer
  // instead of showing an owner with no workspaces".
  it.skip('an unreachable local site 503s rather than silently showing an empty Storage page', async () => {
    const { SiteUnreachableError } = await import('../workspaceStore')
    h.listAllWorkspaces.mockRejectedValue(new (SiteUnreachableError as any)('Box One'))
    await expect(getMyStorageQuery(undefined, ctx({ id: 'u1' }))).rejects.toMatchObject({ statusCode: 503 })
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(getMyStorageQuery(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })

  // Entitlement is applied in the query, not per row: only the projects the caller
  // is listed on come back at all, open or private (spec §6.4, adr-0099).
  it('offers only the projects the caller is listed on, never an open one they have not joined or their personal project, and a Personal group always', async () => {
    const me = await createUser()
    const open = await createProject({ accessLevel: 'OPEN' })
    await createProject({ accessLevel: 'OPEN' })
    const listed = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.createMany({ data: [open, listed].map(p => ({ projectId: p.id, userId: me.id })) })
    await createProject({ accessLevel: 'PRIVATE' })
    await createProject({ personalOwnerId: me.id, personalSpace: true, accessLevel: 'PRIVATE' })

    const { groups } = await getMyStorageQuery(undefined, ctx(me))

    expect(groups.map((g: any) => g.key).sort()).toEqual([`project:${listed.id}`, `project:${open.id}`, `user:${me.id}`].sort())
    expect(groups[0].ownerType).toBe('user')
  })

  it('offers only the Personal group when the caller is entitled to no project', async () => {
    const me = await createUser()
    await createProject({ accessLevel: 'PRIVATE' })
    expect((await getMyStorageQuery(undefined, ctx(me))).groups.map((g: any) => g.ownerType)).toEqual(['user'])
  })
})

describe('the storage listing covers every site', () => {
  it("lists a project's workspaces wherever they are held", async () => {
    const me = await createUser()
    const project = await createProject()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
    answers([
      { siteId: 'site-a', workspaces: [workspace('ws1', 'personal-notes', 'user', me.id, 'site-a')], repos: [] },
      {
        siteId: 'site-b',
        workspaces: [workspace('ws2', 'web', 'project', project.id, 'site-b')],
        repos: [{ workspaceId: 'ws2', ownerType: 'project', ownerId: project.id, repoUrl: 'https://github.com/org/web' }],
      },
    ])

    const { groups } = await getMyStorageQuery(undefined, ctx(me))

    expect(groups.find((g: any) => g.key === `project:${project.id}`)!.workspaces)
      .toEqual([{ id: 'ws2', name: 'web', repoUrl: 'https://github.com/org/web', siteLabel: 'site-b' }])
    expect((groups[0].workspaces as any[]).map((w) => w.name)).toEqual(['personal-notes'])
  })

  it('never lists a workspace of a project the person is not offered, whichever site holds it', async () => {
    const me = await createUser()
    const open = await createProject()
    await prisma.projectMember.create({ data: { projectId: open.id, userId: me.id } })
    const secret = await createProject({ accessLevel: 'PRIVATE' })
    answers([{ siteId: 'site-b', workspaces: [workspace('ws9', 'secret', 'project', secret.id, 'site-b')], repos: [] }])

    const { groups } = await getMyStorageQuery(undefined, ctx(me))

    expect(groups.map((g: any) => g.key)).toEqual([`user:${me.id}`, `project:${open.id}`])
    expect(groups.every((g: any) => g.workspaces.every((w: any) => w.id !== 'ws9'))).toBe(true)
  })

  it('names a site that did not answer instead of showing an owner with no workspaces', async () => {
    const me = await createUser()
    const project = await createProject()
    answers([{ siteId: 'site-a', workspaces: [workspace('ws1', 'web', 'project', project.id, 'site-a')], repos: [] }], [offline('site-b', 'Laptop')])

    const result = await getMyStorageQuery(undefined, ctx(me))

    expect(result.unanswered[0]).toMatchObject({ reason: 'offline', label: 'Laptop' })
  })

  it('does not fail the whole listing when one site is down', async () => {
    const me = await createUser()
    const project = await createProject()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
    answers([], [offline('site-b', 'Laptop')])

    const { groups, unanswered } = await getMyStorageQuery(undefined, ctx(me))

    expect(groups.map((g: any) => g.key)).toEqual([`user:${me.id}`, `project:${project.id}`])
    expect(groups[0].workspaces).toEqual([])
    expect(unanswered).toHaveLength(1)
  })

  it('says every site answered with an empty list rather than nothing at all', async () => {
    const me = await createUser()
    answers([{ siteId: 'site-a', workspaces: [], repos: [] }])
    expect((await getMyStorageQuery(undefined, ctx(me))).unanswered).toEqual([])
  })
})
