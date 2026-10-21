import { Bell } from 'lucide-react'
import { useShellPanel } from './useShellPanel'

/** Opens the notices beside the menu; its count is every notice not dismissed. */
export function NoticesBell({ count }: { count: number }) {
  const { open, toggleNotices } = useShellPanel()
  const on = open === 'notices'
  return (
    <button
      type="button"
      data-shell-bell
      onClick={toggleNotices}
      aria-expanded={on}
      aria-controls="notices-panel"
      aria-label={count ? `Notices, ${count} new` : 'Notices'}
      className={`relative grid size-7 place-items-center rounded-lg text-text-secondary hover:bg-surface-hover ${on ? 'bg-selected text-text-primary' : ''}`}
    >
      <Bell size={15} aria-hidden />
      {count > 0 && (
        <sup className="absolute -top-0.5 -right-[3px] h-[15px] min-w-[15px] rounded-full bg-warning px-1 text-center text-[9.5px] font-bold leading-[15px] text-surface-1">
          {count}
        </sup>
      )}
    </button>
  )
}
