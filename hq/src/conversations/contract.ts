/**
 * The seams between the conversation layer's parts on hq's server (conversational experience, phase 1). Each
 * part implements its side in its own module and exports a function of the type named here; the coordinator
 * is written against these types alone. Nothing outside src/conversations/model/ names a provider's SDK.
 */
import type { z } from 'zod'
import type { CapabilityEffectivePermissions, FoldedName, KnowledgeStepView, ToolArea } from '@agenthix/core'
import type { OrgRole } from '../server/identity/rolePolicy'
import type { CallCosting } from '../billing/types'
import type {
  ConversationHomeValue,
  ConversationMessageKindValue,
  ConversationMessageView,
  ConversationQueueStateValue,
  ConversationRoleValue,
  MessageBodyByKind,
  OperationResult,
} from '../shared/conversations/protocol'

export type ModelProvider = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'openai_compatible' | 'inworld'

/** The fields of a conversation every part reads to decide who it is for. */
export interface ConversationHomeRef {
  id: string
  home: ConversationHomeValue
  projectId: string | null
  taskId: string | null
  openedById: string
  agentId: string | null
}

// ── The record (src/conversations/store/) ──

export interface AppendMessageInput<K extends ConversationMessageKindValue = ConversationMessageKindValue> {
  conversationId: string
  role: ConversationRoleValue
  kind: K
  body: MessageBodyByKind[K]
  authorId?: string | null
  agentId?: string | null
  /** A person's message: the client's id, so admitting it twice stores it once. */
  clientMessageId?: string | null
  operationId?: string | null
  turnId?: string | null
  queueState?: ConversationQueueStateValue | null
  spoken?: boolean
  /** A reply that only asks the person to go on (voice, active listening). */
  encouragement?: boolean
}

/**
 * Stores one message at the conversation's next seq, its body encrypted, and moves lastMessageAt. A repeat of a
 * clientMessageId returns the message already stored, with `duplicate` true.
 */
export type AppendMessage = (input: AppendMessageInput) => Promise<{ message: ConversationMessageView; duplicate: boolean }>
export type ReadMessages = (conversationId: string, page: { beforeSeq?: number; limit: number }) => Promise<ConversationMessageView[]>
export type UpdateMessage = (
  messageId: string,
  patch: { queueState?: ConversationQueueStateValue | null; turnId?: string | null; interrupted?: boolean; withdrawn?: boolean },
) => Promise<ConversationMessageView>

/** The reading rule: throws HttpError 404 when the person may not read it, 409 when they may read and not speak. */
export type RequireConversationReader = (conversationId: string, userId: string) => Promise<ConversationHomeRef>
export type RequireConversationSpeaker = (conversationId: string, userId: string) => Promise<ConversationHomeRef>

// ── The model a conversation talks on (src/conversations/access/, on src/routing/) ──

/** A resolved model via a provider, with the key hq's own call presents (routing/reaching.ts). */
export interface ResolvedAccess {
  providerId: string
  /** The provider as it is named now. */
  providerName: string
  /** The provider's vendor, which picks the SDK. */
  provider: ModelProvider
  /** The model as the vendor names it. */
  model: string
  apiKey: string
  /** For an openai_compatible provider. */
  baseUrl?: string
  /** Who each call's cost belongs to and on what basis, from the resolution: the ledger's row (billing/). */
  costing?: CallCosting
}

/** What a conversation stopped on is offered instead: one model via a provider, with its one-line label. */
export interface ModelOffer { providerId: string; model: string; label: string }

/**
 * The model a conversation's turn talks on (models from one place, part 4), resolved for the person acting: the
 * model fixed to it, or with none yet, the agent's default, else the organisation's. A fixed model that cannot be
 * used now is never switched silently: `access` is null, `problem` says why, and `offer` is the one switch the
 * person may take (talkingModel.ts). `notice` is the line to record once, when the first turn fixes a model other
 * than the default it would have had.
 */
