import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { FilesQuietLine } from '@agenthix/ui/projects'
import { ChangedLines } from './ChangedLines'
import { fileRows, stepTo, type FileMode } from './fileRows'
import { BUTTON_GHOST } from '@agenthix/ui/primitives'

/**
 * A changed file opened whole with its changes in place, as the workspace view opens one: every line, the removed and
 * added ones marked where they are, ↑ ↓ to step between the changes and *Changes only* to fold the rest. `before` is
 * null for a new file, `after` for a deleted one; `binary` has no lines to show.
 */
export function InPlaceChanges({ before, after, binary = false, heading, aside, wrap = false }: {
  before: string | null
  after: string | null
  binary?: boolean
  /** What the header says of the file: its path and where the change is from. */
  heading: ReactNode
  /** Beside the header's modes: *Undo this file's changes*. */
  aside?: ReactNode
  wrap?: boolean
}) {
  const [mode, setMode] = useState<FileMode>('whole')
  const { rows, changes } = useMemo(() => fileRows(before, after, mode), [before, after, mode])
  const [at, setAt] = useState(0)
  useEffect(() => { setAt(0) }, [before, after, mode])
  const refs = useRef(new Map<number, HTMLTableRowElement>())
  const current = changes[at] ?? -1
  useEffect(() => {
    // jsdom has no scrollIntoView; a browser always does.
    refs.current.get(current)?.scrollIntoView?.({ block: 'center' })
  }, [current])
  const count = changes.length
  const step = (by: 1 | -1) => setAt(a => stepTo(count, a, by))

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="changed-file">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle px-4 py-2 text-small text-text-secondary">
        {heading}
        {count > 0 && (
          <span className="flex items-center gap-1" data-testid="change-stepper">
            <button type="button" aria-label="Previous change" disabled={at <= 0} onClick={() => step(-1)}
              className={`flex h-7 w-7 items-center justify-center rounded ${BUTTON_GHOST}`}><ArrowUp size={14} aria-hidden /></button>
            <button type="button" aria-label="Next change" disabled={at >= count - 1} onClick={() => step(1)}
              className={`flex h-7 w-7 items-center justify-center rounded ${BUTTON_GHOST}`}><ArrowDown size={14} aria-hidden /></button>
            <span className="text-micro text-text-muted">{at + 1} of {count} {count === 1 ? 'change' : 'changes'}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {!binary && (
            <span role="group" aria-label="Show" className="flex items-center gap-1 text-micro">
              {(['whole', 'changes'] as const).map((m, i) => (
                <span key={m} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden className="text-text-muted">·</span>}
                  <button type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                    className={mode === m ? 'font-medium text-text-primary' : 'text-text-secondary hover:text-text-primary'}>
                    {m === 'whole' ? 'Whole file' : 'Changes only'}
                  </button>
                </span>
              ))}
            </span>
          )}
          {aside}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {binary
          ? <FilesQuietLine role="status">Not a text file: there are no lines to show.</FilesQuietLine>
          : <ChangedLines rows={rows} current={current} wrap={wrap} rowRefs={refs.current} empty={count === 0} />}
      </div>
    </div>
  )
}
