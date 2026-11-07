/**
 * The conversations list's rows apart from the database: which of a person's conversations they may open, and each
 * one's view from what was read about it. Pure, so the scope and the state are unit-tested.
 */
import type { ConversationAgentView } from '@agenthix/core'
import type { InboxConversation, InboxPlace } from '../../shared/conversations/inbox'
import { cutShort, plainText } from '../plainText'
import { CLOSED_WITH_ITS_PROJECT } from '../readingRule'

/** How long the last line may be on a row. */
export const LAST_LINE_MAX = 140

/** The list holds the open conversations, or with `archived` only the archived ones. */
export function inboxStatusWhere(archived: boolean): { status: 'ARCHIVED' } | { status: { not: 'ARCHIVED' } } {
  return archived ? { status: 'ARCHIVED' } : { status: { not: 'ARCHIVED' } }
}

export type Standing = 'works' | 'reads' | 'none'

export interface InboxSource {
  id: string
  home: 'PERSON' | 'PROJECT' | 'TASK'
  projectId: string | null
  status: string
  closedReason: string | null
  title: string | null
  lastSeq: number
  lastMessageAt: Date
  activeTurnId: string | null
  agent: ConversationAgentView | null
  project: { id: string; key: string; name: string; personalSpace: boolean } | null
}

/**
 * The reading rule (readingRule.ts) for the person's own conversations, given their standing in each project: a
 * conversation in their space is theirs; one in a project needs them still on it, unless it closed because they left
 * or the project was deleted.
 */
export function mayOpen(row: Pick<InboxSource, 'home' | 'projectId' | 'status' | 'closedReason'>, standing: (projectId: string) => Standing): boolean {
  if (row.home === 'PERSON') return true
  if (row.home !== 'PROJECT' || !row.projectId) return false
  if (standing(row.projectId) !== 'none') return true
  return row.status === 'CLOSED' && (CLOSED_WITH_ITS_PROJECT as readonly string[]).includes(row.closedReason ?? '')
}

/** A person's own space is a project underneath; it is shown as their space. */
export function placeOf(row: Pick<InboxSource, 'home' | 'project'>): InboxPlace {
  if (row.home !== 'PROJECT' || !row.project || row.project.personalSpace) return { kind: 'space' }
  return { kind: 'project', id: row.project.id, key: row.project.key, name: row.project.name }
}

export interface InboxFacts {
  unread: number
  needsYou: number
  /** Work under way that is not waiting for the person. */
  otherLiveWork: boolean
  lastText: { byPerson: boolean; text: string } | null
}

export function inboxConversationOf(row: InboxSource, facts: InboxFacts): InboxConversation {
  const text = facts.lastText ? cutShort(plainText(facts.lastText.text), LAST_LINE_MAX) : ''
  return {
    id: row.id,
    title: row.title,
    place: placeOf(row),
    agent: row.agent,
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastSeq: row.lastSeq,
    lastLine: facts.lastText && text ? { by: facts.lastText.byPerson ? 'you' : 'agent', text } : null,
    needsYou: facts.needsYou,
    unread: facts.unread,
    working: row.activeTurnId !== null || facts.otherLiveWork,
  }
}
