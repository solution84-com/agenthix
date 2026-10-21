/**
 * The archived conversations of a place, and finding one by what it was about: its title, its agent, and the words
 * in its latest messages (the record is sealed, so those are opened here, a bounded number at a time).
 */
import { prisma } from 'wasp/server'
import type { ConversationSummaryView } from '../../shared/conversations/protocol'
import { openJson } from '../sealing'
import { AGENT_SELECT, toSummaryView } from '../conversationQueries'

export const ARCHIVED_LIST_LIMIT = 200
/** How many of a conversation's latest messages a search reads, so a search costs the same however long they are. */
const SCANNED_MESSAGES = 100

type Where = { home: 'PERSON' | 'PROJECT'; projectId?: string; openedById: string }

async function saysIt(conversationId: string, needle: string): Promise<boolean> {
  const rows = await prisma.conversationMessage.findMany({
    where: { conversationId, kind: 'TEXT' },
    select: { body: true },
    orderBy: { seq: 'desc' },
    take: SCANNED_MESSAGES,
  })
  return rows.some((row) => {
    try {
      return (openJson<{ text?: unknown }>(row.body).text as string | undefined)?.toLowerCase().includes(needle) ?? false
    } catch {
      return false
    }
  })
}

export async function archivedConversations(where: Where, query: string | undefined): Promise<ConversationSummaryView[]> {
  const rows = await prisma.conversation.findMany({
    where: { ...where, status: 'ARCHIVED' },
    include: { agent: AGENT_SELECT },
    orderBy: { lastMessageAt: 'desc' },
    take: ARCHIVED_LIST_LIMIT,
  })
  const needle = query?.trim().toLowerCase()
  if (!needle) return rows.map(toSummaryView)
  const kept: typeof rows = []
  for (const row of rows) {
    if ((row.title ?? '').toLowerCase().includes(needle) || (row.agent?.name ?? '').toLowerCase().includes(needle) || await saysIt(row.id, needle)) kept.push(row)
  }
  return kept.map(toSummaryView)
}
