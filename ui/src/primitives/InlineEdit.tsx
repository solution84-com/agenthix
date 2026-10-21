import { useState, useEffect, type ReactNode } from 'react'
import { Check } from 'lucide-react'

export interface InlineEditEditorProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export interface InlineEditProps {
  value: string
  onSave: (v: string) => Promise<void>
  multiline?: boolean
  markdown?: boolean
  placeholder?: string
  textClassName?: string
  onEditingChange?: (editing: boolean) => void
  /** Optional renderer for display mode. When omitted, plain text is shown. */
  renderText?: (value: string, className?: string) => ReactNode
  /** Optional renderer for the editor (e.g. a rich-text editor). When omitted, defaults to <textarea> or <input>. */
  renderEditor?: (props: InlineEditEditorProps) => ReactNode
}

export function InlineEdit({
  value,
  onSave,
  multiline = false,
  markdown = false,
  placeholder,
  textClassName = '',
  onEditingChange,
  renderText,
  renderEditor,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDraft(value) }, [value])

  const startEdit = () => { setEditing(true); onEditingChange?.(true) }

  const commit = async () => {
    if (draft.trim() === value) { setEditing(false); onEditingChange?.(false); return }
    setSaving(true)
    try {
      await onSave(draft.trim())
      setEditing(false)
      onEditingChange?.(false)
    } catch {
      // keep editing open on failure
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => { setDraft(value); setEditing(false); onEditingChange?.(false) }

  if (!editing) {
    return (
      <div
        onClick={startEdit}
        className={`cursor-text rounded-lg px-3 py-2 hover:bg-surface-hover transition-colors group ${textClassName}`}
      >
        {value ? (
          markdown && renderText ? (
            renderText(value, 'text-text-primary')
          ) : (
            <span className="text-text-primary whitespace-pre-wrap">{value}</span>
          )
        ) : (
          <span className="text-text-muted italic">{placeholder ?? 'Click to edit…'}</span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {markdown && renderEditor ? (
        renderEditor({ value: draft, onChange: setDraft, placeholder })
      ) : multiline ? (
        <textarea
          autoFocus
          value={draft}
          onChange={e => {
            setDraft(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
          onFocus={e => {
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
          rows={5}
          placeholder={placeholder}
          className="w-full bg-surface-2 border border-accent/40 rounded-lg px-3 py-2 text-body text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
        />
      ) : (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-surface-2 border border-accent/40 rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
        />
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={commit}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small font-medium bg-accent-subtle hover:bg-accent/30 text-accent-hover border border-accent/20 disabled:opacity-40 transition-colors"
        >
          <Check size={12} />
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={cancel} className="px-3 py-1.5 rounded-lg text-small text-text-muted hover:text-text-secondary transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
