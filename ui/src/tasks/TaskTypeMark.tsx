import { Bug, ClipboardList, Diamond, LifeBuoy, Lightbulb, type LucideIcon } from 'lucide-react'
import { EPIC_TYPE_ICON, TASK_TYPE_ICON } from '@agenthix/core'

// The icons a task type may name (adr-0174): Task and Epic, built in, and the ones the designs give custom types.
const ICONS: Record<string, LucideIcon> = {
  [TASK_TYPE_ICON]: ClipboardList,
  [EPIC_TYPE_ICON]: Diamond,
  bug: Bug,
  feature: Lightbulb,
  support: LifeBuoy,
}

/** The icons a type can be given, in the order a chooser lists them. */
export const TASK_TYPE_ICON_NAMES: readonly string[] = Object.keys(ICONS)

/** The icon a type is drawn with: its own, or the task icon for a name this side does not know. */
export function taskTypeIconName(icon: string | null | undefined): string {
  return icon && Object.prototype.hasOwnProperty.call(ICONS, icon) ? icon : TASK_TYPE_ICON
}

/**
 * A task type's mark: its icon, named by the type. `inline` (the default) is the muted icon before a key or a title
 * on a row or a card; `tile` is the icon on a small grey square, where types are listed (Task types, a template).
 */
export function TaskTypeMark({ type, variant = 'inline', size = 14 }: {
  type: { name: string; icon: string }
  variant?: 'inline' | 'tile'
  size?: 12 | 13 | 14
}) {
  const name = taskTypeIconName(type.icon)
  const Icon = ICONS[name]!
  const shell = variant === 'tile'
    ? 'h-6 w-6 justify-center rounded-md bg-surface-2 text-text-secondary'
    : 'text-text-muted'
  return (
    <span role="img" aria-label={type.name} title={type.name} data-icon={name} className={`inline-flex shrink-0 items-center ${shell}`}>
      <Icon size={size} aria-hidden />
    </span>
  )
}
