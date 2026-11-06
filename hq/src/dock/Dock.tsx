import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, EllipsisVertical } from 'lucide-react'
import { useLocation } from 'react-router'
import { useQuery, getConversation } from 'wasp/client/operations'
import { CHAT_PATH } from '../chat/chatComposer'
import { ConversationThread } from '../conversations/components/ConversationThread'
import { CardPlaceContext } from '../agents/profile/cardPlace'
import { VoiceBar } from '../shared/layouts/VoiceBar'
import { dockShown, useDock, type DockDraft, type DockValue, type OpenConversation } from './DockContext'
import { DockBar, WaitingBadge } from './DockBar'
import { DockNewConversation } from './DockNewConversation'
import { DockOverlays } from './DockOverlays'
import { DockPlaceChip } from './DockPlaceChip'
import { DockResizeHandle } from './DockResizeHandle'
import { dockClasses, resizable } from './dockLayout'
import type { DockOverlay } from './dockOverlay'
import { CANCEL_BUTTON, DOCK_BUTTON } from './dockStyles'
import type { PlaceRef } from './startPlace'
import { useConversationInbox } from './useConversationInbox'
import { useDockPlace } from './useDockPlace'
import { useDockSize } from './dockSize'
import { useMarkSeen, useMarkShownRead } from './useMarkShownRead'

/**
 * The chat panel, on the right of the frame (the board's f1), and its bar, the chat's menu. It is drawn once, in the
 * root shell, so the thread, its socket subscription, a streaming reply, its scroll and unsent text survive every
 * change of the canvas. Its state only moves it: minimised to its bar, beside the page, over the page; on a phone
 * folded away, or full screen with ⋮ for the menu (f2). The same tree stays mounted throughout, the thread hidden
 * when minimised. Unframed (a page that shows no shell) it stays mounted, hidden.
 */
export function Dock({ framed }: { framed: boolean }) {
  const dock = useDock()
  const size = useDockSize()
  const { pathname } = useLocation()
  const [overlay, setOverlay] = useState<DockOverlay | null>(null)
  const [draftFromMenu, setDraftFromMenu] = useState(false)
  const shown = dockShown(dock)
  useToggleShortcut(shown ? dock : null)
  useClickOutsideToPutAway(shown && dock.width === 'medium' && dock.position === 'docked' ? dock : null)
  // An overlay never outlives the page it was opened over, nor the draft its menu started.
  useEffect(() => { setOverlay(null) }, [pathname])
  useEffect(() => { if (!dock?.draft) setDraftFromMenu(false) }, [dock?.draft])
  if (!shown) return null
  const narrow = dock.width === 'narrow'
  const collapsed = dock.position === 'collapsed'
  const draggable = framed && resizable(dock.width, dock.position)
  const conversation = dock.open ?? dock.draft?.behind ?? null
  // A new conversation started over an open one floats over it; with nothing open it fills the panel.
  const draftInPanel = dock.draft && !dock.draft.behind ? dock.draft : null
  const draftOver = dock.draft?.behind ? dock.draft : null
  return (
    <>
      <aside
        aria-label="Conversation"
        data-testid="dock"
        data-position={dock.position}
        data-width={dock.width}
        style={draggable ? { width: size.width } : undefined}
        className={framed ? dockClasses(dock.width, dock.position) : 'hidden'}
      >
        {draggable && <DockResizeHandle size={size} />}
        <div className={collapsed ? 'hidden' : 'flex min-h-0 min-w-0 flex-1 flex-col'}>
          {/* Full screen on a narrow window, the dock covers the screen's own voice bar. */}
          {!collapsed && narrow && <VoiceBar />}
          {conversation && (
            <DockedConversation
              dock={dock}
              open={conversation}
              hidden={!!draftInPanel}
              inSight={!collapsed && !dock.draft}
              onMenu={() => setOverlay({ kind: 'menu' })}
            />
          )}
          {draftInPanel && <NewInDock key={`${placeKey(draftInPanel.place)}:${draftInPanel.agentId ?? ''}:${draftInPanel.task?.taskId ?? ''}`} draft={draftInPanel} />}
        </div>
        {!narrow && <DockBar dock={dock} overlay={overlay} onOverlay={setOverlay} />}
      </aside>
      {framed && (
        <DockOverlays
          dock={dock}
          overlay={overlay}
          draftOver={collapsed ? null : draftOver}
          draftFromMenu={draftFromMenu}
          openId={conversation?.conversationId ?? null}
          pathname={pathname}
          onOverlay={setOverlay}
          onNewFromMenu={() => setDraftFromMenu(true)}
        />
      )}
    </>
  )
}

