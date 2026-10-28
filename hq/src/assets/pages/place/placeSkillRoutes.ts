/**
 * Where a place's skill is edited: the editor is another screen (the Library's editor). A new skill for this place or
 * for one agent of it, and an existing place skill's draft, are named here once.
 */
import { LIBRARY_NEW_SKILL_PATH } from '../../../library/components/libraryRoutes'

export const newPlaceSkillPath = (projectId: string, agentId?: string | null): string => {
  const q = new URLSearchParams({ place: projectId })
  if (agentId) q.set('agent', agentId)
  return `${LIBRARY_NEW_SKILL_PATH}?${q.toString()}`
}

export const editPlaceSkillPath = (placeSkillId: string): string => `/library/place-skills/${encodeURIComponent(placeSkillId)}`
