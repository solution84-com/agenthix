import type { ReactNode } from 'react'
import { MessagesSquare, Plus } from 'lucide-react'
import { PlaceAvatar } from '@agenthix/ui/primitives'
import { formatCount } from '../shared/layouts/useShellCounts'
import { placeSignals, placeSignalWords } from '../shared/conversations/inbox'
import { usePinnedPlaces, type PinnedPlace } from './pinnedPlaces'
import { useConversationInbox } from './useConversationInbox'

const ITEM = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-body text-text-primary hover:bg-surface-hover'

/**
 * The phone's ⋮ menu sheet (the board's f2, state 3): Conversations with the badge for everything waiting, a new
 * conversation, and the pinned places with theirs. Each choice's sheet takes this one's place.
 */
export function DockPhoneMenu({ onConversations, onNew, onPlace }: {
  onConversations: () => void
  onNew: () => void
  onPlace: (place: PinnedPlace) => void
}) {
  const { inbox } = useConversationInbox()
  const places = usePinnedPlaces()
  return (
    <div data-testid="dock-phone-menu" className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      <button type="button" onClick={onConversations} className={`${ITEM} font-medium`}>
        <MessagesSquare size={18} aria-hidden className="text-accent" />
        <span className="flex-1">Conversations</span>
        {inbox.waiting > 0 && <Count needsYou={inbox.needsYou > 0}>{formatCount(inbox.waiting)}</Count>}
      </button>
      <button type="button" onClick={onNew} className={ITEM}>
        <Plus size={18} aria-hidden className="text-accent" />
        <span className="flex-1">New conversation</span>
      </button>
      <p className="mt-2 border-t border-border-subtle px-3 pb-1 pt-3 text-micro font-semibold uppercase tracking-wide text-text-muted">Pinned</p>
      <ul aria-label="Pinned">
        {places.map((place) => {
          const s = placeSignals(inbox.conversations, place.placeId)
          return (
            <li key={place.id}>
              <button type="button" aria-label={placeSignalWords(place.name, s)} onClick={() => onPlace(place)} className={ITEM}>
                <PlaceAvatar kind="project" id={place.id} name={place.name} size="sm" />
                <span className="min-w-0 flex-1 truncate">{place.name}</span>
                {s.needsYou > 0
                  ? <Count needsYou>!</Count>
                  : s.unread > 0 ? <Count needsYou={false}>{formatCount(s.unread)}</Count>
                    : s.working ? <span className="text-small text-text-muted">working</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Count({ needsYou, children }: { needsYou: boolean; children: ReactNode }) {
  return (
    <span aria-hidden className={`min-w-5 rounded-full px-1.5 text-center text-micro font-semibold text-on-accent ${needsYou ? 'bg-warning' : 'bg-accent'}`}>
      {children}
    </span>
  )
}
