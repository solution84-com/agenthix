/**
 * Who may join a session, task or board socket room (ADR-0041, ADR-0062,
 * @SC-278), against the real test database. A room carries what a browser
 * query serves — a chat's content is its owner's alone, a task's run output
 * and a board's moves are its project's — so joining one answers to the same
 * rule. Projects, members, tasks, boards and sessions are real rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createSession, createUser, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { isAuthorizedForTaskRoom, isAuthorizedForBoardRoom, isAuthorizedForSessionRoom } from '../socket'

let member: { id: string }
let outsider: { id: string }
let projectId: string
let taskId: string
let boardId: string

beforeEach(async () => {
  member = await createUser()
  outsider = await createUser()
  projectId = (await createProject({ accessLevel: 'PRIVATE' })).id
  await prisma.projectMember.create({ data: { projectId, userId: member.id } })
  boardId = (await prisma.board.create({ data: { name: 'b', projectId } })).id
  taskId = (await createTestTask({ data: { title: 't', projectId, number: 1, boardId, onBehalfOfUserId: member.id } })).id
})

const sessionRoom = (id: string, userId: string | undefined) => isAuthorizedForSessionRoom(id, userId, prisma.agentSession)

describe('joining a chat session room @SC-278', () => {
  it('allows its owner, and refuses anyone else — an admin included', async () => {
    const chat = await createSession({ userId: member.id, sessionType: 'chat' })
    expect(await sessionRoom(chat.id, member.id)).toBe(true)
    expect(await sessionRoom(chat.id, outsider.id)).toBe(false)
  })

  it('refuses a socket with no authenticated user, and a session that does not exist', async () => {
    const chat = await createSession({ userId: member.id, sessionType: 'chat' })
    expect(await sessionRoom(chat.id, undefined)).toBe(false)
    expect(await sessionRoom('missing', member.id)).toBe(false)
  })
})

describe('a room id that is not a plain string', () => {
  it('is refused without a query that could throw and take the server down', async () => {
    for (const bad of [undefined, null, 42, { id: 'x' }, ['x'], '', 'x'.repeat(201)]) {
      expect(await isAuthorizedForSessionRoom(bad, member.id, prisma.agentSession)).toBe(false)
      expect(await isAuthorizedForTaskRoom(bad, member.id)).toBe(false)
      expect(await isAuthorizedForBoardRoom(bad, member.id)).toBe(false)
    }
  })
})

describe('joining a task session room', () => {
  it("allows a member of the task's project and refuses someone outside it", async () => {
    const session = await createSession({ userId: outsider.id, sessionType: 'task', taskId })
    expect(await sessionRoom(session.id, member.id)).toBe(true)
    expect(await sessionRoom(session.id, outsider.id)).toBe(false)
  })

  it('allows anyone signed in to a task session with no task, or whose task was deleted', async () => {
    const session = await createSession({ userId: member.id, sessionType: 'task' })
    expect(await sessionRoom(session.id, outsider.id)).toBe(true)
  })
})

describe('joining a task room', () => {
  it("allows a member of the task's project and refuses someone outside it", async () => {
    expect(await isAuthorizedForTaskRoom(taskId, member.id)).toBe(true)
    expect(await isAuthorizedForTaskRoom(taskId, outsider.id)).toBe(false)
  })

  it('refuses a non-member when the project is open, and allows a member (adr-0099)', async () => {
    await prisma.project.update({ where: { id: projectId }, data: { accessLevel: 'OPEN' } })
    expect(await isAuthorizedForTaskRoom(taskId, outsider.id)).toBe(false)
    expect(await isAuthorizedForTaskRoom(taskId, member.id)).toBe(true)
  })

  it('refuses a socket with no authenticated user, and a task that does not exist', async () => {
    expect(await isAuthorizedForTaskRoom(taskId, undefined)).toBe(false)
    expect(await isAuthorizedForTaskRoom('missing', member.id)).toBe(false)
  })
})

describe('joining a board room', () => {
  it("allows a member of the board's project and refuses someone outside it", async () => {
    expect(await isAuthorizedForBoardRoom(boardId, member.id)).toBe(true)
    expect(await isAuthorizedForBoardRoom(boardId, outsider.id)).toBe(false)
  })

  it('refuses a socket with no authenticated user, and a board that does not exist', async () => {
    expect(await isAuthorizedForBoardRoom(boardId, undefined)).toBe(false)
    expect(await isAuthorizedForBoardRoom('missing', member.id)).toBe(false)
  })
})
