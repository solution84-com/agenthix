/**
 * hq's Socket.io server — moved from `agents/runtime/socket.ts` (plan 5d-2
 * task 10 "shed"). This is hq's own browser-facing real-time layer (dashboard
 * snapshots, task board updates, live session streaming, conversations and their voice) — it was
 * filed under `agents/runtime/` from before the hq/site split but never
 * moved with the execution runtime, since browsers only ever talk to hq
 * (AGENTS.md's "no user-facing UI" rule for site).
 */
import { WebSocketDefinition } from 'wasp/server/webSocket'
import { prisma } from 'wasp/server'
import { Logger } from './utils/logger'
import { registerClientEvents, type ClientSocket } from './clientEvents'
import { clientProtocolSocketGuard, describeClient, type ClientStated, type HandshakeSocket } from './clientProtocol'
import { addSubscriber, removeSubscriber } from './dashboard/subscriptions'
import { composeSnapshot } from './dashboard/snapshot'
import { canReachSessionContent } from '../sessions/sessionEntitlement'
import { projectOfTaskOrNull, projectOfBoardOrNull } from '../projects/resourceEntitlement'
import { isProjectMember } from '../projects/membership'
import { registerConversationRoom } from '../conversations/coordinator/socketRoom'
import { requireConversationReader } from '../conversations/readingRule'
import { registerConversationVoice } from '../conversations/voice/handlers'
import { startConversationVoice } from '../conversations/voice/service'
import type {
  ConversationDeltaEvent,
  ConversationMessageEvent,
  ConversationOperationEvent,
  ConversationOperationLinesEvent,
  ConversationReplayEvent,
  ConversationTurnEvent,
  VoiceActivityPayload,
  VoiceAudioEvent,
  VoiceEndedEvent,
  VoiceEndPayload,
  VoiceErrorEvent,
  VoiceInterruptPayload,
  VoiceSentenceEvent,
  VoiceSilenceWarningEvent,
  VoiceStartPayload,
  VoiceStateEvent,
  VoiceTurnSpokenEvent,
} from '../shared/conversations/protocol'
import type {
  ManifestPendingApprovalClientEvent, ManifestRejectedClientEvent, RunStatusClientEvent, RunStreamDeltaClientEvent,
  TaskCommentAddedClientEvent, TaskSessionStartedClientEvent, TaskUpdatedClientEvent,
} from '@agenthix/core'

const logger = new Logger('socket')

interface ServerToClientEvents {
  agentRunStatus:    (data: RunStatusClientEvent) => void
  agentStreamDelta:  (data: RunStreamDeltaClientEvent) => void
  agentToolCall:     (data: { runId: string; toolUseId: string; toolName: string; toolInput: unknown }) => void
  agentToolResult:   (data: { runId: string; toolUseId: string; output: string }) => void
  agentThinking:     (data: { runId: string; thinking: string }) => void
  agentRunNotice:    (data: { runId: string; notice: string }) => void
  taskSessionStarted: (data: TaskSessionStartedClientEvent) => void
  taskUpdated:       (data: TaskUpdatedClientEvent) => void
  // Sent as a Date, which socket.io writes as the ISO string the client's type says.
  taskCommentAdded:  (data: Omit<TaskCommentAddedClientEvent, 'createdAt'> & { createdAt: Date }) => void
  manifestPendingApproval: (data: ManifestPendingApprovalClientEvent) => void
  manifestRejected: (data: ManifestRejectedClientEvent) => void
  'dashboard:snapshot':      (snapshot: import('@agenthix/core').DashboardSnapshot) => void
  // What needs a person changed (personEvents.ts): ids or counts only; the client reads again.
  'notifications:changed':   (data: { ids?: string[] }) => void
  'needsYou:changed':        (data: { ids?: string[] }) => void
  'runs:changed':            (data: { runId: string; sessionId: string; status: string }) => void
  // A conversation's room (conversations/coordinator/): CONVERSATION_SOCKET's names.
  'conversation:message':        (data: ConversationMessageEvent) => void
  'conversation:messageUpdated': (data: ConversationMessageEvent) => void
  'conversation:delta':          (data: ConversationDeltaEvent) => void
  'conversation:replay':         (data: ConversationReplayEvent) => void
  'conversation:turn':           (data: ConversationTurnEvent) => void
  'conversation:operation':      (data: ConversationOperationEvent) => void
  'conversation:operationLines': (data: ConversationOperationLinesEvent) => void
  // Voice in a conversation (conversations/voice/): CONVERSATION_VOICE_SOCKET's names.
  'conversationVoice:state':          (data: VoiceStateEvent) => void
  'conversationVoice:sentence':       (data: VoiceSentenceEvent) => void
  'conversationVoice:audio':          (data: VoiceAudioEvent) => void
  'conversationVoice:turnSpoken':     (data: VoiceTurnSpokenEvent) => void
  'conversationVoice:silenceWarning': (data: VoiceSilenceWarningEvent) => void
  'conversationVoice:ended':          (data: VoiceEndedEvent) => void
  'conversationVoice:error':          (data: VoiceErrorEvent) => void
}

