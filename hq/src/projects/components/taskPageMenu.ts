import type { OverflowItem } from '@agenthix/ui/tasks'

/** Why an assigned task cannot be made an epic: an epic is never run (the server refuses it too). */
export const EPIC_NEEDS_NO_AGENT = 'Unassign its agent first'

/**
 * A task page's ⋯ (T9): only what is rare. Make this an epic (Not an epic on one), Copy link, Archive (Unarchive on an
 * archived task) and Delete…, set apart last. Run again joins them on a done task, whose header has no button.
 */
export function taskPageMenu(t: {
  canChange: boolean
  isEpic: boolean
  hasAgent: boolean
  archived: boolean
  runAgain: boolean
}, on: {
  setEpic: (isEpic: boolean) => void
  copyLink: () => void
  archive: () => void
  unarchive: () => void
  runAgain: () => void
  askDelete: () => void
}): OverflowItem[] {
  return [
    ...(t.canChange && t.runAgain ? [{ label: 'Run again', onSelect: on.runAgain }] : []),
    ...(t.canChange ? [t.isEpic
      ? { label: 'Not an epic', onSelect: () => on.setEpic(false) }
      : {
          label: 'Make this an epic', hint: 'Other tasks can then be filed under it', onSelect: () => on.setEpic(true),
          disabledReason: t.hasAgent ? EPIC_NEEDS_NO_AGENT : undefined,
        }] : []),
    { label: 'Copy link', onSelect: on.copyLink },
    ...(t.canChange ? [
      t.archived
        ? { label: 'Unarchive', hint: 'Back in the lists', onSelect: on.unarchive }
        : { label: 'Archive', hint: 'Out of the lists; find it under Filter › Archived', onSelect: on.archive },
      { label: 'Delete…', danger: true, separatorBefore: true, onSelect: on.askDelete },
    ] : []),
  ]
}
