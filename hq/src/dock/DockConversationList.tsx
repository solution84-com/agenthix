import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Maximize2, Search } from 'lucide-react'
import { CHAT_PATH } from '../chat/chatComposer'
import { chatListPath } from '../shared/conversations/chatList'
import { filterInbox, NO_FILTERS, type InboxConversation, type InboxFilters } from '../shared/conversations/inbox'
import { useConversationInbox } from './useConversationInbox'
import { InboxRow } from './InboxRow'
import { InboxChips } from './InboxChips'
import { InboxDayList } from './InboxDayList'
import { basePathOf } from './pinnedPlaces'

/** How many rows show at first, and how many more each *Show older* adds. */
export const PAGE = 40
const FILTERS_KEY = 'dock-conversation-filters'

function readFilters(): InboxFilters {
  try {
    const stored = JSON.parse(localStorage.getItem(FILTERS_KEY) ?? 'null') as Partial<InboxFilters> | null
    return { needsYou: stored?.needsYou === true, unread: stored?.unread === true }
  } catch {
    return NO_FILTERS
  }
}

/** The filters stay as the person left them the next time the list opens. */
function useStoredFilters(): [InboxFilters, (next: InboxFilters) => void] {
  const [filters, setFilters] = useState(readFilters)
  useEffect(() => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(filters)) } catch { /* not kept: still applied */ }
  }, [filters])
  return [filters, setFilters]
}

/** The list's search and filters, held by the overlays so the links to the Chat page can carry them over. */
export type ListView = { search: string; setSearch: (search: string) => void; filters: InboxFilters; setFilters: (filters: InboxFilters) => void }

export function useListView(open: boolean): ListView {
  const [filters, setFilters] = useStoredFilters()
  const [search, setSearch] = useState('')
  // A search is for one opening of the list; the filters stay as the person left them.
  useEffect(() => { if (!open) setSearch('') }, [open])
  return { search, setSearch, filters, setFilters }
}

const chatPathOf = (view: ListView) => chatListPath(CHAT_PATH, { search: view.search, filters: view.filters })

/** *Open in Chat*: the same list on the Chat page, full width, with the search and filters as they are here. */
export function OpenInChat({ view, onGo }: { view: ListView; onGo: () => void }) {
  return (
    <Link to={chatPathOf(view)} onClick={onGo} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-small font-medium text-accent hover:bg-surface-hover">
      <Maximize2 size={13} aria-hidden /> Open in Chat
    </Link>
  )
}

/**
 * The Conversations overlay (the board's states 4 and 5): every conversation, newest first, with a search and two
 * toggle filters, Needs you and Unread, each with its count. Choosing a row opens it in the panel.
 */
export function DockConversationList({ view, openId, onChoose, onGo }: {
  view: ListView
  openId: string | null
  onChoose: (conversationId: string, basePath: string) => void
  /** Called when a link leaves for another page. */
  onGo: () => void
}) {
  const { inbox, loaded } = useConversationInbox()
  const { filters, setFilters, search, setSearch } = view
  const [shown, setShown] = useState(PAGE)
  const rows = useMemo(() => filterInbox(inbox.conversations, filters, search), [inbox.conversations, filters, search])
  const filtered = filters.needsYou || filters.unread

  return (
    <div data-testid="dock-conversations" className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 px-3 pb-2">
        <SearchBox label="Search conversations" value={search} onChange={(v) => { setSearch(v); setShown(PAGE) }} />
        <InboxChips filters={filters} totals={inbox} onChange={(next) => { setFilters(next); setShown(PAGE) }} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!loaded
          ? <p className="px-2 py-3 text-small text-text-muted">Loading…</p>
          : <Rows rows={rows} shown={shown} openId={openId} onChoose={onChoose} empty={emptyWords(filtered, search)} />}
        <p className="flex flex-wrap items-center justify-center gap-x-2 px-2 pt-2 text-small text-text-muted">
          {loaded && rows.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="font-medium text-accent hover:underline">Show older</button>
          )}
          {loaded && rows.length > 0 && rows.length <= shown && filtered && !search && <span>That's everything waiting.</span>}
          <Link to={chatPathOf(view)} onClick={onGo} className="font-medium text-accent hover:underline">All in Chat →</Link>
        </p>
      </div>
    </div>
  )
}

function emptyWords(filtered: boolean, search: string): string {
  if (search.trim()) return 'No conversation matches that.'
  return filtered ? 'Nothing is waiting for you.' : 'No conversations yet.'
}

function Rows({ rows, shown, openId, onChoose, empty }: {
  rows: InboxConversation[]
  shown: number
  openId: string | null
  onChoose: (conversationId: string, basePath: string) => void
  empty: string
}) {
  if (rows.length === 0) return <p className="px-2 py-3 text-small text-text-muted">{empty}</p>
  return (
    <InboxDayList
      rows={rows.slice(0, shown)}
      label="Conversations"
      row={(c) => <InboxRow key={c.id} conversation={c} open={c.id === openId} onChoose={() => onChoose(c.id, basePathOf(c.place))} />}
    />
  )
}

export function SearchBox({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 focus-within:border-accent">
      <Search size={14} aria-hidden className="shrink-0 text-text-muted" />
      <input
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-body text-text-primary placeholder:text-text-muted focus:outline-none"
      />
    </label>
  )
}
