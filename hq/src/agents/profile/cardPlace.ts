import { createContext, useContext } from 'react'
import type { Place } from '../../places/placeTypes'
import { CHAT_PATH } from '../../chat/chatComposer'

/**
 * Where the person is when they open an agent's card: a project's screens, or their Chat. Elsewhere there is none.
 * `path` is the place's own address, where the card's links into the place open, when the card is not on it (the
 * dock); otherwise they open on the current page.
 */
export type CardPlace =
  | { kind: 'project'; projectId: string; basePath: string; sessionLocation: Place['sessionLocation']; path?: string }
  | { kind: 'chat'; basePath: string; path?: string }

export const CardPlaceContext = createContext<CardPlace | null>(null)

export function useCardPlace(): CardPlace | null {
  return useContext(CardPlaceContext)
}

/** The place a place screen is: a project (its id set), Chat, or neither (an agent's own page). */
export function cardPlaceOf(place: Pick<Place, 'projectId' | 'basePath' | 'sessionLocation'>): CardPlace | null {
  if (place.projectId) return { kind: 'project', projectId: place.projectId, basePath: place.basePath, sessionLocation: place.sessionLocation }
  if (place.basePath === CHAT_PATH) return { kind: 'chat', basePath: CHAT_PATH }
  return null
}

/** The address that opens an agent in the Agents tool at a part, in the place the person is in. */
export function agentAtPart(pathname: string, agentId: string, focus: 'permissions' | 'tasks'): string {
  const q = new URLSearchParams({ tool: 'agents', agent: agentId, focus })
  return `${pathname}?${q.toString()}`
}
