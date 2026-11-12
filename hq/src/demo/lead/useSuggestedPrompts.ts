import { getDemoInfo, useQuery } from 'wasp/client/operations'

/** The demo's suggested prompts for an agent, by its handle; none outside demo mode or for an agent with none. */
export function useSuggestedPrompts(agentHandle: string | null | undefined): string[] {
  const { data } = useQuery(getDemoInfo)
  if (!data?.on || !agentHandle) return []
  return data.agents[agentHandle]?.suggestedPrompts ?? []
}
