/**
 * One turn of the lead (conversation layer spec, Inference turn; models from one place): the model it talks on,
 * the authority it acts with, its context, then the model step by step — text streamed to the screens, a
 * step's tool calls run together through the tool adapter under the wait limit (stepTools.ts) — and one AGENT
 * message committed at its end, keeping the reply's steps (replySteps.ts). A reply that runs long carries on in
 * the background, started by hq itself (moveToBackground.ts).
 *
 * A failed turn keeps what it wrote and says why, in words a person can act on. A stopped one keeps what was
 * streamed, marked interrupted. A turn that lost the lock — recovery gave it up for dead — writes nothing.
 * The lock itself is the caller's (scheduler.ts): this runs a turn already claimed.
 */
import {
  ModelCallError,
  type AppendMessage,
  type LeadMessage,
  type MailboxSink,
  type MintTurnCapability,
  type ModelAdapter,
  type ResolveConversationAccess,
  type ResolvedAccess,
  type LedgerKeeper,
  type LeadToolCall,
  type ToolAdapter,
  type ToolCallOutcome,
  type TurnUsage,
  type UpdateMessage,
} from '../contract'
import { ControlPlaneError } from '../../server/controlplane/types'
import type { OperationStateValue, ReplyStepView } from '../../shared/conversations/protocol'
import { isEncouragement, withoutEncouragementLine } from '../../shared/conversations/shownParts'
import type { ClaimedTurn, TurnConversation } from './claim'
import type { ContextTurn, LeadContext } from './context'
import type { ConversationEvents } from './events'
import type { TurnEnd, TurnRecord } from './turnRecord'
import { turnLogLine } from './observability'
import { endsReply } from '../memory/usedMemory'
import { createStepLog, type StepCall, type StepLog, type StepNames } from './replySteps'
import { claimsStart, NO_START_CALL, onlyStartedWork, STARTS_WORK, startedLine } from './startedWords'
import { runStepTools } from './stepTools'
import {
  MOVED_TO_BACKGROUND, STOPPED_WITHOUT_ANSWER, canStartWork, moveToBackground, stepMode, toolChoiceFor, wordsNote,
  type BackgroundSources, type StepMode,
} from './moveToBackground'
import { withClock } from './clock'
import type { TurnSpeech } from '../voice/session'
import type { HeldUpdate } from '../voice/hand'
import type { CompactAtStart } from '../long/turnStart'
import { costedToTurn } from '../../billing/sources/hqCalls'
import type { TurnPictures } from './turnPictures'

export const NO_AGENT = "This conversation's agent no longer exists. Start a new conversation to keep going."
export const SOMETHING_WENT_WRONG = 'Something went wrong while writing this reply. Send your message again to retry.'

/** Why a turn's signal was aborted: Stop, a message sent with Interrupt, or the lock lost to recovery. */
export type StopReason = 'stop' | 'interrupt' | 'lost'

