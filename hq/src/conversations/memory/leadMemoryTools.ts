/**
 * The lead's own memory tools (memory and knowledge spec; plan tasks 3.5, 3.7 and 3.10 for the lead): `recall`,
 * `remember` and `forget` over the memory store in process, and `used_memory`, which says what the reply relied
 * on. They are the conversation's own tools, not the data path's (memoryOps.ts refuses turns by design): who they
 * read and write for is the one rule (memory/principal.ts) — the person the turn answers, the agent, and the
 * conversation's place. A turn that answers no one may not write.
 *
 * `recall` reaches memory only; knowledge is found by the knowledge tools.
 */
import { z } from 'zod'
import { DATA_PATH_ONLY_TOOLS } from '../../server/controlplane/toolSchemas'
import { ControlPlaneError } from '../../server/controlplane/types'
import { Logger } from '../../server/utils/logger'
import type { ConversationTool, ToolCallOutcome, TurnCapability } from '../contract'
import type { MemoryPrincipal, MemoryService, RecalledItem } from '../../memory/contract'
import {
  MEMORY_BODY_MAX_CHARS, MEMORY_MAX_TAGS, MEMORY_TITLE_MAX_CHARS, type MemoryItemKindValue, type MemoryScopeValue,
} from '../../shared/memory/protocol'
import { TOOL_KINDS, TOOL_SCOPES } from '../../server/controlplane/memoryOps'
import { MemoryRefused } from '../../memory/memoryService'
import { correctionMiss, shownIn, useOutcomes, type TurnOutcomeRow } from './outcomes'
import { USED_MEMORY, usedMemoryInput } from './usedMemory'

const logger = new Logger('ConversationMemory')

export interface LeadMemoryDeps {
  service: MemoryService
  principalOf(capability: TurnCapability, tool: string): Promise<MemoryPrincipal>
  /** The outcomes already recorded for the turn: what it was shown. */
  turnOutcomes(turnId: string): Promise<TurnOutcomeRow[]>
  /** The ids of the items with these keys in the scopes the principal reaches. */
  itemIdsByKey(principal: MemoryPrincipal, keys: readonly string[]): Promise<string[]>
  /** The held item nearest in meaning to a text, among those the principal reaches. */
  nearest(principal: MemoryPrincipal, text: string): Promise<{ itemId: string; similarity: number } | null>
  probableBar(): Promise<number>
  probeScore(turnId: string, itemId: string): number | undefined
}

const descriptionOf = (name: string): string => DATA_PATH_ONLY_TOOLS.find(t => t.name === name)?.description ?? ''

const lower = <T extends string>(value: string) => value.toLowerCase() as T
const upper = <T extends string>(value: string) => value.toUpperCase() as T

function forLead(item: RecalledItem) {
  return { key: item.key, scope: lower(item.scope), title: item.title, body: item.body, kind: lower(item.kind), tags: item.tags, pinned: item.pinned, writtenAt: item.writtenAt }
}

function readsFor(capability: TurnCapability): boolean {
  return capability.trigger !== 'REPORT' && capability.expiresAt > Date.now()
}

function writesFor(capability: TurnCapability): boolean {
  return readsFor(capability) && !!capability.actingUserId
}

function badArguments(tool: string, error: z.ZodError): ToolCallOutcome {
  return { status: 'refused', reason: `The arguments do not fit ${tool}: ${error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}` }
}

/** A refusal the lead can say in the rule's own words; anything else is logged and told plainly. */
function refused(tool: string, err: unknown): ToolCallOutcome {
  if (err instanceof ControlPlaneError || err instanceof MemoryRefused) return { status: 'refused', reason: err.message }
  logger.error(`${tool} failed in a conversation`, err)
  return { status: 'refused', reason: `${tool} failed` }
}

/** A memory tool has no operation of its own: its answer is tied to the turn that asked. */
const done = (capability: TurnCapability, result: unknown): ToolCallOutcome => ({ status: 'done', operationId: capability.turnId, result })

const recallInput = z.object({
  key: z.string().min(1).optional().describe('One item\'s key'),
  query: z.string().min(1).max(500).optional().describe('What you are looking for, in a few words'),
})
const rememberInput = z.object({
  scope: z.enum(TOOL_SCOPES).describe('Whose memory: the person\'s, yours about them, or yours about this place'),
  title: z.string().min(1).max(MEMORY_TITLE_MAX_CHARS).describe('A short title naming the subject'),
  body: z.string().min(1).max(MEMORY_BODY_MAX_CHARS).describe('What you learned, readable on its own'),
  kind: z.enum(TOOL_KINDS).describe('What sort of thing it is'),
  tags: z.array(z.string()).max(MEMORY_MAX_TAGS).optional().describe('A few words to group it by'),
  key: z.string().max(64).optional().describe('The key of an item to replace; made from the title when left out'),
  correction: z.boolean().optional().describe('True when this records something the person corrected you on'),
})
const forgetInput = z.object({
  key: z.string().min(1).describe('The item\'s key'),
  scope: z.enum(TOOL_SCOPES).describe('The item\'s scope'),
})

