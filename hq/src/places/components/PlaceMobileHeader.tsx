import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { BackButton, MenuButton, TopBar, TopBarTitle } from '../../shared/layouts/TopBar'

/**
 * A place screen's header below `lg`: ‹ back (or ☰ where the place is top-level) and the title; the chat and the
 * screen's ⋯ keep their place at the right.
 */
export function PlaceMobileHeader({ backHref, leading, title, onTitle }: {
  /** Where ‹ goes; null shows ☰, opening the main drawer. */
  backHref: string | null
  leading?: ReactNode
  title: string
  /** Tapping the title does this (a conversation opens its total usage as a sheet). */
  onTitle?: () => void
}) {
  const first = backHref ? <BackButton to={backHref} /> : <MenuButton />
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
