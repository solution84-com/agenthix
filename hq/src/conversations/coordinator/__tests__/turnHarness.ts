/**
 * A turn with everything around it replaced: the model, the tools, access, the record and the screens, each an
 * in-memory stand-in the tests read back.
 */
import { vi } from 'vitest'
import type {
  AppendMessageInput,
  LeadRequest,
  LeadStreamEvent,
  ModelAdapter,
  ResolvedAccess,
  ToolAdapter,
  ToolCallOutcome,
  TurnCapability,
  TurnUsage,
} from '../../contract'
import type { ConversationMessageView, ConversationStepsEvent } from '../../../shared/conversations/protocol'
import type { OperationLine, TurnDeps, RunningTurn } from '../turn'
import type { ClaimedTurn } from '../claim'
import type { TurnEnd } from '../turnRecord'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'

export const access: ResolvedAccess = { provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'k', owner: 'user', kind: 'API_KEY' }
export const usage = (n: number): TurnUsage => ({ inputTokens: n, outputTokens: n, cacheReadTokens: 0, cacheWriteTokens: 0 })

export type Step = LeadStreamEvent[] | ((request: LeadRequest) => AsyncGenerator<LeadStreamEvent>)

/** A model that plays one scripted step per call. */
export function scriptedModel(steps: Step[]): ModelAdapter & { requests: LeadRequest[] } {
  const requests: LeadRequest[] = []
  return {
    requests,
    async *stream(request) {
      requests.push({ ...request, messages: [...request.messages] })
      const step = steps.shift()
      if (!step) throw new Error('no step scripted')
      if (typeof step === 'function') { yield* step(request); return }
      for (const event of step) yield event
    },
    async complete() { throw new Error('not used') },
  }
}

export function claimed(overrides: Partial<ClaimedTurn['conversation']> = {}): ClaimedTurn {
  return {
    turnId: 'turn-1',
    trigger: 'MESSAGE',
    conversation: {
      id: 'conv-1', home: 'PERSON', projectId: null, taskId: null, openedById: 'u1', agentId: 'agent-1',
      talkingModel: 'claude-sonnet-5', talkingProvider: 'anthropic', accessOwnerType: 'user', ...overrides,
    },
    actingUserId: 'u1',
    inputIds: ['m1'],
    queuedAt: new Date(1_000),
    startedAt: new Date(1_500),
  }
}

export function harness(model: ModelAdapter, outcomes: Record<string, ToolCallOutcome> = {}, operationLines: Record<string, OperationLine> = {}) {
  const stored: ConversationMessageView[] = []
  const ended: { state: TurnEnd; usage: TurnUsage; error: string | null; errorKind?: string | null }[] = []
  const deltas: { offset: number; text: string }[] = []
  const turnStates: string[] = []
  const operations: string[] = []
  const logs: string[] = []
  const steps: ConversationStepsEvent[] = []
  let clock = 2_000
  let finishAllowed = true

  const append = vi.fn(async (input: AppendMessageInput) => {
    const message = {
      id: `stored-${stored.length + 1}`, seq: stored.length + 10, clientMessageId: null, role: input.role,
      authorId: input.authorId ?? null, agentId: input.agentId ?? null, kind: input.kind, body: input.body,
      spoken: false, interrupted: false, encouragement: input.encouragement ?? false, operationId: input.operationId ?? null, turnId: input.turnId ?? null,
      queueState: null, createdAt: new Date(clock).toISOString(),
    } as ConversationMessageView
    stored.push(message)
    return { message, duplicate: false }
  })
  const toolCall = vi.fn(async (_c: TurnCapability, call: { name: string }, _o: { waitLimitMs: number }): Promise<ToolCallOutcome> =>
    outcomes[call.name] ?? { status: 'refused', reason: 'unknown' })
  const tools: ToolAdapter = {
    async toolsFor() { return [] },
    call: toolCall,
  }
  const fixTalkingAccess = vi.fn(async () => true)
  const resolveAccess = vi.fn(async (): Promise<Awaited<ReturnType<TurnDeps['resolveAccess']>>> => ({ access, problem: null, offer: null }))

  const deps: TurnDeps = {
    model,
    tools,
    resolveAccess,
    fixTalkingAccess,
    mint: vi.fn(async ({ turnId, actingUserId }) => turnCapability({ turnId, actingUserId })),
    context: vi.fn(async () => ({ system: [{ text: 'base', cacheAfter: true }], messages: [{ role: 'user' as const, content: 'hi' }] })),
    appendMessage: append,
    updateMessage: vi.fn(async (id: string, patch: { interrupted?: boolean }) => {
      const message = stored.find(m => m.id === id)!
      Object.assign(message, patch)
      return message
    }),
    hasOperationStarted: vi.fn(async (operationId: string) => stored.some(m => m.kind === 'OPERATION_STARTED' && m.operationId === operationId)),
    operationLine: vi.fn(async (operationId: string) => operationLines[operationId] ?? null),
    record: {
      setAccess: vi.fn(async () => {}),
      firstToken: vi.fn(async () => {}),
      finish: vi.fn(async (_id, end) => { if (!finishAllowed) return false; ended.push(end); return true }),
      stopRequested: vi.fn(async () => false),
    },
    events: {
      message: vi.fn(),
      messageUpdated: vi.fn(),
      delta: vi.fn(e => { deltas.push({ offset: e.offset, text: e.text }) }),
      turn: vi.fn(e => { turnStates.push(e.state) }),
      operation: vi.fn(e => { operations.push(`${e.operationId}:${e.state}`) }),
      operationLines: vi.fn(),
      steps: vi.fn((e: ConversationStepsEvent) => { steps.push(e) }),
    },
    mailbox: { operationSettled: vi.fn() },
    log: (line: string) => { logs.push(line) },
    logError: vi.fn(),
    now: () => new Date((clock += 100)),
    waitLimitMs: 4_000,
    maxSteps: 4,
    moveAfterSteps: 4,
    background: {
      asked: vi.fn(async () => ['Find the stale tasks in WAL']),
      project: vi.fn(async () => ({ key: 'WAL', name: 'Walkthrough' })),
    },
  }

  function run(turn: ClaimedTurn = claimed(), controller = new AbortController()) {
    const live: string[] = []
    const running: RunningTurn = { claimed: turn, signal: controller.signal, onText: t => { live.push(t) } }
    return { controller, live, running }
  }

  return {
    deps, stored, ended, deltas, turnStates, operations, logs, steps, append, toolCall, fixTalkingAccess, resolveAccess, run,
    refuseFinish() { finishAllowed = false },
    /** Moves the clock on, as time passing while the reply works. */
    advance(ms: number) { clock += ms },
  }
}
