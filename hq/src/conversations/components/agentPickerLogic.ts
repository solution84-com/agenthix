import type { ConversationAgentView } from '../../shared/conversations/protocol'

/** The agents whose name, handle or role holds the search text, in the order the server gave them. */
export function filterAgents(agents: ConversationAgentView[], query: string): ConversationAgentView[] {
  const q = query.trim().toLowerCase()
  if (q === '') return agents
  return agents.filter(a => [a.name, a.handle, a.role ?? ''].some(part => part.toLowerCase().includes(q)))
}
