import { useAuth } from 'wasp/client/auth'
import { ChevronLeft } from 'lucide-react'
import type { PinnedSlot } from './pinnedSlot'
import { YouMenu } from './YouMenu'

/**
 * The navigation's foot, the same inside a place, on the main navigation and in *Go to*, and never moving: the Pinned
 * row when there are pins, then you (a menu with Organisation, Settings and Sign out) and the collapse button.
 */
export function SidebarFooter({ collapsed, onToggleCollapse, onNavigate, pinned }: {
  collapsed: boolean
  onToggleCollapse?: () => void
  onNavigate?: () => void
  pinned?: PinnedSlot
}) {
  const { data: user } = useAuth()
  // The auth identity type does not expose the username identity's shape.
  const username: string = (user as any)?.identities?.username?.id ?? 'admin'
  const pinnedRow = typeof pinned === 'function' ? pinned({ collapsed, onNavigate }) : pinned

  const collapse = onToggleCollapse && (
    <button
      type="button"
      onClick={onToggleCollapse}
      aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      title={collapsed ? 'Expand' : 'Collapse'}
      className="hidden lg:flex p-2 rounded-lg shrink-0 items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
    >
      <ChevronLeft size={16} className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
    </button>
  )

  return (
    <div data-testid="sidebar-foot" className={`shrink-0 border-t border-border-subtle ${collapsed ? 'px-2' : 'px-3'} py-2 space-y-0.5`}>
      {pinnedRow}
      <div className={collapsed ? 'flex flex-col items-center gap-1' : 'flex items-center gap-1'}>
        <YouMenu username={username} collapsed={collapsed} onNavigate={onNavigate} />
        {collapse}
      </div>
    </div>
  )
}
