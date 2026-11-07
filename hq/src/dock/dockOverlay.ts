import type { PinnedPlace } from './pinnedPlaces'

/**
 * Which of the chat's overlays is open over the app: the Conversations list, a pinned place's conversations, or on a
 * phone the menu sheet. `fromMenu`: opened from the phone's menu, so ‹ goes back to it. A new conversation is the
 * dock's draft (`DockDraft`), not one of these.
 */
export type DockOverlay =
  | { kind: 'conversations'; fromMenu?: boolean }
  | { kind: 'place'; place: PinnedPlace; fromMenu?: boolean }
  | { kind: 'menu' }