interface ClientToServerEvents {
  subscribeToSession: (sessionId: any) => void
  subscribeToTask:    (taskId: any) => void
  subscribeToBoard:   (boardId: any) => void
  'connection:ping':         (ack?: (reply: { ok: true }) => void) => void
  'hq:version':              (ack?: (reply: { ok: boolean; version?: string; built?: string }) => void) => void
  subscribeToDashboard:      () => void
  unsubscribeFromDashboard:  () => void
  subscribeToConversation:     (conversationId: unknown) => void
  unsubscribeFromConversation: (conversationId: unknown) => void
  'conversationVoice:start':     (data: VoiceStartPayload) => void
  'conversationVoice:end':       (data: VoiceEndPayload) => void
  'conversationVoice:interrupt': (data: VoiceInterruptPayload) => void
  'conversationVoice:activity':  (data: VoiceActivityPayload) => void
}

interface InterServerEvents {
  ping: () => void
}

export function emitTaskUpdated(boardId: string) {
  const io = (globalThis as any).__wasp_io__
  io?.to(`board:${boardId}`).emit('taskUpdated', { boardId })
}

interface AgentSessionLookup {
  findUnique(args: {
    where: { id: string }
    select: { userId: true; sessionType: true; taskId: true; primaryOwnerType: true; primaryOwnerId: true }
  }): Promise<{
    userId: string
    sessionType: string
    taskId: string | null
    primaryOwnerType: string | null
    primaryOwnerId: string | null
  } | null>
}

// A socket room is a read surface like any other, and every one of these three
// is the real-time twin of a query in sessions/queries.ts or
// projects/queries.ts. Joining `session:<id>` streams the run output
// (agentStreamDelta/agentThinking/agentToolCall/agentToolResult) that
// getActivitySession serves; joining `task:<id>` streams the same output again
// for a task run, plus its comments and manifest decisions, which
// getTaskRuns/getTaskComments serve; joining `board:<id>` says which board a
// task moved on, which getBoard serves. Each room therefore answers to the
// boundary that owns what it carries (ADR-0041, ADR-0062) — closing the browser
// query and leaving its room open would be no refusal at all.
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

export async function isAuthorizedForTaskRoom(
  taskId: unknown,
  requestingUserId: string | undefined,
): Promise<boolean> {
  if (!requestingUserId || !isRoomId(taskId)) return false
  const projectId = await projectOfTaskOrNull(taskId)
  return projectId !== null && (await isProjectMember(projectId, requestingUserId))
}

export async function isAuthorizedForBoardRoom(
  boardId: unknown,
  requestingUserId: string | undefined,
): Promise<boolean> {
  if (!requestingUserId || !isRoomId(boardId)) return false
  const projectId = await projectOfBoardOrNull(boardId)
  return projectId !== null && (await isProjectMember(projectId, requestingUserId))
}

