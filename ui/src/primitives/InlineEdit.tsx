import { useState, useEffect, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { DISABLED, FIELD, FOCUS_RING } from './controlStyles'
import { BUTTON_PRIMARY } from './buttonStyles'
import { useAttention } from './AttentionDialog'
import { isFinal } from '../attention/retry'

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

/** What `onSave` throws for a value it will not take, with the reason: said under the field. Any other failure is a failed press. */
export class ValueRefused extends Error {}

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
  const [error, setError] = useState<string | null>(null)
  const attention = useAttention()

  // A background update (a live query refreshing the record) must not overwrite what is being typed.
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  const startEdit = () => { setDraft(value); setError(null); setEditing(true); onEditingChange?.(true) }

  const commit = async () => {
    if (draft.trim() === value) { setEditing(false); onEditingChange?.(false); return }
    setSaving(true)
    setError(null)
    try {
      await onSave(draft.trim())
      setEditing(false)
      onEditingChange?.(false)
    } catch (err) {
      // A refusal of the value is said under the field; any other failure is a failed press: the dialog with Try again.
      if (err instanceof ValueRefused || isFinal(err)) setError(err instanceof Error && err.message ? err.message : 'Could not save. Nothing was changed.')
      else attention.show({ text: 'Could not save. Nothing was changed.', retry: () => { void commit() } })
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => { setDraft(value); setError(null); setEditing(false); onEditingChange?.(false) }

  if (!editing) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={startEdit}
        onKeyDown={e => {
          // Only the display itself: a link or button inside rendered text keeps its own keys.
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit() }
        }}
        className={`cursor-text rounded-lg px-3 py-2 hover:bg-surface-hover transition-colors group ${FOCUS_RING} ${textClassName}`}
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
          className={`w-full ${FIELD} rounded-lg px-3 py-2 text-body resize-none`}
        />
      ) : (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${FIELD} rounded-lg px-3 py-2 text-body`}
        />
      )}
      {attention.dialog}
      {error && <p role="status" className="text-small text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={commit}
          disabled={saving}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small font-medium ${BUTTON_PRIMARY}`}
        >
          <Check size={12} />
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={cancel} className={`px-3 py-1.5 rounded-lg text-small text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-pressed transition-colors ${FOCUS_RING}`}>
          Cancel
        </button>
      </div>
    </div>
  )
}
