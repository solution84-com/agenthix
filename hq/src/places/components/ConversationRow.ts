export interface ConversationRowData {
  id: string
  title: string | null
  lastActivityAt: string | Date
  agent: { id: string; name: string; avatarUrl: string | null }
  lastEntry: { content: string; role: string } | null
  /** A run is in progress in it. */
  working?: boolean
}
