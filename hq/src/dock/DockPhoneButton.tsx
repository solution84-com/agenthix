import { MessagesSquare } from 'lucide-react'
import { useDock } from './DockContext'
import { SPACE_REF } from './startPlace'
import { useConversationInbox } from './useConversationInbox'
import { WaitingBadge } from './DockBar'
import { BUTTON_GHOST } from '@agenthix/ui/primitives'

/**
 * The chat on a phone while it is folded (the board's f2, state 1): one icon in the top bar, beside notifications,
 * with the badge for everything waiting. It opens the conversation the person was in, full screen. Drawn only on a
 * narrow window, where the chat has no bar of its own.
 */
export function DockPhoneButton() {
  const dock = useDock()
  if (!dock || dock.width !== 'narrow') return null
  return <PhoneButton onOpen={() => {
    if (dock.open || dock.draft) dock.setPosition('docked')
    else dock.startNew(SPACE_REF)
  }} />
}

function PhoneButton({ onOpen }: { onOpen: () => void }) {
  const { inbox } = useConversationInbox()
  const label = inbox.waiting ? `Chat, ${inbox.waiting} waiting` : 'Chat'
  return (
    <button
      type="button"
      data-testid="dock-phone-button"
      aria-label={label}
      title="Chat"
      onClick={onOpen}
      className={`relative flex h-11 w-11 items-center justify-center rounded-lg ${BUTTON_GHOST}`}
    >
      <MessagesSquare size={18} aria-hidden />
      {inbox.waiting > 0 && <WaitingBadge count={inbox.waiting} needsYou={inbox.needsYou > 0} />}
    </button>
  )
}
