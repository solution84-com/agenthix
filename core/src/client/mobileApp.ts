/**
 * What the mobile app relies on of hq: each HTTP path it calls outside the operations, each operation (Wasp's
 * `POST /operations/<kebab-name>`, superjson) with what it sends and what it gets back, and each socket.io room and
 * event, in each direction, with what the event carries. hq's tests check that hq still has every one of them, and
 * the client protocol's committed snapshot is to be made from these declarations. Removing one, or changing what it
 * carries, is a change to the client protocol, and its version says so. Every operation's argument and result is
 * declared: a test fails while one is `unknown` or `any`.
 */
import type {
  ConversationAgentChoicesArgs, ConversationAgentView, ConversationIdArgs, ConversationPage, ConversationSummaryView,
  ConversationView, GetConversationArgs, GetConversationMessagesArgs, GetConversationsArgs, GetModelChoicesArgs,
  MarkConversationReadArgs, ModelChoices, SendConversationMessageArgs, SendConversationMessageResult,
  SetConversationModelArgs, StartConversationArgs, StartConversationResult, WaitingMessageArgs,
} from './conversation.js'
import type { AnswerApprovalArgs, ConversationActivity, GetConversationActivityArgs } from './conversationWork.js'
import {
  CONVERSATION_SOCKET as C,
  type ConversationDeltaEvent, type ConversationMessageEvent, type ConversationOperationEvent,
  type ConversationOperationLinesEvent, type ConversationReplayEvent, type ConversationRoomArg,
  type ConversationStepsEvent, type ConversationTurnEvent,
} from './conversationSocket.js'
import {
  CONVERSATION_VOICE_SOCKET as V,
  type SpeechToken, type VoiceActivityPayload, type VoiceAudioEvent, type VoiceContinuePayload, type VoiceEndedEvent,
  type VoiceEndPayload, type VoiceErrorEvent, type VoiceInterruptPayload, type VoiceInvitePayload, type VoicePhraseEvent,
  type VoiceSentenceEvent, type VoiceServices, type VoiceSilenceWarningEvent, type VoiceStartPayload,
  type VoiceStateEvent, type VoiceTurnSpokenEvent, type VoiceUpdateEvent,
} from './voice.js'
import {
  RUN_CLIENT_SOCKET as R,
  type ManifestPendingApprovalClientEvent, type RunStatusClientEvent, type RunStreamDeltaClientEvent,
  type TaskSessionStartedClientEvent,
} from './runEvents.js'
import {
  ROOM_SOCKET as Room, TASK_CLIENT_SOCKET as T,
  type ManifestRejectedClientEvent, type RoomJoinArg, type TaskCommentAddedClientEvent, type TaskUpdatedClientEvent,
} from './rooms.js'
import type {
  ApproveManifestArgs, GetRunDetailArgs, GetSessionPendingManifestArgs, GetToolCallLogArgs, GetToolCallOutputArgs,
  ManifestAnswerResult, MyRun, PendingManifestView, RejectManifestArgs, RunDetail, RunsPageArgs, RunsPageResult,
  ToolCallOutput, ToolCallView,
} from './runs.js'
import type { AgentListItem } from './agents.js'
import type {
  ExchangeMobileAuthTokenArgs, ExchangeMobileAuthTokenResult, MarkNotificationsReadArgs, RemovePersonPictureArgs,
  RemovePersonPictureResult, SetMyTimezoneArgs, SetPersonNameArgs, SetPersonNameResult, SyncBrowserTimezoneArgs,
  UploadPersonPictureArgs, UploadPersonPictureResult, UserSettingsView,
} from './people.js'
import type {
  HomeSignals, HomeSignalsArgs, NotificationItem, OrgIdentity, PinArgs, PinnedItem, ProjectCardsView,
} from './workplace.js'
import type { ProjectDetail, ProjectIdArgs, ProjectKeyArgs, ProjectListItem } from './projects.js'
import type {
  BoardAcrossProjects, BoardFields, BoardSummary, BoardView, GetBoardArgs, ProjectBoardsArgs,
} from './boards.js'
import type {
  AddTaskCommentArgs, CreateTaskArgs, GetTaskByKeyArgs, GetTasksArgs, MoveTaskToBoardArgs, MoveTaskToColumnArgs,
  ProjectTaskListItem, StopResult, StopTaskSessionArgs, TaskByKey, TaskCommentListItem, TaskCommentView, TaskFields,
  TaskIdArgs, TaskListItem,
} from './tasks.js'
import type { TaskSessionView } from './taskSession.js'