export interface TurnDeps {
  model: ModelAdapter
  tools: ToolAdapter
  resolveAccess: ResolveConversationAccess
  fixTalkingAccess(conversationId: string, access: ResolvedAccess): Promise<boolean>
  mint: MintTurnCapability
  context(conversation: TurnConversation, agentId: string, turn: ContextTurn): Promise<LeadContext>
  appendMessage: AppendMessage
  updateMessage: UpdateMessage
  /** Whether the thread already shows this operation as started. */
  hasOperationStarted(operationId: string): Promise<boolean>
  /** The operation's own line, from its row, and the conversation's outstanding count with it; null when it is gone. */
  operationLine(operationId: string): Promise<OperationLine | null>
  record: TurnRecord
  events: ConversationEvents
  mailbox: MailboxSink
  log(line: string): void
  logError(message: string, err: unknown): void
  now(): Date
  waitLimitMs: number
  /** Model calls in one turn at most: each tool round is one. Its last is words only. */
  maxSteps: number
  /** Steps that looked something up, after which hq moves the rest of the reply to the background. */
  moveAfterSteps: number
  /** What hq's own move reads; without it, a long reply ends in words. */
  background?: BackgroundSources
  /** The time now for the person, as the model is told it; without it, the model is told none. */
  clock?(personId: string | null): Promise<string | null>
  /** The person's timezone, for when a task set for a time starts; without it, such a time is told in UTC. */
  timezone?(personId: string): Promise<string | null>
  /** Names a step's line may show (a project's); without it, a step names none. */
  stepNames?: StepNames
  /** Names an untitled conversation from the person's first message and `reply`, on `access`; one titled is left. */
  titleConversation?(conversationId: string, access: ResolvedAccess, reply: string): Promise<void>
  /** Voice (conversations/voice/): the turn's speech, when someone is listening to it. */
  voice?: {
    begin(claimed: ClaimedTurn): TurnSpeech | null
    /** While someone holds voice, cards awaiting a turn wait for their invitation, and the agent raises its hand. */
    holdsCards?(conversationId: string): boolean
    raiseHand?(conversationId: string, update: HeldUpdate): void
  }
  /** Compaction at the marks (long/), before the context is assembled; what the summariser used counts as the turn's. */
  compactAtStart?: CompactAtStart
  /** The ledger (long/): an operation this turn started is open in it. */
  ledger?: Pick<LedgerKeeper, 'record'>
  /** The pictures the turn gives its model beside the words (turnPictures.ts); without it, the words alone. */
  pictures?(conversation: TurnConversation, access: ResolvedAccess, inputIds: readonly string[]): TurnPictures
}

export interface RunningTurn {
  claimed: ClaimedTurn
  signal: AbortSignal
  /** Everything streamed so far, after each piece: what a screen joining now is replayed. */
  onText(text: string): void
  /** The reply's steps so far, and when it began to work: what a screen joining now is replayed. */
  onSteps?(live: { from: Date; steps: ReplyStepView[] }): void
}

/** `startsAt`: when a task set for a time starts; setting it completed the operation (walkthrough finding 33). */
export interface OperationLine { title: string; state: OperationStateValue; boundaryName?: string; startsAt?: Date; outstanding: number }

/** How the turn ended, and what it said: a turn that answers no person notifies with its first line. */
export interface TurnOutcome { state: TurnEnd; error: string | null; text: string }

type ErrorKind = ModelCallError['kind'] | null

const ZERO: TurnUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }

function add(a: TurnUsage, b: TurnUsage): TurnUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  }
}

/** What the lead is told a call gave: the result itself, or the call's state in the contract's words. */
function forModel(outcome: ToolCallOutcome): unknown {
  switch (outcome.status) {
    case 'done': return outcome.result
    case 'accepted': return { operationId: outcome.operationId, status: 'accepted' }
    case 'waitingApproval': return { operationId: outcome.operationId, status: 'waitingApproval' }
    case 'refused': return { status: 'refused', reason: outcome.reason }
  }
}

/** A failure a person should read as it is; anything else is logged and told in general words. */
function reasonOf(err: unknown): string | null {
  if (err instanceof ModelCallError) return err.reasonForPerson
  if (err instanceof ControlPlaneError) return err.message
  return null
}

