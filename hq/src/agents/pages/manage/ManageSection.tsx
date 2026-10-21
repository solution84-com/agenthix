import { useState, type ReactNode } from 'react'

const HEADING = 'text-micro font-medium uppercase tracking-wide text-text-muted'

/** One section of the settings page: a summary and an Edit that opens the editor beneath it. */
export function ManageSection({ title, summary, editor, editLabel = 'Edit' }: {
  title: string
  summary: ReactNode
  /** What opens under Edit; given a function, it is told how to close the editor (after a save, say). */
  editor: ReactNode | ((close: () => void) => ReactNode)
  editLabel?: string
}) {
  const [editing, setEditing] = useState(false)
  return (
    <section aria-label={title} className="border-t border-border-subtle py-4 first:border-t-0">
      <div className="flex items-center justify-between">
        <h3 className={HEADING}>{title}</h3>
        <button type="button" onClick={() => setEditing(e => !e)} className="text-small font-medium text-accent hover:text-accent-hover">
          {editing ? 'Done' : editLabel}
        </button>
      </div>
      {editing ? <div className="mt-3">{typeof editor === 'function' ? editor(() => setEditing(false)) : editor}</div> : <div className="mt-2 text-body text-text-secondary">{summary}</div>}
    </section>
  )
}