// ── HTTP outside the operations ──

export type ClientHttpRoute = { method: 'GET' | 'POST'; path: string }

/**
 * Wasp's own username-and-password sign-in, sign-out and session (`/auth/…`), the organisation and hq's versions
 * before sign-in (`PublicIdentityAnswer`), and changing one's password.
 */
export const MOBILE_HTTP_ROUTES = [
  { method: 'POST', path: '/auth/username/login' },
  { method: 'GET', path: '/auth/me' },
  { method: 'POST', path: '/auth/logout' },
  { method: 'GET', path: '/api/org/public-identity' },
  { method: 'POST', path: '/api/auth/change-password' },
] as const satisfies readonly ClientHttpRoute[]

// ── Operations ──


type Query<A, R> = { kind: 'query'; args: A; result: R }
type Action<A, R> = { kind: 'action'; args: A; result: R }

export type MobileOperations = {
  // Conversations
  getConversations: Query<GetConversationsArgs, ConversationSummaryView[]>
  getConversation: Query<GetConversationArgs, ConversationView>
  getConversationMessages: Query<GetConversationMessagesArgs, ConversationPage>
  getConversationActivity: Query<GetConversationActivityArgs, ConversationActivity>
  getConversationAgentChoices: Query<ConversationAgentChoicesArgs, ConversationAgentView[]>
  getModelChoices: Query<GetModelChoicesArgs, ModelChoices>
  startConversation: Action<StartConversationArgs, StartConversationResult>
  sendConversationMessage: Action<SendConversationMessageArgs, SendConversationMessageResult>
  stopConversationTurn: Action<ConversationIdArgs, void>
  answerConversationApproval: Action<AnswerApprovalArgs, SendConversationMessageResult>
  sendWaitingConversationMessageNow: Action<WaitingMessageArgs, void>
  cancelWaitingConversationMessage: Action<WaitingMessageArgs, void>
  setConversationModel: Action<SetConversationModelArgs, void>
  markConversationRead: Action<MarkConversationReadArgs, void>
  // Work
  getProjects: Query<void, ProjectListItem[]>
  getProject: Query<ProjectIdArgs, ProjectDetail>
  getProjectByKey: Query<ProjectKeyArgs, ProjectDetail>
  getProjectCards: Query<void, ProjectCardsView>
  getProjectBoards: Query<ProjectBoardsArgs, BoardSummary[]>
  getBoards: Query<ProjectBoardsArgs, BoardFields[]>
  getAllBoards: Query<void, BoardAcrossProjects[]>
  getBoard: Query<GetBoardArgs, BoardView>
  getTasks: Query<GetTasksArgs, ProjectTaskListItem[]>
  getMyTasks: Query<void, TaskListItem[]>
  getTask: Query<TaskIdArgs, TaskListItem | null>
  getTaskByKey: Query<GetTaskByKeyArgs, TaskByKey>
  getTaskComments: Query<TaskIdArgs, TaskCommentListItem[]>
  addTaskComment: Action<AddTaskCommentArgs, TaskCommentView>
  createTask: Action<CreateTaskArgs, TaskFields>
  moveTaskToColumn: Action<MoveTaskToColumnArgs, TaskFields>
  moveTaskToBoard: Action<MoveTaskToBoardArgs, TaskFields>
  getTaskSession: Query<TaskIdArgs, TaskSessionView | null>
  stopTask: Action<TaskIdArgs, StopResult>
  stopTaskSession: Action<StopTaskSessionArgs, StopResult>
  // Runs and approvals
  getMyRuns: Query<void, MyRun[]>
  getMyRunsGoingCount: Query<void, number>
  getRunsPage: Query<RunsPageArgs | undefined, RunsPageResult>
  getRunDetail: Query<GetRunDetailArgs, RunDetail | null>
  getToolCallLog: Query<GetToolCallLogArgs, ToolCallView[]>
  getToolCallOutput: Query<GetToolCallOutputArgs, ToolCallOutput | null>
  getSessionPendingManifest: Query<GetSessionPendingManifestArgs, PendingManifestView | null>
  approveManifest: Action<ApproveManifestArgs, ManifestAnswerResult>
  rejectManifest: Action<RejectManifestArgs, ManifestAnswerResult>
  // The rest
  getHomeSignals: Query<HomeSignalsArgs, HomeSignals>
  getNotifications: Query<void, NotificationItem[]>
  markNotificationsRead: Action<MarkNotificationsReadArgs | undefined, void>
  getPins: Query<void, PinnedItem[]>
  pinItem: Action<PinArgs, void>
  unpinItem: Action<PinArgs, void>
  getAgents: Query<void, AgentListItem[]>
  getUserSettings: Query<void, UserSettingsView>
  getOrgIdentity: Query<void, OrgIdentity>
  setPersonName: Action<SetPersonNameArgs, SetPersonNameResult>
  setMyTimezone: Action<SetMyTimezoneArgs, void>
  syncBrowserTimezone: Action<SyncBrowserTimezoneArgs, void>
  uploadPersonPicture: Action<UploadPersonPictureArgs, UploadPersonPictureResult>
  removePersonPicture: Action<RemovePersonPictureArgs, RemovePersonPictureResult>
  getVoiceServices: Query<void, VoiceServices>
  getSpeechToken: Action<void, SpeechToken>
  /** Pairing by QR code: the code's token for a session. */
  exchangeMobileAuthToken: Action<ExchangeMobileAuthTokenArgs, ExchangeMobileAuthTokenResult>
}

