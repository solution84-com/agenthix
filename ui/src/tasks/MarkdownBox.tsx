import { useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode, type RefObject } from 'react'
import { Bold, Code, Heading2, Italic, Link, List, ListChecks, ListOrdered } from 'lucide-react'
import { Tooltip } from '../primitives/Tooltip'
import { SCROLL_EDGE_FADE } from '../primitives/controlStyles'
import { applyMarkdownFormat, type MarkdownFormat } from './markdownFormat'

const TOOLS: { format: MarkdownFormat; label: string; icon: ReactNode }[] = [
  { format: 'heading', label: 'Heading', icon: <Heading2 size={14} aria-hidden /> },
  { format: 'bold', label: 'Bold', icon: <Bold size={14} aria-hidden /> },
  { format: 'italic', label: 'Italic', icon: <Italic size={14} aria-hidden /> },
  { format: 'bullet', label: 'Bulleted list', icon: <List size={14} aria-hidden /> },
  { format: 'numbered', label: 'Numbered list', icon: <ListOrdered size={14} aria-hidden /> },
  { format: 'checklist', label: 'Checklist', icon: <ListChecks size={14} aria-hidden /> },
  { format: 'link', label: 'Link', icon: <Link size={14} aria-hidden /> },
  { format: 'code', label: 'Code', icon: <Code size={14} aria-hidden /> },
]

const tabClass = (on: boolean) =>
  `rounded-md px-2.5 py-1 text-small font-medium max-sm:min-h-11 ${on ? 'bg-selected text-text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'}`

export interface MarkdownBoxProps {
  value: string
  onChange: (value: string) => void
  /** How Preview draws the text: the app's Markdown renderer. */
  renderPreview: (value: string) => ReactNode
  placeholder?: string
  /** The box's accessible name. */
  label: string
  /** ⌘↵ or Ctrl↵. */
  onSubmit?: () => void
  disabled?: boolean
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  /** Under the box, left: what the text is written in. Right: the box's buttons. */
  footer?: ReactNode
  autoFocus?: boolean
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void
  onDrop?: (e: DragEvent<HTMLTextAreaElement>) => void
  /** A new task's description: at least 160 px, growing as it is written; on a wide screen it fills its container's height. */
  fill?: boolean
}

/**
 * A box for Markdown (T0): *Write* shows the text with a toolbar for whoever prefers buttons, *Preview* shows it as
 * it will read. The comments, a new task's description and the description write with it.
 */
export function MarkdownBox(p: MarkdownBoxProps) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const own = useRef<HTMLTextAreaElement>(null)
  const ref = p.textareaRef ?? own

  const format = (f: MarkdownFormat) => {
    const el = ref.current
    const start = el?.selectionStart ?? p.value.length
    const end = el?.selectionEnd ?? p.value.length
    const edit = applyMarkdownFormat(p.value, start, end, f)
    p.onChange(edit.value)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(edit.selectionStart, edit.selectionEnd)
    })
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-surface-1 focus-within:ring-1 focus-within:ring-accent/40 ${p.fill ? 'flex min-h-0 flex-col lg:flex-1' : ''}`}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border-subtle px-2 py-1.5 max-sm:flex-nowrap">
        <div role="tablist" aria-label="Write or preview" className="flex gap-1">
          <button type="button" role="tab" aria-selected={tab === 'write'} onClick={() => setTab('write')} className={tabClass(tab === 'write')}>Write</button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')} className={tabClass(tab === 'preview')}>Preview</button>
        </div>
        {tab === 'write' && (
          <div role="toolbar" aria-label="Formatting" className={`ml-auto flex flex-wrap gap-0.5 max-sm:min-w-0 max-sm:flex-nowrap max-sm:overflow-x-auto ${SCROLL_EDGE_FADE}`}>
            {TOOLS.map(t => (
              <Tooltip key={t.format} label={t.label} side="top">
                <button
                  type="button" aria-label={t.label} disabled={p.disabled} onClick={() => format(t.format)}
                  className="flex items-center justify-center rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 max-sm:h-11 max-sm:w-11"
                >
                  {t.icon}
                </button>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
      {tab === 'write' ? (
        <textarea
          ref={ref}
          value={p.value}
          aria-label={p.label}
          placeholder={p.placeholder}
          disabled={p.disabled}
          autoFocus={p.autoFocus}
          rows={3}
          onPaste={p.onPaste}
          onDrop={p.onDrop}
          onChange={e => {
            p.onChange(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) p.onSubmit?.() }}
          style={p.fill ? undefined : { maxHeight: '20rem' }}
          className={`block w-full resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-small text-text-primary placeholder:text-text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${p.fill ? 'min-h-40 lg:flex-1' : ''}`}
        />
      ) : (
        <div className={`px-3 py-2.5 ${p.fill ? 'min-h-40 overflow-auto lg:flex-1' : 'min-h-[4.5rem]'}`} data-testid="markdown-preview">
          {p.value.trim() === '' ? <p className="text-small text-text-muted">Nothing to preview yet.</p> : p.renderPreview(p.value)}
        </div>
      )}
      {p.footer && <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-3 py-2">{p.footer}</div>}
    </div>
  )
}
