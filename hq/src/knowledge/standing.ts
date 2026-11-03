/**
 * The places a call reaches, as the person it acts for stands in them at this call (agent knowledge spec, part 4,
 * *Who reaches what*; adr-0102). A run's or a turn's places are built from what hq signed when it began; a person
 * removed from a project since reaches none of its knowledge, and one made its Viewer reads it and changes nothing.
 * Every tool call passes through here, so a change of standing applies from the next call.
 */
import type { KnowledgeDeps } from './deps'
import type { KnowledgeReach } from './reach'

export async function reachNow(deps: KnowledgeDeps, reach: KnowledgeReach): Promise<KnowledgeReach> {
  const places: KnowledgeReach['places'] = []
  for (const place of reach.places) {
    const standing = await deps.standing(place.owner, reach.userId)
    if (standing === 'none') continue
    places.push({ level: place.level, owner: place.owner, ...(standing === 'reads' ? { readOnly: true } : {}) })
  }
  return { ...reach, places }
}
