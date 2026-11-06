import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { ChevronLeft, PanelRight } from 'lucide-react'
import { MenuButton, TOP_BAR_BUTTON, TopBar, TopBarTitle } from '../../shared/layouts/TopBar'
import { ProjectDrawer } from '../../shared/components/sidebar/ProjectDrawer'
import type { PlaceNav } from '../../shared/layouts/placeNavTypes'

/**
 * Below `lg`, inside a place: ‹ Back (☰ in your space, which is one of the app's places), the section's name with the
 * place's under it, and at the end the button that opens the place's menu as a drawer from the right.
 */
export function PlaceDrillMobileHeader({ nav, backHref }: {
  nav: PlaceNav
  /** Where ‹ goes: the list the place sits in. */
  backHref: string
}) {
  const [open, setOpen] = useState(false)
  const { pathname, search } = useLocation()
  useEffect(() => { setOpen(false) }, [pathname, search])

  const section = nav.sections.find((s) => s.id === nav.current)?.label ?? 'Overview'
  const leading = nav.kind === 'space'
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

  return (
    <>
      <TopBar leading={leading} end={drawerButton}>
        <TopBarTitle title={section} under={nav.name} />
      </TopBar>
      {open && <ProjectDrawer nav={nav} onClose={() => setOpen(false)} />}
    </>
  )
}