// A socket listener's rejection is unhandled and ends the process: a join whose
// check fails for any reason is refused instead.
async function refuseOnError(check: () => Promise<boolean>): Promise<boolean> {
  try {
    return await check()
  } catch (err) {
    logger.warn(`room join refused: its check failed — ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

export const webSocketFn: WebSocketDefinition<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  any
> = (io, context) => {
  // Wasp's Socket.io server only allows WASP_WEB_CLIENT_URL by default.
  // Override engine CORS options before any client connects so that HQ
  // brokered sessions can open a WebSocket to this site cross-origin.
  const wsOrigins = [
    process.env.WASP_WEB_CLIENT_URL ?? 'http://localhost:3000',
    process.env.HQ_ORIGIN ?? 'http://localhost:5173',
  ].filter(Boolean) as string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(io.engine as any).opts.cors = {
    origin: wsOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization'],
  }

  ;(globalThis as any).__wasp_io__ = io

  // After Wasp's own handshake middleware: an app too far from hq's client protocol is refused (clientProtocol.ts).
  io.use((socket, next) => clientProtocolSocketGuard(socket as unknown as HandshakeSocket, next))

  // No browser is connected yet, so nobody holds voice: each holder left from before is let go, with its line.
  void startConversationVoice(logger).catch(err => logger.error('Could not let go of voice held before the restart', err))

  io.on('connection', (socket) => {
    const client = describeClient(socket.data?.client as ClientStated | undefined)
    logger.info(`Client connected: ${socket.id}${client ? ` (${client})` : ''}`)
    registerClientEvents(socket as unknown as ClientSocket)

    socket.on('subscribeToSession', async (sessionId: unknown) => {
      const roomStr = `session:${String(sessionId)}`
      const authorized = await refuseOnError(() => isAuthorizedForSessionRoom(
        sessionId,
        socket.data?.user?.id,
        context.entities.AgentSession,
      ))
      if (!authorized) {
        logger.warn(`${socket.id} denied join to ${roomStr}: not authorized for this session (ADR-0041)`)
        return
      }
      socket.join(roomStr)
      logger.info(`${socket.id} joined room ${roomStr}`)
    })

    socket.on('subscribeToTask', async (taskId: unknown) => {
      const roomStr = `task:${String(taskId)}`
      if (!(await refuseOnError(() => isAuthorizedForTaskRoom(taskId, socket.data?.user?.id)))) {
        logger.warn(`${socket.id} denied join to ${roomStr}: not a member of this task's project (ADR-0062)`)
        return
      }
      socket.join(roomStr)
      logger.info(`${socket.id} joined room ${roomStr}`)
    })

    socket.on('subscribeToBoard', async (boardId: unknown) => {
      const roomStr = `board:${String(boardId)}`
      if (!(await refuseOnError(() => isAuthorizedForBoardRoom(boardId, socket.data?.user?.id)))) {
        logger.warn(`${socket.id} denied join to ${roomStr}: not a member of this board's project (ADR-0062)`)
        return
      }
      socket.join(roomStr)
      logger.info(`${socket.id} joined room ${roomStr}`)
    })

    socket.on('subscribeToDashboard', async () => {
      const userId = (socket as any).data?.user?.id
      if (!userId) return
      addSubscriber(socket, userId)
      try {
        socket.emit('dashboard:snapshot', await composeSnapshot(prisma, userId))
      } catch {
        // initial snapshot best-effort; subsequent triggers will retry
      }
    })

    socket.on('unsubscribeFromDashboard', () => {
      removeSubscriber(socket)
    })

    socket.on('disconnect', () => {
      removeSubscriber(socket)
    })

    // The reading rule decides the join; the replay of a running turn follows it.
    registerConversationRoom(socket as unknown as Parameters<typeof registerConversationRoom>[0], requireConversationReader, logger)

    // Voice: who may take it is decided per event, against the speaking rule (conversations/voice/).
    registerConversationVoice(socket as unknown as Parameters<typeof registerConversationVoice>[0], logger)
  })
}
