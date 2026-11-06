import { createContext, useContext } from 'react'
import type { PlaceRef } from './startPlace'
import type { DockWidth } from './useDockWidth'

/** The conversation in the dock. `basePath` is the place's list when it came from a conversation's own address. */
export interface OpenConversation {
  conversationId: string
  basePath: string | null
}

/**
 * The chat panel's state, whatever the width: open (beside the canvas when wide, sliding over it when medium, full
 * screen when narrow), expanded over the canvas, or minimised (only its bar left; on a phone, folded away).
 * Never a remount between them.
 */
export type DockPosition = 'docked' | 'expanded' | 'collapsed'

/** A task whose conversation is to be started in the dock. */
export interface TaskTarget {
  taskId: string
  taskKey: string
  /** The agent working on it, who leads the conversation. */
  agentName: string | null
}

/**
 * A new conversation being written in the dock, before its first message (spec §10). What was open stays mounted,
 * hidden, underneath it, so cancelling puts back exactly that.
 */
export interface DockDraft {
  /** The task a conversation is about, when it is one: *Talk about this task* on its page. Its first message creates the task's conversation. */
  task?: TaskTarget | null
  /** The place the canvas was on when it was started: *You're here*, and the place first chosen. */
  place: PlaceRef
  /** The agent the box starts with (*Talk to <agent>*), or null for the place's usual one. */
  agentId: string | null
  /** Counts each ask for a new conversation, so asking again while the draft shows can refocus its box. */
  asked: number
  /** The conversation that was open before, kept mounted and hidden under the draft. */
  behind: OpenConversation | null
  /** Discards the draft and puts back what was open, in its position, or closes the dock if nothing was. */
  cancel: () => void
}

export interface DockValue {
  open: OpenConversation | null
  draft: DockDraft | null
  /** How the dock is shown at the window's width (spec §12). */
  width: DockWidth
  /** Opens a conversation in the dock; the canvas stays where it is. */
  openConversation: (conversationId: string, basePath: string | null, how?: { replace?: boolean }) => void
  /** Puts a new conversation in the dock, in `place`, over the open one, which is remembered for Cancel. */
  startNew: (place: PlaceRef, agentId?: string | null, task?: TaskTarget | null) => void
  close: () => void
  position: DockPosition
  setPosition: (position: DockPosition) => void
}

// Null where no root shell is drawn (a page rendered alone): a conversation's page then shows it in the canvas.
export const DockContext = createContext<DockValue | null>(null)

export function useDock(): DockValue | null {
  return useContext(DockContext)
}

/** True under the root shell, whose dock shows conversations at every width, so a conversation's own page need not. */
export function useDocked(): boolean {
  return useDock() !== null
}

/** Whether the dock is drawn at all: something is in it. */
export function dockShown(dock: DockValue | null): dock is DockValue {
  return dock !== null && (dock.open !== null || dock.draft !== null)
}
