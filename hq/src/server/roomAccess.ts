/**
 * Who may be in a browser's socket room, at the join and for as long as the socket stays in it.
 *
 * A socket room is a read surface like any other, and each kind is the real-time twin of a query: `session:<id>`
 * streams the run output getActivitySession serves; `task:<id>` the same output for a task run, plus its comments
 * and request decisions; `board:<id>` which of a board's tasks moved; `conversation:<id>` a conversation's
 * messages and replies; `workspace:<id>` a workspace's branches. Each room answers to the boundary that owns what
 * it carries (ADR-0041, ADR-0062).
 *
 * The join is checked when it is asked for (socket.ts and each room's own module). Access can end afterwards — a
 * person removed from a project or the organisation, their role changed, a task or project deleted — so the rooms
 * already joined are checked again: at once by the change that may end access (`leaveRoomsNoLongerAllowed`), and
 * on a sweep every `ROOM_SWEEP_MS` for anything that did not say so. A socket that may no longer read a room
 * leaves it; a person removed from the organisation is disconnected outright (`disconnectPerson`).
 */
import { prisma } from 'wasp/server'
import { canReachSessionContent, type SessionContentFields } from '../sessions/sessionEntitlement'
import { projectOfTaskOrNull, projectOfBoardOrNull } from '../projects/resourceEntitlement'
import { isProjectMember } from '../projects/membership'
import { Logger } from './utils/logger'

const logger = new Logger('roomAccess')

export const ROOM_SWEEP_MS = 60_000

export interface AgentSessionLookup {
  findUnique(args: {
    where: { id: string }
    select: { userId: true; sessionType: true; taskId: true; primaryOwnerType: true; primaryOwnerId: true }
  }): Promise<SessionContentFields | null>
}

// A room id comes from the browser: anything but a plain string is refused before
// it reaches a query, so a malformed one cannot throw and take the server down.
function isRoomId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200
}

export async function isAuthorizedForSessionRoom(
  sessionId: unknown,
  requestingUserId: string | undefined,
  agentSessionEntity: AgentSessionLookup,
): Promise<boolean> {
  if (!requestingUserId || !isRoomId(sessionId)) return false
  const session = await agentSessionEntity.findUnique({
    where: { id: sessionId },
    select: { userId: true, sessionType: true, taskId: true, primaryOwnerType: true, primaryOwnerId: true },
  })
  if (!session) return false
  return canReachSessionContent(session, requestingUserId)
}

export async function isAuthorizedForTaskRoom(taskId: unknown, requestingUserId: string | undefined): Promise<boolean> {
  if (!requestingUserId || !isRoomId(taskId)) return false
  const projectId = await projectOfTaskOrNull(taskId)
  return projectId !== null && (await isProjectMember(projectId, requestingUserId))
}

export async function isAuthorizedForBoardRoom(boardId: unknown, requestingUserId: string | undefined): Promise<boolean> {
  if (!requestingUserId || !isRoomId(boardId)) return false
  const projectId = await projectOfBoardOrNull(boardId)
  return projectId !== null && (await isProjectMember(projectId, requestingUserId))
}

/** A room's check: true to stay, false to leave. A throw is not an answer — see `stillAllowed`. */
export type RoomCheck = (id: string, userId: string) => Promise<boolean>
export type RoomChecks = ReadonlyArray<readonly [prefix: string, check: RoomCheck]>

/** A refusal that throws, as the conversation and workspace rules do, is a `false`; any other failure is rethrown. */
function refusalAsFalse(rule: (id: string, userId: string) => Promise<unknown>): RoomCheck {
  return async (id, userId) => {
    try {
      await rule(id, userId)
      return true
    } catch (err) {
      const status = (err as { statusCode?: unknown })?.statusCode
      if (typeof status === 'number' && status >= 400 && status < 500) return false
      throw err
    }
  }
}

// Loaded when first used, so a module that only reports a change in access does not pull in every room's rules.
let checks: Promise<RoomChecks> | null = null
function roomChecks(): Promise<RoomChecks> {
  checks ??= Promise.all([import('../conversations/readingRule'), import('../branches/workspaceAccess')])
    .then(([reading, workspace]): RoomChecks => [
      ['session:', (id, userId) => isAuthorizedForSessionRoom(id, userId, prisma.agentSession)],
      ['task:', isAuthorizedForTaskRoom],
      ['board:', isAuthorizedForBoardRoom],
      ['conversation:', refusalAsFalse(reading.requireConversationReader)],
      ['workspace:', refusalAsFalse((id, userId) => workspace.reachWorkspace(id, userId, 'read'))],
    ])
  return checks
}

/** The part of a socket this module uses, as `io.fetchSockets()` gives it. */
export interface RoomSocket {
  id: string
  data?: { user?: { id: string } }
  rooms: Set<string>
  leave(room: string): unknown
  disconnect(close?: boolean): unknown
}

interface SocketSource { fetchSockets(): Promise<RoomSocket[]> }

function io(): SocketSource | undefined {
  return (globalThis as { __wasp_io__?: SocketSource }).__wasp_io__
}

/**
 * Whether the socket may stay in the room: null when the check could not answer (the database or a site did not
 * reply). Such a socket stays until a check answers, so an outage does not drop every open screen; a refusal
 * always removes it.
 */
async function stillAllowed(check: RoomCheck, id: string, userId: string | undefined): Promise<boolean | null> {
  if (!userId) return false
  try {
    return await check(id, userId)
  } catch (err) {
    logger.warn(`room check could not answer for ${id}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Checks every room these sockets are in against `rules`, and takes each out of the rooms it may no longer read.
 * With `userIds`, only those people's sockets are checked. Returns the rooms left, as `socketId room` pairs.
 */
export async function revalidateSockets(sockets: RoomSocket[], rules: RoomChecks, userIds?: Iterable<string>): Promise<string[]> {
  const only = userIds ? new Set(userIds) : null
  const left: string[] = []
  for (const socket of sockets) {
    const userId = socket.data?.user?.id
    if (only && (!userId || !only.has(userId))) continue
    for (const room of [...socket.rooms]) {
      const rule = rules.find(([prefix]) => room.startsWith(prefix))
      if (!rule) continue
      if ((await stillAllowed(rule[1], room.slice(rule[0].length), userId)) === false) {
        socket.leave(room)
        left.push(`${socket.id} ${room}`)
      }
    }
  }
  return left
}

/**
 * Takes the sockets of these people — or, with none named, everyone's — out of every room they may no longer
 * read. Called after a change that may end someone's access has committed; never throws, as that change stands.
 */
export async function leaveRoomsNoLongerAllowed(userIds?: Iterable<string>): Promise<void> {
  const source = io()
  if (!source) return
  try {
    const left = await revalidateSockets(await source.fetchSockets(), await roomChecks(), userIds)
    for (const entry of left) logger.info(`left room on loss of access: ${entry}`)
  } catch (err) {
    logger.warn(`rooms not checked again: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Ends every open socket of a person who is no longer in the organisation. Never throws. */
export async function disconnectPerson(userId: string): Promise<void> {
  const source = io()
  if (!source) return
  try {
    for (const socket of await source.fetchSockets()) {
      if (socket.data?.user?.id === userId) socket.disconnect(true)
    }
  } catch (err) {
    logger.warn(`sockets of a removed person not ended: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** The sweep for a loss of access nothing reported. Started once, with the socket server; never keeps the process up. */
export function startRoomSweep(): void {
  const timer = setInterval(() => { void leaveRoomsNoLongerAllowed() }, ROOM_SWEEP_MS)
  timer.unref?.()
}
