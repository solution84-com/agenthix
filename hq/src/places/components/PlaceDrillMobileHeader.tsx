import { ChevronDown, Menu } from 'lucide-react'
import { useNavDrawer } from '../../shared/context/NavDrawerContext'
import { ShellPanelButtons } from '../../shared/layouts/ShellPanelButtons'
import { CrumbMenu, MenuItems, sectionItems } from '../../shared/layouts/CrumbLists'
import type { PlaceNav } from '../../shared/layouts/placeNavTypes'

const ICON_BUTTON = 'flex items-center justify-center p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors'

/**
 * Below `lg`, drilled into a place: ☰ opens the drawer (the drilled-in panel), the title names the section and
 * opens the place's sections, and the place's name follows it.
 */
export function PlaceDrillMobileHeader({ nav }: { nav: PlaceNav }) {
  const { openDrawer } = useNavDrawer()
  const section = nav.sections.find((s) => s.id === nav.current)?.label ?? 'Overview'
  return (
    <header data-testid="mobile-header" className="lg:hidden h-12 shrink-0 flex items-center gap-2 px-3 border-b border-border-subtle bg-surface-1">
      <button type="button" onClick={openDrawer} aria-label="Open menu" className={ICON_BUTTON}><Menu size={18} /></button>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <CrumbMenu
          label={`${section}, ${nav.name} sections`}
          menuLabel={`${nav.name} sections`}
          buttonClassName="flex min-w-0 items-center gap-1 text-left"
          button={<>
            <span className="min-w-0 truncate text-h3 font-semibold text-text-primary">{section}</span>
            <ChevronDown size={14} className="shrink-0 text-text-muted" aria-hidden />
          </>}
        >
          {(close) => <MenuItems items={sectionItems(nav)} onChoose={close} />}
        </CrumbMenu>
        <span className="min-w-0 truncate text-small text-text-muted">{nav.name}</span>
      </div>
      <ShellPanelButtons />
    </header>
  )
}
