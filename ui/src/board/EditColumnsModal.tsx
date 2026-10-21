import { useState } from 'react'
import { TASK_BUTTON, TASK_BUTTON_PRIMARY } from '../tasks/TasksToolParts'
import type { BoardColumnInfo } from './types'

const STATES = [
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'DONE', label: 'Done' },
]

function slug(label: string, taken: Set<string>): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'column'
  let name = base
  for (let i = 2; taken.has(name); i += 1) name = `${base}_${i}`
  return name
}

/** Edit columns (every screen reviewed spec §3): rename, reorder, add, remove, and pick the state each maps to. */
export function EditColumnsModal({ columns, taskCountByColumn, onSave, onClose }: {
  columns: BoardColumnInfo[]
  taskCountByColumn: Record<string, number>
  onSave: (columns: BoardColumnInfo[]) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState<BoardColumnInfo[]>(() => [...columns].sort((a, b) => a.order - b.order).map(c => ({ ...c })))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const edit = (i: number, patch: Partial<BoardColumnInfo>) => setDraft(d => d.map((c, k) => (k === i ? { ...c, ...patch } : c)))
  const move = (i: number, by: -1 | 1) => setDraft(d => {
    const next = [...d]
    const j = i + by
    if (j < 0 || j >= next.length) return d
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })
  const remove = (i: number) => {
    const count = taskCountByColumn[draft[i].name] ?? 0
    if (count > 0) { setError(`"${draft[i].label}" still holds ${count} task${count === 1 ? '' : 's'}. Move them first.`); return }
    setError('')
    setDraft(d => d.filter((_, k) => k !== i))
  }
  const add = () => setDraft(d => [
    ...d,
    // A new column carries the style data of the last, which the board stores with each column.
    { ...(d[d.length - 1] ?? {}), name: slug('New column', new Set(d.map(c => c.name))), label: 'New column', status: 'IN_PROGRESS', autoQueue: false, order: d.length },
  ])

  const save = async () => {
    const labels = draft.map(c => c.label.trim())
    if (labels.some(l => !l)) { setError('Every column needs a name.'); return }
    if (labels.some(l => l.toLowerCase() === 'backlog')) { setError('Every board has a Backlog already; name the column something else.'); return }
    if (draft.length === 0) { setError('A board needs at least one column.'); return }
    setBusy(true)
    setError('')
    try {
      await onSave(draft.map((c, order) => ({ ...c, label: c.label.trim(), order })))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
      <div role="dialog" aria-label="Edit columns" className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface-1 shadow-2xl">
        <div className="border-b border-border-subtle px-5 py-3">
          <h2 className="text-h3 font-semibold text-text-primary">Edit columns</h2>
          <p className="text-small text-text-muted">The Backlog comes first on every board and is not a column.</p>
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto px-5 py-3">
          {draft.map((c, i) => (
            <div key={c.name} className="flex items-center gap-2 rounded-xl border border-border-subtle px-2 py-1.5">
              <input
                value={c.label} aria-label={`Column ${i + 1} name`} onChange={e => edit(i, { label: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-body text-text-primary focus:outline-none"
              />
              <select
                value={c.status} aria-label={`${c.label} state`} onChange={e => edit(i, { status: e.target.value })}
                className="rounded-lg border border-border bg-surface-2 px-1.5 py-1 text-small text-text-secondary"
              >
                {STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button type="button" aria-label={`Move ${c.label} up`} disabled={i === 0} onClick={() => move(i, -1)} className="px-1 text-text-muted disabled:opacity-30">↑</button>
              <button type="button" aria-label={`Move ${c.label} down`} disabled={i === draft.length - 1} onClick={() => move(i, 1)} className="px-1 text-text-muted disabled:opacity-30">↓</button>
              <button type="button" aria-label={`Remove ${c.label}`} onClick={() => remove(i)} className="px-1 text-text-muted hover:text-danger">✕</button>
            </div>
          ))}
          <button type="button" className="text-small text-accent hover:underline" onClick={add}>＋ Add column</button>
          {error && <p role="alert" className="text-small text-danger">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <button type="button" className={TASK_BUTTON} onClick={onClose}>Cancel</button>
          <button type="button" className={TASK_BUTTON_PRIMARY} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
