// Who may read a location's repository state, and connect or disconnect its
// repository (@SC-304): the location access rule, and for a project, its admin.
// Against the real test database — people, projects, members and sites are real
// rows. The repository work itself (on the site and on GitHub) and the site's
// workspace read are the stand-ins; whether that work was reached is the
// behaviour checked.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, ensureExecutionSite } from '../../test/factories'

const h = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  getRepoState: vi.fn(),
  connectRepo: vi.fn(),
  disconnectRepo: vi.fn(),
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
vi.mock('../repoAttachmentService', async () => {
  const actual = await vi.importActual<typeof import('../repoAttachmentService')>('../repoAttachmentService')
  return { ...actual, getRepoState: h.getRepoState, connectRepo: h.connectRepo, disconnectRepo: h.disconnectRepo }
})

import { getRepoStateQuery } from '../queries'
import { connectRepoAction, disconnectRepoAction } from '../actions'

const reachedTheRepo = () => h.getRepoState.mock.calls.length + h.connectRepo.mock.calls.length + h.disconnectRepo.mock.calls.length

let siteId: string
let me: { id: string }

beforeEach(async () => {
  for (const fn of Object.values(h)) fn.mockReset()
  h.getRepoState.mockResolvedValue({ repoUrl: null, isGitRepo: false, hasFiles: true })
  h.connectRepo.mockResolvedValue({ repoUrl: 'https://github.com/o/r', attachmentId: 'att-1' })
  h.disconnectRepo.mockResolvedValue(undefined)
  siteId = (await ensureExecutionSite()).siteId
  me = await createUser()
})

describe('the location access rule at the repository operations', () => {
  it("refuses another person's files (403, not rewrapped as 400) and never reaches the repository", async () => {
    const theirs = { ownerType: 'user' as const, ownerId: (await createUser()).id }
    await expect(getRepoStateQuery({ target: theirs }, { user: me })).rejects.toMatchObject({ statusCode: 403 })
    await expect(connectRepoAction({ target: theirs, mode: 'init', name: 'stolen' }, { user: me })).rejects.toMatchObject({ statusCode: 403 })
    await expect(disconnectRepoAction({ target: theirs }, { user: me })).rejects.toMatchObject({ statusCode: 403 })
    expect(reachedTheRepo()).toBe(0)
  })

  it('refuses a project that does not exist (404) and a workspace of a different owner (400)', async () => {
    const project = await createProject({ accessLevel: 'OPEN' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
    h.getWorkspace.mockResolvedValue({ id: 'ws-1', ownerType: 'project', ownerId: 'proj-2' })
    const mismatched = { ownerType: 'project' as const, ownerId: project.id, workspaceId: 'ws-1' }

    await expect(connectRepoAction({ target: { ownerType: 'project', ownerId: 'nope' }, mode: 'init' }, { user: me })).rejects.toMatchObject({ statusCode: 404 })
    await expect(getRepoStateQuery({ target: mismatched }, { user: me })).rejects.toMatchObject({ statusCode: 400 })
    await expect(connectRepoAction({ target: mismatched, mode: 'init' }, { user: me })).rejects.toMatchObject({ statusCode: 400 })
    await expect(disconnectRepoAction({ target: mismatched }, { user: me })).rejects.toMatchObject({ statusCode: 400 })
    expect(reachedTheRepo()).toBe(0)
  })

  it("reads, connects and disconnects the caller's own files, on the site that holds them", async () => {
    const mine = { ownerType: 'user' as const, ownerId: me.id }
    await expect(getRepoStateQuery({ target: mine }, { user: me })).resolves.toEqual({ repoUrl: null, isGitRepo: false, hasFiles: true, mayAdminister: true })
    await expect(connectRepoAction({ target: mine, mode: 'init', name: 'mine' }, { user: me })).resolves.toMatchObject({ repoUrl: 'https://github.com/o/r' })
    await expect(disconnectRepoAction({ target: mine }, { user: me })).resolves.toBeUndefined()
    expect(h.disconnectRepo).toHaveBeenCalledWith(siteId, mine)
  })

  it('refuses a caller who is not signed in (401)', async () => {
    const mine = { ownerType: 'user' as const, ownerId: me.id }
    await expect(getRepoStateQuery({ target: mine }, {})).rejects.toMatchObject({ statusCode: 401 })
    await expect(connectRepoAction({ target: mine, mode: 'init' }, {})).rejects.toMatchObject({ statusCode: 401 })
    await expect(disconnectRepoAction({ target: mine }, {})).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe("a project's repository attachments are its admin's @SC-304", () => {
  async function projectWith(role: 'ADMIN' | 'MEMBER') {
    const project = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id, role } })
    return { ownerType: 'project' as const, ownerId: project.id, workspaceId: null }
  }

  it('refuses a member who is not the project admin (403), attaching and detaching nothing', async () => {
    const target = await projectWith('MEMBER')
    await expect(connectRepoAction({ target, mode: 'init' }, { user: me })).rejects.toMatchObject({ statusCode: 403 })
    await expect(disconnectRepoAction({ target }, { user: me })).rejects.toMatchObject({ statusCode: 403 })
    expect(reachedTheRepo()).toBe(0)
  })

  it('says whether the person may administer, so the screens offer the buttons only to those who may', async () => {
    await expect(getRepoStateQuery({ target: await projectWith('ADMIN') }, { user: me })).resolves.toMatchObject({ mayAdminister: true })
    await expect(getRepoStateQuery({ target: await projectWith('MEMBER') }, { user: me })).resolves.toMatchObject({ mayAdminister: false })
  })

  it("refuses a task's folder as the target of any of the three, reaching no repository", async () => {
    const target = { ...(await projectWith('ADMIN')), taskId: 'some-task' }
    await expect(getRepoStateQuery({ target }, { user: me })).rejects.toMatchObject({ statusCode: 400 })
    await expect(connectRepoAction({ target, mode: 'init' }, { user: me })).rejects.toMatchObject({ statusCode: 400 })
    await expect(disconnectRepoAction({ target }, { user: me })).rejects.toMatchObject({ statusCode: 400 })
    expect(reachedTheRepo()).toBe(0)
  })

  it('lets the project admin connect and disconnect', async () => {
    const target = await projectWith('ADMIN')
    await connectRepoAction({ target, mode: 'init' }, { user: me })
    await disconnectRepoAction({ target }, { user: me })
    expect(h.connectRepo).toHaveBeenCalledOnce()
    expect(h.disconnectRepo).toHaveBeenCalledOnce()
  })

  it('refuses a project with no Execution Site (400) before any repository work', async () => {
    const project = await createProject({ accessLevel: 'OPEN', executionSiteId: null })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id, role: 'ADMIN' } })
    await expect(connectRepoAction({ target: { ownerType: 'project', ownerId: project.id }, mode: 'init' }, { user: me }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(reachedTheRepo()).toBe(0)
  })
})
