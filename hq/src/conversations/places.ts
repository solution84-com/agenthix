/**
 * A conversation's places (agent knowledge spec, part 4; adr-0152): its own place, worked out from the conversation
 * and never stored, and the places its person added, each a `ConversationPlace` row with who added it and when.
 * Every path by which the lead reaches a place — its knowledge tools and starting work — reads them here.
 *
 * Access is checked when a place is added and on every read: a place the conversation's person can no longer open
 * drops out, its row removed, so nothing reaches it from that moment. A task's thread holds its project only.
 */
import { Prisma } from '@prisma/client'
import { prisma } from 'wasp/server'
import { isYourSpace } from '../projects/personalProject'
import { projectStanding } from '../projects/membership'
import { PERSONAL_LEVEL } from '../knowledge/reach'
import type { PlaceRef, PlaceSummary } from './placesProtocol'

/** A place as the rest of the conversation layer names a boundary: the person's own space, or a project. */
export type Place = { type: 'user'; id: string } | { type: 'project'; id: string }

export interface PlacesConversation {
  id: string
  home: 'PERSON' | 'PROJECT' | 'TASK'
  projectId: string | null
  openedById: string
}

export interface AddedPlaceRow { place: Place; addedById: string; addedAt: Date }

export const YOUR_SPACE_NAME = 'Your space'

export const samePlace = (a: Place, b: Place): boolean => a.type === b.type && a.id === b.id

/** The level a project's knowledge pages start with: its slug, or its key for a row made without one. */
export function projectLevel(project: { slug: string | null; key: string }): string {
  return project.slug ?? project.key.toLowerCase()
}

const conversationSelect = { id: true, home: true, projectId: true, openedById: true } as const

export async function placesConversation(conversationId: string): Promise<PlacesConversation | null> {
  return prisma.conversation.findUnique({ where: { id: conversationId }, select: conversationSelect })
}

/**
 * The conversation's own place: the opener's own space, or its project (its task's, in a task's thread) — the
 * opener's own space when that project is their space. Null for a project that is gone.
 */
export async function ownPlace(conversation: PlacesConversation): Promise<Place | null> {
  if (conversation.home === 'PERSON') return { type: 'user', id: conversation.openedById }
  if (!conversation.projectId) return null
  const project = await prisma.project.findUnique({
    where: { id: conversation.projectId },
    select: { id: true, personalOwnerId: true, personalSpace: true },
  })
  if (!project) return null
  return isYourSpace(project) && project.personalOwnerId ? { type: 'user', id: project.personalOwnerId } : { type: 'project', id: project.id }
}

/** Whether the person may open the place: their own space, or a project they are a member of (a Viewer included). */
export async function mayOpenPlace(personId: string, place: Place): Promise<boolean> {
  if (place.type === 'user') {
    if (place.id !== personId) return false
    const person = await prisma.user.findUnique({ where: { id: personId }, select: { deactivatedAt: true } })
    return person !== null && person.deactivatedAt === null
  }
  const project = await prisma.project.findUnique({ where: { id: place.id }, select: { personalOwnerId: true, personalSpace: true } })
  // A person's space is reached as their own space, never as a project.
  if (!project || isYourSpace(project)) return false
  return (await projectStanding(place.id, personId)) !== 'none'
}

const rowPlace = (row: { placeKind: string; projectId: string | null; userId: string | null }): Place | null => {
  if (row.placeKind === 'PROJECT' && row.projectId) return { type: 'project', id: row.projectId }
  if (row.placeKind === 'USER' && row.userId) return { type: 'user', id: row.userId }
  return null
}

/**
 * The places the person added, oldest first, after the re-check: a row the conversation's person can no longer
 * open is removed and left out. A task's thread has none.
 */
