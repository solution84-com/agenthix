/**
 * The probe's hook before every turn (memory and knowledge spec, What decides a recall): who the turn is for, the
 * composed query, the probe, and the block the lead reads at the end of the turn's own message. What the turn was
 * shown is recorded — included and hinted, with the probe's similarity — and the included items count as read.
 *
 * Memory informs a turn and never stops one: a probe that fails, or takes longer than a reply can wait — the local
 * model's first load, say — is logged and the turn goes on without it.
 */
import { prisma } from 'wasp/server'
import type { ConversationMessageView } from '../../shared/conversations/protocol'
import type { MemoryPrincipal, MemoryService } from '../../memory/contract'
import { memoryService } from '../../memory/memoryService'
import { markRecalled } from '../../memory/memoryRows'
import { Logger } from '../../server/utils/logger'
import type { ConversationHomeRef } from '../contract'
import { composeQuery } from './composedQuery'
import { probe as defaultProbe, type TurnProbe } from './probe'
import { keepScores } from './probeScores'
import { memoryTurnBlock } from './turnBlock'
import { turnPrincipal } from './turnPrincipal'

const logger = new Logger('ConversationMemory')

/** How long a turn waits for its probe: an embed and a search take tens of milliseconds once the model is loaded. */
export const PROBE_TIME_LIMIT_MS = 2_000

export interface TurnMemoryInput {
  conversation: ConversationHomeRef
  agentId: string
  turn: { turnId: string; trigger: 'MESSAGE' | 'REPORT' | 'CONTINUATION'; actingUserId: string | null; inputIds: readonly string[] }
  history: readonly ConversationMessageView[]
}

export interface TurnMemoryDeps {
  principal(input: TurnMemoryInput): Promise<MemoryPrincipal>
  title(conversationId: string): Promise<string | null>
  probe(principal: MemoryPrincipal, composedQuery: string): Promise<TurnProbe>
  recordOutcomes: MemoryService['recordOutcomes']
  markRecalled(ids: string[], now: Date): Promise<void>
  now(): Date
  timeLimitMs: number
}

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms) })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

export async function memoryForTurn(input: TurnMemoryInput, deps: TurnMemoryDeps = defaultDeps): Promise<string | null> {
  try {
    const { conversation, turn, history } = input
    const [principal, title] = await Promise.all([deps.principal(input), deps.title(conversation.id)])
    const found = await within(deps.probe(principal, composeQuery(history, turn.inputIds, title)), deps.timeLimitMs)
    // A report turn has no tools: a hint it cannot follow is left out.
    const canRecall = turn.trigger !== 'REPORT'
    const probable = canRecall ? found.probable : []
    keepScores(turn.turnId, found.scores)

    const ids = { conversationId: conversation.id, turnId: turn.turnId }
    await deps.recordOutcomes([
      ...found.certain.map(i => ({ itemId: i.itemId, kind: 'INCLUDED' as const, similarity: i.similarity, ...ids })),
      ...probable.map(p => ({ itemId: p.itemId, kind: 'HINTED' as const, similarity: p.similarity, ...ids })),
    ])
    await deps.markRecalled(found.certain.map(i => i.itemId), deps.now())
    return memoryTurnBlock({ pinned: found.pinned, certain: found.certain, probable }, canRecall)
  } catch (err) {
    logger.warn(`The memory probe for turn ${input.turn.turnId} failed; the turn goes on without it: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

const defaultDeps: TurnMemoryDeps = {
  principal: ({ conversation, agentId, turn, history }) => turnPrincipal({
    conversation,
    agentId,
    trigger: turn.trigger,
    actingUserId: turn.actingUserId,
    operationIds: history.filter(m => turn.inputIds.includes(m.id) && m.operationId).map(m => m.operationId!),
  }),
  async title(conversationId) {
    const row = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { title: true } })
    return row?.title ?? null
  },
  probe: defaultProbe,
  recordOutcomes: outcomes => memoryService.recordOutcomes(outcomes),
  markRecalled,
  now: () => new Date(),
  timeLimitMs: PROBE_TIME_LIMIT_MS,
}
