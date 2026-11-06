import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronLeft } from 'lucide-react'
import { MenuButton, TOP_BAR_BUTTON, TopBar, TopBarTitle } from '../../shared/layouts/TopBar'

/**
 * A place screen's header below `lg`: ‹ back (or ☰ where the place is top-level) and the title. The chat,
 * notifications and Runs keep their place at the right.
 */
export function PlaceMobileHeader({ backHref, leading, title, onTitle }: {
  /** Where ‹ goes; null shows ☰, opening the main drawer. */
  backHref: string | null
  leading?: ReactNode
  title: string
  /** Tapping the title does this (a conversation opens its total usage as a sheet). */
  onTitle?: () => void
}) {
  const first = backHref
    ? <Link to={backHref} aria-label="Back" className={TOP_BAR_BUTTON}><ChevronLeft size={18} /></Link>
    : <MenuButton />
  return (
    <TopBar leading={<>{first}{leading}</>}>
      {onTitle ? (
        <button type="button" data-panel-trigger onClick={onTitle} aria-label="This conversation's usage" className="flex min-w-0 items-center gap-1 text-left">
          <TopBarTitle title={title} />
          <ChevronDown size={14} className="shrink-0 text-text-muted" aria-hidden />
        </button>
      ) : (
        <TopBarTitle title={title} />
      )}
    </TopBar>
  )
}
