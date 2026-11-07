import { createContext, useContext } from 'react'
import type { Breadcrumb } from '../layouts/ScreenBar'
import type { PlaceNav } from '../layouts/placeNavTypes'

/** What a page's `AppShell` hands up to the frame drawn once in the app's root. */
export interface ShellParts {
  breadcrumbs: Breadcrumb[]
  /** The page draws its own mobile header, into `mobileHeaderSlot`, in place of the standard one. */
  ownMobileHeader: boolean
  /** The place the left panel is drilled into, when the page is a place's screen. */
  placeNav: PlaceNav | null
  /** The page draws its own top bar in place of the screen bar. */
  ownBar?: boolean
}

export interface ShellPublisher {
  publish: (id: string, parts: ShellParts) => void
  unpublish: (id: string) => void
}

/** Where the frame's page-owned parts go: the publishing page portals them in, so they keep the page's context. */
export interface ShellSlots {
  /** The `AppShell` whose parts the frame shows: the one published last. */
  activeId: string | null
  screenBarRight: HTMLElement | null
  mobileHeader: HTMLElement | null
}

// Null when no frame is drawn in the root (a page rendered alone, as in a unit test): AppShell then draws one itself.
export const ShellPublisherContext = createContext<ShellPublisher | null>(null)
export const ShellSlotsContext = createContext<ShellSlots>({ activeId: null, screenBarRight: null, mobileHeader: null })
// True below an AppShell, so an AppShell inside another adds no second frame.
export const InsideShellContext = createContext(false)

export function useShellPublisher() {
  return useContext(ShellPublisherContext)
}

export function useShellSlots() {
  return useContext(ShellSlotsContext)
}

export function useInsideShell() {
  return useContext(InsideShellContext)
}

export function sameParts(a: ShellParts, b: ShellParts): boolean {
  return a.ownMobileHeader === b.ownMobileHeader
    && !!a.ownBar === !!b.ownBar
    && a.breadcrumbs.length === b.breadcrumbs.length
    && a.breadcrumbs.every((c, i) => c.label === b.breadcrumbs[i].label && c.href === b.breadcrumbs[i].href && c.list === b.breadcrumbs[i].list)
    && JSON.stringify(a.placeNav) === JSON.stringify(b.placeNav)
}
