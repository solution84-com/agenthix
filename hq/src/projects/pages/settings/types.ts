/** What Settings reads from `getProjectByKey`, cast at the boundary. */
export type SettingsProject = {
  id: string
  name: string
  key: string
  description: string | null
  productId: string | null
  programId: string | null
  accessLevel: 'OPEN' | 'PRIVATE'
  personalOwnerId: string | null
  /** Your space: its name and key are fixed, and it is never deleted. */
  personalSpace?: boolean
  defaultAgentId: string | null
  lead: { userId: string; username: string } | null
  executionSite: { id: string; label: string } | null
  product: { id: string; name: string } | null
  program: { id: string; name: string } | null
  agents: { agentId: string; agent: { id: string; name: string } }[]
  tasks: unknown[]
}
