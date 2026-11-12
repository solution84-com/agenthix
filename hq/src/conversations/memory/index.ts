/**
 * Memory in a conversation (memory and knowledge spec): the lead's own memory tools, wired to the store and to what
 * the turn was shown. The probe's hook is turnMemory.ts.
 */
import { prisma } from 'wasp/server'
import type { MemoryOutcomeKindValue } from '../../shared/memory/protocol'
import type { ConversationTool } from '../contract'
import { memoryService } from '../../memory/memoryService'
import { memoryPrincipalOf } from '../../memory/principal'
import { recallableWhere } from '../../memory/scopes'
import { currentBars } from '../../memory/barTuner'
import { createLeadMemoryTools } from './leadMemoryTools'
import { probe } from './probe'
import { probeScore } from './probeScores'

export const memoryTools: ConversationTool[] = createLeadMemoryTools({
  service: memoryService,
  principalOf: (capability, tool) => memoryPrincipalOf({ kind: 'turn', turn: capability }, tool),
  async turnOutcomes(turnId) {
    const rows = await prisma.memoryOutcome.findMany({ where: { turnId, itemId: { not: null } }, select: { itemId: true, kind: true } })
    return rows.map(r => ({ itemId: r.itemId!, kind: r.kind as MemoryOutcomeKindValue }))
  },
  async itemIdsByKey(principal, keys) {
    const reach = recallableWhere(principal)
    if (keys.length === 0 || !reach) return []
    const rows = await prisma.memoryItem.findMany({ where: { AND: [reach, { key: { in: [...keys] } }] }, select: { id: true } })
    return rows.map(r => r.id)
  },
  async nearest(principal, text) {
    let best: { itemId: string; similarity: number } | null = null
    for (const [itemId, similarity] of (await probe(principal, text)).scores) {
      if (!best || similarity > best.similarity) best = { itemId, similarity }
    }
    return best
  },
  probableBar: async () => (await currentBars()).probable,
  probeScore,
})
