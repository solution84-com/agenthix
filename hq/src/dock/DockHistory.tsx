import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { History } from 'lucide-react'
import { useQuery, getConversations } from 'wasp/client/operations'
import type { ConversationSummaryView } from '../shared/conversations/protocol'
import { rowTime } from '../places/conversationGroups'
import { CHAT_PATH } from '../chat/chatComposer'
import { useDock } from './DockContext'
import { canvasPlaceOf, useStartPlace, type StartPlace } from './startPlace'
import { DOCK_BUTTON } from './dockStyles'

const RECENT = 8

/**
 * 🕘 in the dock (spec §4): a short, flat list of the person's recent conversations in the place the canvas is on,
 * each with its place, and *All conversations*, the Chat page. Choosing one opens it in the dock.
 */
export function DockHistory() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Recent conversations"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Recent conversations"
        onClick={() => setOpen((v) => !v)}
        className={DOCK_BUTTON}
      >
        <History size={16} aria-hidden />
      </button>
      {open && <RecentList onDone={() => setOpen(false)} />}
    </div>
  )
}

function RecentList({ onDone }: { onDone: () => void }) {
  const { pathname } = useLocation()
  const place = useStartPlace(canvasPlaceOf(pathname))
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onDone} />
      <div
        role="menu"
        aria-label="Recent conversations"
        onKeyDown={(e) => { if (e.key === 'Escape') onDone() }}
        className="absolute right-0 top-full z-20 mt-1 w-80 overflow-hidden rounded-xl border border-border bg-surface-1 py-1 shadow-lg"
      >
        <p className="px-3 pb-1 pt-2 text-small font-medium text-text-muted">Recent</p>
        {place ? <Rows place={place} onDone={onDone} /> : <p className="px-3 py-2 text-small text-text-muted">Loading…</p>}
        <Link
          to={CHAT_PATH}
          role="menuitem"
          onClick={onDone}
          className="mt-1 block border-t border-border-subtle px-3 py-2 text-small font-medium text-accent hover:bg-surface-hover"
        >
          All conversations →
        </Link>
      </div>
    </>
  )
}

function Rows({ place, onDone }: { place: StartPlace; onDone: () => void }) {
  const dock = useDock()
  const { data, isLoading } = useQuery(getConversations, { home: place.home, projectId: place.projectId })
  const recent = useMemo(
    () => [...((data ?? []) as ConversationSummaryView[])]
      .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt))
      .slice(0, RECENT),
    [data],
  )
  if (isLoading) return <p className="px-3 py-2 text-small text-text-muted">Loading…</p>
  if (recent.length === 0) return <p className="px-3 py-2 text-small text-text-muted">No conversations in {place.label} yet.</p>
  return (
    <ul>
      {recent.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            role="menuitem"
            data-testid="dock-recent-row"
            aria-current={dock?.open?.conversationId === c.id ? 'true' : undefined}
            onClick={() => { onDone(); dock?.openConversation(c.id, place.basePath) }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover aria-[current]:bg-accent-subtle"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body text-text-primary">{c.title || 'New conversation'}</span>
              <span className="mt-0.5 inline-flex max-w-full rounded-full bg-accent-subtle px-2 text-small text-accent">
                <span className="truncate">{place.label}</span>
              </span>
            </span>
            <span className="shrink-0 text-small text-text-muted">{rowTime(c.lastMessageAt)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
