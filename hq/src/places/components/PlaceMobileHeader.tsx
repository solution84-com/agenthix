import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronLeft, Menu } from 'lucide-react'
import { useNavDrawer } from '../../shared/context/NavDrawerContext'
import { ShellPanelButtons } from '../../shared/layouts/ShellPanelButtons'

const ICON_BUTTON = 'flex items-center justify-center p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors'

/**
 * A place screen's header below `lg`: ‹ back (or ☰ where the place is top-level) and the title. Notifications and Runs keep their place at the right.
 */
export function PlaceMobileHeader({ backHref, leading, title, onTitle }: {
  /** Where ‹ goes; null shows ☰, opening the navigation drawer. */
  backHref: string | null
  leading?: ReactNode
  title: string
  /** Tapping the title does this (a conversation opens its total usage as a sheet). */
  onTitle?: () => void
}) {
  const { openDrawer } = useNavDrawer()
  return (
    <header data-testid="mobile-header" className="lg:hidden h-12 shrink-0 flex items-center gap-2 px-3 border-b border-border-subtle bg-surface-1">
      {backHref ? (
        <Link to={backHref} aria-label="Back" className={ICON_BUTTON}><ChevronLeft size={18} /></Link>
      ) : (
        <button type="button" onClick={openDrawer} aria-label="Open menu" className={ICON_BUTTON}><Menu size={18} /></button>
      )}
      {leading}
      {onTitle ? (
        <button type="button" data-panel-trigger onClick={onTitle} aria-label="This conversation's usage" className="flex min-w-0 flex-1 items-center gap-1 text-left">
          <span className="min-w-0 truncate text-h3 font-semibold text-text-primary">{title}</span>
          <ChevronDown size={14} className="shrink-0 text-text-muted" aria-hidden />
        </button>
      ) : (
        <span className="flex-1 min-w-0 truncate text-h3 font-semibold text-text-primary">{title}</span>
      )}
      <ShellPanelButtons />
    </header>
  )
}
