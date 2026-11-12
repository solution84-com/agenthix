import { useMemo } from 'react'
import { useQuery, getAgents } from 'wasp/client/operations'
import type { ComposerPlace } from '../places/components/PlaceComposer'

export const CHAT_PATH = '/chat'

/**
 * Chat's message box (spec §7, §8): any agent in the organisation, and a new
 * conversation works in the person's own storage (no location). Home starts
 * conversations here too.
 */
export function useChatComposerPlace(defaultAgentId: string | null): ComposerPlace {
  const { data } = useQuery(getAgents)
  const agents = useMemo(
    () => (data ?? []).map((a) => ({ id: a.id, name: a.name, avatarUrl: a.avatarUrl })),
    [data],
  )
  return chatComposerPlace(agents, defaultAgentId)
}

/** Chat's message box from the organisation's agents, once read. */
export function chatComposerPlace(agents: ComposerPlace['agents'], defaultAgentId: string | null): ComposerPlace {
  return {
    basePath: CHAT_PATH,
    sessionLocation: null,
    agents,
    defaultAgentId,
    composerPlaceholder: 'Ask any agent…',
    noAgentsNotice: 'Add an agent to the organisation to talk to it',
  }
}
