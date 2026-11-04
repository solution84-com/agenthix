import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useQuery, getConversation } from 'wasp/client/operations'
import { CHAT_PATH } from '../chat/chatComposer'
import { ConversationThread, type ThreadActivity } from '../conversations/components/ConversationThread'
import { CardPlaceContext } from '../agents/profile/cardPlace'
import { VoiceBar } from '../shared/layouts/VoiceBar'
import { dockShown, useDock, type DockDraft, type DockValue, type OpenConversation } from './DockContext'
import { DockActions } from './DockActions'
import { DockNewConversation } from './DockNewConversation'
import { DockPlaceChip } from './DockPlaceChip'
import { DockRail } from './DockRail'
import { DockPill } from './DockPill'
import { DockResizeHandle } from './DockResizeHandle'
import { dockClasses, resizable } from './dockLayout'
import { CANCEL_BUTTON, DOCK_BUTTON } from './dockStyles'
import type { PlaceRef } from './startPlace'
import { useDockPlace } from './useDockPlace'
import { useDockSize } from './dockSize'

/**
 * The open conversation, docked on the right of the frame (spec §2). It is drawn once, in the root shell, so the
 * thread, its socket subscription, a streaming reply, its scroll and unsent text survive every change of the
 * canvas. Its width and position only move it (spec §12, §15): beside the canvas, sliding over it on a medium
 * window, full screen on a narrow one, expanded, or put away to the rail (the pill when narrow). The same tree
 * stays mounted throughout, the thread hidden behind the rail or pill. Unframed (a page that shows no shell) it
 * stays mounted, hidden.
 */
export function Dock({ framed }: { framed: boolean }) {
  const dock = useDock()
  const size = useDockSize()
  // What the open thread reports of itself, for the rail and the pill while it is hidden behind them.
  const [activity, setActivity] = useState<ThreadActivity>(IDLE)
  const shown = dockShown(dock)
  useToggleShortcut(shown ? dock : null)
  useClickOutsideToPutAway(shown && dock.width === 'medium' && dock.position === 'docked' ? dock : null)
  const collapsed = shown && dock.position === 'collapsed'
  if (!shown) return null
  const narrow = dock.width === 'narrow'
  const putAway = () => dock.setPosition('docked')
  const draggable = framed && resizable(dock.width, dock.position)
  const conversation = dock.open ?? dock.draft?.behind ?? null
  const signals = dock.open ? activity : IDLE
  return (
    <aside
      aria-label="Conversation"
      data-testid="dock"
      data-position={dock.position}
      data-width={dock.width}
      style={draggable ? { width: size.width } : undefined}
      className={framed ? dockClasses(dock.width, dock.position) : 'hidden'}
    >
      {draggable && <DockResizeHandle size={size} />}
      {collapsed && !narrow && <DockRail conversationId={dock.open?.conversationId ?? null} activity={signals} onOpen={putAway} />}
      {collapsed && narrow && <DockPill conversationId={dock.open?.conversationId ?? null} activity={signals} onOpen={putAway} />}
      {/* Full screen on a narrow window, the dock covers the screen's own voice bar. */}
      {!collapsed && narrow && <VoiceBar />}
      <div className={collapsed ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
        {/* Under a draft, the conversation that was open stays mounted, hidden, for Cancel to put back. */}
        {conversation && <DockedConversation dock={dock} open={conversation} hidden={!!dock.draft} onActivity={setActivity} />}
        {dock.draft && <NewInDock key={`${placeKey(dock.draft.place)}:${dock.draft.agentId ?? ''}`} draft={dock.draft} />}
      </div>
    </aside>
  )
}

/** ⌘J (Ctrl+J elsewhere) collapses the dock, and opens it again from the rail (spec §11). */
function useToggleShortcut(dock: DockValue | null) {
  const latest = useRef(dock)
  latest.current = dock
  const active = dock !== null
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const current = latest.current
      if (!current || e.key.toLowerCase() !== 'j' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      e.preventDefault()
      current.setPosition(current.position === 'collapsed' ? 'docked' : 'collapsed')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}

/** Where a click is still within the conversation: the dock itself, and what it opens in front of the page (a menu, a dialog). */
const INSIDE = '[data-testid="dock"], [role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'

/** On a medium window the dock slides over the page: a click on the page puts it away, as it does for the navigation drawer. */
function useClickOutsideToPutAway(dock: DockValue | null) {
  const latest = useRef(dock)
  latest.current = dock
  const active = dock !== null
  useEffect(() => {
    if (!active) return
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(INSIDE)) return
      latest.current?.setPosition('collapsed')
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [active])
}

function Header({ children, actions, dock }: { children: ReactNode; actions: ReactNode; dock?: DockValue }) {
  return (
    <header data-testid="dock-header" className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2">
      {dock?.width === 'narrow' && (
        <button type="button" aria-label="Back to the page" title="Back to the page" onClick={() => dock.setPosition('collapsed')} className={DOCK_BUTTON}>
          <ChevronLeft size={16} aria-hidden />
        </button>
      )}
      <div className="min-w-0 flex-1">{children}</div>
      <div data-testid="dock-actions" className="flex shrink-0 items-center gap-0.5">{actions}</div>
    </header>
  )
}

const IDLE: ThreadActivity = { working: false, needYou: 0 }

const placeKey = (place: PlaceRef) => (place.kind === 'space' ? 'space' : `project:${place.key}`)

/** A new conversation (spec §10): *New conversation* and Cancel in place of the buttons; Esc cancels too. */
function NewInDock({ draft }: { draft: DockDraft }) {
  const area = useRef<HTMLDivElement>(null)
  const seen = useRef(draft.asked)
  // Asking again while the draft shows (Talk, or Talk to an agent) puts the caret back in its box; the first ask
  // is focused by the box itself once its agents are known.
  useEffect(() => {
    if (seen.current === draft.asked) return
    seen.current = draft.asked
    area.current?.querySelector('textarea')?.focus()
  }, [draft.asked])
  return (
    <div
      ref={area}
      data-testid="dock-draft"
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); draft.cancel() } }}
    >
      <Header actions={<button type="button" onClick={draft.cancel} className={CANCEL_BUTTON}>Cancel</button>}>
        <h2 className="truncate text-body font-medium text-text-primary">New conversation</h2>
      </Header>
      <DockNewConversation here={draft.place} agentId={draft.agentId} />
    </div>
  )
}

function DockedConversation({ dock, open, hidden, onActivity }: {
  dock: DockValue
  open: OpenConversation
  hidden: boolean
  onActivity: (activity: ThreadActivity) => void
}) {
  const { conversationId } = open
  const { data: view } = useQuery(getConversation, { conversationId })
  const place = useDockPlace(view)
  const listPath = place?.listPath ?? open.basePath ?? CHAT_PATH

  // The conversation's own header, inside the thread, shows its title and agent; the dock's shows where it lives.
  // Deleted or archived, the conversation leaves the dock and the canvas stays where it is.
  return (
    <div className={hidden ? 'hidden' : 'contents'}>
      {!hidden && <Header dock={dock} actions={<DockActions dock={dock} />}>{place && <DockPlaceChip place={place} />}</Header>}
      <div className="min-h-0 flex-1">
        <CardPlaceContext.Provider value={place?.card ?? null}>
          <ConversationThread
            key={conversationId}
            conversationId={conversationId}
            listPath={listPath}
            onActivity={onActivity}
            onDeleted={dock.close}
            onArchived={dock.close}
          />
        </CardPlaceContext.Provider>
      </div>
    </div>
  )
}