export type ResolveConversationAccess = (
  conversation: ConversationHomeRef,
  actingUserId: string | null,
) => Promise<{ access: ResolvedAccess | null; problem: string | null; offer: ModelOffer | null; notice?: string }>

// ── The model (src/conversations/model/) ──

export interface LeadToolCall { id: string; name: string; input: unknown }

/** A photo or file a person's message carries, as the lead's context names it: its message, its name in the shared folder. */
export interface LeadShared { messageId: string; name: string; kind: 'image' | 'file' }
/** A picture given to the model beside the words, read from the place's shared folder for this turn. */
export interface LeadImage { mediaType: string; data: Uint8Array }

export type LeadMessage =
  | { role: 'user'; content: string; shared?: LeadShared[]; images?: LeadImage[] }
  | { role: 'assistant'; content: string; toolCalls?: LeadToolCall[] }
  | { role: 'tool'; toolCallId: string; toolName: string; result: unknown }

/** One piece of the system prompt; `cacheAfter` puts a cache breakpoint after it, where the provider has them. */
export interface PromptPart { text: string; cacheAfter?: boolean }

export interface LeadToolDefinition { name: string; description: string; input: z.ZodType }

/** A tool a turn may use, with its area: what the tool search and the area lines read (tools/foldedTools.ts). */
export interface OfferedTool extends LeadToolDefinition { area: ToolArea }

export interface LeadRequest {
  access: ResolvedAccess
  system: PromptPart[]
  messages: LeadMessage[]
  /** Index into `messages` after which a cache breakpoint goes; none when absent. */
  cacheAfterMessage?: number
  tools: LeadToolDefinition[]
  /**
   * Which tools the step may call: any (absent), or none — words only. The tools are still sent, since a provider
   * refuses tool calls in the messages without them.
   */
  toolChoice?: 'none'
  /** One per conversation, for providers that route caching by a key. */
  cacheKey: string
  maxOutputTokens?: number
  /** The reply is spoken aloud as it is written: the model reasons as little as it can, to answer sooner. */
  spoken?: boolean
  /**
   * The first step of the reply to a spoken message (the voice turn block): reasoning off, or at its lowest where the
   * provider cannot turn it off, beyond what `spoken` asks (model/anthropicThinking.ts).
   */
  firstSpokenStep?: boolean
  signal: AbortSignal
}

export interface TurnUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }

export type LeadStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; call: LeadToolCall }
  | { type: 'finish'; reason: 'stop' | 'tool-calls' | 'length' | 'other'; usage: TurnUsage }

export type ModelErrorKind = 'auth' | 'rate-limit' | 'quota' | 'unavailable' | 'invalid' | 'request' | 'cancelled' | 'other'

/** A failed model call, with the reason a person reads on the failed turn's card. */
export class ModelCallError extends Error {
  constructor(readonly kind: ModelErrorKind, readonly reasonForPerson: string, options?: { cause?: unknown }) {
    super(reasonForPerson, options)
    this.name = 'ModelCallError'
  }
}

export interface ModelAdapter {
  /** One model step, streamed. A tool call ends the step; the coordinator runs it and calls again. Throws ModelCallError. */
  stream(request: LeadRequest): AsyncIterable<LeadStreamEvent>
  /** One step, whole: the summariser's call. */
  complete(request: Omit<LeadRequest, 'tools'>): Promise<{ text: string; usage: TurnUsage }>
}

// ── The turn's authority and its tools (src/conversations/tools/) ──

/**
 * The authority one turn acts with (adr-0082): minted per turn for the author it answers — that person's
 * membership and tool permissions — or, for a report turn (actingUserId null), the home's reading authority.
 * Never stored; dies with the turn.
 */
