/**
 * A socket that joined a room while its person could read it leaves the room once they cannot, rather than keep
 * receiving what it carries (session, task, board, conversation and workspace rooms alike). The rules themselves,
 * against the real database, are socketRooms.integration.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {}, HttpError: class extends Error {} }))

import { revalidateSockets, disconnectPerson, type RoomChecks, type RoomSocket } from '../roomAccess'

function socket(id: string, userId: string | undefined, rooms: string[]): RoomSocket & { disconnected: boolean } {
  const s = {
    id,
    data: userId ? { user: { id: userId } } : {},
    rooms: new Set([id, ...rooms]),
    disconnected: false,
    leave(room: string) { s.rooms.delete(room) },
    disconnect() { s.disconnected = true },
  }
  return s
}

/** Ana may read task t1 and conversation c1; nobody may read anything else; the board check cannot answer. */
const rules: RoomChecks = [
  ['task:', async (id, userId) => userId === 'ana' && id === 't1'],
  ['session:', async () => false],
  ['conversation:', async (id, userId) => userId === 'ana' && id === 'c1'],
  ['board:', async () => { throw new Error('database down') }],
]

describe('checking the rooms a socket has already joined', () => {
  it('takes it out of every room its person may no longer read, and leaves the rest', async () => {
    const ana = socket('s1', 'ana', ['task:t1', 'task:t2', 'session:x', 'conversation:c1', 'conversation:c2', 'person:ana'])
    const left = await revalidateSockets([ana], rules)
    expect([...ana.rooms].sort()).toEqual(['conversation:c1', 'person:ana', 's1', 'task:t1'])
    expect(left.sort()).toEqual(['s1 conversation:c2', 's1 session:x', 's1 task:t2'])
  })

  it('keeps a room whose check could not answer, until one does', async () => {
    const ana = socket('s1', 'ana', ['board:b1'])
    await revalidateSockets([ana], rules)
    expect(ana.rooms.has('board:b1')).toBe(true)
  })

  it('takes a socket with no signed-in person out of every checked room', async () => {
    const anon = socket('s2', undefined, ['task:t1', 'board:b1'])
    await revalidateSockets([anon], rules)
    expect([...anon.rooms]).toEqual(['s2'])
  })

  it('with people named, checks only their sockets', async () => {
    const ana = socket('s1', 'ana', ['task:t2'])
    const ben = socket('s3', 'ben', ['task:t1'])
    await revalidateSockets([ana, ben], rules, ['ana'])
    expect(ana.rooms.has('task:t2')).toBe(false)
    expect(ben.rooms.has('task:t1')).toBe(true)
  })
})

describe('a person removed from the organisation', () => {
  afterEach(() => { delete (globalThis as { __wasp_io__?: unknown }).__wasp_io__ })

  it('has every socket of theirs ended, and nobody else\'s', async () => {
    const mine = [socket('s1', 'ana', []), socket('s2', 'ana', [])]
    const theirs = socket('s3', 'ben', [])
    ;(globalThis as { __wasp_io__?: unknown }).__wasp_io__ = { fetchSockets: async () => [...mine, theirs] }
    await disconnectPerson('ana')
    expect(mine.map((s) => s.disconnected)).toEqual([true, true])
    expect(theirs.disconnected).toBe(false)
  })
})
