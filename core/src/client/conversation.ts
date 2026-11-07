/**
 * A conversation as a client reads it from hq: what a message holds by kind, the views hq answers with, and the
 * arguments and answers of the operations a client calls on one (Wasp queries and actions, sent with superjson).
 * The socket events are ./conversationSocket.ts, the work and approvals ./conversationWork.ts, voice ./voice.ts.
 * Shapes are `type` aliases, not interfaces: Wasp's operation payloads must be plain object types.
 */
import type { ConversationVoiceView } from './voice.js'
import type { OperationOutcome } from './conversationWork.js'
import type { SharedFile } from '../storage/sharedFiles.js'

export type ConversationHomeValue = 'PERSON' | 'PROJECT' | 'TASK'
export type ConversationStatusValue = 'ACTIVE' | 'ARCHIVED' | 'CLOSED'
export type ConversationRoleValue = 'PERSON' | 'AGENT' | 'PLATFORM'
export type ConversationQueueStateValue = 'WAITING' | 'TAKEN' | 'CANCELLED'
export type InferenceTurnStateValue = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type OperationKindValue = 'WORKER' | 'TASK' | 'TOOL'
export type OperationStateValue =
  | 'WAITING_FOR_APPROVAL' | 'SCHEDULED' | 'ACCEPTED' | 'QUEUED' | 'RUNNING' | 'UNCERTAIN'
  | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DETACHED'

/** A page of the thread, newest first. */
export const MESSAGE_PAGE_SIZE = 50
/** The longest message a person may send, in characters. */
export const MESSAGE_MAX_CHARS = 32_000

// ── What a message holds, by kind (ConversationMessage.body, encrypted at rest) ──

/**
 * One step of a reply that looked something up: what it looked at, in a person's words, and how long it took
 * from asking the model to the step's tools being back. `ms` is absent while the step runs; `failed` when none
 * of its lookups worked. `made` is on a step that started one piece of work (`started`) or set one task to start
 * at a time (`set`): each such piece is its own step, so a screen counts them ("started 2", "set 1").
 */
export type ReplyStepView = {
  label: string
  ms?: number
  failed?: boolean
  made?: 'started' | 'set'
  /** What the step's knowledge calls did, for its detail (since 1.6): one entry per call that worked. */
  knowledge?: KnowledgeStepView[]
}

/**
 * One knowledge call of a reply's step (agent knowledge spec, part 5, C1–C3). `level` is the level's name as the
 * agent reads pages by it (`website-rebuild`, `personal`, `org`, `platform`); `owner` is whose pages it is, as hq's
 * Knowledge operations take it.
 *
 * - `knowledge_change`: a page the step created, edited, moved, deleted or restored. `versionId` is the page's
 *   version after the change (its hash, as History lists it); `previousVersionId` the kept version holding what the
 *   page was before, which *Undo* restores (absent for a page just created). `summary` is the change in one line.
 * - `knowledge_search`: the levels a search covered, in the order it answered, with each one's name as shown.
 * - `platform_page`: the platform guide's page a read used, by its name in the guide.
 */
export type KnowledgeStepView =
  | {
    kind: 'knowledge_change'
    level: string
    owner: { ownerType: 'project' | 'user' | 'org'; ownerId: string }
    page: string
    title: string
    change: 'created' | 'edited' | 'moved' | 'deleted' | 'restored'
    versionId?: string
    previousVersionId?: string
    summary: string
  }
  | { kind: 'knowledge_search'; levels: string[]; names: string[] }
  | { kind: 'platform_page'; page: string; title: string }
/** How long a reply that looked things up worked, start to end, and its steps: kept with the reply, shown on asking. */
export type ReplyThinking = { ms: number; steps: ReplyStepView[] }

/**
 * `thinking`: on a reply that took steps to look something up; a plain answer has none. `skill`: on a person's
 * message, the skill they picked with `/` for it, carried with the work the message is answered by.
 */
export type TextBody = {
  text: string; thinking?: ReplyThinking; skill?: PickedSkill
  /** Since 1.12, on a person's message: the photos and files they added, kept in the place's shared folder. */
  shared?: SharedFile[]
  /** Since 1.12: the model a turn talked on that was not given this message's pictures, by its name; the agent had the files. */
  unseenBy?: string
}
/** A quiet line from hq: an access switch, a lead taking over a task's thread. */
export type NoticeBody = { text: string }
/** A turn that failed: the partial reply it streamed, and why, in words a person can act on. */
export type FailedBody = { reason: string; partialText?: string; thinking?: ReplyThinking }
/** A compaction's marker. */
/** `segmentId` and `ledgerKept` are a compaction's: the segment the marker opens, and what the ledger kept from the span. */
export type SummarisedBody = {
  brief: string
  summary: string
  firstSeq?: number
  lastSeq?: number
  segmentId?: string
  ledgerKept?: string[]
}
/**
 * `startsAt` (ISO): a task set for a time, which setting completed — its card in the thread is drawn from this,
 * for good, and never from a live row (walkthrough finding 33).
 */
