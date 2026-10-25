/**
 * The conversation header's places (screens C3; agent knowledge spec, part 4): listing a conversation's places and
 * those its person could add, and adding and removing one. Only the conversation's person adds or removes, by their
 * own click; no agent can (B6). A removal takes effect from the next call that reads the places.
 */
import { HttpError, prisma } from 'wasp/server'
import { z } from 'zod'
import { peopleByIds } from '../server/identity/people'
import { entitledProjectsFilter } from '../projects/membership'
import { requireConversationReader, requireConversationSpeaker } from './readingRule'
import type { ConversationHomeRef } from './contract'
import {
  addPlace, addedPlaces, ownPlace, placeKey, placeOfRef, removePlace, samePlace, summaries, type Place, type PlacesConversation,
} from './places'
import type { ConversationPlaceArgs, ConversationPlaces, GetConversationPlacesArgs, PlaceSummary } from './placesProtocol'

type Ctx = { user?: { id: string } | null }

export const NOT_THEIR_CONVERSATION = "Only the person whose conversation this is can change its places. Nothing was changed."
export const TASK_THREAD_PLACES = "A task's conversation works only in its task's project, so places can't be added to it. Nothing was changed."
export const PLACE_UNREACHABLE = "You can't open that place, so it can't be added to this conversation; ask one of its admins to add you to it. Nothing was changed."
export const OWN_PLACE_STAYS = "This conversation's own place is always in it and can't be removed. Nothing was changed."

const placeRef = z.union([
  z.object({ kind: z.literal('project'), projectId: z.string().min(1).max(100) }).strict(),
  z.object({ kind: z.literal('user') }).strict(),
])
const changeArgs = z.object({ conversationId: z.string().min(1).max(100), place: placeRef })

const asConversation = (ref: ConversationHomeRef): PlacesConversation =>
  ({ id: ref.id, home: ref.home, projectId: ref.projectId, openedById: ref.openedById })

/** The projects and the own space the person can open, not among the places held. */
async function addableFor(personId: string, held: Place[]): Promise<PlaceSummary[]> {
  const projects = await prisma.project.findMany({
    where: { ...entitledProjectsFilter(personId), NOT: { personalSpace: true } },
    select: { id: true },
    orderBy: { name: 'asc' },
  })
  const candidates: Place[] = [{ type: 'user', id: personId }, ...projects.map(p => ({ type: 'project' as const, id: p.id }))]
  const open = candidates.filter(c => !held.some(h => samePlace(h, c)))
  const named = await summaries(open)
  return open.map(p => named.get(placeKey(p))).filter((s): s is PlaceSummary => s !== undefined)
}

export const getConversationPlaces = async (args: GetConversationPlacesArgs, context: Ctx): Promise<ConversationPlaces> => {
  if (!context.user) throw new HttpError(401)
  const userId = context.user.id
  const conversation = asConversation(await requireConversationReader(args?.conversationId, userId))
  const own = await ownPlace(conversation)
  if (!own) throw new HttpError(404, "This conversation's place no longer exists")
  const added = await addedPlaces(conversation)
  const held = [own, ...added.map(a => a.place)]
  const [named, people] = await Promise.all([summaries(held), peopleByIds(added.map(a => a.addedById))])
  const theirs = conversation.home !== 'TASK' && conversation.openedById === userId
  return {
    own: named.get(placeKey(own))!,
    added: added.flatMap(a => {
      const summary = named.get(placeKey(a.place))
      if (!summary) return []
      return [{ ...summary, addedBy: { id: a.addedById, name: people.get(a.addedById)?.name ?? '' }, addedAt: a.addedAt.toISOString() }]
    }),
    addable: theirs ? await addableFor(userId, held) : [],
  }
}

/** The conversation, when the caller is its person and it may hold added places; refused otherwise. */
async function theirConversation(raw: unknown, userId: string): Promise<{ conversation: PlacesConversation; place: Place | null }> {
  const parsed = changeArgs.safeParse(raw)
  if (!parsed.success) throw new HttpError(400, 'Say which conversation and which place. Nothing was changed.')
  const conversation = asConversation(await requireConversationSpeaker(parsed.data.conversationId, userId))
  if (conversation.home === 'TASK') throw new HttpError(409, TASK_THREAD_PLACES)
  if (conversation.openedById !== userId) throw new HttpError(403, NOT_THEIR_CONVERSATION)
  return { conversation, place: await placeOfRef(userId, parsed.data.place) }
}

export const addConversationPlace = async (args: ConversationPlaceArgs, context: Ctx): Promise<void> => {
  if (!context.user) throw new HttpError(401)
  const { conversation, place } = await theirConversation(args, context.user.id)
  // A project that does not exist and one the person can't open are refused alike, so neither says which it is.
  if (!place || (await addPlace(conversation, context.user.id, place)) === 'unreachable') throw new HttpError(403, PLACE_UNREACHABLE)
}

export const removeConversationPlace = async (args: ConversationPlaceArgs, context: Ctx): Promise<void> => {
  if (!context.user) throw new HttpError(401)
  const { conversation, place } = await theirConversation(args, context.user.id)
  if (!place) return
  const own = await ownPlace(conversation)
  if (own && samePlace(own, place)) throw new HttpError(409, OWN_PLACE_STAYS)
  await removePlace(conversation.id, place)
}