export interface TurnCapability {
  conversationId: string
  turnId: string
  agentId: string
  home: ConversationHomeValue
  projectId: string | null
  taskId: string | null
  actingUserId: string | null
  /**
   * For a turn that answers no one: the person whose reading authority it reads with — the one who opened a
   * personal or project conversation, who alone may read it. Null in a task's thread, which has no one reader.
   */
  readerUserId?: string | null
  /** What the turn answers: a report turn is offered no tools; a continuation acts as the person who authorised it. */
  trigger?: 'MESSAGE' | 'REPORT' | 'CONTINUATION'
  /** For a continuation turn: how deep its sequence already is (the obligation it carries out). */
  continuationDepth?: number
  role: OrgRole | null
  permissions: CapabilityEffectivePermissions
  expiresAt: number
}

export type MintTurnCapability = (input: {
  conversation: ConversationHomeRef
  turnId: string
  agentId: string
  actingUserId: string | null
  /** What the turn answers; MESSAGE when absent. */
  trigger?: TurnCapability['trigger']
  /** For a continuation turn: the depth of the obligation it carries out. */
  continuationDepth?: number
}) => Promise<TurnCapability>

/**
 * What a tool call gave the lead. `done` results are already capped (RESULT_CAP_CHARS). `knowledge`: what a knowledge
 * call did, which its work step keeps for the screen; never shown to the model.
 */
export type ToolCallOutcome =
  | { status: 'done'; operationId: string; result: unknown; knowledge?: KnowledgeStepView }
  | { status: 'accepted'; operationId: string }
  | { status: 'waitingApproval'; operationId: string }
  | { status: 'refused'; reason: string }

/** Where a detached call's end is reported, so the coordinator can take it in after the turn. */
export interface MailboxSink {
  operationSettled(conversationId: string, operationId: string): void
}

export interface ToolAdapter {
  /** The tools the lead may call in this turn, under its capability. */
  toolsFor(capability: TurnCapability): Promise<LeadToolDefinition[]>
  /** The tools the turn finds by search rather than is shown, by name and area, for the area lines; none when absent. */
  foldedFor?(capability: TurnCapability): Promise<FoldedName[]>
  /**
   * Runs one call: creates its Operation row first, waits up to `waitLimitMs` for a foreground tool, and past
   * that detaches the same call, which carries on and reports to `mailbox` when it ends.
   */
  call(
    capability: TurnCapability,
    call: LeadToolCall,
    options: { waitLimitMs: number; signal: AbortSignal; mailbox: MailboxSink },
  ): Promise<ToolCallOutcome>
  /**
   * Whether this call only reads and runs as asked, without a person's approval: such calls in one step run side by
   * side. Anything else, or every call when absent, runs on its own.
   */
  readsOnly?(capability: TurnCapability, call: LeadToolCall): boolean
}

// ── Work and results (phase 2: src/conversations/work/) ──

/** A boundary the person and the agent share: the person's own space, or a project both belong to. */
export interface SharedBoundary {
  /** What the lead passes as `boundary`: "personal", or the project's key. */
  key: string
  type: 'user' | 'project'
  id: string
  /** "your space", or the project's name. */
  name: string
}

/**
 * The three admission checks, as they stand now (conversation layer spec, Commissioning outside the place): the
 * person is a member of the boundary; the agent is assigned there; the tool is allowed there for them. `reason`
 * is the lead's words to say ("you're not a member of Finance").
 */
export type AdmitToBoundary = (input: {
  personId: string
  agentId: string
  boundary: SharedBoundary
  /** The tool or tool group being admitted: 'start_work' for a brief, the tool's name for a task tool. */
  tool: string
  /**
   * Set when new work is started from a conversation: the boundary must be one of its places (adr-0152). Left out
   * when re-checking work already started there, which carries on after its place is removed.
   */
  conversationId?: string
}) => Promise<{ ok: true } | { ok: false; reason: string }>

/** How an operation ended. A conditional update from any outstanding state: a repeat is a no-op. */
export interface OperationEnd {
  state: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DETACHED'
  result?: OperationResult
  /** For FAILED: why, in words a person can act on. */
  error?: string
  /** No report turn for it: the person stopped it. */
  noReport?: boolean
}

