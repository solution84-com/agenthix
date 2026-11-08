import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { BackButton, MenuButton, TopBar, TopBarTitle } from '../../shared/layouts/TopBar'
import { ProjectDrawer } from '../../shared/components/sidebar/ProjectDrawer'
import type { PlaceNav } from '../../shared/layouts/placeNavTypes'
import type { PhoneAction } from '../../shared/layouts/phoneActions'
import type { PlaceDrill } from '../placeCrumb'

/**
 * Below `lg`, inside a place: ‹ Back (☰ in your space, which is one of the app's places), the section's name with the
 * place's under it, then the chat and the ⋯. The section's add (New task) is the ⋯'s first item, and its last opens
 * the place's menu as a drawer from the right.
 */
export function PlaceDrillMobileHeader({ nav, backHref, title, add }: {
  nav: PlaceNav
  /** Where ‹ goes: the list the place sits in, or the section's list when a view inside it is open. */
  backHref: string
  /** The open view's name (a task's key), in place of the section's. */
  title?: string
  /** The section's add (New task), the first of the ⋯'s actions rather than a button in the content. */
  add?: PlaceDrill['add']
}) {
  const [open, setOpen] = useState(false)
  const { pathname, search } = useLocation()
  useEffect(() => { setOpen(false) }, [pathname, search])

  const section = nav.sections.find((s) => s.id === nav.current)?.label ?? 'Overview'
  const leading = nav.kind === 'space' && !title ? <MenuButton /> : <BackButton to={backHref} />
  const actions = useMemo<PhoneAction[]>(() => (add ? [{ label: add.label, onSelect: add.onClick }] : []), [add])

  return (
    <>
      <TopBar leading={leading} actions={actions} placeMenu={{ name: nav.name, onOpen: () => setOpen(true) }}>
        <TopBarTitle title={title ?? section} under={title ? `${section} · ${nav.name}` : nav.name} />
      </TopBar>
      {open && <ProjectDrawer nav={nav} onClose={() => setOpen(false)} />}
    </>
  )
}
