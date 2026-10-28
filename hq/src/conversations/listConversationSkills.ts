/**
 * What the message box's `/` picker lists (skills spec part 5, *Picking a skill*): the skills the conversation's agent
 * would have on its next turn, with the name each is staged under, the name a person reads, its description and where
 * it comes from. Read-only: hq's records are read and the site is never asked, so it answers while hq is read-only.
 *
 * Only the conversation's own person may list it: their own skills are among the list, and a task's thread or
 * someone else's conversation is told it does not exist. The site validates a pick again when the turn is staged.
 */
import { HttpError, prisma } from 'wasp/server'
import { requireConversationReader, CONVERSATION_NOT_FOUND } from './readingRule'
import { mayOpenPlace, ownPlace, placeKey, summaries, type PlacesConversation } from './places'
import { agentChoicesFor } from './primaryAgent'
import { conversationSkills, type ConversationSkill } from './skillPicker/agentSkills'

export type ListConversationSkillsArgs = { conversationId: string }
export type ListConversationSkillsResult = { skills: ConversationSkill[] }

type Ctx = { user?: { id: string } | null }

export const listConversationSkillsQuery = async (args: ListConversationSkillsArgs, context: Ctx): Promise<ListConversationSkillsResult> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const conversationId = args?.conversationId
  if (typeof conversationId !== 'string' || conversationId.length === 0 || conversationId.length > 100) {
    throw new HttpError(400, 'Say which conversation to list skills for. Nothing was changed.')
  }
  const userId = context.user.id
  const ref = await requireConversationReader(conversationId, userId)
  if (ref.home === 'TASK' || ref.openedById !== userId) throw new HttpError(404, CONVERSATION_NOT_FOUND)
  if (!ref.agentId) return { skills: [] }

  return { skills: await skillsAt({ id: ref.id, home: ref.home, projectId: ref.projectId, openedById: ref.openedById }, ref.agentId, userId) }
}

export type ListStartSkillsArgs = { home: 'PERSON' | 'PROJECT'; projectId?: string; agentId: string }

/**
 * The same list before the conversation exists, for the box that starts one (`NewConversationBox`, a place's
 * composer): the agent the person chose, in the place the conversation will start in. Only an agent the person may
 * start a conversation with there is listed for; any other is told it isn't there.
 */
export const listStartSkillsQuery = async (args: ListStartSkillsArgs, context: Ctx): Promise<ListConversationSkillsResult> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const agentId = args?.agentId
  if (typeof agentId !== 'string' || agentId.length === 0 || agentId.length > 100) {
    throw new HttpError(400, 'Say which agent to list skills for. Nothing was changed.')
  }
  const projectId = typeof args.projectId === 'string' && args.projectId ? args.projectId : undefined
  const userId = context.user.id
  const choices = await agentChoicesFor({ home: args.home, projectId }, userId)
  if (!choices.some(a => a.id === agentId)) throw new HttpError(404, "That agent isn't one you can talk to here.")
  return { skills: await skillsAt({ id: null, home: args.home, projectId: projectId ?? null, openedById: userId }, agentId, userId) }
}

async function skillsAt(conversation: Omit<PlacesConversation, 'id'> & { id: string | null }, agentId: string, userId: string): Promise<ConversationSkill[]> {
  const own = await ownPlace({ ...conversation, id: conversation.id ?? '' })
  const open = own !== null && await mayOpenPlace(userId, own)
  const name = own ? (await summaries([own])).get(placeKey(own))?.name ?? '' : ''
  return conversationSkills(prisma, {
    agentId,
    personId: userId,
    place: open && own ? { placeType: own.type, placeId: own.id } : null,
    placeName: name,
    conversationId: conversation.id,
  })
}