/** Ends an operation once and tells the mailbox. Returns false when it had already ended (a duplicate event). */
export type SettleOperation = (operationId: string, end: OperationEnd) => Promise<boolean>

/**
 * Where the work's events land (conversation layer spec, A completion while a reply streams). Each writes the
 * card into the record, wakes an archived conversation, and schedules the conversation, whose next turn after
 * any waiting messages is one report (or continuation) turn over every card awaiting it. Each is idempotent.
 */
export interface Mailbox extends MailboxSink {
  /** The operation ended (settleOperation calls this): a RESULT card, a report turn unless noReport or closed, a notification. */
  operationEnded(operationId: string): Promise<void>
  /** A worker's run, or a task run commissioned here, asks for approval: an APPROVAL_REQUEST card awaiting a turn. */
  approvalRequested(operationId: string, request: { runId: string; reason: string; what: string }): Promise<void>
}

/**
 * The service that owns one kind of operation (WORKER: work/workers, TASK: work/tasks, TOOL: work/toolCalls).
 * Stop and the approval answer go through it, after the caller has checked the person may.
 */
export interface OperationOwner {
  /** Stops it at its owner: a worker's run is stopped, a task operation detached, a call's result abandoned. */
  cancel(operationId: string, byUserId: string): Promise<void>
  /** Carries out an answer already admitted: on approve the work goes on; on decline it is told, or cancelled. */
  answerApproval(operationId: string, answer: 'approve' | 'decline', note: string | null, byUserId: string): Promise<void>
}

/**
 * A tool only a conversation's lead has (start_work, answer_approval, cancel_operation), or a turn's own version of
 * a control-plane tool that becomes operation-returning in a conversation (run_task, create_task). Looked up
 * before the control plane's tools, by name. It creates and settles its own Operation rows.
 */
/** What part of the work a tool belongs to (core's `ToolArea`): never sent to the model. */
export type { ToolArea }

export interface ConversationTool {
  name: string
  /** Every tool the registry offers has one (work/registry.ts); optional only for the live preview's, given its area there. */
  area?: ToolArea
  /** The tool's description for this turn: start_work lists the boundaries the person and the agent share. */
  describe(capability: TurnCapability): Promise<string>
  input: z.ZodType
  /** Whether this turn may be offered it at all (the group it belongs to, the turn's trigger). */
  offered(capability: TurnCapability): Promise<boolean>
  run(capability: TurnCapability, input: unknown, options: { signal: AbortSignal }): Promise<ToolCallOutcome>
}

// ── Long conversations (phase 4: src/conversations/long/) ──

/** The model's context window in tokens, for the marks; a conservative default for a model not known. */
export type ContextWindowOf = (model: string) => number

/**
 * The ledger (long conversations spec, The ledger): what must survive any compaction, kept from events and by the
 * lead's own tool; bounded when written as the compaction block's head.
 */
export interface LedgerKeeper {
  record(conversationId: string, entry: { kind: import('../shared/conversations/protocol').LedgerEntryKind; text: string; operationId?: string; sourceSeq?: number }): Promise<void>
  /** An operation ended: its entry trimmed to one line. */
  closeOperation(conversationId: string, operationId: string, line: string): Promise<void>
  head(conversationId: string): Promise<import('../shared/conversations/protocol').LedgerEntry[]>
}

/**
 * Compaction in segments: only at the start of a turn, before its first model call, or on *Summarise now*. One
 * summariser call on the talking model; the segment written once; a SUMMARISED message in the record.
 */
export interface Compactor {
  /** Whether the context the last turn sent passed the high mark of the model's window. */
  due(conversationId: string, model: string): Promise<boolean>
  compact(conversationId: string, access: ResolvedAccess, reason: 'marks' | 'person'): Promise<{ segmentId: string } | null>
}
