import { useMemo, useState } from 'react'
import { BUTTON_GHOST, FOCUS_RING } from '@agenthix/ui/primitives'
import { Link } from 'react-router'
import { ArrowUpRight, Plus } from 'lucide-react'
import { filterInbox, inPlace, NO_FILTERS } from '../shared/conversations/inbox'
import { useConversationInbox } from './useConversationInbox'
import { InboxRow } from './InboxRow'
import { SearchBox, PAGE } from './DockConversationList'
import type { PinnedPlace } from './pinnedPlaces'

/**
 * A pinned place's overlay (the board's state 8): its conversations, most recent first, each with its state in
 * words; *Open project* moves the page there, *New conversation here* starts one in it.
 */
export function DockPlaceConversations({ place, openId, onChoose, onNew, onGo }: {
  place: PinnedPlace
  openId: string | null
  onChoose: (conversationId: string, basePath: string) => void
  onNew: () => void
  onGo: () => void
}) {
  const { inbox, loaded } = useConversationInbox()
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(PAGE)
  const rows = useMemo(
    () => filterInbox(inbox.conversations.filter((c) => inPlace(c, place.placeId)), NO_FILTERS, search),
    [inbox.conversations, place.placeId, search],
  )
  return (
    <div data-testid="dock-place-conversations" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 justify-between gap-2 px-3 pb-2">
        <Link to={place.href} onClick={onGo} className={`inline-flex items-center gap-1 rounded-lg ${BUTTON_GHOST} px-2 py-1 text-small font-medium`}>
          {place.placeId === null ? 'Open your space' : 'Open project'} <ArrowUpRight size={13} aria-hidden />
        </Link>
        <button type="button" onClick={onNew} className={`inline-flex items-center gap-1 rounded-lg ${BUTTON_GHOST} px-2 py-1 text-small font-medium`}>
          <Plus size={13} aria-hidden /> New conversation here
        </button>
      </div>
      <div className="shrink-0 px-3 pb-2"><SearchBox label={`Search ${place.name}`} value={search} onChange={setSearch} /></div>
      <p className="shrink-0 px-4 pb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Conversations · most recent first</p>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!loaded && <p className="px-2 py-3 text-small text-text-muted">Loading…</p>}
        {loaded && rows.length === 0 && (
          <p className="px-2 py-3 text-small text-text-muted">{search.trim() ? 'No conversation matches that.' : `No conversations in ${place.name} yet.`}</p>
        )}
        {rows.length > 0 && (
          <ul aria-label={`Conversations in ${place.name}`}>
            {rows.slice(0, shown).map((c) => (
              <InboxRow key={c.id} conversation={c} open={c.id === openId} showPlace={false} onChoose={() => onChoose(c.id, place.basePath)} />
            ))}
          </ul>
        )}
        {rows.length > shown && (
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className={`rounded mx-auto block pt-2 text-small font-medium text-link hover:underline ${FOCUS_RING}`}>Show older</button>
        )}
      </div>
    </div>
  )
}
