import { useEffect, useState } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { MarkdownMessage, type MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'
import { RichTextEditor } from '../../shared/components/ui/RichTextEditor'
import { useAttention } from '../../shared/components/AttentionDialog'

const EDIT_LINK = 'text-small text-text-muted hover:text-text-primary'

function useTextSave(value: string, onSave: (v: string) => Promise<void>, what: string) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const attention = useAttention()
  // A refresh of the task must not overwrite what is being typed.
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  const save = async (text: string): Promise<void> => {
    if (text.trim() === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(text.trim())
      setEditing(false)
    } catch (e) {
      attention.show({
        title: `${what} wasn’t changed`,
        text: `${e instanceof Error && e.message ? e.message : 'Could not save.'} Nothing was changed.`,
        retry: () => void save(text),
      })
    } finally {
      setSaving(false)
    }
  }
  const start = () => { setDraft(value); setEditing(true) }
  const cancel = () => { setDraft(value); setEditing(false) }
  return { editing, draft, setDraft, saving, save, start, cancel, dialog: attention.dialog }
}

/** The title, edited in place (T0): a save that works shows nothing; one that fails opens the centred dialog. */
export function TaskTitleField({ value, onSave, readOnly }: { value: string; onSave: (v: string) => Promise<void>; readOnly?: boolean }) {
  const t = useTextSave(value, onSave, 'The title')
  if (readOnly) return <h1 className="text-h2 font-semibold text-text-primary">{value}</h1>
  if (!t.editing) {
    return (
      <h1 className="text-h2 font-semibold text-text-primary">
        <button type="button" onClick={t.start} className="w-full rounded-lg text-left hover:bg-surface-hover" aria-label={`Title: ${value}. Edit`}>
          {value}
        </button>
        {t.dialog}
      </h1>
    )
  }
  return (
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); void t.save(t.draft) }}>
      <input
        autoFocus aria-label="Title" value={t.draft} onChange={e => t.setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') t.cancel() }}
        className="w-full rounded-lg border border-accent/40 bg-surface-2 px-3 py-2 text-h2 font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={t.cancel}>Cancel</Button>
        <Button type="submit" variant="secondary" size="sm" disabled={t.saving || !t.draft.trim()}>Save</Button>
      </div>
      {t.dialog}
    </form>
  )
}

/**
 * The description (T0): Markdown shown formatted; ✎ Edit, or a click on it, opens the editor in place with Write and
 * Preview. Ask <agent> to help sends the draft to the task's conversation, where the agent can write it.
 */
export function TaskDescriptionField({ value, onSave, readOnly, embed, help }: {
  value: string
  onSave: (v: string) => Promise<void>
  readOnly?: boolean
  embed?: MarkdownEmbedContext
  /** Ask <agent> to help; its button is greyed with `refusal` when the person may not talk about the task. */
  help?: { label: string; refusal: string | null; ask: (draft: string) => Promise<void> }
}) {
  const t = useTextSave(value, onSave, 'The description')
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const text = value
    ? <MarkdownMessage content={value} className="text-body leading-relaxed text-text-primary" embed={embed} />
    : <p className="text-body italic text-text-muted">{readOnly ? 'No description.' : 'Add a description…'}</p>
  if (readOnly) return text
  if (!t.editing) {
    return (
      <div className="group relative">
        <div role="button" tabIndex={0} aria-label="Description. Edit" onClick={t.start}
          onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.start() } }}
          className="cursor-text rounded-lg py-1 hover:bg-surface-hover"
        >
          {text}
        </div>
        <button type="button" onClick={t.start} className={`${EDIT_LINK} mt-1`}>✎ Edit</button>
        {t.dialog}
      </div>
    )
  }
  const tabClass = (on: boolean) => `px-2.5 py-1 text-small rounded-md ${on ? 'bg-selected text-text-primary' : 'text-text-muted hover:text-text-primary'}`
  return (
    <div className="space-y-2">
      <div role="tablist" aria-label="Description editor" className="flex gap-1">
        <button type="button" role="tab" aria-selected={tab === 'write'} className={tabClass(tab === 'write')} onClick={() => setTab('write')}>Write</button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} className={tabClass(tab === 'preview')} onClick={() => setTab('preview')}>Preview</button>
      </div>
      {tab === 'write'
        ? <RichTextEditor value={t.draft} onChange={t.setDraft} placeholder="Add a description…" />
        : <div className="min-h-[8rem] rounded-lg border border-border-subtle px-3 py-2">
            {t.draft ? <MarkdownMessage content={t.draft} className="text-body leading-relaxed" embed={embed} /> : <p className="text-body text-text-muted">Nothing to preview.</p>}
          </div>}
      <div className="flex flex-wrap items-center gap-2">
        {help && (
          <Button
            type="button" variant="secondary" size="sm" disabled={!!help.refusal} title={help.refusal ?? undefined}
            onClick={() => { void help.ask(t.draft).then(() => t.cancel(), () => undefined) }}
          >
            ✦ {help.label}
          </Button>
        )}
        <span className="text-micro text-text-muted">Markdown</span>
        <span className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={t.cancel}>Cancel</Button>
          <Button type="button" variant="secondary" size="sm" disabled={t.saving} onClick={() => void t.save(t.draft)}>Save</Button>
        </span>
      </div>
      {t.dialog}
    </div>
  )
}
