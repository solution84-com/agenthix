import type { ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { useNavDrawer } from '../context/NavDrawerContext'
import { DockPhoneButton } from '../../dock/DockPhoneButton'
import { ShellPanelButtons } from './ShellPanelButtons'

export const TOP_BAR_BUTTON = 'flex items-center justify-center p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors'

/** ☰: the main drawer, the same everywhere. */
export function MenuButton() {
  const { openDrawer } = useNavDrawer()
  return <button type="button" onClick={openDrawer} aria-label="Open menu" className={TOP_BAR_BUTTON}><Menu size={18} /></button>
}

/** A screen's title in the top bar, and what it is in (a project's name) small underneath. */
export function TopBarTitle({ title, under }: { title: string; under?: string }) {
  return (
    <>
      <span className="min-w-0 truncate text-h3 font-semibold leading-tight text-text-primary">{title}</span>
      {under && <span className="min-w-0 truncate text-micro leading-tight text-text-muted">{under}</span>}
    </>
  )
}

/**
 * The phone's top bar, the one every screen below `lg` draws: what leads (☰ or ‹ Back), the title, then the chat's
 * icon, notifications and Runs, then what the screen adds at the end (a project's drawer button).
 */
export function TopBar({ leading, children, end }: { leading: ReactNode; children: ReactNode; end?: ReactNode }) {
  return (
    <header data-testid="mobile-header" className="lg:hidden h-12 shrink-0 flex items-center gap-2 px-3 border-b border-border-subtle bg-surface-1">
      {leading}
      <div className="flex min-w-0 flex-1 flex-col justify-center">{children}</div>
      <div className="flex shrink-0 items-center gap-1">
        <DockPhoneButton />
        <ShellPanelButtons />
        {end}
      </div>
    </header>
  )
}
