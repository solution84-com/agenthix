import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'

/** The Markdown a toolbar button wraps around the selection (or inserts, with nothing selected). */
const TOOLS = [
  { label: 'Bold', text: 'B', before: '**', after: '**', hint: 'bold' },
  { label: 'Italic', text: 'I', before: '_', after: '_', hint: 'italic' },
  { label: 'Code', text: '</>', before: '`', after: '`', hint: 'code' },
  { label: 'List', text: '•', before: '\n- ', after: '', hint: 'item' },
  { label: 'Link', text: 'Link', before: '[', after: '](https://)', hint: 'text' },
] as const

const imagesOf = (files: FileList | null | undefined): File[] => Array.from(files ?? []).filter(f => f.type.startsWith('image/'))

/**
 * A new task's description: Markdown, written with a toolbar or previewed as it will read. Images pasted or dropped
 * on it are not written into the text: the task does not exist yet, so they are kept to be attached to it.
 */
export function NewTaskDescription({ value, onChange, onImages }: {
  value: string
  onChange: (value: string) => void
  onImages: (files: File[]) => void
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const box = useRef<HTMLTextAreaElement>(null)
  const tabClass = (on: boolean) => `rounded-lg px-2.5 py-1 text-small ${on ? 'bg-surface-2 font-medium text-text-primary' : 'text-text-secondary hover:bg-surface-hover'}`

  const apply = (tool: typeof TOOLS[number]) => {
    const el = box.current
    const from = el?.selectionStart ?? value.length
    const to = el?.selectionEnd ?? value.length
    const picked = value.slice(from, to) || tool.hint
    onChange(`${value.slice(0, from)}${tool.before}${picked}${tool.after}${value.slice(to)}`)
    el?.focus()
  }
  const onPaste = (e: ClipboardEvent) => {
    const images = imagesOf(e.clipboardData?.files)
    if (images.length > 0) { e.preventDefault(); onImages(images) }
  }
  const onDrop = (e: DragEvent) => {
    const images = imagesOf(e.dataTransfer?.files)
    if (images.length > 0) { e.preventDefault(); onImages(images) }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Write or preview" className="flex gap-1">
          <button type="button" role="tab" aria-selected={tab === 'write'} onClick={() => setTab('write')} className={tabClass(tab === 'write')}>Write</button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')} className={tabClass(tab === 'preview')}>Preview</button>
        </div>
        {tab === 'write' && (
          <div className="flex gap-0.5" role="toolbar" aria-label="Formatting">
            {TOOLS.map(t => (
              <button key={t.label} type="button" aria-label={t.label} title={t.label} onClick={() => apply(t)}
                className="rounded-md px-2 py-0.5 text-small text-text-secondary hover:bg-surface-hover">{t.text}</button>
            ))}
          </div>
        )}
      </div>
      {tab === 'write' ? (
        <textarea
          ref={box} aria-label="Description" value={value} onChange={e => onChange(e.target.value)} onPaste={onPaste} onDrop={onDrop}
          placeholder="Describe the task. Markdown works; paste or drop an image to attach it."
          className="min-h-[12rem] w-full flex-1 resize-none rounded-lg border border-border bg-surface-1 px-3 py-2 text-body text-text-primary placeholder:text-text-muted"
        />
      ) : (
        <div role="tabpanel" className="min-h-[12rem] flex-1 overflow-auto rounded-lg border border-border-subtle bg-surface-1 px-3 py-2">
          {value.trim() === '' ? <p className="text-small text-text-muted">Nothing to preview yet.</p> : <MarkdownMessage content={value} />}
        </div>
      )}
    </div>
  )
}
