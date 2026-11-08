import type { BoardKind } from '@agenthix/core'
import type { BoardRowData } from './types'

type Part = BoardRowData['spread'][number]

const BY_STATE: Record<string, string> = {
  BACKLOG: 'bg-surface-3', TODO: 'bg-text-muted', IN_PROGRESS: 'bg-warning', DONE: 'bg-success',
}
const BY_RUN: Record<string, string> = {
  NOT_STARTED: 'bg-surface-3', WAITING: 'bg-text-muted', RUNNING: 'bg-accent', NEEDS_YOU: 'bg-warning', FAILED: 'bg-danger', FINISHED: 'bg-success',
}
// A field's options in steps of the accent, so its order reads from light to full.
const OPTION_STEPS = [
  'bg-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-surface-2))]',
  'bg-[color-mix(in_srgb,var(--color-accent)_60%,var(--color-surface-2))]',
  'bg-[color-mix(in_srgb,var(--color-accent)_80%,var(--color-surface-2))]',
  'bg-accent',
]

/** The colour of a column's part of the bar: its task state's, its execution state's, or a step of a field's options. */
export function spreadTone(kind: BoardKind, part: Part, index: number, parts: number): string {
  if (kind === 'EXECUTION') return BY_RUN[part.key] ?? 'bg-surface-3'
  if (kind === 'FIELD') {
    if (index === 0) return 'bg-surface-3'
    const options = Math.max(1, parts - 1)
    return OPTION_STEPS[Math.min(OPTION_STEPS.length - 1, Math.floor(((index - 1) / options) * OPTION_STEPS.length))]
  }
  return (part.state && BY_STATE[part.state]) || 'bg-surface-3'
}

/** "Backlog 9 · To do 7 · In progress 6 · Done 11", in the board's order. */
export function spreadWords(spread: readonly Part[]): string {
  return spread.map(p => `${p.name} ${p.count}`).join(' · ')
}

/**
 * A board's spread at a glance (BS1): one part per column in the board's order, each as wide as its count, with the
 * counts written under it in the same order. The words carry it; the colours only repeat them.
 */
export function SpreadBar({ kind, spread }: { kind: BoardKind; spread: BoardRowData['spread'] }) {
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <span role="img" aria-label="Tasks in each column" className="flex h-1.5 gap-px overflow-hidden rounded-full bg-surface-2">
        {spread.map((p, i) => p.count > 0 && (
          <i key={p.key} title={`${p.name} ${p.count}`} className={`block ${spreadTone(kind, p, i, spread.length)}`} style={{ flex: p.count }} />
        ))}
      </span>
      <span className="truncate text-small text-text-muted">{spreadWords(spread)}</span>
    </span>
  )
}