export type OperationStartedBody = { title: string; boundaryName?: string; startsAt?: string }
/**
 * A completion card: how the operation ended and what it gave. `summary` is the worker's result summary, the
 * task run's stated result, or a call's capped result as text; for a failure, why. `stated` is false when a run
 * ended without stating its result. `taskState` is the task's column after the run ("Release").
 */
export type ResultBody = {
  title: string
  summary: string
  outcome: OperationOutcome
  boundaryName?: string
  stated?: boolean
  taskState?: string
  taskId?: string
  taskKey?: string
}
/** `target.params`: what else the tool's address names to open the item, such as a memory's scope and agent. */
export type ActionBody = { text: string; toolName: string; target?: { kind: string; id: string; label: string; params?: Record<string, string> } }
export type TaskBody = { taskId: string; taskKey: string; title: string }
/**
 * A workflow version's approval card (workflows spec part 5, U4). Its summary and flags are the plain checks', never
 * the agent's words or the reviewer's; `hash` names the version shown, so an answer can approve only that. Approve
 * is offered only when `mayApprove`; otherwise only "Review all of it", with `reason` in one line. The reviewer's
 * level is shown, and never decides that.
 */
export type WorkflowApprovalCard = {
  workflowId: string
  workflow: string
  version: number
  hash: string
  summary: string
  /** Null when the reviewer gave none; `reviewNote` then says why. */
  reviewLevel: 'low' | 'look_closely' | 'high' | null
  reviewNote?: string
  flags: { rule: number; high: boolean; message: string; path?: string; line?: number }[]
  mayApprove: boolean
  reason?: string
}
/**
 * `askedBy` is the agent's name; `what` says what would run ("Run the benchmark"). `workflow` (from 1.5): the card
 * asks for a workflow version's approval.
 */
export type ApprovalRequestBody = {
  title: string; reason: string; boundaryName?: string; askedBy: string; what?: string; workflow?: WorkflowApprovalCard
}
/**
 * Written as the answering person's message; `operationId` is on the message. `transcript`: what the person said,
 * for an answer given aloud (the message is marked spoken).
 */
export type ApprovalAnswerBody = { answer: 'approve' | 'decline'; note?: string; transcript?: string }
/** A voice quiet line. On VOICE_ENDED: how long voice was on, and why it ended when the person did not end it. */
export type VoiceBody = { byUserId: string; durationSec?: number; reason?: string }

export type MessageBodyByKind = {
  TEXT: TextBody
  OPERATION_STARTED: OperationStartedBody
  ACTION: ActionBody
  TASK: TaskBody
  RESULT: ResultBody
  APPROVAL_REQUEST: ApprovalRequestBody
  APPROVAL_ANSWER: ApprovalAnswerBody
  SUMMARISED: SummarisedBody
  VOICE_STARTED: VoiceBody
  VOICE_ENDED: VoiceBody
  FAILED: FailedBody
  NOTICE: NoticeBody
}
export type ConversationMessageKindValue = keyof MessageBodyByKind

/** One message as the screen receives it, decrypted. A union over kind, so the body's shape follows the kind. */
export type ConversationMessageView = {
  [K in ConversationMessageKindValue]: {
    id: string
    seq: number
    clientMessageId: string | null
    role: ConversationRoleValue
    authorId: string | null
    agentId: string | null
    kind: K
    body: MessageBodyByKind[K]
    spoken: boolean
    interrupted: boolean
    /** Withdrawn: the person's next words joined the message it answered (voice). */
    withdrawn: boolean
    /** A reply that only asked the person to go on when they trailed off (voice, active listening). */
    encouragement: boolean
    operationId: string | null
    turnId: string | null
    queueState: ConversationQueueStateValue | null
    createdAt: string
  }
}[ConversationMessageKindValue]

// ── Views ──

/** `role` is filled where agents are offered to choose from (`getConversationAgentChoices`), for the picker's search. */
/** `voiceRefusal`, among the agents a new conversation can start with: why voice cannot start with it; null when it can. */
export type ConversationAgentView = {
  id: string; name: string; handle: string; avatarUrl: string | null; role?: string | null; voiceRefusal?: string | null
}

/** A person named in a thread once more than one has spoken. */
export type ConversationPersonView = { id: string; name: string; avatarUrl: string | null }

export type ConversationSummaryView = {
  id: string
  home: ConversationHomeValue
  projectId: string | null
  taskId: string | null
  title: string | null
  status: ConversationStatusValue
  closedReason: string | null
  agent: ConversationAgentView | null
  lastMessageAt: string
}

