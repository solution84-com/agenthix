import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const slide = vi.hoisted(() => vi.fn().mockResolvedValue(true))
vi.mock('../../mobile/deviceSessions', async () => ({
  ...(await vi.importActual<object>('../../mobile/deviceSessions')),
  slidePhoneSession: slide,
}))
vi.mock('wasp/server', () => ({ prisma: {} }))

import { registerClientEvents, CLIENT_EVENTS, type ClientSocket } from '../clientEvents'
import { BUILD_INFO } from '../buildInfo'
import { emitToPerson, notificationsChanged, connectedPeople, PERSON_EVENTS } from '../personEvents'

function fakeSocket(userId?: string, token?: string) {
  const listeners = new Map<string, (...a: any[]) => void>()
  const joined: string[] = []
  const socket: ClientSocket = {
    data: userId ? { user: { id: userId } } : {},
    handshake: { auth: token ? { token } : {} },
    join: (r: string) => { joined.push(r) },
    on: (e: string, l: (...a: any[]) => void) => { listeners.set(e, l) },
  }
  return { socket, listeners, joined }
}

beforeEach(() => slide.mockClear())

describe('liveness and version @SC-1102', () => {
  it('acknowledges a ping at once', () => {
    const { socket, listeners } = fakeSocket('u1')
    registerClientEvents(socket)
    const ack = vi.fn()
    listeners.get(CLIENT_EVENTS.ping)!(ack)
    expect(ack).toHaveBeenCalledWith({ ok: true })
  })

  it('ignores a ping with no callback', () => {
    const { socket, listeners } = fakeSocket('u1')
    registerClientEvents(socket)
    expect(() => listeners.get(CLIENT_EVENTS.ping)!()).not.toThrow()
  })

  it('tells a signed-in client the version, and a socket with no person nothing', () => {
    const a = fakeSocket('u1'); registerClientEvents(a.socket)
    const ackIn = vi.fn(); a.listeners.get(CLIENT_EVENTS.version)!(ackIn)
    expect(ackIn).toHaveBeenCalledWith({ ok: true, ...BUILD_INFO })
    const b = fakeSocket(); registerClientEvents(b.socket)
    const ackOut = vi.fn(); b.listeners.get(CLIENT_EVENTS.version)!(ackOut)
    expect(ackOut).toHaveBeenCalledWith({ ok: false })
  })
})

describe('rooms and renewal on connect @SC-1102', () => {
  it("joins the person's own room and its session's, and renews the session", () => {
    const { socket, joined } = fakeSocket('u1', 'sess-1')
    registerClientEvents(socket)
    expect(joined).toEqual(['person:u1', 'device:sess-1'])
    expect(slide).toHaveBeenCalledWith('sess-1')
  })

  it('joins nothing for a socket with no person', () => {
    const { socket, joined } = fakeSocket(undefined, 'sess-1')
    registerClientEvents(socket)
    expect(joined).toEqual([])
    expect(slide).not.toHaveBeenCalled()
  })
})

describe('events to one person @SC-1103', () => {
  const emit = vi.fn()
  const to = vi.fn(() => ({ emit }))
  beforeEach(() => {
    emit.mockClear(); to.mockClear()
    ;(globalThis as any).__wasp_io__ = { to, sockets: { adapter: { rooms: new Map([['person:a', new Set(['x'])], ['person:b', new Set(['y'])], ['session:z', new Set(['x'])]]) } } }
  })
  afterEach(() => { delete (globalThis as any).__wasp_io__ })

  it("goes to that person's room only", () => {
    emitToPerson('a', PERSON_EVENTS.runsChanged, { runId: 'r', sessionId: 's', status: 'RUNNING' })
    expect(to).toHaveBeenCalledTimes(1)
    expect(to).toHaveBeenCalledWith('person:a')
    expect(emit).toHaveBeenCalledWith('runs:changed', { runId: 'r', sessionId: 's', status: 'RUNNING' })
  })

  it('names only people with a socket open when no one is named', () => {
    expect(connectedPeople().sort()).toEqual(['a', 'b'])
    notificationsChanged()
    expect(to.mock.calls.map(c => (c as unknown[])[0]).sort()).toEqual(['person:a', 'person:b'])
    expect(emit).toHaveBeenCalledWith('notifications:changed', {})
  })

  it('tells each named person once', () => {
    notificationsChanged(['a', 'a'])
    expect(to).toHaveBeenCalledTimes(1)
  })
})
