import { BUILD_INFO } from './buildInfo'
import { bearerSessionId, deviceRoom, slidePhoneSession } from '../mobile/deviceSessions'
import { personRoom } from './personEvents'
import { Logger } from './utils/logger'

const logger = new Logger('clientEvents')

export const CLIENT_EVENTS = { ping: 'connection:ping', version: 'hq:version' } as const

/** The part of a socket these events use, so they can be tested without a server. */
export type ClientSocket = {
  data?: { user?: { id: string } }
  handshake: { auth?: Record<string, unknown>; headers?: Record<string, string | string[] | undefined> }
  join(room: string): unknown
  on(event: string, listener: (...args: any[]) => void): unknown // eslint-disable-line @typescript-eslint/no-explicit-any -- Socket.IO's own listener type
}

type Ack = (reply: unknown) => void
const ackOf = (args: unknown[]): Ack | null => (typeof args[args.length - 1] === 'function' ? (args[args.length - 1] as Ack) : null)

/**
 * What a client other than the browser needs of the socket, once it has connected: a room of the person's own
 * (so events about them reach only them), the room of its session (so signing it out can close it), its phone
 * session renewed by use, a liveness check, and hq's version, both acknowledged at once.
 */
export function registerClientEvents(socket: ClientSocket): void {
  const userId = socket.data?.user?.id
  if (userId) {
    socket.join(personRoom(userId))
    const token = socket.handshake.auth?.token
    const sessionId = typeof token === 'string' ? token : bearerSessionId(String(socket.handshake.headers?.authorization ?? ''))
    if (sessionId) {
      socket.join(deviceRoom(sessionId))
      slidePhoneSession(sessionId).catch(err => logger.warn(`session not renewed: ${err instanceof Error ? err.message : String(err)}`))
    }
  }

  socket.on(CLIENT_EVENTS.ping, (...args: unknown[]) => { ackOf(args)?.({ ok: true }) })

  socket.on(CLIENT_EVENTS.version, (...args: unknown[]) => {
    const ack = ackOf(args)
    if (!ack) return
    // Behind sign-in, like the operation of the same name: a socket without a person is told nothing of the version.
    ack(userId ? { ok: true, ...BUILD_INFO } : { ok: false })
  })
}
