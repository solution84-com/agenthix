/**
 * A conversation's places as its screens read them (agent knowledge spec, part 4; screens C3): the operations'
 * arguments and answers, and the lead's `suggest_place` card. Client-safe — no server imports. Shapes are `type`
 * aliases, not interfaces: Wasp's operation payloads must be plain object types.
 */
import type { ActionBody } from '../shared/conversations/protocol'

/** A place a conversation can hold: a project, or `user`, the person's own space. */
export type PlaceRef = { kind: 'project'; projectId: string } | { kind: 'user' }
/** `level`: the name its knowledge pages start with — the project's slug, or `personal` for the person's own space. */
export type PlaceSummary = PlaceRef & { name: string; level: string }
export type AddedPlace = PlaceSummary & { addedBy: { id: string; name: string }; addedAt: string }

export type ConversationPlaces = {
  /** The conversation's own place, first and never removed. */
  own: PlaceSummary
  /** The places its person added, oldest first. */
  added: AddedPlace[]
  /** The places the person can open that it does not hold; empty for anyone but its person, and in a task's thread. */
  addable: PlaceSummary[]
}

export type GetConversationPlacesArgs = { conversationId: string }
export type ConversationPlaceArgs = { conversationId: string; place: PlaceRef }

export const SUGGEST_PLACE_TOOL = 'suggest_place'
/** The `target.kind` of the card's ACTION line. */
export const PLACE_SUGGESTION_TARGET = 'place'

/** The card `suggest_place` leaves in the thread; only the conversation's person answers it, by adding the place. */
export type PlaceSuggestion = { kind: 'suggest_place'; place: PlaceSummary; why: string }

/**
 * The card as it is stored: an ACTION line by the lead, `toolName` `suggest_place`, its target naming the place —
 * `id` the project's id or `user`, `label` its name, and `params` its level and the lead's reason (`why`). A screen
 * that does not know the card shows the line's text, "Add a place to this conversation: Shop".
 */
export function placeSuggestionOf(body: ActionBody): PlaceSuggestion | null {
  const target = body.target
  if (body.toolName !== SUGGEST_PLACE_TOOL || target?.kind !== PLACE_SUGGESTION_TARGET) return null
  const level = target.params?.level
  const why = target.params?.why ?? ''
  if (!level) return null
  const ref: PlaceRef = target.id === 'user' ? { kind: 'user' } : { kind: 'project', projectId: target.id }
  return { kind: 'suggest_place', place: { ...ref, name: target.label, level }, why }
}

/** The card's ACTION body for a place. */
export function placeSuggestionBody(place: PlaceSummary, why: string): ActionBody {
  return {
    text: `Add a place to this conversation: ${place.name}`,
    toolName: SUGGEST_PLACE_TOOL,
    target: {
      kind: PLACE_SUGGESTION_TARGET,
      id: place.kind === 'user' ? 'user' : place.projectId,
      label: place.name,
      params: { level: place.level, why },
    },
  }
}
