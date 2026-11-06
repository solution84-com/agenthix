import { NewConversationBox } from '../../conversations/components/NewConversationBox'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import type { Place } from '../placeTypes'

/** The agent a new conversation starts with: the place's default when it may be talked to here, else the first. */
export function startingAgentId(place: Pick<Place, 'agents' | 'defaultAgentId'>): string {
  if (place.defaultAgentId && place.agents.some((a) => a.id === place.defaultAgentId)) return place.defaultAgentId
  return place.agents[0]?.id ?? ''
}

/** What the message box needs of a place. */
export type ComposerPlace = Pick<Place, 'basePath' | 'sessionLocation' | 'agents' | 'defaultAgentId' | 'composerPlaceholder' | 'noAgentsNotice'>

/**
 * A place's message box: the one box conversations start from (`NewConversationBox`), offering the place's own
 * agents — an agent's page has only that agent — and starting with the place's default. Sending the first message
 * starts a new conversation in the place's project or else in the person's own space, and opens it. A project's
 * Viewer talks to none of its agents (adr-0102), so they get a line saying so in its place.
 */
export function PlaceComposer({ place, autoFocus = false }: { place: ComposerPlace; autoFocus?: boolean }) {
  const projectId = place.sessionLocation?.primaryOwnerId
  const mayWork = useMayWork(projectId)
  if (!mayWork) return <p className="shrink-0 px-4 pb-4 pt-2 text-small text-text-muted">{VIEWER_CANNOT_WORK}</p>
  return (
    <NewConversationBox
      home={projectId ? 'PROJECT' : 'PERSON'}
      projectId={projectId}
      basePath={place.basePath}
      placeholder={place.composerPlaceholder}
      noAgentsNotice={place.noAgentsNotice}
      agentId={startingAgentId(place) || undefined}
      onlyAgentIds={place.agents.map((a) => a.id)}
      autoFocus={autoFocus}
    />
  )
}
