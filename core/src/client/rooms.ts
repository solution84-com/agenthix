/**
 * The socket.io rooms a client joins besides a conversation's, and the task and board events hq sends in them.
 * hq refuses a join silently when the person may not read what the room carries. A conversation's room is
 * ./conversationSocket.ts; the run events in a session's and a task's rooms are ./runEvents.ts.
 */

export const ROOM_SOCKET = {
  /** Client → server, with the session's id: a task's session, or a run's. Carries the run events. */
  subscribeToSession: 'subscribeToSession',
  /** Client → server, with the task's id: its comments, its run's events and its approvals. */
  subscribeToTask: 'subscribeToTask',
  /** Client → server, with the board's id: which of its tasks moved. */
  subscribeToBoard: 'subscribeToBoard',
  /**
   * Client → server, nothing sent. hq answers it with nothing: no screen shows the dashboard it once sent.
   * @deprecated since 1.10; stops working in 3.0. Nothing replaces it.
   */
  subscribeToDashboard: 'subscribeToDashboard',
  /** @deprecated since 1.10; stops working in 3.0. Nothing replaces it. */
  unsubscribeFromDashboard: 'unsubscribeFromDashboard',
} as const

/** What a room's join sends: the session's, task's or board's id, as a plain string. */
export type RoomJoinArg = string

export const TASK_CLIENT_SOCKET = {
  /** To the board's room: a task on it changed; the client reads the board again. */
  taskUpdated: 'taskUpdated',
  /** To the task's room: a comment was added. */
  taskCommentAdded: 'taskCommentAdded',
  /** To the task's room for a task run, or the session's room for a conversation's: a person denied a run's request. */
  manifestRejected: 'manifestRejected',
} as const

export type TaskUpdatedClientEvent = { boardId: string }
/** `createdAt` is ISO: hq sends a `Date`, which socket.io writes as its ISO string. */
export type TaskCommentAddedClientEvent = {
  id: string
  taskId: string
  authorType: string
  agentId: string | null
  agentName: string | null
  agentHandle: string | null
  userId: string | null
  runId: string | null
  content: string
  createdAt: string
}
/** `taskId` for a task run's denial, `sessionId` for a conversation run's. */
export type ManifestRejectedClientEvent = { runId: string; taskId?: string; sessionId?: string; reason: string }
