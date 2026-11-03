/**
 * hq's Socket.io server — moved from `agents/runtime/socket.ts` (plan 5d-2
 * task 10 "shed"). This is hq's own browser-facing real-time layer (task board updates, live session streaming, conversations and their voice) — it was
 * filed under `agents/runtime/` from before the hq/site split but never
 * moved with the execution runtime, since browsers only ever talk to hq
 * (AGENTS.md's "no user-facing UI" rule for site).
 */
import { WebSocketDefinition } from 'wasp/server/webSocket'
import { Logger } from './utils/logger'
import { registerClientEvents, type ClientSocket } from './clientEvents'
import { clientProtocolSocketGuard, describeClient, type ClientStated, type HandshakeSocket } from './clientProtocol'
import { isAuthorizedForSessionRoom, isAuthorizedForTaskRoom, isAuthorizedForBoardRoom, startRoomSweep } from './roomAccess'
import { WORKFLOW_RUN_SOCKET_EVENT, type WorkflowRunSocketEvent } from '../workflows/runsSocketEvent'
import { registerConversationRoom } from '../conversations/coordinator/socketRoom'
import { requireConversationReader } from '../conversations/readingRule'
import { registerConversationVoice } from '../conversations/voice/handlers'
import { startConversationVoice } from '../conversations/voice/service'
import { registerWorkspaceRoom } from '../branches/workspaceRoom'
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
  TaskCommentAddedClientEvent, TaskSessionStartedClientEvent, TaskUpdatedClientEvent, WorkspaceBranchEvent, WorkspaceMainEvent,
  WorkspaceLivePreviewEvent, WorkspaceLivePreviewReloadEvent,
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
  // What needs a person changed (personEvents.ts): ids or counts only; the client reads again.
  'notifications:changed':   (data: { ids?: string[] }) => void
  'needsYou:changed':        (data: { ids?: string[] }) => void
  'runs:changed':            (data: { runId: string; sessionId: string; status: string }) => void
  // A workflow run's step or state changed (workflows/runsLive.ts): ids and a state only; the screen reads the run.
  [WORKFLOW_RUN_SOCKET_EVENT]: (data: WorkflowRunSocketEvent) => void
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
  // A workspace's room (branches/workspaceEvents.ts): WORKSPACE_SOCKET's names.
  'workspace:branch': (data: WorkspaceBranchEvent) => void
  'workspace:main':   (data: WorkspaceMainEvent) => void
  'workspace:livePreview':       (data: WorkspaceLivePreviewEvent) => void
  'workspace:livePreviewReload': (data: WorkspaceLivePreviewReloadEvent) => void
}

interface ClientToServerEvents {
  subscribeToSession: (sessionId: any) => void
  subscribeToTask:    (taskId: any) => void
  subscribeToBoard:   (boardId: any) => void
  'connection:ping':         (ack?: (reply: { ok: true }) => void) => void
  'hq:version':              (ack?: (reply: { ok: boolean; version?: string; built?: string }) => void) => void
  subscribeToConversation:     (conversationId: unknown, answer?: (joined: boolean) => void) => void
  unsubscribeFromConversation: (conversationId: unknown) => void
  'conversationVoice:start':     (data: VoiceStartPayload) => void
  'conversationVoice:end':       (data: VoiceEndPayload) => void
  'conversationVoice:interrupt': (data: VoiceInterruptPayload) => void
  'conversationVoice:activity':  (data: VoiceActivityPayload) => void
  subscribeToWorkspace:     (workspaceId: unknown) => void
  unsubscribeFromWorkspace: (workspaceId: unknown) => void
}

interface InterServerEvents {
  ping: () => void
}

export function emitTaskUpdated(boardId: string) {
  const io = (globalThis as any).__wasp_io__
  io?.to(`board:${boardId}`).emit('taskUpdated', { boardId })
}

// Who may join a session, task or board room, and stay in one, is roomAccess.ts's.
export { isAuthorizedForSessionRoom, isAuthorizedForTaskRoom, isAuthorizedForBoardRoom } from './roomAccess'

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

  // A room joined is checked again while the socket stays in it (roomAccess.ts).
  startRoomSweep()

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

    // The reading rule decides the join; the replay of a running turn follows it.
    registerConversationRoom(socket as unknown as Parameters<typeof registerConversationRoom>[0], requireConversationReader, logger)

    // Voice: who may take it is decided per event, against the speaking rule (conversations/voice/).
    registerConversationVoice(socket as unknown as Parameters<typeof registerConversationVoice>[0], logger)

    // A workspace's branches and main: who may join is the workspace's read rule (branches/workspaceAccess.ts).
    registerWorkspaceRoom(socket as unknown as Parameters<typeof registerWorkspaceRoom>[0], logger)
  })
}
