/**
 * The facts every Agents view shows of an agent, read once in one shape: who
 * it is (name, role, handle, avatar and cover) and its own settings (approval). The profile card, the cards on the Agents screen, the
 * Agents tool and Organisation › Agents all start from these.
 */
export const AGENT_FACTS_SELECT = {
  id: true, name: true, handle: true, role: true, avatarUrl: true, coverUrl: true,
  approval: true, isKernel: true,
} as const

export type AgentFacts = {
  id: string
  name: string
  handle: string
  role: string | null
  avatarUrl: string | null
  coverUrl: string | null
  approval: string
  isKernel: boolean
}
