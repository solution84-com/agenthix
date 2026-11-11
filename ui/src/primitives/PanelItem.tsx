import type { ReactNode, Ref } from 'react'
import { DISABLED, FOCUS_RING, ROW_CHOSEN } from './controlStyles'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from './buttonStyles'

export interface PanelItemProps {
  /** At the left: the agent's avatar, or a sign for a message from the system. */
  icon?: ReactNode
  /** Line 1, after its key: what it is. */
  title: ReactNode
  /** The key line 1 starts with, such as a task's (WEB-27). */
  itemKey?: string | null
  /** Line 2: why it is here, or the agent, place and state — one line, cut short when it is longer. */
  detail?: ReactNode
  /** At the right: when, or for how long. */
  time?: string
  /** At the right, under the time: the one action. */
  action?: ReactNode
  /** Not seen yet: a dot before line 1. */
  unread?: boolean
  /** History rather than something current: drawn quieter. */
  quiet?: boolean
  /** The one open beside a list: the chosen row's fill. */
  selected?: boolean
  /** A tap on the item anywhere but its button. */
  onOpen?: () => void
  /** Shown on hover, as ✕. */
  onDismiss?: () => void
  dismissLabel?: string
  itemRef?: Ref<HTMLLIElement>
  /** Set as data-item-id, so a parent can tell which item came into view. */
  itemId?: string
}

/**
 * One item of the Notifications or Runs panel: two lines and one action
 * (every screen reviewed spec §6).
 */
export function PanelItem({
  icon, title, itemKey, detail, time, action, unread, quiet, selected, onOpen, onDismiss, dismissLabel = 'Dismiss', itemRef, itemId,
}: PanelItemProps) {
  const lines = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-small font-medium text-text-primary">
        {unread && <span aria-label="Not seen" className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-primary" />}
        {itemKey && <span className="shrink-0 text-text-muted">{itemKey}</span>}
        <span className="truncate">{title}</span>
      </span>
      {detail && <span className="block truncate text-micro text-text-secondary">{detail}</span>}
    </>
  )
  return (
    <li
      ref={itemRef}
      data-item-id={itemId}
      aria-current={selected ? 'true' : undefined}
      onClick={onOpen}
      className={`group flex items-start gap-2.5 border-b border-border-subtle px-3 py-2.5 transition-colors ${selected ? ROW_CHOSEN : 'hover:bg-surface-hover active:bg-surface-pressed'} ${onOpen ? 'cursor-pointer' : ''} ${quiet ? 'opacity-80' : ''}`}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      {onOpen ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpen() }} className={`flex min-w-0 flex-1 cursor-pointer flex-col items-stretch gap-0.5 rounded-lg text-left ${FOCUS_RING}`}>
          {lines}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">{lines}</span>
      )}
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="flex items-center gap-1">
          {time && <span className="text-micro text-text-muted">{time}</span>}
          {onDismiss && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDismiss() }}
              aria-label={dismissLabel}
              title={dismissLabel}
              className={`flex h-4 w-4 items-center justify-center rounded text-micro text-text-muted opacity-0 transition-opacity hover:text-text-primary focus:opacity-100 group-hover:opacity-100 ${FOCUS_RING}`}
            >
              ✕
            </button>
          )}
        </span>
        {action && <span onClick={e => e.stopPropagation()}>{action}</span>}
      </span>
    </li>
  )
}

// The main and the secondary look are Button's (buttonStyles); Stop keeps its danger edge, with its hover and pressed step.
const ACTION_LOOK = {
  primary: BUTTON_PRIMARY,
  plain: BUTTON_SECONDARY,
  stop: `border border-danger/30 text-danger not-disabled:hover:bg-danger/10 not-disabled:active:bg-danger/20 ${FOCUS_RING} ${DISABLED}`,
} as const

/** The one action of a panel item. */
export function PanelItemAction({ look = 'plain', children, onClick, disabled, title }: {
  look?: keyof typeof ACTION_LOOK
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`shrink-0 cursor-pointer rounded-lg px-2 py-0.5 text-micro font-medium transition-colors ${ACTION_LOOK[look]}`}
    >
      {children}
    </button>
  )
}

/** A group's heading inside a panel: its name, and how many it holds. */
export function PanelGroupHeading({ label, count, tone }: { label: string; count?: number; tone?: 'warning' | 'success' }) {
  const toneClass = tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-text-muted'
  return (
    <h3 className="flex items-center justify-between px-3 pb-1 pt-3 text-micro font-medium uppercase tracking-wide text-text-muted">
      <span>{label}</span>
      {count !== undefined && count > 0 && <span className={toneClass}>{count}</span>}
    </h3>
  )
}
