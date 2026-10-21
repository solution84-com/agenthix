import type { ConversationRowData } from './components/ConversationRow'

/** The agents a place's conversations are with, each once, in the order they first appear. */
export function agentsOf(rows: ConversationRowData[]): { id: string; name: string }[] {
  const seen = new Map<string, string>()
  for (const r of rows) if (!seen.has(r.agent.id)) seen.set(r.agent.id, r.agent.name)
  return [...seen].map(([id, name]) => ({ id, name }))
}

/** The rows with one agent (or any, for null) whose title, agent or preview contains the search, ignoring case. */
export function filterConversations(rows: ConversationRowData[], agentId: string | null, search: string): ConversationRowData[] {
  const needle = search.trim().toLowerCase()
  return rows.filter((r) => {
    if (agentId && r.agent.id !== agentId) return false
    if (!needle) return true
    return [r.title, r.agent.name, r.lastEntry?.content].some((t) => t?.toLowerCase().includes(needle))
  })
}