export type MobileOperationName = keyof MobileOperations

/** Each operation the mobile app calls, and whether hq declares it a query or an action. */
export const MOBILE_OPERATIONS: { readonly [K in MobileOperationName]: MobileOperations[K]['kind'] } = {
  getConversations: 'query', getConversation: 'query', getConversationMessages: 'query',
  getConversationActivity: 'query', getConversationAgentChoices: 'query', getModelChoices: 'query',
  startConversation: 'action', sendConversationMessage: 'action', stopConversationTurn: 'action',
  answerConversationApproval: 'action', sendWaitingConversationMessageNow: 'action',
  cancelWaitingConversationMessage: 'action', setConversationModel: 'action', markConversationRead: 'action',
  getProjects: 'query', getProject: 'query', getProjectByKey: 'query', getProjectCards: 'query',
  getProjectBoards: 'query', getBoards: 'query', getAllBoards: 'query', getBoard: 'query', getTasks: 'query',
  getMyTasks: 'query', getTask: 'query', getTaskByKey: 'query', getTaskComments: 'query', addTaskComment: 'action',
  createTask: 'action', moveTaskToColumn: 'action', moveTaskToBoard: 'action', getTaskSession: 'query',
  stopTask: 'action', stopTaskSession: 'action',
  getMyRuns: 'query', getMyRunsGoingCount: 'query', getRunsPage: 'query', getRunDetail: 'query',
  getToolCallLog: 'query', getToolCallOutput: 'query', getSessionPendingManifest: 'query', approveManifest: 'action',
  rejectManifest: 'action',
  getHomeSignals: 'query', getNotifications: 'query', markNotificationsRead: 'action', getPins: 'query',
  pinItem: 'action', unpinItem: 'action', getAgents: 'query', getUserSettings: 'query', getOrgIdentity: 'query',
  setPersonName: 'action', setMyTimezone: 'action', syncBrowserTimezone: 'action', uploadPersonPicture: 'action',
  removePersonPicture: 'action', getVoiceServices: 'query', getSpeechToken: 'action', exchangeMobileAuthToken: 'action',
}

