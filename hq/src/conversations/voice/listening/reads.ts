/**
 * What the listening call reads from hq's records (adaptive voice listening, spec §What it reads, each call; §Which light
 * model): whether it listens at all — the flag `voiceListener` and the holder's own Adaptive voice — the light model's
 * access through the resolver's purpose `listener`, costed under it, and who is who, the recap and the last exchanges
 * word for word. Nothing else: not the agent's instructions, tools, tasks or knowledge.
 */
import { prisma } from 'wasp/server'
import type { ResolvedAccess } from '../../contract'
import { isOrgFeatureOn } from '../../../features/switches'
import { resolve } from '../../../routing/resolver'
import { hqCallAccess } from '../../../routing/reaching'
import { placeOfConversation } from '../../../routing/place'
import { costingOf } from '../../../billing/costing'
import { personName } from '../../../sessions/transcriptAuthors'
import { readMessages } from '../../store/messages'
import { leadAgentId } from '../../taskThread/lead'
import type { ListeningContext, ListeningSession } from './listen'

export const VOICE_LISTENER_FLAG = 'voiceListener' as const

/** Whether the light model's turn path is on for this organisation, by the one rule. */
export function voiceListenerFeatureOn(): Promise<boolean> {
  return isOrgFeatureOn(VOICE_LISTENER_FLAG)
}

/** The flag on, and the holder's Adaptive voice on (it is unless they turned it off). */
export async function listenerEnabled(holderId: string): Promise<boolean> {
  if (!(await voiceListenerFeatureOn())) return false
  const row = await prisma.userSettings.findUnique({ where: { userId: holderId }, select: { adaptiveVoice: true } })
  return row?.adaptiveVoice ?? true
}

async function conversationRef(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, home: true, projectId: true, taskId: true, openedById: true, agentId: true, voiceRecap: true },
  })
}

/** The light model's access for this conversation, costed under `listener`; null when no fast model is reached. */
export async function listenerAccess(session: ListeningSession): Promise<ResolvedAccess | null> {
  const ref = await conversationRef(session.conversationId)
  if (!ref) return null
  const agentId = await leadAgentId(ref)
  const req = {
    purpose: 'listener' as const, place: await placeOfConversation(ref), userId: session.holderId, conversationId: ref.id,
    ...(agentId ? { agentId } : {}),
  }
  const answer = await resolve(req)
  if (!answer.ok) return null
  const access = await hqCallAccess(answer.resolution)
  return access ? { ...access, costing: costingOf(answer.resolution, req) } : null
}

/** How far back the last exchanges are looked for: other messages (cards, notices) sit between them. */
const LOOK_BACK = 40

export async function listeningContext(session: ListeningSession, recentExchanges: number): Promise<ListeningContext> {
  const ref = await conversationRef(session.conversationId)
  const agentId = ref ? await leadAgentId(ref) : null
  const [agent, person, messages] = await Promise.all([
    agentId ? prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } }) : null,
    personName(session.holderId),
    recentExchanges > 0 ? readMessages(session.conversationId, { limit: LOOK_BACK }) : Promise.resolve([]),
  ])
  const exchanges = messages
    .filter(m => m.kind === 'TEXT' && (m.role === 'PERSON' || m.role === 'AGENT') && !m.withdrawn && m.body.text.trim())
    .slice(0, recentExchanges)
    .reverse()
    .map(m => ({ who: m.role === 'PERSON' ? 'person' as const : 'agent' as const, text: m.kind === 'TEXT' ? m.body.text : '' }))
  return { agent: agent?.name ?? 'the agent', person: person ?? 'the person', recap: ref?.voiceRecap ?? null, exchanges }
}
