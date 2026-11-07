import { type ReactNode, useId, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  InsideShellContext, useInsideShell, useShellPublisher, useShellSlots, type ShellPublisher,
} from '../context/ShellContext'
import { ShellFrame } from './ShellFrame'
import type { Breadcrumb } from './ScreenBar'
import type { PlaceNav } from './placeNavTypes'

interface AppShellProps {
  children: ReactNode
  breadcrumbs?: Breadcrumb[]
  /** The right-hand end of the screen bar. */
  screenBarRight?: ReactNode
  /** Below `lg`, in place of the standard header (☰ and the title): a place's own, with ‹ and its page button. */
  mobileHeader?: ReactNode
  /** The place the left panel drills into. */
  placeNav?: PlaceNav | null
  /** The screen draws its own top bar (the workspace view): the frame leaves out the screen bar and keeps the rest. */
  ownBar?: boolean
}

/**
 * A screen inside the shell. In the app the shell is drawn once, in the root
 * (`RootShell`): this hands it the screen's breadcrumbs, bar slot and mobile header
 * and draws only the screen's content. Rendered with no root shell above it, as a
 * page is in a unit test, it draws the whole frame itself.
 */
export function AppShell(props: AppShellProps) {
  const publisher = useShellPublisher()
  const inside = useInsideShell()
  if (inside) return <>{props.children}</>
  const content = <InsideShellContext.Provider value={true}>{props.children}</InsideShellContext.Provider>
  if (publisher) return <PublishedShell {...props} publisher={publisher}>{content}</PublishedShell>
  return (
    <ShellFrame
      framed
      breadcrumbs={props.breadcrumbs ?? []}
      screenBarRight={props.screenBarRight}
      mobileHeader={props.mobileHeader}
      placeNav={props.placeNav ?? null}
      ownBar={props.ownBar}
    >
      {content}
    </ShellFrame>
  )
}

function PublishedShell({ children, breadcrumbs, screenBarRight, mobileHeader, placeNav, ownBar = false, publisher }: AppShellProps & { publisher: ShellPublisher }) {
  const id = useId()
  const slots = useShellSlots()
  const ownMobileHeader = mobileHeader != null
  // A page passes a new array each render; publishing by value keeps the root from re-rendering for nothing.
  const crumbsKey = JSON.stringify(breadcrumbs ?? [])
  const crumbs = useMemo(() => JSON.parse(crumbsKey) as Breadcrumb[], [crumbsKey])
  const navKey = JSON.stringify(placeNav ?? null)
  const nav = useMemo(() => JSON.parse(navKey) as PlaceNav | null, [navKey])
  const { publish, unpublish } = publisher

  // A layout effect, so the root draws or drops the frame before the browser paints.
  useLayoutEffect(() => {
    publish(id, { breadcrumbs: crumbs, ownMobileHeader, placeNav: nav, ownBar })
  }, [publish, id, crumbs, ownMobileHeader, nav, ownBar])
  useLayoutEffect(() => () => unpublish(id), [unpublish, id])

  const active = slots.activeId === id
  return (
    <>
      {active && screenBarRight != null && slots.screenBarRight && createPortal(screenBarRight, slots.screenBarRight)}
      {active && ownMobileHeader && slots.mobileHeader && createPortal(mobileHeader, slots.mobileHeader)}
      {children}
    </>
  )
}
