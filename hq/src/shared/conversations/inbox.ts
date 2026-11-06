/**
 * The person's conversations as the chat's bar and its Conversations list show them: every conversation they can
 * open, newest first, each with what is going on in it. Client-safe, and `type` aliases only (Wasp's payload check needs them): the server builds it, the bar and its
 * overlays filter and count it.
 */
import type { ConversationAgentView } from '@agenthix/core'

/** Where a conversation lives: the person's own space, or a project by its key. */
export type InboxPlace = { kind: 'space' } | { kind: 'project'; id: string; key: string; name: string }

export type InboxConversation = {
  id: string
  title: string | null
  place: InboxPlace
  agent: ConversationAgentView | null
  lastMessageAt: string
  /** The conversation's newest message number, for marking it read. */
  lastSeq: number
  /** The latest thing said in it, made plain, and who said it: the person, or the agent. */
  lastLine: { by: 'you' | 'agent'; text: string } | null
  /** Requests in it waiting for the person's okay. */
  needsYou: number
  /** What someone else said or what came back since the person last read it. */
  unread: number
  /** A reply or other work under way in it. */
  working: boolean
}

export type ConversationInbox = {
  conversations: InboxConversation[]
  /** Conversations that need the person or have something unread: the bar's one badge. */
  waiting: number
  needsYou: number
  unread: number
}

export const isWaiting = (c: Pick<InboxConversation, 'needsYou' | 'unread'>) => c.needsYou > 0 || c.unread > 0

/** The totals over a list: each conversation counted once in `waiting`, whatever it is waiting for. */
export function inboxTotals(conversations: Pick<InboxConversation, 'needsYou' | 'unread'>[]): Omit<ConversationInbox, 'conversations'> {
  return {
    waiting: conversations.filter(isWaiting).length,
    needsYou: conversations.filter((c) => c.needsYou > 0).length,
    unread: conversations.filter((c) => c.unread > 0).length,
  }
}

/** The list's two filters: toggles, so none, either or both. */
export type InboxFilters = {
  needsYou: boolean
  unread: boolean
}

export const NO_FILTERS: InboxFilters = { needsYou: false, unread: false }

const placeName = (place: InboxPlace) => (place.kind === 'space' ? 'Your space' : place.name)

/** Newest first by `lastMessageAt`, the time a row shows, so the order and the times always agree; equal times keep their order. */
export function newestFirst<T extends Pick<InboxConversation, 'lastMessageAt'>>(conversations: T[]): T[] {
  return [...conversations].sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt))
}

/**
 * The conversations the list shows, newest first by the time each row shows: with no filter on, all of them; with
 * one or both on, those that match either one that is on. A search keeps those whose title, agent, place or last
 * line holds it.
 */
export function filterInbox(conversations: InboxConversation[], filters: InboxFilters, search = ''): InboxConversation[] {
  const q = search.trim().toLowerCase()
  const anyFilter = filters.needsYou || filters.unread
  return newestFirst(conversations).filter((c) => {
    if (anyFilter && !((filters.needsYou && c.needsYou > 0) || (filters.unread && c.unread > 0))) return false
    if (!q) return true
    return [c.title ?? 'New conversation', c.agent?.name ?? '', placeName(c.place), c.lastLine?.text ?? '']
      .some((s) => s.toLowerCase().includes(q))
  })
}

/** Whether a conversation lives in a place: a project by its id, or the person's own space. */
export function inPlace(c: Pick<InboxConversation, 'place'>, placeId: string | null): boolean {
  return placeId === null ? c.place.kind === 'space' : c.place.kind === 'project' && c.place.id === placeId
}

/** What a pinned place's tile in the bar carries: whether anything in it needs the person, how many are unread, and work under way. */
export type PlaceSignals = {
  needsYou: number
  unread: number
  working: boolean
  conversations: number
}

/** `placeId` null is the person's own space. */
export function placeSignals(conversations: InboxConversation[], placeId: string | null): PlaceSignals {
  const here = conversations.filter((c) => inPlace(c, placeId))
  return {
    needsYou: here.filter((c) => c.needsYou > 0).length,
    unread: here.filter((c) => c.unread > 0).length,
    working: here.some((c) => c.working),
    conversations: here.length,
  }
}

/** A tile's hover text: "Website relaunch · 1 needs you · 5 conversations". */
export function placeSignalWords(name: string, s: PlaceSignals): string {
  return [
    name,
    s.needsYou ? `${s.needsYou} ${s.needsYou === 1 ? 'needs' : 'need'} you` : null,
    s.unread ? `${s.unread} unread` : null,
    s.working ? 'working' : null,
    `${s.conversations} ${s.conversations === 1 ? 'conversation' : 'conversations'}`,
  ].filter(Boolean).join(' · ')
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** A day heading in the person's calendar days: Today, Yesterday, then the date (with the year for another year). */
export function dayHeading(value: Date | string, now: Date = new Date()): string {
  const d = new Date(value)
  // Math.round absorbs a daylight-saving hour.
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  const dayMonth = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth} ${d.getFullYear()}`
}

/** Rows (already newest first) under their day headings. */
export function groupByDay(conversations: InboxConversation[], now: Date = new Date()): { heading: string; rows: InboxConversation[] }[] {
  const groups: { heading: string; rows: InboxConversation[] }[] = []
  for (const c of conversations) {
    const heading = dayHeading(c.lastMessageAt, now)
    const last = groups[groups.length - 1]
    if (last?.heading === heading) last.rows.push(c)
    else groups.push({ heading, rows: [c] })
  }
  return groups
}
