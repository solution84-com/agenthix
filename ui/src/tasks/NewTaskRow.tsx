import { useEffect, useRef, useState } from 'react'
import { TASK_BUTTON_PRIMARY } from './TasksToolParts'

/** A title typed in place lands in the backlog; "More details" opens the full form with it (every screen reviewed spec §3). */
export function NewTaskRow({ onAdd, onMoreDetails, onClose }: {
  onAdd: (title: string) => Promise<void>
  onMoreDetails: (title: string) => void
  onClose?: () => void
}) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])

  const add = async () => {
    const value = title.trim()
    if (!value || busy) return
    setBusy(true)
    setError('')
    try {
      await onAdd(value)
      setTitle('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1 px-4 pt-3">
      <div className="flex items-center gap-2">
        <input
          ref={input}
          value={title}
          disabled={busy}
          aria-label="New task title"
          placeholder="Add a task to the backlog"
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void add()
            if (e.key === 'Escape') onClose?.()
          }}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-body text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
        />
        <button type="button" className={TASK_BUTTON_PRIMARY} disabled={busy || !title.trim()} onClick={() => void add()}>Add</button>
      </div>
      <p className="text-micro text-text-muted">
        Enter adds it ·{' '}
        <button type="button" onClick={() => onMoreDetails(title.trim())} className="text-accent hover:underline">More details</button>
      </p>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
    </div>
  )
}
