/**
 * The lead's knowledge tools (agent knowledge spec, part 3): the same five a worker has, as the conversation's own
 * tools, run in process against hq's knowledge service. What a call reaches is built from the turn's capability
 * (server/controlplane/knowledgeReach.ts): the conversation's own place, the person whose turn it is, the agent and
 * the conversation. Search and read are offered to every turn that may read; write, edit and delete only to a turn
 * that answers a person, as `remember` is. A tool the agent's place never allows is not offered.
 */
import { z } from 'zod'
import { prisma } from 'wasp/server'
import type { KnowledgeStepView } from '@agenthix/core'
import * as knowledge from '../../knowledge'
import type { KnowledgeReach } from '../../knowledge'
import { KNOWLEDGE_TOOLS } from '../../server/controlplane/knowledgeToolSchemas'
import { turnMayChange, turnReach } from '../../server/controlplane/knowledgeReach'
import { actingPerson } from '../../server/controlplane/runPerson'
import { ControlPlaneError } from '../../server/controlplane/types'
import { Logger } from '../../server/utils/logger'
import type { ConversationTool, ToolCallOutcome, TurnCapability } from '../contract'

const logger = new Logger('ConversationKnowledge')

type KnowledgeCall = (reach: KnowledgeReach, params: unknown) => Promise<string>

export interface LeadKnowledgeDeps {
  search: KnowledgeCall
  read: KnowledgeCall
  write: KnowledgeCall
  edit: KnowledgeCall
  delete: KnowledgeCall
  /** The turn's reach, or why it has none. */
  reachOf(capability: TurnCapability, tool: string): Promise<KnowledgeReach>
  /** Each level's name as a person reads it in the work step, by the level's name in the reach. */
  levelNames(reach: KnowledgeReach): Promise<Map<string, string>>
}

const CHANGES: ReadonlySet<string> = new Set(['write_knowledge', 'edit_knowledge', 'delete_knowledge'])

function readsFor(capability: TurnCapability): boolean {
  return capability.trigger !== 'REPORT' && capability.expiresAt > Date.now()
}

function offeredTo(capability: TurnCapability, tool: string): boolean {
  if (capability.permissions.neverTools.includes(tool)) return false
  return CHANGES.has(tool) ? turnMayChange(capability) : readsFor(capability)
}

function refused(tool: string, err: unknown): ToolCallOutcome {
  if (err instanceof ControlPlaneError) return { status: 'refused', reason: err.message }
  logger.error(`${tool} failed in a conversation`, err)
  return { status: 'refused', reason: `${tool} failed` }
}

export function createLeadKnowledgeTools(deps: LeadKnowledgeDeps): ConversationTool[] {
  const calls: Record<string, KnowledgeCall> = {
    search_knowledge: deps.search,
    read_knowledge: deps.read,
    write_knowledge: deps.write,
    edit_knowledge: deps.edit,
    delete_knowledge: deps.delete,
  }
  return KNOWLEDGE_TOOLS.map(({ name, description, schema }): ConversationTool => ({
    name,
    input: z.object(schema),
    offered: async capability => offeredTo(capability, name),
    describe: async () => description ?? '',
    async run(capability, raw) {
      if (!offeredTo(capability, name)) {
        const why = CHANGES.has(name) ? 'changes knowledge, and this reply acts for no one' : 'is not available in this reply'
        return { status: 'refused', reason: `${name} ${why}` }
      }
      try {
        let step: KnowledgeStepView | undefined
        const reach: KnowledgeReach = { ...(await deps.reachOf(capability, name)), onStep: s => (step = s) }
        const text = await calls[name](reach, raw ?? {})
        const knowledge = step ? await named(deps, reach, step) : undefined
        return { status: 'done', operationId: capability.turnId, result: text, ...(knowledge ? { knowledge } : {}) }
      } catch (err) {
        return refused(name, err)
      }
    },
  }))
}

/** A search's step names its levels as the person knows them; a name that can't be read stays the level's own. */
async function named(deps: LeadKnowledgeDeps, reach: KnowledgeReach, step: KnowledgeStepView): Promise<KnowledgeStepView> {
  if (step.kind !== 'knowledge_search') return step
  const names = await deps.levelNames(reach).catch(() => new Map<string, string>())
  return { ...step, names: step.levels.map(l => names.get(l) ?? l) }
}

/** "Your space", a project's name, "Organisation", "Platform guide". */
async function levelNames(reach: KnowledgeReach): Promise<Map<string, string>> {
  const names = new Map<string, string>([['org', 'Organisation'], ['platform', 'Platform guide']])
  const projects = reach.places.filter(p => p.owner.ownerType === 'project')
  const rows = projects.length
    ? await prisma.project.findMany({ where: { id: { in: projects.map(p => p.owner.ownerId) } }, select: { id: true, name: true } })
    : []
  for (const place of reach.places) {
    if (place.owner.ownerType === 'user') names.set(place.level, 'Your space')
    const row = rows.find(r => r.id === place.owner.ownerId)
    if (place.owner.ownerType === 'project' && row) names.set(place.level, row.name)
  }
  return names
}

export const knowledgeTools: ConversationTool[] = createLeadKnowledgeTools({
  search: knowledge.searchKnowledge,
  read: knowledge.readKnowledge,
  write: knowledge.writeKnowledge,
  edit: knowledge.editKnowledge,
  delete: knowledge.deleteKnowledge,
  async reachOf(capability, tool) {
    // The person the turn acts or reads for, still in the organisation (adr-0101).
    const { userId } = await actingPerson({ kind: 'turn', turn: capability }, tool)
    return turnReach(capability, userId)
  },
  levelNames,
})
