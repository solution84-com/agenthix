// The Projects screen's Boards view: the boards of the projects a person is a member of, and nobody else's
// (every screen reviewed spec §3). Against the real test database.
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, createUserWithRole, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})

import { getAllBoards } from '../queries'

const board = (projectId: string, name: string, data: Record<string, unknown> = {}) =>
  prisma.board.create({ data: { projectId, name, ...data } })

const listFor = (user: { id: string }) => getAllBoards(undefined, { user, entities: {} } as any)

describe('the Boards view @SC-655', () => {
  it('lists the boards of the projects the person is a member of, with each board’s project', async () => {
    const me = await createUser()
    const mine = await createProject({ name: 'Mine', key: 'MINE' })
    await joinProjectAs(mine.id, me.id)
    await board(mine.id, 'Launch plan')

    const rows = await listFor(me)

    expect(rows.map(r => r.name)).toEqual(['Launch plan'])
    expect(rows[0].project).toEqual({ id: mine.id, name: 'Mine', key: 'MINE', isPersonal: false })
  })

  it('leaves out a project the person is not in, open or private', async () => {
    const me = await createUser()
    const other = await createUser()
    const open = await createProject({ name: 'Open', key: 'OPEN', accessLevel: 'OPEN' })
    const closed = await createProject({ name: 'Closed', key: 'CLOSED', accessLevel: 'PRIVATE' })
    await joinProjectAs(open.id, other.id)
    await joinProjectAs(closed.id, other.id)
    await board(open.id, 'Open board')
    await board(closed.id, 'Closed board')

    expect(await listFor(me)).toEqual([])
  })

  it('shows an organisation admin the boards of their own projects only', async () => {
    const admin = await createUserWithRole('ADMIN')
    const someone = await createUser()
    const theirs = await createProject({ name: 'Theirs', key: 'THEIRS' })
    const notTheirs = await createProject({ name: 'Not theirs', key: 'NOTTHEIRS' })
    await joinProjectAs(theirs.id, admin.id)
    await joinProjectAs(notTheirs.id, someone.id)
    await board(theirs.id, 'Theirs')
    await board(notTheirs.id, 'Not theirs')

    expect((await listFor(admin)).map(r => r.name)).toEqual(['Theirs'])
  })

  it('lists a Viewer’s project, archived boards included and marked, and a person’s own personal project as theirs', async () => {
    const me = await createUser()
    const other = await createUser()
    const shared = await createProject({ name: 'Shared', key: 'SHARED' })
    await joinProjectAs(shared.id, me.id, 'VIEWER')
    await board(shared.id, 'Old', { archivedAt: new Date() })
    const own = await createProject({ name: 'My tasks', key: 'MYT', personalOwnerId: me.id, personalSpace: true })
    const theirs = await createProject({ name: 'My tasks', key: 'THEIRPERSONAL', personalOwnerId: other.id, personalSpace: true })
    await board(own.id, 'Mine alone')
    await board(theirs.id, 'Theirs alone')

    const rows = await listFor(me)

    expect(rows.map(r => r.name).sort()).toEqual(['Mine alone', 'Old'])
    expect(rows.find(r => r.name === 'Old')!.archivedAt).not.toBeNull()
    expect(rows.find(r => r.name === 'Mine alone')!.project.isPersonal).toBe(true)
  })

  it('counts a board’s tasks per column and what needs the person', async () => {
    const me = await createUser()
    const p = await createProject({ name: 'Counted', key: 'CNT' })
    await joinProjectAs(p.id, me.id)
    const b = await board(p.id, 'Work')
    await prisma.task.create({ data: { title: 'a', projectId: p.id, number: 1, boardId: b.id, column: 'todo', onBehalfOfUserId: me.id } as any })
    await prisma.task.create({ data: { title: 'b', projectId: p.id, number: 2, boardId: b.id, column: null, onBehalfOfUserId: me.id } as any })

    const [row] = await listFor(me)

    expect(row.backlogCount).toBe(1)
    expect(row.columns.find(c => c.name === 'todo')!.count).toBe(1)
    expect(row.needsYouCount).toBe(0)
  })
})
