import { useRef, type ReactNode } from 'react'
import { useWide } from '../../storage/pages/useToolParams'

/**
 * A task with one of its files open (board T1): wide, the file sits beside the task; narrow, it covers the task until
 * ‹ back. With no file open, the task alone.
 */
export function TaskBesideFile({ task, file }: { task: ReactNode; file: ((layout: 'narrow' | 'wide') => ReactNode) | null }) {
  const root = useRef<HTMLDivElement>(null)
  const wide = useWide(root)
  // The task and the file keep their places in the tree, so the open file isn't opened again when the width is known.
  return (
    <div ref={root} className={file && wide ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]' : file ? 'flex min-h-0 flex-1 flex-col' : undefined}>
      {(!file || wide) && <div className={file ? 'min-h-0 min-w-0 overflow-y-auto' : 'min-w-0'}>{task}</div>}
      {file && (
        <section aria-label="Open file" className={`flex min-h-0 min-w-0 flex-1 flex-col${wide ? ' border-l border-border-subtle' : ''}`}>
          {file(wide ? 'wide' : 'narrow')}
        </section>
      )}
    </div>
  )
}