/** ⌘J (Ctrl+J elsewhere) minimises the panel, and opens it again beside the page. */
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

/** Where a click is still within the conversation: the dock itself, its overlays, and what it opens in front of the page (a menu, a dialog). */
const INSIDE = '[data-testid="dock"], [data-dock-layer], [role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'

/** On a medium window the panel slides over the page: a click on the page minimises it, as it does for the navigation drawer. */
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

function Header({ children, actions, before }: { children: ReactNode; actions?: ReactNode; before?: ReactNode }) {
  return (
    <header data-testid="dock-header" className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2">
      {before}
      <div className="min-w-0 flex-1">{children}</div>
      {actions && <div data-testid="dock-actions" className="flex shrink-0 items-center gap-0.5">{actions}</div>}
    </header>
  )
}

const placeKey = (place: PlaceRef) => (place.kind === 'space' ? 'space' : `project:${place.key}`)

/** A new conversation with nothing open behind it: it fills the panel, with Cancel (or Esc) in place of the buttons. */
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
      <DockNewConversation here={draft.place} agentId={draft.agentId} task={draft.task} />
    </div>
  )
}

/** On a phone, ⋮ opens the chat's menu, with the badge for everything waiting. */
function PhoneMenuButton({ onMenu }: { onMenu: () => void }) {
  const { inbox } = useConversationInbox()
  return (
    <button
      type="button"
      aria-label={inbox.waiting ? `Chat menu, ${inbox.waiting} waiting` : 'Chat menu'}
      title="Chat menu"
      onClick={onMenu}
      className={`relative ${DOCK_BUTTON}`}
    >
      <EllipsisVertical size={16} aria-hidden />
      {inbox.waiting > 0 && <WaitingBadge count={inbox.waiting} needsYou={inbox.needsYou > 0} />}
    </button>
  )
}

function DockedConversation({ dock, open, hidden, inSight, onMenu }: {
  dock: DockValue
  open: OpenConversation
  hidden: boolean
  /** In view in the panel: not minimised and nothing drawn over it. */
  inSight: boolean
  onMenu: () => void
}) {
  const { conversationId } = open
  const { data: view } = useQuery(getConversation, { conversationId })
  const place = useDockPlace(view)
  const listPath = place?.listPath ?? open.basePath ?? CHAT_PATH
  const narrow = dock.width === 'narrow'
  useMarkShownRead(inSight && !hidden ? conversationId : null)
  const onSeen = useMarkSeen(conversationId, inSight && !hidden)
  const fold = narrow && (
    <button type="button" aria-label="Fold the chat away" title="Fold the chat away" onClick={() => dock.setPosition('collapsed')} className={DOCK_BUTTON}>
      <ChevronDown size={16} aria-hidden />
    </button>
  )

  // The conversation's own header, inside the thread, shows its title and agent; the panel's shows where it lives.
  // Over the page, it is read in a centred column. Deleted or archived, it leaves the panel and the canvas stays.
  return (
    <div className={hidden ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
      <div className={`flex min-h-0 w-full flex-1 flex-col ${dock.position === 'expanded' ? 'mx-auto max-w-3xl' : ''}`}>
        <Header before={fold} actions={narrow ? <PhoneMenuButton onMenu={onMenu} /> : undefined}>
          {place && <DockPlaceChip place={place} />}
        </Header>
        <div className="min-h-0 flex-1">
          <CardPlaceContext.Provider value={place?.card ?? null}>
            <ConversationThread
              key={conversationId}
              conversationId={conversationId}
              listPath={listPath}
              onSeen={onSeen}
              onDeleted={dock.close}
              onArchived={dock.close}
            />
          </CardPlaceContext.Provider>
        </div>
      </div>
    </div>
  )
}