export type ConversationView = ConversationSummaryView & {
  openedById: string
  talkingModel: string | null
  /** A turn running now, so the screen shows the typing indicator and Stop. */
  activeTurnId: string | null
  /** Messages waiting for the running turn to end, oldest first. */
  waiting: ConversationMessageView[]
  /** When the conversation cannot be answered now — no access, the access stopped being usable — what to do. */
  accessProblem: string | null
  /** The next access the person may switch to, when the current one stopped being usable. */
  accessOffer: { label: string } | null
  canSpeak: boolean
  /** Voice in this conversation for this person. */
  voice: ConversationVoiceView
  /** Everyone who has spoken in it, for naming authors once more than one has. */
  people: ConversationPersonView[]
  /** Kept out of archiving by a person. */
  keep: boolean
}

export type ConversationPage = { messages: ConversationMessageView[]; hasMore: boolean }

// ── Operations ──

export type GetConversationsArgs = { home: 'PERSON' | 'PROJECT'; projectId?: string }
export type GetConversationArgs = { conversationId: string }
/** Newest first: `beforeSeq` pages back from there. */
export type GetConversationMessagesArgs = { conversationId: string; beforeSeq?: number; limit?: number }

export type StartConversationArgs = {
  home: 'PERSON' | 'PROJECT'
  projectId?: string
  /** Defaults to the person's primary agent; another only from the home's agents, before the first message. */
  agentId?: string
  /** The talking model picked before the first message; the policy's talking model when absent. */
  model?: string
  clientMessageId: string
  /** The first message; empty only when `voice` starts the conversation to be talked in. */
  text: string
  voice?: boolean
  /** The skill picked with `/` for the first message, by the name it is staged under (`PickedSkill`). */
  skill?: PickedSkill
}
/** `messageId`: null for a conversation started for voice, which has no message yet. */
export type StartConversationResult = { conversationId: string; messageId: string | null }

/**
 * `spoken`: the words came from speech to text in voice mode; recorded on the message for the lead, never shown.
 * `trailedOff`, on a spoken message: it ended on a long pause while the person seemed mid-thought.
 */
export type SendConversationMessageArgs = {
  conversationId: string; clientMessageId: string; text: string; spoken?: boolean; trailedOff?: boolean
  skill?: PickedSkill
  /** Since 1.12: the photos and files added to the message, each first kept with `shareConversationFile`. */
  shared?: SharedFile[]
}

/**
 * A photo or file added to a conversation's message box, kept in the conversation's own place under its shared folder
 * before the message is sent (since 1.12). `dataUrl` is the file as `data:<type>;base64,<bytes>`; what it is, is read
 * from its bytes. The answer is the file as kept, under the name it was given there.
 */
export type ShareConversationFileArgs = { conversationId: string; name: string; dataUrl: string }
export type ShareConversationFileResult = SharedFile

/**
 * The skill a person picked with `/` at the start of the message box: a structured field beside the message, never
 * rewritten text. `name` is a name staged for the agent's run; the site keeps it only when it is one.
 */
export type PickedSkill = { name: string }
/** `queued` when a turn was running and the message waits for it (or interrupted it, by the person's setting). */
export type SendConversationMessageResult = { messageId: string; seq: number; queued: boolean; duplicate: boolean }

export type ConversationIdArgs = { conversationId: string }
export type WaitingMessageArgs = { conversationId: string; messageId: string }
export type ConversationAgentChoicesArgs = { home: 'PERSON' | 'PROJECT'; projectId?: string }
export type MarkConversationReadArgs = { conversationId: string; throughSeq: number }

// ── The model picker ──

/** One model via a provider the picker offers: one the providers reach that every list applying here allows. */
export type ModelChoice = {
  /** The model via its provider: `<providerId>/<model>`, the model as that provider's vendor names it. */
  value: string
  label: string
  /** Who makes it, for grouping: "Anthropic", "DeepSeek", "OpenAI". */
  maker: string
  /** The access that reaches it, shown beside the group: "via OpenRouter", "the organisation's key". */
  via: string
  /** A rough price hint, 1 to 3 ($ to $$$). */
  price: 1 | 2 | 3
  /** The provider is not working: the choice stays listed, greyed out and marked, and cannot be picked. */
  notWorking?: boolean
  /** Since 1.12: true when the model takes images, false when it is known to read text only; absent when nobody knows. */
  images?: boolean
}

export type ModelChoices = {
  current: string | null
  /** The model this conversation would talk on if nobody picked one, which the list puts first as recommended here; absent from an older hq. */
  recommended?: ModelChoice[]
  /** The person's recently used models, newest first, at most three. */
  recent: ModelChoice[]
  /** Every model offered, grouped on screen by maker. */
  models: ModelChoice[]
}

/**
 * Before the first message, `conversationId` is absent and the home says whose access and policy apply. A model
 * policy's form says `policyScope` instead of a home: its choices are bounded only by the layer above the policy
 * being edited, and the organisation's reach through the organisation's keys alone (an org admin's to ask for).
 */
export type GetModelChoicesArgs = {
  conversationId?: string
  home?: 'PERSON' | 'PROJECT'
  projectId?: string
  policyScope?: 'org' | 'user' | 'project'
}
export type SetConversationModelArgs = { conversationId: string; model: string }
