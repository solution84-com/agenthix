import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { ChevronLeft, PanelRight, Plus } from 'lucide-react'
import { Tooltip } from '@agenthix/ui/primitives'
import { MenuButton, TOP_BAR_BUTTON, TopBar, TopBarTitle } from '../../shared/layouts/TopBar'
import { ProjectDrawer } from '../../shared/components/sidebar/ProjectDrawer'
import type { PlaceNav } from '../../shared/layouts/placeNavTypes'
import type { PlaceDrill } from '../placeCrumb'

/**
 * Below `lg`, inside a place: ‹ Back (☰ in your space, which is one of the app's places), the section's name with the
 * place's under it, and at the end the button that opens the place's menu as a drawer from the right.
 */
export function PlaceDrillMobileHeader({ nav, backHref, title, add }: {
  nav: PlaceNav
  /** Where ‹ goes: the list the place sits in, or the section's list when a view inside it is open. */
  backHref: string
  /** The open view's name (a task's key), in place of the section's. */
  title?: string
  /** The section's add button (New task), here rather than in the content. */
  add?: PlaceDrill['add']
}) {
  const [open, setOpen] = useState(false)
  const { pathname, search } = useLocation()
  useEffect(() => { setOpen(false) }, [pathname, search])

  const section = nav.sections.find((s) => s.id === nav.current)?.label ?? 'Overview'
  const leading = nav.kind === 'space' && !title
    ? <MenuButton />
    : <Link to={backHref} aria-label="Back" className={TOP_BAR_BUTTON}><ChevronLeft size={18} /></Link>
  const drawerButton = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`${nav.name} menu`}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={TOP_BAR_BUTTON}
    >
      <PanelRight size={18} />
    </button>
  )

  const addButton = add && (
    <Tooltip label={add.label} side="bottom">
      <button type="button" onClick={add.onClick} aria-label={add.label} className={TOP_BAR_BUTTON}><Plus size={18} /></button>
    </Tooltip>
  )

  return (
    <>
      <TopBar leading={leading} end={<>{addButton}{drawerButton}</>}>
        <TopBarTitle title={title ?? section} under={title ? `${section} · ${nav.name}` : nav.name} />
      </TopBar>
      {open && <ProjectDrawer nav={nav} onClose={() => setOpen(false)} />}
    </>
  )
}
