import { Menu } from 'lucide-react'
import { useNavDrawer } from '../context/NavDrawerContext'
import { ShellPanelButtons } from './ShellPanelButtons'

/** Below the `lg` breakpoint: ☰ opens the navigation drawer; Notifications and Runs sit at the top right. */
export function MobileHeader({ title }: { title: string }) {
  const { openDrawer } = useNavDrawer()
  return (
    <header
      data-testid="mobile-header"
      className="lg:hidden h-12 shrink-0 flex items-center gap-2 px-3 border-b border-border-subtle bg-surface-1"
    >
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Open menu"
        className="flex items-center justify-center p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
      >
        <Menu size={18} />
      </button>
      <span className="flex-1 min-w-0 truncate text-h3 font-semibold text-text-primary">{title}</span>
      <ShellPanelButtons />
    </header>
  )
}
