/**
 * A person's pins (every screen reviewed spec §1, §9), against the real test
 * database: pin, unpin and reorder change only the caller's own; the list comes
 * back in their order with each item's name and link; and a pin to something
 * they can no longer see is kept but not shown.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser } from '../../test/factories'
import { makeBoard } from '../../projects/__tests__/projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getPins } from '../queries'
import { pinItem, unpinItem, reorderPins } from '../actions'

const ctx = (user?: { id: string }) => ({ user }) as any

async function cast() {
  const me = await createUser()
  const project = await createProject({ name: 'Agenthix', key: 'AGX' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
  const board = await makeBoard(project.id, { name: 'Sprint 4' })
  const agent = await createAgent({ name: 'Project manager', handle: 'pm', avatarUrl: '/agents/a/images/x.png' })
  return { me, project, board, agent }
}

describe('pinItem @SC-491 @SC-493', () => {
  it('pins a project, a board and an agent in the order they were pinned', async () => {
    const { me, project, board, agent } = await cast()

    await pinItem({ kind: 'AGENT', itemId: agent.id }, ctx(me))
    await pinItem({ kind: 'PROJECT', itemId: project.id }, ctx(me))
    await pinItem({ kind: 'BOARD', itemId: board.id }, ctx(me))

    expect(await getPins(undefined as any, ctx(me))).toEqual([
      expect.objectContaining({ kind: 'AGENT', itemId: agent.id, name: 'Project manager', href: '/agents/pm', avatarUrl: '/agents/a/images/x.png' }),
      expect.objectContaining({ kind: 'PROJECT', itemId: project.id, name: 'Agenthix', href: '/projects/AGX', avatarUrl: null }),
      expect.objectContaining({ kind: 'BOARD', itemId: board.id, name: 'Sprint 4', href: `/projects/AGX/boards/${board.id}` }),
    ])
  })

  it('pinning the same item again changes nothing', async () => {
    const { me, project } = await cast()
    await pinItem({ kind: 'PROJECT', itemId: project.id }, ctx(me))
    await pinItem({ kind: 'PROJECT', itemId: project.id }, ctx(me))
    expect(await prisma.pin.count({ where: { userId: me.id } })).toBe(1)
  })

  it('refuses a private project the caller is not on, as if it did not exist', async () => {
    const me = await createUser()
    const hidden = await createProject({ accessLevel: 'PRIVATE' })
    await expect(pinItem({ kind: 'PROJECT', itemId: hidden.id }, ctx(me))).rejects.toMatchObject({ statusCode: 404 })
    expect(await prisma.pin.count()).toBe(0)
  })

  it("refuses a board in a project the caller cannot see, and someone else's personal project", async () => {
    const me = await createUser()
    const other = await createUser()
    const hidden = await createProject({ accessLevel: 'PRIVATE' })
    const board = await makeBoard(hidden.id)
    const theirs = await createProject({ accessLevel: 'PRIVATE', personalOwnerId: other.id })
    await expect(pinItem({ kind: 'BOARD', itemId: board.id }, ctx(me))).rejects.toMatchObject({ statusCode: 404 })
    await expect(pinItem({ kind: 'PROJECT', itemId: theirs.id }, ctx(me))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses an unknown kind, a missing item, and a caller who is not signed in', async () => {
    const { me } = await cast()
    await expect(pinItem({ kind: 'TASK' as any, itemId: 'x' }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
    await expect(pinItem({ kind: 'AGENT', itemId: 'no-such-agent' }, ctx(me))).rejects.toMatchObject({ statusCode: 404 })
    await expect(pinItem({ kind: 'AGENT', itemId: 'x' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('getPins @SC-491 @SC-493', () => {
  it("lists only the caller's own pins", async () => {
    const { me, project } = await cast()
    const other = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: other.id } })
    await pinItem({ kind: 'PROJECT', itemId: project.id }, ctx(other))
    expect(await getPins(undefined as any, ctx(me))).toEqual([])
  })

  it('does not show a pin to something the caller can no longer see, and keeps it', async () => {
    const me = await createUser()
    const project = await createProject({ accessLevel: 'PRIVATE', key: 'SEC' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id, role: 'MEMBER' } })
    const board = await makeBoard(project.id)
    await pinItem({ kind: 'PROJECT', itemId: project.id }, ctx(me))
    await pinItem({ kind: 'BOARD', itemId: board.id }, ctx(me))

    await prisma.projectMember.deleteMany({ where: { projectId: project.id, userId: me.id } })

    expect(await getPins(undefined as any, ctx(me))).toEqual([])
    expect(await prisma.pin.count({ where: { userId: me.id } })).toBe(2)
  })

  it('does not show a pin whose item is gone', async () => {
    const { me, agent } = await cast()
    await pinItem({ kind: 'AGENT', itemId: agent.id }, ctx(me))
    await prisma.agent.delete({ where: { id: agent.id } })
    expect(await getPins(undefined as any, ctx(me))).toEqual([])
  })

  it('refuses a caller who is not signed in', async () => {
    await expect(getPins(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('unpinItem @SC-491 @SC-493', () => {
  it("removes the caller's pin and leaves someone else's of the same item", async () => {
    const { me, project } = await cast()
    const other = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: other.id } })
    await pinItem({ kind: 'PROJECT', itemId: project.id }, ctx(me))
    await pinItem({ kind: 'PROJECT', itemId: project.id }, ctx(other))

    await unpinItem({ kind: 'PROJECT', itemId: project.id }, ctx(me))

    expect(await prisma.pin.findMany({ select: { userId: true } })).toEqual([{ userId: other.id }])
  })

  it('unpins an item the caller can no longer see', async () => {
    const me = await createUser()
    const project = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.pin.create({ data: { userId: me.id, kind: 'PROJECT', itemId: project.id, position: 0 } })
    await unpinItem({ kind: 'PROJECT', itemId: project.id }, ctx(me))
    expect(await prisma.pin.count()).toBe(0)
  })
})

describe('reorderPins @SC-492', () => {
  it('puts the pins in the order given', async () => {
    const { me, project, board, agent } = await cast()
    await pinItem({ kind: 'PROJECT', itemId: project.id }, ctx(me))
    await pinItem({ kind: 'BOARD', itemId: board.id }, ctx(me))
    await pinItem({ kind: 'AGENT', itemId: agent.id }, ctx(me))
    const [p, b, a] = await getPins(undefined as any, ctx(me))

    await reorderPins({ pinIds: [a.id, p.id, b.id] }, ctx(me))

    expect((await getPins(undefined as any, ctx(me))).map((pin) => pin.id)).toEqual([a.id, p.id, b.id])
  })

  it('keeps pins left out of the order, hidden ones included, after the ones given', async () => {
    const { me, project, agent } = await cast()
    const hidden = await createProject({ accessLevel: 'PRIVATE' })
    await pinItem({ kind: 'PROJECT', itemId: project.id }, ctx(me))
    const hiddenPin = await prisma.pin.create({ data: { userId: me.id, kind: 'PROJECT', itemId: hidden.id, position: 1 } })
    await pinItem({ kind: 'AGENT', itemId: agent.id }, ctx(me))
    const [p, a] = await getPins(undefined as any, ctx(me))

    await reorderPins({ pinIds: [a.id] }, ctx(me))

    const stored = await prisma.pin.findMany({ where: { userId: me.id }, orderBy: { position: 'asc' } })
    expect(stored.map((pin) => pin.id)).toEqual([a.id, p.id, hiddenPin.id])
  })

  it("refuses someone else's pin and changes nothing", async () => {
    const { me, project } = await cast()
    const other = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: other.id } })
    await pinItem({ kind: 'PROJECT', itemId: project.id }, ctx(other))
    const [theirs] = await getPins(undefined as any, ctx(other))
    await pinItem({ kind: 'PROJECT', itemId: project.id }, ctx(me))
    const before = await prisma.pin.findMany({ orderBy: { id: 'asc' } })

    await expect(reorderPins({ pinIds: [theirs.id] }, ctx(me))).rejects.toMatchObject({ statusCode: 404 })

    expect(await prisma.pin.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
  })

  it('refuses a list naming a pin twice', async () => {
    const { me, project } = await cast()
    await pinItem({ kind: 'PROJECT', itemId: project.id }, ctx(me))
    const [p] = await getPins(undefined as any, ctx(me))
    await expect(reorderPins({ pinIds: [p.id, p.id] }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
  })
})
