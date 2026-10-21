import { useSyncExternalStore } from 'react'

/**
 * Whether the open conversation's popup (its total usage and the agent's memory) is showing. The header that
 * opens it (the desktop's "started…" line, the phone's title) and the conversation that draws it are separate
 * parts of the screen, so they share this one flag; only one conversation is on screen at a time.
 */
let open = false
const listeners = new Set<() => void>()

export function setConversationPopup(next: boolean) {
  if (open === next) return
  open = next
  listeners.forEach(l => l())
}

export const toggleConversationPopup = () => setConversationPopup(!open)

export function useConversationPopup(): boolean {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    () => open,
    () => false,
  )
}
