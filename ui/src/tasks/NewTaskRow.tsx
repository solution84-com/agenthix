import { useEffect, useRef, useState } from 'react'
import { TASK_BUTTON_PRIMARY } from './TasksToolParts'
import { FIELD, FOCUS_RING } from '../primitives/controlStyles'
import { useAttentionWhen } from '../attention/useAttentionWhen'

/** A title typed in place lands in the backlog; "More details" opens the full form with it (every screen reviewed spec §3). */
export function NewTaskRow({ onAdd, onMoreDetails, onClose }: {
  onAdd: (title: string) => Promise<void>
  onMoreDetails: (title: string) => void
  onClose?: () => void
}) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error, { kind: 'alert' })
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
          className={`${FIELD} min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-body`}
        />
        <button type="button" className={TASK_BUTTON_PRIMARY} disabled={busy || !title.trim()} onClick={() => void add()}>Add</button>
      </div>
      <p className="text-micro text-text-muted">
        Enter adds it ·{' '}
        <button type="button" onClick={() => onMoreDetails(title.trim())} className={`text-link hover:underline ${FOCUS_RING}`}>More details</button>
      </p>
      {errorDialog}
    </div>
  )
}
