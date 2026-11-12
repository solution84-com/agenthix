import type { Place, PlaceAgent, PlaceFact, PlaceTool } from '../places/placeTypes'
import { PersonalProjectsFact } from '../projects/place/PersonalProjectsFact'
import { ChatAgentsFact } from './ChatAgentsFact'
import { ChatAgentsTool } from './ChatAgentsTool'
import { CHAT_PATH, chatComposerPlace } from './chatComposer'
import { SPACE_PATH } from './chatPlacePaths'

/** Your space's facts. The Site appears only once the person's storage has been placed on one. */
export function chatFacts(site: { id: string; label: string } | null | undefined): PlaceFact[] {
  return [
    { label: 'Who sees it', value: 'Only you' },
    { label: 'Agents', value: <ChatAgentsFact /> },
    { label: 'Personal projects', value: <PersonalProjectsFact /> },
    ...(site ? [{ label: 'Site', value: site.label }] : []),
    { label: 'Files', value: 'Your personal files' },
  ]
}

/**
 * The roster of a personal place (Your space or a personal project): a section of its own, and what the Overview's
 * Agents card opens.
 */
export function chatLinkedTools(projectId: string | undefined): PlaceTool[] {
  return [{ id: 'agents', label: 'Agents', render: () => <ChatAgentsTool projectId={projectId} /> }]
}

/**
 * What makes the personal project behind Chat Your space (spec §7, §8): its own address at `/space`, its
 * conversations at `/chat`, any agent in the organisation to talk to, and new conversations in the person's own
 * storage. The rest of the place is the project place's.
 */
export function spacePlaceFields(agents: PlaceAgent[], site: { id: string; label: string } | null | undefined): Partial<Place> {
  return {
    ...chatComposerPlace(agents, null),
    homePath: SPACE_PATH,
    breadcrumbs: [{ label: 'Chat', href: CHAT_PATH }],
    name: 'Your space',
    talkLabel: 'Talk in your space',
    factsHeading: 'Your space',
    backHref: null,
    projectId: null,
    facts: chatFacts(site),
  }
}
