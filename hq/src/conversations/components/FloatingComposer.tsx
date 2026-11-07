import type { ReactNode } from 'react'
import { useDock, type DockValue } from '../../dock/DockContext'
import { useChatComposerPlace } from '../../chat/chatComposer'
import { NewConversationBox } from './NewConversationBox'

/**
 * Whether a page draws its own box to write in: only while the chat is minimised (or there is no chat panel at all,
 * a page rendered alone). Beside the page or over it, the chat's own box is the one place to write.
 */
export function showsFloatingComposer(dock: DockValue | null): boolean {
  return dock === null || dock.position === 'collapsed'
}

/** Room a page keeps at the foot of its scrolling content for the floating box, whether it is drawn or not. */
export const FLOATING_COMPOSER_ROOM = 'pb-28'

/**
 * Home's and the Chat page's box to write in (the board's f5): the chat's own box, `NewConversationBox`, floating
 * at the foot of the page while the chat is minimised. Sending starts the conversation in the chat panel, which
 * opens on it. It floats over the page, so the page's content never moves when the chat's state changes: a page
 * keeps `FLOATING_COMPOSER_ROOM` at the foot of what it scrolls.
 */
export function FloatingComposer() {
  const dock = useDock()
  const composer = useChatComposerPlace(null)
  if (!showsFloatingComposer(dock)) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-3 max-lg:pb-2">
      <div data-testid="floating-composer" className="pointer-events-auto w-full max-w-[560px] rounded-2xl border border-border-subtle bg-surface-0 shadow-lg [&>div]:pb-2">
        <NewConversationBox home="PERSON" basePath={composer.basePath} placeholder={composer.composerPlaceholder} noAgentsNotice={composer.noAgentsNotice} />
      </div>
    </div>
  )
}

/** A page body that holds a floating box: positioned, so the box floats over its foot. */
export function WithFloatingComposer({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {children}
      <FloatingComposer />
    </div>
  )
}
