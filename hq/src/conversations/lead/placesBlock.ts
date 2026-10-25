/**
 * What the lead is told of its places every turn (agent knowledge spec, part 4, P6): the conversation's places by the
 * names the person sees, read from the same re-checked list the tools use (../places.ts), after the cached part of
 * the prompt. A place the person lost is no longer among them, so it is no longer named.
 */
import type { PlaceSummary } from '../placesProtocol'
import { addedPlaces, ownPlace, placeKey, placesConversation, samePlace, summaries, type Place } from '../places'

export interface PlacesForLead {
  /** The conversation's own place; null when its project is gone. */
  own: PlaceSummary | null
  /** Those the person added, oldest first. */
  added: PlaceSummary[]
}

const named = (p: PlaceSummary) => `${p.name} (its pages are named ${p.level}:)`

export function placesTurnBlock({ own, added }: PlacesForLead): string {
  const lines = ["[This conversation's places, checked this turn]"]
  if (own) lines.push(`- ${named(own)}: the conversation's own`)
  for (const p of added) lines.push(`- ${named(p)}: added by the person`)
  if (!own && added.length === 0) lines.push('- none: its project is gone')
  lines.push(
    "The organisation's knowledge (org:) and the platform guide (platform:) are always in reach.",
    'Any other place, a project or the person\'s space, is out of reach until the person adds it: you cannot search',
    'it or start work there, so finding nothing in it does not mean it is empty. When the person names one or needs',
    'one, offer it with suggest_place; never answer as if it were empty, and never use one of these places instead.',
  )
  return lines.join('\n')
}

/** The places as the turn's tools reach them, by their names; null for a conversation that is gone. */
export async function placesForLead(conversationId: string): Promise<PlacesForLead | null> {
  const conversation = await placesConversation(conversationId)
  if (!conversation) return null
  const [own, added] = await Promise.all([ownPlace(conversation), addedPlaces(conversation)])
  const others: Place[] = added.map(a => a.place).filter(p => !own || !samePlace(p, own))
  const names = await summaries(own ? [own, ...others] : others)
  const summaryOf = (p: Place) => names.get(placeKey(p)) ?? null
  return {
    own: own ? summaryOf(own) : null,
    added: others.map(summaryOf).filter((s): s is PlaceSummary => s !== null),
  }
}
