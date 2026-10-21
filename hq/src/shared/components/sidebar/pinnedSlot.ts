import type { ReactNode } from 'react'

/** What the Pinned row is told about the navigation around it. */
export interface PinnedSlotState {
  collapsed: boolean
  /** Called when a pin is followed, so a phone's drawer can close. */
  onNavigate?: () => void
}

/** The Pinned row in the foot: a node, or a function given the navigation's state. */
export type PinnedSlot = ReactNode | ((state: PinnedSlotState) => ReactNode)
