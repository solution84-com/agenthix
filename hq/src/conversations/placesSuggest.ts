/**
 * `suggest_place` (agent knowledge spec, part 4, P5; adr-0152): the lead's only way to ask for a place its
 * conversation does not hold. It never adds one: it leaves a card in the thread (placesProtocol.ts), and only the
 * person's click on it adds the place. Offered to a turn that answers a person, outside a task's thread.
 *
 * The place is looked for only among those the conversation's person can open, so a place they can't reach — or one
 * that does not exist — is refused alike, in fixed words that echo nothing of what was asked.
 */
import { z } from 'zod'
import { prisma } from 'wasp/server'
import { PLACE_TOOLS } from '../server/controlplane/knowledgeToolSchemas'
import { entitledProjectsFilter } from '../projects/membership'
import { PERSONAL_LEVEL } from '../knowledge/reach'
import type { ActionBody } from '../shared/conversations/protocol'
import type { ConversationTool, ToolCallOutcome, TurnCapability } from './contract'
import { appendMessage } from './store/messages'
import { conversationEvents } from './coordinator/events'
import { placeKey, placesConversation, placesOf, projectLevel, samePlace, summaries, type Place } from './places'
import { SUGGEST_PLACE_TOOL, placeSuggestionBody } from './placesProtocol'

export const SUGGEST_UNREACHABLE = 'suggest_place suggests only a place the person can open, and there is none by that name. Nothing was suggested.'

const definition = PLACE_TOOLS.find(t => t.name === SUGGEST_PLACE_TOOL)!
const input = z.object(definition.schema)

export interface SuggestPlaceDeps {
  /** The conversation's person, and the places it holds now; null when it is gone. */
  conversation(conversationId: string): Promise<{ personId: string; held: Place[] } | null>
  /** The place the words name among those the person can open. */
  find(personId: string, words: string): Promise<Place | null>
  name(place: Place): Promise<{ name: string; level: string } | null>
  /** Writes the card into the thread. */
  card(capability: TurnCapability, body: ActionBody): Promise<void>
}

function offeredTo(capability: TurnCapability): boolean {
  if (capability.permissions.neverTools.includes(SUGGEST_PLACE_TOOL)) return false
  return !!capability.actingUserId && capability.trigger !== 'REPORT' && capability.home !== 'TASK' && capability.expiresAt > Date.now()
}

const refused = (reason: string): ToolCallOutcome => ({ status: 'refused', reason })

export function createSuggestPlaceTool(deps: SuggestPlaceDeps): ConversationTool {
  return {
    name: SUGGEST_PLACE_TOOL,
    input,
    offered: async capability => offeredTo(capability),
    describe: async () => definition.description ?? '',
    async run(capability, raw) {
      if (!offeredTo(capability)) return refused(`${SUGGEST_PLACE_TOOL} is not available in this reply`)
      const parsed = input.safeParse(raw ?? {})
      if (!parsed.success) {
        return refused(`The arguments do not fit ${SUGGEST_PLACE_TOOL}: ${parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`)
      }
      const { place: words, why } = parsed.data as { place: string; why: string }
      const conversation = await deps.conversation(capability.conversationId)
      // Only the conversation's own person answers the card; a turn acting for anyone else suggests nothing.
      if (!conversation || conversation.personId !== capability.actingUserId) return refused(SUGGEST_UNREACHABLE)
      const place = await deps.find(conversation.personId, words)
      const named = place && (await deps.name(place))
      if (!place || !named) return refused(SUGGEST_UNREACHABLE)
      if (conversation.held.some(h => samePlace(h, place))) {
        return refused(`${named.name} is already in this conversation: its knowledge is searched as ${named.level}: and work can start there`)
      }
      const summary = place.type === 'user' ? { kind: 'user' as const, ...named } : { kind: 'project' as const, projectId: place.id, ...named }
      await deps.card(capability, placeSuggestionBody(summary, why.trim()))
      return {
        status: 'done',
        operationId: capability.turnId,
        result: {
          suggested: named.name,
          note: `The person sees a card asking to add ${named.name}. Nothing reaches it unless they add it; carry on without it, and do not ask again in this reply.`,
        },
      }
    },
  }
}

/** The project the words name among those the person can open: by slug, then key, then name; or their own space. */
export async function findOpenPlace(personId: string, words: string): Promise<Place | null> {
  const wanted = words.trim().replace(/:$/, '')
  const lower = wanted.toLowerCase()
  if (lower === PERSONAL_LEVEL || lower === 'your space') return { type: 'user', id: personId }
  const projects = await prisma.project.findMany({
    where: { ...entitledProjectsFilter(personId), NOT: { personalSpace: true } },
    select: { id: true, slug: true, key: true, name: true },
    orderBy: { key: 'asc' },
  })
  const match = projects.find(p => projectLevel(p) === lower)
    ?? projects.find(p => p.key.toLowerCase() === lower)
    ?? projects.find(p => p.name.toLowerCase() === lower)
  return match ? { type: 'project', id: match.id } : null
}

export const suggestPlaceTool: ConversationTool = createSuggestPlaceTool({
  async conversation(conversationId) {
    const row = await placesConversation(conversationId)
    return row ? { personId: row.openedById, held: await placesOf(conversationId) } : null
  },
  find: findOpenPlace,
  async name(place) {
    const summary = (await summaries([place])).get(placeKey(place))
    return summary ? { name: summary.name, level: summary.level } : null
  },
  async card(capability, body) {
    const { message } = await appendMessage({
      conversationId: capability.conversationId, role: 'AGENT', kind: 'ACTION', body, agentId: capability.agentId, turnId: capability.turnId,
    })
    conversationEvents.message(capability.conversationId, message)
  },
})

export const placeTools: ConversationTool[] = [suggestPlaceTool]
