import { PlaceAvatar } from '@agenthix/ui/primitives'
import type { DockDraft, DockValue } from './DockContext'
import { DockLayer } from './DockLayer'
import { DockConversationList, OpenInChat, useListView } from './DockConversationList'
import { DockPlaceConversations } from './DockPlaceConversations'
import { DockPhoneMenu } from './DockPhoneMenu'
import { DockNewConversation } from './DockNewConversation'
import type { DockOverlay } from './dockOverlay'
import { canvasPlaceOf } from './startPlace'

/**
 * What is open over the app from the chat's bar or, on a phone, its ⋮ menu: one overlay at a time, each replacing the
 * last. A new conversation started over an open one is an overlay too (the board's state 6); sending makes it the
 * conversation in the panel, and closing it puts back the one that was there.
 */
export function DockOverlays({ dock, overlay, draftOver, draftFromMenu, openId, pathname, onOverlay, onNewFromMenu }: {
  dock: DockValue
  overlay: DockOverlay | null
  /** The draft, when it is drawn over the conversation that was open. */
  draftOver: DockDraft | null
  draftFromMenu: boolean
  openId: string | null
  pathname: string
  onOverlay: (overlay: DockOverlay | null) => void
  onNewFromMenu: () => void
}) {
  const narrow = dock.width === 'narrow'
  const listView = useListView(!draftOver && overlay?.kind === 'conversations')
  const close = () => onOverlay(null)
  const backToMenu = () => onOverlay({ kind: 'menu' })
  const choose = (conversationId: string, basePath: string) => { close(); dock.openConversation(conversationId, basePath) }

  if (draftOver) {
    return (
      <DockLayer
        label="New conversation"
        heading="New conversation"
        narrow={narrow}
        onClose={draftOver.cancel}
        onBack={narrow && draftFromMenu ? () => { draftOver.cancel(); backToMenu() } : undefined}
      >
        <DockNewConversation key={`${JSON.stringify(draftOver.place)}:${draftOver.agentId ?? ''}:${draftOver.task?.taskId ?? ''}`} here={draftOver.place} agentId={draftOver.agentId} task={draftOver.task} />
      </DockLayer>
    )
  }
  if (!overlay) return null
  if (overlay.kind === 'menu') {
    return (
      <DockLayer label="Chat" heading="Chat" narrow={narrow} onClose={close}>
        <DockPhoneMenu
          onConversations={() => onOverlay({ kind: 'conversations', fromMenu: true })}
          onNew={() => { close(); onNewFromMenu(); dock.startNew(canvasPlaceOf(pathname)) }}
          onPlace={(place) => onOverlay({ kind: 'place', place, fromMenu: true })}
        />
      </DockLayer>
    )
  }
  const onBack = overlay.fromMenu ? backToMenu : undefined
  if (overlay.kind === 'conversations') {
    return (
      <DockLayer label="Conversations" heading="Conversations" actions={<OpenInChat view={listView} onGo={close} />} narrow={narrow} onClose={close} onBack={onBack}>
        <DockConversationList view={listView} openId={openId} onChoose={choose} onGo={close} />
      </DockLayer>
    )
  }
  const { place } = overlay
  return (
    <DockLayer
      label={place.name}
      heading={<><PlaceAvatar kind="project" id={place.id} name={place.name} size="sm" /><span className="truncate">{place.name}</span></>}
      narrow={narrow}
      onClose={close}
      onBack={onBack}
    >
      <DockPlaceConversations
        place={place}
        openId={openId}
        onChoose={choose}
        onNew={() => { close(); if (overlay.fromMenu) onNewFromMenu(); dock.startNew(place.ref) }}
        onGo={close}
      />
    </DockLayer>
  )
}
