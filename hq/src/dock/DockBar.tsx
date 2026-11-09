import { MessagesSquare, Plus } from 'lucide-react'
import { useLocation } from 'react-router'
import { PlaceAvatar } from '@agenthix/ui/primitives'
import { formatCount } from '../shared/layouts/useShellCounts'
import { placeSignals, placeSignalWords } from '../shared/conversations/inbox'
import type { DockValue } from './DockContext'
import { DockStateControl } from './DockStateControl'
import { StateBadge, WorkingDot } from './InboxRow'
import { canvasPlaceOf } from './startPlace'
import { usePinnedPlaces, type PinnedPlace } from './pinnedPlaces'
import { useConversationInbox } from './useConversationInbox'
import { DOCK_BUTTON, SELECTED } from './dockStyles'
import type { DockOverlay } from './dockOverlay'

/**
 * The chat's bar, on the panel's right (the board's f1): its menu and its queue, in three groups with a divider
 * between them. The panel's state; then ＋ new conversation and Conversations with one badge for everything waiting;
 * then the pinned places, each with what is going on inside it. The button whose pop-up is open has the selected fill.
 * Minimised, the bar is all that is left of the panel.
 */
export function DockBar({ dock, overlay, onOverlay, besideFile = false }: {
  dock: DockValue
  overlay: DockOverlay | null
  onOverlay: (overlay: DockOverlay | null) => void
  /** A file is open in the viewer: the chat stays beside it, so it can't go over the page. */
  besideFile?: boolean
}) {
  const { pathname } = useLocation()
  const { inbox } = useConversationInbox()
  const places = usePinnedPlaces()
  const listOpen = overlay?.kind === 'conversations'
  const openPlaceId = overlay?.kind === 'place' ? overlay.place.id : null
  const waitingWords = inbox.waiting ? `, ${inbox.waiting} waiting` : ''
  return (
    <nav aria-label="Chat" data-testid="dock-bar" className={`flex w-14 shrink-0 flex-col items-center gap-4 overflow-y-auto bg-surface-0 py-3 ${dock.position === 'collapsed' ? '' : 'border-l border-border-subtle'}`}>
      <DockStateControl position={dock.position} onChoose={dock.setPosition} besideFile={besideFile} />
      <Divider />
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          aria-label="New conversation"
          title="New conversation"
          aria-expanded={!!dock.draft}
          onClick={() => { onOverlay(null); if (dock.draft) dock.draft.cancel(); else dock.startNew(canvasPlaceOf(pathname)) }}
          className={`${DOCK_BUTTON} ${dock.draft ? SELECTED : ''}`}
        >
          <Plus size={18} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Conversations${waitingWords}`}
          title="Conversations"
          aria-expanded={listOpen}
          onClick={() => onOverlay(listOpen ? null : { kind: 'conversations' })}
          className={`relative ${DOCK_BUTTON} ${listOpen ? SELECTED : ''}`}
        >
          <MessagesSquare size={18} aria-hidden />
          {inbox.waiting > 0 && <WaitingBadge count={inbox.waiting} needsYou={inbox.needsYou > 0} />}
        </button>
      </div>
      {places.length > 0 && (
        <>
          <Divider />
          <ul aria-label="Pinned" className="flex flex-col items-center gap-2">
            {places.map((place) => (
              <PlaceTile
                key={place.id}
                place={place}
                signals={placeSignals(inbox.conversations, place.placeId)}
                selected={place.id === openPlaceId}
                onOpen={() => onOverlay(place.id === openPlaceId ? null : { kind: 'place', place })}
              />
            ))}
          </ul>
        </>
      )}
    </nav>
  )
}

const Divider = () => <span aria-hidden className="w-6 border-t border-border-subtle" />

/** One badge for everything waiting: amber when anything needs the person. */
export function WaitingBadge({ count, needsYou }: { count: number; needsYou: boolean }) {
  return (
    <span
      data-testid="dock-waiting"
      aria-hidden
      className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-micro font-semibold leading-none text-on-accent ring-2 ring-surface-0 ${needsYou ? 'bg-warning' : 'bg-accent'}`}
    >
      {formatCount(count)}
    </span>
  )
}

function PlaceTile({ place, signals, selected, onOpen }: {
  place: PinnedPlace
  signals: ReturnType<typeof placeSignals>
  /** Its pop-up is open. */
  selected: boolean
  onOpen: () => void
}) {
  const words = placeSignalWords(place.name, signals)
  return (
    <li>
      <button
        type="button"
        data-testid="dock-place-tile"
        data-place={place.id}
        data-working={signals.working || undefined}
        aria-label={words}
        aria-expanded={selected}
        title={words}
        onClick={onOpen}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-hover ${selected ? SELECTED : ''}`}
      >
        <PlaceAvatar kind="project" id={place.id} name={place.name} size="sm" />
        {signals.working && <WorkingDot />}
        {signals.needsYou > 0
          ? <StateBadge tone="needs">!</StateBadge>
          : signals.unread > 0 ? <StateBadge tone="unread">{formatCount(signals.unread)}</StateBadge> : null}
      </button>
    </li>
  )
}
