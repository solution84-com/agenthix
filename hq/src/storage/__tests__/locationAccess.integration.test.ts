// The one location access rule (@SC-247, R-068), against the real test database:
// projects, members and tasks are real rows. The site a named workspace is read
// from is the stand-in.
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../workspaceStore', async () => {
  const actual = await vi.importActual<typeof import('../workspaceStore')>('../workspaceStore')
  return { ...actual, getWorkspace: vi.fn() }
})

import { getWorkspace, SiteUnreachableError } from '../workspaceStore'
import { assertLocationAccess } from '../locationAccess'

async function privateProject(memberId?: string) {
  const project = await createProject({ accessLevel: 'PRIVATE' })
  if (memberId) await prisma.projectMember.create({ data: { projectId: project.id, userId: memberId } })
  return project
}

async function openProject(memberId: string) {
  const project = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: memberId } })
  return project
}

let taskNumber = 0
const taskIn = (projectId: string, userId: string) =>
  createTestTask({ data: { title: 't', projectId, number: ++taskNumber, onBehalfOfUserId: userId } })

describe('assertLocationAccess @SC-247', () => {
  it('refuses a private project the caller is not a member of (403)', async () => {
    const me = await createUser()
    const project = await privateProject()
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: project.id }, me.id, 'work')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows a private project the caller is listed on', async () => {
    const me = await createUser()
    const project = await privateProject(me.id)
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: project.id }, me.id, 'work')).resolves.toBeUndefined()
  })

  it('refuses an open project the caller has not joined (403), and allows one they are listed on (adr-0099)', async () => {
    const me = await createUser()
    const stranger = await createUser()
    const project = await openProject(me.id)
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: project.id }, stranger.id, 'work')).rejects.toMatchObject({ statusCode: 403 })
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: project.id }, me.id, 'work')).resolves.toBeUndefined()
  })

  it('404s a project that does not exist', async () => {
    const me = await createUser()
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: 'nope' }, me.id, 'work')).rejects.toMatchObject({ statusCode: 404 })
  })

  it("refuses another person's files, and allows the caller's own", async () => {
    const me = await createUser()
    const other = await createUser()
    await expect(assertLocationAccess({ ownerType: 'user', ownerId: other.id }, me.id, 'work')).rejects.toMatchObject({ statusCode: 403 })
    await expect(assertLocationAccess({ ownerType: 'user', ownerId: me.id }, me.id, 'work')).resolves.toBeUndefined()
  })
})

describe('assertLocationAccess with a task (R-068)', () => {
  it('allows a task that belongs to the owning project', async () => {
    const me = await createUser()
    const project = await openProject(me.id)
    const task = await taskIn(project.id, me.id)
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: project.id, taskId: task.id }, me.id, 'work')).resolves.toBeUndefined()
  })

  it("refuses a task of another project, so a project's location cannot be paired with someone else's task (400)", async () => {
    const me = await createUser()
    const project = await openProject(me.id)
    const other = await createProject({ accessLevel: 'OPEN' })
    const task = await taskIn(other.id, me.id)
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: project.id, taskId: task.id }, me.id, 'work'))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('404s a task that does not exist', async () => {
    const me = await createUser()
    const project = await openProject(me.id)
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: project.id, taskId: 'gone' }, me.id, 'work'))
      .rejects.toMatchObject({ statusCode: 404 })
  })

  it("refuses a task on a person's own files, since a task belongs to a project (400)", async () => {
    const me = await createUser()
    await expect(assertLocationAccess({ ownerType: 'user', ownerId: me.id, taskId: 't1' }, me.id, 'work')).rejects.toMatchObject({ statusCode: 400 })
  })

  it('checks the owner first: a task never reveals its project to a caller who may not use it', async () => {
    const me = await createUser()
    const project = await privateProject()
    // A task id that does not exist would be 404 if the task were looked up first.
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: project.id, taskId: 'gone' }, me.id, 'work'))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('treats a null taskId as no task', async () => {
    const me = await createUser()
    const project = await openProject(me.id)
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: project.id, taskId: null }, me.id, 'work')).resolves.toBeUndefined()
  })
})

describe('assertLocationAccess with a workspace', () => {
  it("allows a workspace of the stated owner, and refuses one of another owner (400) or one that does not exist (404)", async () => {
    const me = await createUser()
    const project = await openProject(me.id)
    const loc = { ownerType: 'project' as const, ownerId: project.id, workspaceId: 'ws-1' }

    vi.mocked(getWorkspace).mockResolvedValueOnce({ id: 'ws-1', ownerType: 'project', ownerId: project.id } as never)
    await expect(assertLocationAccess(loc, me.id, 'work')).resolves.toBeUndefined()

    vi.mocked(getWorkspace).mockResolvedValueOnce({ id: 'ws-1', ownerType: 'project', ownerId: 'another' } as never)
    await expect(assertLocationAccess(loc, me.id, 'work')).rejects.toMatchObject({ statusCode: 400 })

    vi.mocked(getWorkspace).mockResolvedValueOnce(null as never)
    await expect(assertLocationAccess(loc, me.id, 'work')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('never passes silently when the site holding the workspace cannot answer (503)', async () => {
    const me = await createUser()
    const project = await openProject(me.id)
    vi.mocked(getWorkspace).mockRejectedValueOnce(new SiteUnreachableError('Site B', 'site-b') as never)
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: project.id, workspaceId: 'ws-1' }, me.id, 'work'))
      .rejects.toMatchObject({ statusCode: 503 })
  })
})

describe("a personal project's storage (agents own schedule spec §4)", () => {
  it('is refused as a location to its own owner — it has none; its work is in their own files (400)', async () => {
    const me = await createUser()
    const mine = await createProject({ personalOwnerId: me.id, personalSpace: true, accessLevel: 'PRIVATE' })
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: mine.id }, me.id, 'work')).rejects.toMatchObject({ statusCode: 400 })
  })

  it("is its owner's to use when it is another personal project, with storage of its own", async () => {
    const me = await createUser()
    const side = await createProject({ personalOwnerId: me.id, accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: side.id, userId: me.id, role: 'ADMIN' } })
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: side.id }, me.id, 'work')).resolves.toBeUndefined()
  })

  it('is refused to anyone else as a non-member first (403), even one listed as its admin', async () => {
    const me = await createUser()
    const other = await createUser()
    const mine = await createProject({ personalOwnerId: me.id, personalSpace: true, accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: mine.id, userId: other.id, role: 'ADMIN' } })
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: mine.id }, other.id, 'work')).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe("a project's Viewer (adr-0102)", () => {
  it('reads its storage, and is refused working in it (403, saying so)', async () => {
    const me = await createUser()
    const project = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id, role: 'VIEWER' } })
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: project.id }, me.id, 'read')).resolves.toBeUndefined()
    await expect(assertLocationAccess({ ownerType: 'project', ownerId: project.id }, me.id, 'work'))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Viewer') })
  })
})
