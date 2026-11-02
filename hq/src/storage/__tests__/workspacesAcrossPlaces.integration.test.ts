// The Projects screen's Workspaces view (every screen reviewed spec §3): the workspaces of the places a person
// may reach, each with its place, repository, site and preview, and where they may add one. Against the real
// test database; what the sites hold is the stand-in, as in the storage listing's suite.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createProject, createUser, joinProjectAs } from '../../test/factories'

const h = vi.hoisted(() => ({ askEverySite: vi.fn(), listAllWorkspaces: vi.fn(), listAllRepos: vi.fn() }))

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

import { getWorkspacesAcrossPlacesQuery } from '../workspacesAcrossPlaces'

const workspace = (id: string, name: string, ownerType: string, ownerId: string) => ({
  id, name, ownerType, ownerId, siteId: 'site-local', allowedTools: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})

const ctx = (user?: { id: string }) => ({ user }) as any

beforeEach(() => {
  h.askEverySite.mockReset().mockImplementation(async (call: (s: unknown) => Promise<unknown>) => ({
    answers: [{ siteId: 'site-local', value: await call({ id: 'es-1', siteId: 'site-local', label: 'HQ', status: 'ONLINE', protocolVersion: SITE_PROTOCOL_VERSION }) }],
    unanswered: [{ siteId: 's9', label: 'Build server', reason: 'offline', detail: 'Build server is not connected to hq.' }],
  }))
  h.listAllWorkspaces.mockReset().mockResolvedValue([])
  h.listAllRepos.mockReset().mockResolvedValue([])
})

describe('the Workspaces view @SC-657', () => {
  it('lists the workspaces of the person’s projects and their own Chat, each with its place, repository and site', async () => {
    const me = await createUser()
    const mine = await createProject({ name: 'Mine', key: 'MINE' })
    await joinProjectAs(mine.id, me.id)
    h.listAllWorkspaces.mockResolvedValue([workspace('w1', 'website', 'project', mine.id), workspace('w2', 'scratch', 'user', me.id)])
    h.listAllRepos.mockResolvedValue([{ workspaceId: 'w1', ownerType: 'project', ownerId: mine.id, repoUrl: 'https://github.com/acme/website' }])

    const view = await getWorkspacesAcrossPlacesQuery(undefined, ctx(me))

    expect(view.workspaces).toEqual([
      { id: 'w2', name: 'scratch', repoUrl: null, siteLabel: 'HQ', previewRunning: false, place: { ownerType: 'user', ownerId: me.id, key: null, name: 'Chat' } },
      { id: 'w1', name: 'website', repoUrl: 'https://github.com/acme/website', siteLabel: 'HQ', previewRunning: false, place: { ownerType: 'project', ownerId: mine.id, key: 'MINE', name: 'Mine' } },
    ])
  })

  it('leaves out the workspaces of a project the person is not in, and names the site that did not answer', async () => {
    const me = await createUser()
    const other = await createUser()
    const theirs = await createProject({ name: 'Theirs', key: 'THEIRS' })
    await joinProjectAs(theirs.id, other.id)
    h.listAllWorkspaces.mockResolvedValue([workspace('w9', 'secret', 'project', theirs.id)])

    const view = await getWorkspacesAcrossPlacesQuery(undefined, ctx(me))

    expect(view.workspaces).toEqual([])
    expect(view.unanswered.map(s => s.label)).toEqual(['Build server'])
  })

  it('marks a workspace with a live preview running', async () => {
    const me = await createUser()
    h.listAllWorkspaces.mockResolvedValue([workspace('w1', 'scratch', 'user', me.id), workspace('w2', 'other', 'user', me.id)])
    const live = { executionSiteId: 'site-local', ownerType: 'user', ownerId: me.id, branch: 'main', onMain: true, copyKind: 'MAIN', userId: me.id } as const
    await prisma.livePreview.create({ data: { ...live, workspaceId: 'w1', copyId: 'c1', state: 'RUNNING' } })
    await prisma.livePreview.create({ data: { ...live, workspaceId: 'w2', copyId: 'c2', state: 'STOPPED' } })

    const view = await getWorkspacesAcrossPlacesQuery(undefined, ctx(me))

    expect(Object.fromEntries(view.workspaces.map(w => [w.id, w.previewRunning]))).toEqual({ w1: true, w2: false })
  })

  it('offers to add a workspace in Chat and in the projects the person works in, not where they are a Viewer @SC-658', async () => {
    const me = await createUser()
    const works = await createProject({ name: 'Works', key: 'WORKS' })
    const reads = await createProject({ name: 'Reads', key: 'READS' })
    await joinProjectAs(works.id, me.id, 'MEMBER')
    await joinProjectAs(reads.id, me.id, 'VIEWER')

    const { places } = await getWorkspacesAcrossPlacesQuery(undefined, ctx(me))

    expect(Object.fromEntries(places.map(p => [p.name, p.mayAdd]))).toEqual({ Chat: true, Works: true, Reads: false })
  })

  it('refuses a caller who is not signed in', async () => {
    await expect(getWorkspacesAcrossPlacesQuery(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})