export async function runTurn(deps: TurnDeps, turn: RunningTurn): Promise<TurnOutcome> {
  const { claimed, signal } = turn
  const { conversation, turnId } = claimed
  const conversationId = conversation.id
  let text = ''
  let usage = ZERO
  // What the last model call sent: the context's size, which the next turn's marks read.
  let contextTokens = 0
  let firstTokenAt: Date | null = null
  let model: string | null = conversation.talkingModel
  /** The access the turn talks on, once resolved: the title is named on it too. */
  let talkedOn: ResolvedAccess | null = null
  let log: StepLog | null = null
  const speech = deps.voice?.begin(claimed) ?? null

  deps.events.turn({ conversationId, turnId, state: 'RUNNING' })

  async function commit(input: Parameters<AppendMessage>[0]) {
    const { message } = await deps.appendMessage(input)
    deps.events.message(conversationId, message)
    return message
  }

  async function end(state: TurnEnd, error: string | null, errorKind: ErrorKind = null): Promise<TurnOutcome> {
    // What the person heard, when they spoke over the reply: the record keeps only that.
    const said: { text: string; interrupted: boolean; withdrawn?: boolean } = speech?.end(state, text) ?? { text, interrupted: state === 'CANCELLED' }
    // A reply that only asks the person to go on is marked as one, its mark left out (Orchestration §5).
    const encouragement = isEncouragement(said.text)
    text = encouragement ? withoutEncouragementLine(said.text) : said.text
    if (signal.reason === 'lost') return { state: 'FAILED', error: 'lost', text }
    const at = deps.now()
    if (!(await deps.record.finish(turnId, { state, usage, contextTokens, error, errorKind, at }))) return { state, error, text }
    const agentId = conversation.agentId
    const thinking = log?.thinking()
    const kept = thinking ? { thinking } : {}
    if (state === 'FAILED') {
      await commit({ conversationId, role: 'AGENT', kind: 'FAILED', body: { reason: error!, ...(text ? { partialText: text } : {}), ...kept }, agentId, turnId })
    } else if (text || state === 'CANCELLED') {
      // A reply the person stopped before it said anything is still kept, empty and marked interrupted, so they
      // see their stop took effect (walkthrough finding 39) and what it had started stays in its record.
      const { message } = await deps.appendMessage({
        conversationId, role: 'AGENT', kind: 'TEXT', body: { text, ...kept }, agentId, turnId, ...(encouragement && { encouragement }),
      })
      const marks = { interrupted: true, ...(said.withdrawn && { withdrawn: true }) }
      deps.events.message(conversationId, said.interrupted ? await deps.updateMessage(message.id, marks) : message)
    }
    // An untitled conversation is named from its first reply, after it, so the reply never waits for it.
    if (state === 'COMPLETED' && claimed.trigger === 'MESSAGE' && text && talkedOn) {
      void deps.titleConversation?.(conversationId, talkedOn, text).catch(err => deps.logError(`Could not title conversation ${conversationId}`, err))
    }
    deps.events.turn({ conversationId, turnId, state, ...(error ? { error } : {}) })
    deps.log(turnLogLine({ turnId, conversationId, state, model, usage, queuedAt: claimed.queuedAt, lastQueuedAt: claimed.lastQueuedAt, startedAt: claimed.startedAt, firstTokenAt, endedAt: at }))
    return { state, error, text }
  }

  async function keepOpen(operationId: string, title: string, boundaryName: string | undefined, sourceSeq?: number) {
    if (!deps.ledger) return
    const text = boundaryName ? `${title} (in ${boundaryName})` : title
    await deps.ledger.record(conversationId, { kind: 'open-operation', text, operationId, ...(sourceSeq !== undefined ? { sourceSeq } : {}) })
      .catch(err => deps.logError(`Could not keep operation ${operationId} in the ledger`, err))
  }

  function stream(piece: string) {
    if (!firstTokenAt) {
      firstTokenAt = deps.now()
      void deps.record.firstToken(turnId, firstTokenAt).catch(err => deps.logError(`Could not record turn ${turnId}'s first token`, err))
    }
    deps.events.delta({ conversationId, turnId, offset: text.length, text: piece })
    text += piece
    turn.onText(text)
    speech?.text(text)
  }

  try {
    const agentId = conversation.agentId
    if (!agentId) return await end('FAILED', NO_AGENT)

    const resolved = await deps.resolveAccess(conversation, claimed.actingUserId)
    if (!resolved.access) return await end('FAILED', resolved.problem ?? 'There is no model to talk on here.')
    const access = costedToTurn(resolved.access, turnId)
    talkedOn = access
    model = access.model
    // The first turn fixes the model, and says once when it is not the default it would have had.
    const firstToFix = !conversation.talkingModel && (await deps.fixTalkingAccess(conversationId, access))
    if (resolved.notice && firstToFix) {
      await commit({ conversationId, role: 'PLATFORM', kind: 'NOTICE', body: { text: resolved.notice } })
    }
    await deps.record.setAccess(turnId, access)

    const capability = await deps.mint({
      conversation, turnId, agentId, actingUserId: claimed.actingUserId, trigger: claimed.trigger,
      ...(claimed.continuationDepth !== undefined ? { continuationDepth: claimed.continuationDepth } : {}),
    })
    const compaction = await deps.compactAtStart?.(conversationId, access, claimed.inputIds, signal)
    if (compaction) usage = add(usage, compaction)
    const [tools, context] = await Promise.all([
      deps.tools.toolsFor(capability),
      deps.context(conversation, agentId, claimed),
    ])
    const person = claimed.actingUserId ?? capability.readerUserId ?? null
    const clock = await deps.clock?.(person)
    const timezone = person && deps.timezone ? await deps.timezone(person) : null
    const messages: LeadMessage[] = clock ? withClock(context.messages, clock, context.cacheAfterMessage) : [...context.messages]
    const pictures = deps.pictures?.(conversation, access, claimed.inputIds) ?? null
    await pictures?.give(messages)
    const from = deps.now()
    const stepLog = createStepLog({
      from, now: deps.now, timezone, ...(deps.stepNames ? { names: deps.stepNames } : {}),
      emit(steps, elapsedMs) {
        deps.events.steps?.({ conversationId, turnId, elapsedMs, steps })
        turn.onSteps?.({ from, steps })
      },
    })
    log = stepLog
    // Only a person's ask can be carried on: a turn that presents cards has no words of theirs to brief with.
    const background = claimed.trigger === 'MESSAGE' && canStartWork(tools) ? deps.background : undefined
    let canMove = background !== undefined
    const found: StepCall[] = []
    let mode: StepMode = 'free'
    // Words that said work started with no call that started any get one more step to make it (finding 38).
    let checkedClaim = !tools.some(t => STARTS_WORK.has(t.name))
    const claimedWithoutCall = (stepText: string, step: number) => {
      if (checkedClaim || step + 1 >= deps.maxSteps || !claimsStart(stepText)) return false
      checkedClaim = true
      return !found.some(d => STARTS_WORK.has(d.call.name) && (d.outcome.status === 'accepted' || d.outcome.status === 'waitingApproval'))
    }

    async function runStep(calls: LeadToolCall[], askedAt: Date): Promise<StepCall[]> {
      await stepLog.begin(calls, askedAt)
      const done = await runStepTools({
        tools: deps.tools, capability, waitLimitMs: deps.waitLimitMs, signal, mailbox: deps.mailbox, now: deps.now, log: deps.log,
        hasOperationStarted: deps.hasOperationStarted, operationLine: deps.operationLine,
        async started(operationId, title, line) {
          const body = {
            title,
            ...(line?.boundaryName ? { boundaryName: line.boundaryName } : {}),
            ...(line?.startsAt ? { startsAt: line.startsAt.toISOString() } : {}),
          }
          const message = await commit({ conversationId, role: 'AGENT', kind: 'OPERATION_STARTED', body, agentId, turnId, operationId })
          // A task set for a time is done once set: nothing is open, and nothing is live on the screens.
          if (line?.startsAt) return
          await keepOpen(operationId, title, line?.boundaryName, message.seq)
          deps.events.operation({ conversationId, operationId, state: line?.state ?? 'RUNNING', title, ...(line ? { outstanding: line.outstanding } : {}) })
        },
        waiting: (operationId, title, boundaryName) => keepOpen(operationId, title, boundaryName),
      }, calls)
      await stepLog.finish(done)
      found.push(...done)
      return done
    }

    for (let step = 0; step < deps.maxSteps; step++) {
      mode = stepMode({ step, maxSteps: deps.maxSteps, lookups: stepLog.count(), moveAfter: deps.moveAfterSteps, canMove })
      if (mode === 'words' && step > 0) messages.push(wordsNote())
      const calls: { id: string; name: string; input: unknown }[] = []
      let stepText = ''
      const askedAt = deps.now()
      const toolChoice = toolChoiceFor(mode)
      const events = deps.model.stream({
        access, system: context.system, messages, cacheAfterMessage: context.cacheAfterMessage, tools,
        ...(toolChoice ? { toolChoice } : {}), ...(speech ? { spoken: true } : {}), cacheKey: conversationId, signal,
      })
      try {
        for await (const event of events) {
          if (event.type === 'text') {
            if (!event.text) continue
            if (stepText === '' && text !== '' && !text.endsWith('\n')) stream('\n\n')
            stepText += event.text
            stream(event.text)
          } else if (event.type === 'tool-call') {
            calls.push(event.call)
          } else {
            usage = add(usage, event.usage)
            contextTokens = event.usage.inputTokens + event.usage.cacheReadTokens + event.usage.cacheWriteTokens
          }
        }
      } catch (err) {
        // A provider that refused the pictures before answering: the same step again, the files named in the words.
        if (!pictures?.refused(err) || stepText !== '' || calls.length > 0) throw err
        await pictures.withdraw(messages)
        step--
        continue
      }
      if (calls.length === 0 && mode !== 'words' && claimedWithoutCall(stepText, step)) {
        messages.push({ role: 'assistant', content: stepText }, { role: 'user', content: NO_START_CALL })
        continue
      }
      // A words-only step that asks for tools anyway is not followed: the reply ends with what it said.
      if (calls.length === 0 || mode === 'words') break
      // Past the lookups a reply may take, more tools are hq's to start in the background, not run here; work the
      // model starts itself runs as asked.
      if (mode === 'move' && background && !calls.every(c => STARTS_WORK.has(c.name))) {
        const moved = await moveToBackground({
          capability, inputIds: claimed.inputIds, found, sources: background, runStep: calls => runStep(calls, deps.now()),
        })
        if (signal.aborted) throw new ModelCallError('cancelled', 'The reply was stopped.')
        if (moved) {
          if (text && !text.endsWith('\n')) stream('\n\n')
          stream(MOVED_TO_BACKGROUND)
          return await end('COMPLETED', null)
        }
        canMove = false
        if (stepText) messages.push({ role: 'assistant', content: stepText })
        continue
      }
      messages.push({ role: 'assistant', content: stepText, toolCalls: calls })
      const done = await runStep(calls, askedAt)
      for (const { call, outcome } of done) messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, result: forModel(outcome) })
      if (signal.aborted) throw new ModelCallError('cancelled', 'The reply was stopped.')
      // The reply's last words came with only used_memory, or the step only started work: nothing is left to say.
      if (endsReply(stepText, calls)) {
        if (!claimedWithoutCall(stepText, step)) break
        messages.push({ role: 'user', content: NO_START_CALL })
        continue
      }
      if (onlyStartedWork(done)) {
        // The agent says what it started in the same step; when it wrote nothing there, hq says it in its voice.
        if (!stepText.trim()) {
          if (text && !text.endsWith('\n')) stream('\n\n')
          stream(startedLine(done, timezone))
        }
        break
      }
    }
    // A reply that had to stop never ends without a word, whatever the last call gave.
    if (mode === 'words' && !text.trim()) stream(STOPPED_WITHOUT_ANSWER)
    return await end('COMPLETED', null)
  } catch (err) {
    if (signal.aborted || (err instanceof ModelCallError && err.kind === 'cancelled')) return end('CANCELLED', null)
    const reason = reasonOf(err)
    if (!reason) deps.logError(`Turn ${turnId} of conversation ${conversationId} failed`, err)
    return end('FAILED', reason ?? SOMETHING_WENT_WRONG, err instanceof ModelCallError ? err.kind : null)
  }
}
