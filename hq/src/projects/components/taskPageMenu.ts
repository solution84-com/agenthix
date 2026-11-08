import type { OverflowItem } from '@agenthix/ui/tasks'

export const ALREADY_FIRST = 'It is first in the project’s order'
export const ALREADY_LAST = 'It is last in the project’s order'

/**
 * A task page's ⋯ (TK1): only what is rare. Move to top and Move to bottom (the task's place in the project's one
 * order, never shown as a number: D14), then Copy link and Archive (Unarchive on an archived task), then Delete…, set
 * apart last. Run again leads them on a done task, whose header has no button. Its type, an epic's included, is the
 * header's Type chip.
 */
export function taskPageMenu(t: {
  canChange: boolean
  archived: boolean
  runAgain: boolean
  first: boolean
  last: boolean
}, on: {
  moveToTop: () => void
  moveToBottom: () => void
  copyLink: () => void
  archive: () => void
  unarchive: () => void
  runAgain: () => void
  askDelete: () => void
}): OverflowItem[] {
  return [
    ...(t.canChange && t.runAgain ? [{ label: 'Run again', onSelect: on.runAgain }] : []),
    ...(t.canChange ? [
      { label: 'Move to top', onSelect: on.moveToTop, disabledReason: t.first ? ALREADY_FIRST : undefined },
      { label: 'Move to bottom', onSelect: on.moveToBottom, disabledReason: t.last ? ALREADY_LAST : undefined },
    ] : []),
    { label: 'Copy link', onSelect: on.copyLink, separatorBefore: t.canChange },
    ...(t.canChange ? [
      t.archived
        ? { label: 'Unarchive', hint: 'Back in the lists', onSelect: on.unarchive }
        : { label: 'Archive', hint: 'Out of the lists; find it under Filter › Archived', onSelect: on.archive },
      { label: 'Delete…', danger: true, separatorBefore: true, onSelect: on.askDelete },
    ] : []),
  ]
}
