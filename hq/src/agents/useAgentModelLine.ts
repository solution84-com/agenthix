import { useCallback } from 'react'
import { getAgentModelLines, useQuery } from 'wasp/client/operations'

/**
 * What an agent's models are shown as where agents are listed (models from one place, part 4): its own conversation
 * model, else that it follows the organisation's default. Empty while it loads.
 */
export function useAgentModelLine(): (agentId: string) => string {
  const { data } = useQuery(getAgentModelLines)
  return useCallback((agentId: string) => (data ? data.lines[agentId] ?? data.orgDefault : ''), [data])
}
