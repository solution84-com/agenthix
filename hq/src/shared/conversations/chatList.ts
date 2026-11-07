/**
 * The Chat page's list: the whole Conversations list with more ways to narrow it — a project, an agent and the
 * archived ones. The page keeps its search and filters in its address, so the chat's bar can open the same list
 * (*Open in Chat*) and a list can be shared or come back after a reload. Client-safe. (`agent` is not one of its
 * parameters: `/chat?agent=<id>` is the address that starts a new conversation with that agent.)
 */
import { filterInbox, type InboxConversation, type InboxFilters } from './inbox'

/** The project filter's value for the person's own space. */
export const SPACE_FILTER = 'space'

export type ChatListView = {
  search: string
  filters: InboxFilters
  /** A project's id, or `SPACE_FILTER`; null for every place. */
  place: string | null
  agentId: string | null
  archived: boolean
}

export const EMPTY_VIEW: ChatListView = { search: '', filters: { needsYou: false, unread: false }, place: null, agentId: null, archived: false }

const PARAMS = { search: 'q', needsYou: 'needs', unread: 'unread', place: 'project', agentId: 'with', archived: 'archived' } as const

/** Reads the list's view from an address's query string; anything else in it is ignored. */
export function readChatList(search: string): ChatListView {
  const p = new URLSearchParams(search)
  return {
    search: p.get(PARAMS.search) ?? '',
    filters: { needsYou: p.get(PARAMS.needsYou) === '1', unread: p.get(PARAMS.unread) === '1' },
    place: p.get(PARAMS.place) || null,
    agentId: p.get(PARAMS.agentId) || null,
    archived: p.get(PARAMS.archived) === '1',
  }
}

/** Writes the view onto `base` (an address's other parameters, kept); what is off is left out. */
export function withChatList(base: URLSearchParams | string, view: ChatListView): URLSearchParams {
  const p = new URLSearchParams(base)
  for (const name of Object.values(PARAMS)) p.delete(name)
  if (view.search.trim()) p.set(PARAMS.search, view.search.trim())
  if (view.filters.needsYou) p.set(PARAMS.needsYou, '1')
  if (view.filters.unread) p.set(PARAMS.unread, '1')
  if (view.place) p.set(PARAMS.place, view.place)
  if (view.agentId) p.set(PARAMS.agentId, view.agentId)
  if (view.archived) p.set(PARAMS.archived, '1')
  return p
}

/** The Chat page's address for a view. */
export function chatListPath(chatPath: string, view: Partial<ChatListView>): string {
  const query = withChatList('', { ...EMPTY_VIEW, ...view }).toString()
  return query ? `${chatPath}?${query}` : chatPath
}

const inPlaceFilter = (c: InboxConversation, place: string) =>
  place === SPACE_FILTER ? c.place.kind === 'space' : c.place.kind === 'project' && c.place.id === place

/** Still newest first: the search and the two toggles as the bar's list has them, then the project and the agent. */
export function filterChatList(conversations: InboxConversation[], view: ChatListView): InboxConversation[] {
  return filterInbox(conversations, view.filters, view.search).filter((c) =>
    (view.place === null || inPlaceFilter(c, view.place)) && (view.agentId === null || c.agent?.id === view.agentId))
}

/** The projects and agents the list's own filters offer: only those with a conversation in the list. */
export function chatListChoices(conversations: InboxConversation[]) {
  const places = new Map<string, string>()
  const agents = new Map<string, string>()
  for (const c of conversations) {
    if (c.place.kind === 'space') places.set(SPACE_FILTER, 'Your space')
    else places.set(c.place.id, c.place.name)
    if (c.agent) agents.set(c.agent.id, c.agent.name)
  }
  const sorted = (m: Map<string, string>) => [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  return { places: sorted(places), agents: sorted(agents) }
}
