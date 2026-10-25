import type { AddedPlace, ConversationPlaces, PlaceRef, PlaceSummary } from '../placesProtocol'

export type { AddedPlace, PlaceRef, PlaceSummary }
export type ConversationPlacesView = ConversationPlaces

export const placeKey = (p: PlaceRef): string => (p.kind === 'user' ? 'user' : `project:${p.projectId}`)
export const refOf = (p: PlaceRef): PlaceRef => (p.kind === 'user' ? { kind: 'user' } : { kind: 'project', projectId: p.projectId })

/** How a place is described in the list of places to add: a project by the person's part in it, the person's own space by name. */
export function levelWords(p: PlaceSummary): string {
  if (p.kind === 'user') return 'Your space'
  return p.level === 'personal' ? 'Personal project' : `Project · ${p.level}`
}

/** What is shown once, before a place is added: what the agent gains, and what it can then carry between places. */
export function addNotice(agentName: string, place: string): string {
  return `${agentName} will be able to read ${place}'s knowledge and start work there. What it finds can reach the other places in this conversation.`
}

export function placeCount(view: ConversationPlacesView): string {
  const n = 1 + view.added.length
  return n === 1 ? '1 place' : `${n} places`
}
