/**
 * An older version of main, read through hq against the real test database (ADR-0094): which commit the address's
 * version names, by number or by commit, and its folders and files read at that commit only when it is one of main's
 * versions. A Viewer may read it. The site's answers are replaced: they leave hq.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BranchWorkError, type SiteMethodName } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createProject, createUserWithRole, ensureExecutionSite, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
// The task runner leads back to the workspace store while its stand-in below is still being made, so the real
// `getWorkspace` would be used and ask a site that is not there. Its fake breaks that loop, as in the other branch suites.
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
const workspaceRow = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }))
vi.mock('../../storage/workspaceStore', async () => {
  const actual = await vi.importActual<object>('../../storage/workspaceStore')
  return { ...actual, getWorkspace: vi.fn(async (id: string) => (workspaceRow.current?.id === id ? workspaceRow.current : null)) }
})
const site = vi.hoisted(() => ({ calls: [] as { method: string; params: Record<string, unknown> }[], answer: {} as Record<string, (p: Record<string, unknown>) => unknown> }))
vi.mock('../siteCalls', () => ({
  siteCall: vi.fn(async (_siteId: string, method: SiteMethodName, params: Record<string, unknown>) => {
    site.calls.push({ method, params })
    const answer = site.answer[method]
    if (!answer) throw new Error(`no answer for ${method}`)
    return answer(params)
  }),
}))

import { getGitFileQuery, getGitTreeQuery, getMainVersionAtQuery, getMainVersionChangesQuery } from '../operations'

const id = (c: string) => c.repeat(40)
const HEAD = id('e')
// main's first-parent line, newest first: v5 … v1.
const LINE = [5, 4, 3, 2, 1].map(n => ({ number: n, commit: id(String(n)), subject: `v${n}`, author: { name: 'K', email: 'k@a.b' }, files: 1, at: new Date().toISOString() }))
LINE[0].commit = HEAD

let viewer: { id: string }
let workspaceId: string
let n = 0
const ctx = (u: { id: string }) => ({ user: u })

beforeEach(async () => {
  site.calls.length = 0
  site.answer = {
    'branch.list': () => ({ main: { name: 'main', head: HEAD, versions: 5 }, branches: [], overflow: false }),
    'git.versions': (p) => {
      const before = p.before as string | null
      const from = before === null ? 0 : LINE.findIndex(v => v.commit === before) + 1
      if (before !== null && from === 0) throw new BranchWorkError('not_found', 'not on main')
      const versions = LINE.slice(from, from + (p.limit as number))
      return { versions, total: 5, overflow: from + versions.length < 5 }
    },
    'git.listTree': () => ({ exists: true, entries: [], overflow: false }),
    'git.readFile': () => ({ exists: true, binary: false, tooLarge: false, bytes: 3, text: 'old' }),
    'git.versionChanges': (p) => {
      const at = LINE.findIndex(v => v.commit === p.version)
      if (at < 0) throw new BranchWorkError('not_found', 'not on main')
      return { base: LINE[at + 1]?.commit ?? '4b825dc642cb6eb9a060e54bf8d69288fbee4904', head: p.version, files: [{ path: 'a.txt', status: 'modified', from: null, additions: 1, deletions: 0 }], overflow: false }
    },
  }
  const s = await ensureExecutionSite()
  viewer = await createUserWithRole('MEMBER')
  const project = await createProject({ name: 'Web', slug: `web-${++n}` })
  await joinProjectAs(project.id, viewer.id, 'VIEWER')
  workspaceId = `wsv-${n}`
  await prisma.workspacePlacement.create({ data: { workspaceId, siteId: s.id } })
  workspaceRow.current = { id: workspaceId, name: 'website-code', ownerType: 'project', ownerId: project.id, siteId: s.siteId, allowedTools: null }
})

describe("an older version of main, by number or by commit, for a Viewer too", () => {
  it('names v3 by its number and finds its commit', async () => {
    expect(await getMainVersionAtQuery({ workspaceId, version: 'v3' }, ctx(viewer))).toEqual({ number: 3, commit: id('3'), latest: false })
    expect(await getMainVersionAtQuery({ workspaceId, version: '5' }, ctx(viewer))).toEqual({ number: 5, commit: HEAD, latest: true })
  })

  it('names a version by its commit and finds its number', async () => {
    expect(await getMainVersionAtQuery({ workspaceId, version: id('2') }, ctx(viewer))).toEqual({ number: 2, commit: id('2'), latest: false })
    expect(await getMainVersionAtQuery({ workspaceId, version: id('1') }, ctx(viewer))).toEqual({ number: 1, commit: id('1'), latest: false })
  })

  it('refuses a number past the latest, a commit off main’s line, and anything else', async () => {
    await expect(getMainVersionAtQuery({ workspaceId, version: 'v9' }, ctx(viewer))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getMainVersionAtQuery({ workspaceId, version: id('f') }, ctx(viewer))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getMainVersionAtQuery({ workspaceId, version: 'HEAD~1' }, ctx(viewer))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('reads a folder and a file at that version, checked to be one of main’s first', async () => {
    await getGitTreeQuery({ workspaceId, ref: { kind: 'main', version: id('3') }, path: '' }, ctx(viewer))
    await getGitFileQuery({ workspaceId, ref: { kind: 'main', version: id('3') }, at: 'tip', path: 'README.md' }, ctx(viewer))
    expect(site.calls.filter(c => c.method === 'git.listTree' || c.method === 'git.readFile').map(c => c.params.rev)).toEqual([{ commit: id('3') }, { commit: id('3') }])
    expect(site.calls.filter(c => c.method === 'git.versions').map(c => c.params.before)).toEqual([id('3'), id('3')])
  })

  it('reads nothing at a commit that is not one of main’s versions', async () => {
    await expect(getGitTreeQuery({ workspaceId, ref: { kind: 'main', version: id('f') }, path: '' }, ctx(viewer))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getGitFileQuery({ workspaceId, ref: { kind: 'main', version: 'main' }, at: 'tip', path: 'a' }, ctx(viewer))).rejects.toMatchObject({ statusCode: 400 })
    expect(site.calls.some(c => c.method === 'git.listTree' || c.method === 'git.readFile')).toBe(false)
  })
})

describe("an older version's own changes, for a Viewer too", () => {
  it('answers the files v3 changed against v2', async () => {
    expect(await getMainVersionChangesQuery({ workspaceId, version: id('3') }, ctx(viewer))).toMatchObject({ base: id('2'), head: id('3'), files: [{ path: 'a.txt' }] })
  })

  it("refuses a commit off main's line, and anything but a commit", async () => {
    await expect(getMainVersionChangesQuery({ workspaceId, version: id('f') }, ctx(viewer))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getMainVersionChangesQuery({ workspaceId, version: 'v3' }, ctx(viewer))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses a person who is not in the project', async () => {
    const stranger = await createUserWithRole('MEMBER')
    await expect(getMainVersionChangesQuery({ workspaceId, version: id('3') }, ctx(stranger))).rejects.toMatchObject({ statusCode: 403 })
    expect(site.calls.some(c => c.method === 'git.versionChanges')).toBe(false)
  })
})