/** The path Wasp serves an operation at: `getMyRunsGoingCount` → `/operations/get-my-runs-going-count`. */
export function operationPath(name: string): string {
  return `/operations/${name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`
}

// ── Socket.io ──

/** What the app sends hq, by event name: joining and leaving rooms, and voice. */
export type MobileClientToHqEvents = {
  [C.subscribe]: ConversationRoomArg
  [C.unsubscribe]: ConversationRoomArg
  [Room.subscribeToTask]: RoomJoinArg
  [Room.subscribeToBoard]: RoomJoinArg
  [Room.subscribeToSession]: RoomJoinArg
  [V.start]: VoiceStartPayload
  [V.end]: VoiceEndPayload
  [V.interrupt]: VoiceInterruptPayload
  [V.activity]: VoiceActivityPayload
  [V.invite]: VoiceInvitePayload
  [V.continue]: VoiceContinuePayload
}

/** What hq sends the app, by event name: a conversation's room, voice to its holder, and the run and task events. */
export type MobileHqToClientEvents = {
  [C.delta]: ConversationDeltaEvent
  [C.message]: ConversationMessageEvent
  [C.messageUpdated]: ConversationMessageEvent
  [C.turn]: ConversationTurnEvent
  [C.steps]: ConversationStepsEvent
  [C.operation]: ConversationOperationEvent
  [C.operationLines]: ConversationOperationLinesEvent
  [C.replay]: ConversationReplayEvent
  [V.state]: VoiceStateEvent
  [V.sentence]: VoiceSentenceEvent
  [V.audio]: VoiceAudioEvent
  [V.turnSpoken]: VoiceTurnSpokenEvent
  [V.phrase]: VoicePhraseEvent
  [V.silenceWarning]: VoiceSilenceWarningEvent
  [V.ended]: VoiceEndedEvent
  [V.error]: VoiceErrorEvent
  [V.update]: VoiceUpdateEvent
  [R.runStatus]: RunStatusClientEvent
  [R.streamDelta]: RunStreamDeltaClientEvent
  [R.taskSessionStarted]: TaskSessionStartedClientEvent
  [R.manifestPendingApproval]: ManifestPendingApprovalClientEvent
  [T.taskUpdated]: TaskUpdatedClientEvent
  [T.taskCommentAdded]: TaskCommentAddedClientEvent
  [T.manifestRejected]: ManifestRejectedClientEvent
}

// Records over the maps' keys, so a name added to a map and not here, or here and not in the map, fails to compile.
const CLIENT_TO_HQ: Record<keyof MobileClientToHqEvents, true> = {
  [C.subscribe]: true, [C.unsubscribe]: true,
  [Room.subscribeToTask]: true, [Room.subscribeToBoard]: true, [Room.subscribeToSession]: true,
  [V.start]: true, [V.end]: true, [V.interrupt]: true, [V.activity]: true, [V.invite]: true, [V.continue]: true,
}
const HQ_TO_CLIENT: Record<keyof MobileHqToClientEvents, true> = {
  [C.delta]: true, [C.message]: true, [C.messageUpdated]: true, [C.turn]: true, [C.steps]: true,
  [C.operation]: true, [C.operationLines]: true, [C.replay]: true,
  [V.state]: true, [V.sentence]: true, [V.audio]: true, [V.turnSpoken]: true, [V.phrase]: true,
  [V.silenceWarning]: true, [V.ended]: true, [V.error]: true, [V.update]: true,
  [R.runStatus]: true, [R.streamDelta]: true, [R.taskSessionStarted]: true, [R.manifestPendingApproval]: true,
  [T.taskUpdated]: true, [T.taskCommentAdded]: true, [T.manifestRejected]: true,
}

export const MOBILE_CLIENT_TO_HQ_EVENTS = Object.keys(CLIENT_TO_HQ) as (keyof MobileClientToHqEvents)[]
export const MOBILE_HQ_TO_CLIENT_EVENTS = Object.keys(HQ_TO_CLIENT) as (keyof MobileHqToClientEvents)[]
