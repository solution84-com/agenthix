/**
 * Events pushed to one person's sockets when what needs them changes. A client other than the browser reads
 * the changed thing again, so an event carries ids or counts and no more. Each goes to the person's own room
 * and nowhere else.
 */
export const PERSON_EVENTS = {
  notificationsChanged: 'notifications:changed',
  needsYouChanged: 'needsYou:changed',
  runsChanged: 'runs:changed',
} as const

export type PersonEvent = (typeof PERSON_EVENTS)[keyof typeof PERSON_EVENTS]

export type PersonEventPayload =
  | { ids?: string[] }
  | { runId: string; sessionId: string; status: string }

export const personRoom = (userId: string) => `person:${userId}`

type Emitter = { to(room: string): { emit(event: string, data: unknown): void } }

export function emitToPerson(userId: string, event: PersonEvent, payload: PersonEventPayload = {}): void {
  const io = (globalThis as { __wasp_io__?: Emitter }).__wasp_io__
  io?.to(personRoom(userId)).emit(event, payload)
}

export function emitToPeople(userIds: Iterable<string>, event: PersonEvent, payload: PersonEventPayload = {}): void {
  for (const id of new Set(userIds)) emitToPerson(id, event, payload)
}

type RoomSource = { sockets: { adapter: { rooms: Map<string, Set<string>> } } } & Emitter

/** Everyone with a socket open. Used where a change cannot be attributed to a person before it is read. */
export function connectedPeople(): string[] {
  const io = (globalThis as { __wasp_io__?: RoomSource }).__wasp_io__
  if (!io) return []
  return [...io.sockets.adapter.rooms.keys()].filter(r => r.startsWith('person:')).map(r => r.slice('person:'.length))
}

/** Notifications changed for these people; with none named, for everyone with a socket open. */
export function notificationsChanged(userIds?: Iterable<string>): void {
  emitToPeople(userIds ?? connectedPeople(), PERSON_EVENTS.notificationsChanged)
}
