import { useState } from 'react'
import {
  MEMORY_BODY_MAX_CHARS, MEMORY_TITLE_MAX_CHARS, type MemoryItemKindValue, type MemoryItemView,
} from '../../../shared/memory/protocol'
import { KIND_LABELS } from './memoryFormat'

export type Draft = { title: string; body: string; kind: MemoryItemKindValue; tags: string[] }

const FIELD = 'w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:border-accent/50'

export function draftOf(item?: MemoryItemView): Draft {
  return { title: item?.title ?? '', body: item?.body ?? '', kind: item?.kind ?? 'FACT', tags: item?.tags ?? [] }
}

/** One memory to write or change: a title, what is remembered, its kind and tags. */
export function MemoryEditor({ initial, submitLabel, onSave, onCancel }: {
  initial: Draft
  submitLabel: string
  onSave: (draft: Draft) => Promise<void>
  onCancel?: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [tags, setTags] = useState(initial.tags.join(', '))
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }))

  async function submit() {
    setBusy(true)
    try {
      await onSave({ ...draft, tags: tags.split(',').map(t => t.trim()).filter(Boolean) })
      if (!onCancel) { setDraft(initial); setTags('') }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <input aria-label="Title" value={draft.title} maxLength={MEMORY_TITLE_MAX_CHARS} placeholder="What it is about"
        onChange={e => set({ title: e.target.value })} className={FIELD} />
      <textarea aria-label="What is remembered" value={draft.body} maxLength={MEMORY_BODY_MAX_CHARS} rows={3}
        placeholder="A fact that stands on its own, readable months from now" onChange={e => set({ body: e.target.value })} className={FIELD} />
      <div className="flex flex-wrap gap-2">
        <select aria-label="Kind" value={draft.kind} onChange={e => set({ kind: e.target.value as MemoryItemKindValue })}
          className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary">
          {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input aria-label="Tags" value={tags} placeholder="Tags, separated by commas" onChange={e => setTags(e.target.value)}
          className={`${FIELD} flex-1 min-w-40`} />
      </div>
      <div className="flex gap-3">
        <button type="button" disabled={busy || !draft.title.trim() || !draft.body.trim()} onClick={submit}
          className="bg-accent hover:bg-accent/90 disabled:opacity-50 text-on-accent px-4 py-2 rounded-lg text-body font-medium transition-colors cursor-pointer">
          {submitLabel}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="text-body text-text-muted cursor-pointer">Cancel</button>}
      </div>
    </div>
  )
}
