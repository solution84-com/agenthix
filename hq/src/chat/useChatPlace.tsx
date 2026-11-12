import { useAuth } from 'wasp/client/auth'
import { useQuery, getMyPersonalProject } from 'wasp/client/operations'
import type { Place } from '../places/placeTypes'
import { useProjectPlace } from '../projects/place/useProjectPlace'

/**
 * Your space as a place (spec §7, §8): the personal project behind Chat, drawn as a project place — a personal
 * project's sections, Settings and Overview — with its conversations outside any project, with any agent, and its
 * tools in the person's own storage. Its sections are at `/space`; its conversations at `/chat`. Undefined until the
 * person and their space are known.
 */
export function useChatPlace(): Place | undefined {
  const { data: user } = useAuth()
  const { data: personal } = useQuery(getMyPersonalProject)
  const key = (personal as { key: string } | undefined)?.key
  const { project, place } = useProjectPlace(key)
  if (!user || !project?.personalSpace) return undefined
  return place
}