export function createLeadMemoryTools(deps: LeadMemoryDeps): ConversationTool[] {
  const recall: ConversationTool = {
    name: 'recall',
    input: recallInput,
    offered: async c => readsFor(c),
    describe: async () => descriptionOf('recall'),
    async run(capability, raw) {
      if (!readsFor(capability)) return { status: 'refused', reason: 'recall is not available in this reply' }
      const parsed = recallInput.safeParse(raw ?? {})
      if (!parsed.success) return badArguments('recall', parsed.error)
      const key = parsed.data.key?.trim()
      const query = parsed.data.query?.trim()
      if (!key === !query) return { status: 'refused', reason: 'recall takes a key or a query, one of the two' }
      try {
        const principal = await deps.principalOf(capability, 'recall')
        const memory = key
          ? { items: await deps.service.recallByKey(principal, [key]), cut: [] as string[] }
          : await deps.service.recallByQuery(principal, query!)
        await deps.service.recordOutcomes(memory.items.map(item => ({
          itemId: item.itemId, kind: 'RECALLED' as const, similarity: item.similarity,
          conversationId: capability.conversationId, turnId: capability.turnId,
        })))
        return done(capability, { items: memory.items.map(forLead), cut: memory.cut })
      } catch (err) {
        return refused('recall', err)
      }
    },
  }

  const remember: ConversationTool = {
    name: 'remember',
    input: rememberInput,
    offered: async c => writesFor(c),
    describe: async () =>
      `${descriptionOf('remember')} When the person corrected you, set correction: what you had wrong is then ` +
      'measured against what memory already held. Not for what a knowledge page says, or what you just wrote into ' +
      'one: the page keeps it, and a memory of it would go stale.',
    async run(capability, raw) {
      if (!writesFor(capability)) return { status: 'refused', reason: 'remember changes something, and this reply acts for no one' }
      const parsed = rememberInput.safeParse(raw ?? {})
      if (!parsed.success) return badArguments('remember', parsed.error)
      const { correction, ...args } = parsed.data
      try {
        const principal = await deps.principalOf(capability, 'remember')
        if (correction) await recordCorrectionMiss(capability, principal, `${args.title}\n${args.body}`)
        const outcome = await deps.service.remember(principal, {
          scope: upper<MemoryScopeValue>(args.scope), title: args.title, body: args.body,
          kind: upper<MemoryItemKindValue>(args.kind), tags: args.tags, key: args.key,
          writtenBy: { agentId: principal.agentId },
        })
        if (outcome.status === 'refused') return { status: 'refused', reason: outcome.reason }
        return done(capability, { status: outcome.status, key: outcome.key, scope: args.scope })
      } catch (err) {
        return refused('remember', err)
      }
    },
  }

  async function recordCorrectionMiss(capability: TurnCapability, principal: MemoryPrincipal, text: string): Promise<void> {
    const [nearest, bar, rows] = await Promise.all([deps.nearest(principal, text), deps.probableBar(), deps.turnOutcomes(capability.turnId)])
    const miss = correctionMiss(nearest, bar, shownIn(rows), id => deps.probeScore(capability.turnId, id))
    if (miss) await deps.service.recordOutcomes([{ ...miss, conversationId: capability.conversationId, turnId: capability.turnId }])
  }

  const forget: ConversationTool = {
    name: 'forget',
    input: forgetInput,
    offered: async c => writesFor(c),
    describe: async () => descriptionOf('forget'),
    async run(capability, raw) {
      if (!writesFor(capability)) return { status: 'refused', reason: 'forget changes something, and this reply acts for no one' }
      const parsed = forgetInput.safeParse(raw ?? {})
      if (!parsed.success) return badArguments('forget', parsed.error)
      try {
        const principal = await deps.principalOf(capability, 'forget')
        return done(capability, { forgotten: await deps.service.forget(principal, parsed.data.key, upper<MemoryScopeValue>(parsed.data.scope)) })
      } catch (err) {
        return refused('forget', err)
      }
    },
  }

  const usedMemory: ConversationTool = {
    name: USED_MEMORY,
    input: usedMemoryInput,
    offered: async c => readsFor(c),
    describe: async () =>
      'Say which remembered items your reply relied on, by key — from the memory shown with the message or from ' +
      'recall. Call it once, together with the end of your reply; an empty list when you relied on none.',
    async run(capability, raw) {
      if (!readsFor(capability)) return { status: 'refused', reason: `${USED_MEMORY} is not available in this reply` }
      const parsed = usedMemoryInput.safeParse(raw ?? {})
      if (!parsed.success) return badArguments(USED_MEMORY, parsed.error)
      try {
        const principal = await deps.principalOf(capability, USED_MEMORY)
        const [usedIds, rows] = await Promise.all([deps.itemIdsByKey(principal, parsed.data.keys), deps.turnOutcomes(capability.turnId)])
        const outcomes = useOutcomes(shownIn(rows), usedIds, id => deps.probeScore(capability.turnId, id))
        await deps.service.recordOutcomes(outcomes.map(o => ({ ...o, conversationId: capability.conversationId, turnId: capability.turnId })))
        return done(capability, { noted: true })
      } catch (err) {
        return refused(USED_MEMORY, err)
      }
    },
  }

  return [recall, remember, forget, usedMemory]
}
