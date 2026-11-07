/**
 * On screen and the task's thread (conversational experience spec, On screen; the overview's task-thread rules;
 * phase 6): a task's thread, the board's thread marks and unread counts, archiving, and finding a conversation's
 * runs. Re-exported from protocol.ts. Client-safe; `type` aliases only.
 */
import type { ConversationAgentView, ConversationSummaryView, ConversationView } from './protocol'

export type { ConversationPersonView, MarkConversationReadArgs } from '@agenthix/core'

export type TaskConversationArgs = { taskId: string }
/**
 * A task's thread as its page shows it: the conversation once someone has spoken in it; whether this viewer may
 * start or speak in it, and why not (`assign an agent to talk here` when the task has no agent); its lead now.
 */
export type TaskConversationView = {
  conversation: ConversationView | null
  canStart: boolean
  refusal: string | null
  lead: ConversationAgentView | null
}
export type StartTaskConversationArgs = { taskId: string; clientMessageId: string; text: string }

/** The board's thread mark on a task's card, with this viewer's unread count. */
export type TaskThreadMarksArgs = { projectId: string }
export type TaskThreadMark = { taskId: string; conversationId: string; unread: number }

/** Archive (on-screen spec): idle conversations are hidden, kept, found and reopened; a person may keep one out. */
export type SetConversationKeepArgs = { conversationId: string; keep: boolean }
/** Rename: a person who may write in a conversation gives it a title of their own. */
export type RenameConversationArgs = { conversationId: string; title: string }
export type ReopenConversationArgs = { conversationId: string }
export type GetArchivedConversationsArgs = { home: 'PERSON' | 'PROJECT'; projectId?: string; query?: string }
export type ArchivedConversationsView = { conversations: ConversationSummaryView[] }

/** Finding a conversation's runs: what its runs said, asked of their sites only when used. */
export type SearchConversationRunsArgs = { conversationId: string; query: string }
export type ConversationRunHit = {
  runId: string
  /** The session it ran on, which opens it on the Runs screen. */
  sessionId: string
  siteId: string
  /** The work it was, in the person's words: the operation's title. */
  title: string | null
  at: string
  excerpt: string
}
export type ConversationRunHits = { hits: ConversationRunHit[]; unavailable: string[] }
