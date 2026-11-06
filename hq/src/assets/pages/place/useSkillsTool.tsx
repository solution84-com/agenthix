import { useMemo } from 'react'
import { useQuery, getPlaceSkills } from 'wasp/client/operations'
import type { PlaceTool } from '../../../places/placeTypes'
import { retryUnlessDenied } from '../../../projects/place/retryUnlessDenied'
import { PlaceSkillsTool, type SkillsPlace } from './PlaceSkillsTool'
import { pageCounts, type PlaceSkillsData } from './placeSkillsModel'

/** How often the count beside Skills is read again. */
export const SKILLS_COUNT_REFRESH_MS = 30_000

/**
 * The Skills entry of a place's panel under *Agents at work* (skills spec part 6): the number of skills found, or *N
 * need you* in the panel's needs tone for the people who can switch them. Undefined while there is no place.
 */
export function useSkillsTool(place: SkillsPlace | undefined): PlaceTool | undefined {
  const projectId = place?.projectId
  const { data } = useQuery(getPlaceSkills, projectId ? { projectId } : undefined, {
    enabled: !!projectId, retry: retryUnlessDenied, refetchInterval: SKILLS_COUNT_REFRESH_MS,
  })
  const view = data as PlaceSkillsData | undefined
  const counts = view ? pageCounts(view.skills, view.may) : undefined
  const needYou = counts?.needYou ?? 0
  const total = view ? view.skills.filter((s) => !s.gone).length : undefined
  const name = place?.name
  const isSpace = place?.isSpace
  const agentKey = place?.agents.map((a) => `${a.id}:${a.name}`).join('|')
  return useMemo(() => {
    if (!projectId || name === undefined) return undefined
    const here: SkillsPlace = { projectId, name, isSpace: !!isSpace, agents: place?.agents ?? [] }
    return {
      id: 'skills',
      label: 'Skills',
      count: needYou > 0 ? `${needYou} need you` : total === undefined ? undefined : String(total),
      tone: needYou > 0 ? 'needs' as const : undefined,
      render: () => <PlaceSkillsTool place={here} />,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, name, isSpace, agentKey, needYou, total])
}
