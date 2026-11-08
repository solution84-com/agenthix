// The deprecated `getAllBoards` (client protocol 1.16; it stops working in 3.0): the boards of the projects a person is
// a member of, and nobody else's, answered from boards as saved views (adr-0176). Each project gives its Task state
// board, named by the project's id, then its saved boards. Against the real test database.
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, createUserWithRole, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})

import { getAllBoards } from '../queries'

const board = (projectId: string, name: string) => prisma.board.create({ data: { projectId, name, view: 'STATE' } })

const listFor = (user: { id: string }) => getAllBoards(undefined, { user, entities: {} } as any)
const saved = (rows: Awaited<ReturnType<typeof listFor>>) => rows.filter(r => r.id !== r.project.id).map(r => r.name)

describe('the deprecated Boards across projects @SC-655', () => {
  it('lists the Task state board and the saved boards of the projects the person is a member of, with each board’s project', async () => {
    const me = await createUser()
    const mine = await createProject({ name: 'Mine', key: 'MINE' })
    await joinProjectAs(mine.id, me.id)
    await board(mine.id, 'Launch plan')

    const rows = await listFor(me)

    expect(rows.map(r => [r.id, r.name])).toEqual([[mine.id, 'Task state'], [expect.any(String), 'Launch plan']])
    expect(rows[0]).toMatchObject({ kind: 'PROJECT_TASKS', columns: [], archivedAt: null, view: { kind: 'STATE' } })
    expect(rows[1].project).toEqual({ id: mine.id, name: 'Mine', key: 'MINE', isPersonal: false })
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

    expect(saved(await listFor(admin))).toEqual(['Theirs'])
  })

  it('lists a Viewer’s project, and a person’s own personal project as theirs', async () => {
    const me = await createUser()
    const other = await createUser()
    const shared = await createProject({ name: 'Shared', key: 'SHARED' })
    await joinProjectAs(shared.id, me.id, 'VIEWER')
    await board(shared.id, 'Ours')
    const own = await createProject({ name: 'My tasks', key: 'MYT', personalOwnerId: me.id, personalSpace: true })
    const theirs = await createProject({ name: 'My tasks', key: 'THEIRPERSONAL', personalOwnerId: other.id, personalSpace: true })
    await board(own.id, 'Mine alone')
    await board(theirs.id, 'Theirs alone')

    const rows = await listFor(me)

    expect(saved(rows).sort()).toEqual(['Mine alone', 'Ours'])
    expect(rows.find(r => r.name === 'Mine alone')!.project.isPersonal).toBe(true)
  })

  it('counts each board’s tasks per column and what needs the person', async () => {
    const me = await createUser()
    const p = await createProject({ name: 'Counted', key: 'CNT' })
    await joinProjectAs(p.id, me.id)
    await prisma.task.create({ data: { title: 'a', projectId: p.id, number: 1, state: 'TODO', onBehalfOfUserId: me.id } })
    await prisma.task.create({ data: { title: 'b', projectId: p.id, number: 2, state: 'BACKLOG', executionState: 'NEEDS_YOU', onBehalfOfUserId: me.id } })

    const [row] = await listFor(me)

    expect(row.backlogCount).toBe(0)
    expect(row.viewColumns!.map(c => [c.key, c.count])).toEqual([['BACKLOG', 1], ['TODO', 1], ['IN_PROGRESS', 0], ['DONE', 0]])
    expect(row.needsYouCount).toBe(1)
  })
})
