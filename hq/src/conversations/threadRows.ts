/**
 * A place's list of new conversations, in the row shape the list's filter and grouping already take, the most
 * recently active first.
 */
import type { ConversationRowData } from '../places/components/ConversationRow'
import type { ConversationSummaryView } from '../shared/conversations/protocol'
import { closedMark } from './closedCopy'
import { threadPath } from './threadPaths'

export type ThreadRow = ConversationRowData & {
  href: string
  /** A quiet mark beside the agent's name: "Closed · its project was deleted". */
  mark: string | null
}

export function conversationRow(c: ConversationSummaryView, basePath: string): ThreadRow {
  // An agent that was removed leaves its conversations listed under no agent.
  const agent = c.agent ?? { id: '', name: 'Removed agent', avatarUrl: null, handle: '' }
  return {
    id: c.id,
    title: c.title,
    lastActivityAt: c.lastMessageAt,
    agent: { id: agent.id, name: agent.name, avatarUrl: agent.avatarUrl },
    lastEntry: null,
    href: threadPath(basePath, c.id),
    mark: c.status === 'CLOSED' ? closedMark(c.closedReason) : null,
  }
}

export function threadRows(conversations: ConversationSummaryView[], basePath: string): ThreadRow[] {
  return conversations
    .map((c) => conversationRow(c, basePath))
    .sort((a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt))
}