export async function addedPlaces(conversation: PlacesConversation): Promise<AddedPlaceRow[]> {
  if (conversation.home === 'TASK') return []
  const rows = await prisma.conversationPlace.findMany({
    where: { conversationId: conversation.id },
    orderBy: { addedAt: 'asc' },
    select: { id: true, placeKind: true, projectId: true, userId: true, addedById: true, addedAt: true },
  })
  const kept: AddedPlaceRow[] = []
  const lost: string[] = []
  for (const row of rows) {
    const place = rowPlace(row)
    if (place && (await mayOpenPlace(conversation.openedById, place))) kept.push({ place, addedById: row.addedById, addedAt: row.addedAt })
    else lost.push(row.id)
  }
  if (lost.length > 0) await prisma.conversationPlace.deleteMany({ where: { id: { in: lost } } })
  return kept
}

/** The re-check at the start of a turn: the places the person lost drop out of the conversation. */
export async function dropLostPlaces(conversationId: string): Promise<void> {
  const conversation = await placesConversation(conversationId)
  if (conversation) await addedPlaces(conversation)
}

/** Every place the conversation reaches, its own first, then those added, oldest first. */
export async function placesOf(conversationId: string): Promise<Place[]> {
  const conversation = await placesConversation(conversationId)
  if (!conversation) return []
  const [own, added] = await Promise.all([ownPlace(conversation), addedPlaces(conversation)])
  const places = own ? [own] : []
  for (const { place } of added) if (!places.some(p => samePlace(p, place))) places.push(place)
  return places
}

/** Whether the conversation reaches this place now. */
export async function holdsPlace(conversationId: string, place: Place): Promise<boolean> {
  return (await placesOf(conversationId)).some(p => samePlace(p, place))
}

/**
 * The place a reference names for this person: `user` is their own space, and a project that is their space is
 * that too. Null for a project that does not exist.
 */
export async function placeOfRef(personId: string, ref: PlaceRef): Promise<Place | null> {
  if (ref.kind === 'user') return { type: 'user', id: personId }
  const project = await prisma.project.findUnique({ where: { id: ref.projectId }, select: { id: true, personalOwnerId: true, personalSpace: true } })
  if (!project) return null
  if (isYourSpace(project)) return project.personalOwnerId === personId ? { type: 'user', id: personId } : null
  return { type: 'project', id: project.id }
}

/** How a place reads on screen and to the lead. */
export async function summaries(places: Place[]): Promise<Map<string, PlaceSummary>> {
  const ids = places.filter(p => p.type === 'project').map(p => p.id)
  const projects = ids.length === 0 ? [] : await prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true, key: true } })
  const out = new Map<string, PlaceSummary>()
  for (const place of places) {
    if (place.type === 'user') out.set(placeKey(place), { kind: 'user', name: YOUR_SPACE_NAME, level: PERSONAL_LEVEL })
  }
  for (const p of projects) out.set(placeKey({ type: 'project', id: p.id }), { kind: 'project', projectId: p.id, name: p.name, level: projectLevel(p) })
  return out
}

export const placeKey = (place: Place): string => `${place.type}:${place.id}`

export type AddOutcome = 'added' | 'already' | 'unreachable'

/**
 * Adds a place to the conversation for its person, recording who and when. The caller has checked that the person
 * is the conversation's own; this checks they may open the place. Adding one it already holds changes nothing.
 */
export async function addPlace(conversation: PlacesConversation, personId: string, place: Place): Promise<AddOutcome> {
  if (!(await mayOpenPlace(personId, place))) return 'unreachable'
  const own = await ownPlace(conversation)
  if (own && samePlace(own, place)) return 'already'
  try {
    await prisma.conversationPlace.create({
      data: {
        conversationId: conversation.id,
        placeKind: place.type === 'user' ? 'USER' : 'PROJECT',
        ...(place.type === 'user' ? { userId: place.id } : { projectId: place.id }),
        addedById: personId,
      },
    })
    return 'added'
  } catch (err) {
    // Added twice at once: the unique index keeps one.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'already'
    throw err
  }
}

/** Removes an added place; from then on nothing in the conversation reaches it. Work started there carries on. */
export async function removePlace(conversationId: string, place: Place): Promise<void> {
  await prisma.conversationPlace.deleteMany({
    where: { conversationId, ...(place.type === 'user' ? { placeKind: 'USER', userId: place.id } : { placeKind: 'PROJECT', projectId: place.id }) },
  })
}
