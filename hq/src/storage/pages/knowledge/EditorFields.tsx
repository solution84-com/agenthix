import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { MarkdownMessage, type MarkdownEmbedContext } from '../../../shared/components/MarkdownMessage'
import type { PropertyRow } from './editorModel'

const INPUT = 'block w-full rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-body text-text-primary placeholder:text-text-muted'

export function Field({ label, hint, problems, children, htmlFor }: {
  label: string
  hint?: string
  problems?: string[]
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="px-4 py-2">
      <label htmlFor={htmlFor} className="mb-1 block text-small font-medium text-text-secondary">{label}</label>
      {children}
      {hint && <p className="mt-1 text-micro text-text-muted">{hint}</p>}
      {problems?.map((m, i) => <p key={i} role="alert" className="mt-1 text-small text-danger">{m}</p>)}
    </div>
  )
}

export function TextInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input id={id} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={INPUT} />
}

export function TagsInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim().replace(/,$/, '')
    if (t !== '') onChange([...tags, t])
    setDraft('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2 py-1.5">
      {tags.map((t, i) => (
        <span key={`${t}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-small text-text-secondary">
          {t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((_, j) => j !== i))} className="text-text-muted hover:text-text-primary">
            <X size={11} aria-hidden />
          </button>
        </span>
      ))}
      <input
        id="knowledge-tags" aria-label="Add a tag" placeholder="Add a tag" value={draft}
        onChange={e => setDraft(e.target.value)} onBlur={add}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
        className="min-w-[6rem] flex-1 bg-transparent text-body text-text-primary placeholder:text-text-muted focus:outline-none"
      />
    </div>
  )
}

export function PropertyRows({ rows, offered, onChange }: {
  rows: PropertyRow[]
  offered: { name: string; values: string[] }[]
  onChange: (rows: PropertyRow[]) => void
}) {
  const set = (i: number, patch: Partial<PropertyRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const unused = offered.filter(o => !rows.some(r => r.name === o.name))
  return (
    <div>
      {rows.map((row, i) => (
        <div key={i} className="mb-1.5 flex items-center gap-2">
          <input
            aria-label="Property name" list="knowledge-property-names" value={row.name} placeholder="name"
            onChange={e => set(i, { name: e.target.value })} className={`${INPUT} w-1/3`}
          />
          <input
            aria-label={`Value of ${row.name || 'property'}`} list={`knowledge-values-${i}`} value={row.value} placeholder="value"
            onChange={e => set(i, { value: e.target.value })} className={INPUT}
          />
          <datalist id={`knowledge-values-${i}`}>
            {(offered.find(o => o.name === row.name)?.values ?? []).map(v => <option key={v} value={v} />)}
          </datalist>
          <button type="button" aria-label={`Remove ${row.name || 'property'}`} onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-text-muted hover:text-text-primary">
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
      <datalist id="knowledge-property-names">{offered.map(o => <option key={o.name} value={o.name} />)}</datalist>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {unused.map(o => (
          <button
            key={o.name} type="button" onClick={() => onChange([...rows, { name: o.name, value: '', list: false }])}
            className="rounded-full border border-border-subtle px-2 py-0.5 text-small text-text-secondary hover:bg-surface-hover"
          >
            + {o.name}
          </button>
        ))}
        <button
          type="button" onClick={() => onChange([...rows, { name: '', value: '', list: false }])}
          className="rounded-full border border-border-subtle px-2 py-0.5 text-small text-text-secondary hover:bg-surface-hover"
        >
          Add property
        </button>
      </div>
    </div>
  )
}

/** The page's text in Markdown, written or previewed as it will read: `embed` is the saved page's place and folder. */
export function TextEditor({ value, onChange, problems, embed }: {
  value: string
  onChange: (v: string) => void
  problems?: string[]
  embed?: MarkdownEmbedContext
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const tabClass = (on: boolean) => `rounded-lg px-2.5 py-1 text-small ${on ? 'bg-surface-2 font-medium text-text-primary' : 'text-text-secondary hover:bg-surface-hover'}`
  return (
    <Field label="Text" problems={problems} htmlFor="knowledge-text">
      <div role="tablist" aria-label="Write or preview" className="mb-1.5 flex gap-1">
        <button type="button" role="tab" aria-selected={tab === 'write'} onClick={() => setTab('write')} className={tabClass(tab === 'write')}>Write</button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')} className={tabClass(tab === 'preview')}>Preview</button>
      </div>
      {tab === 'write' ? (
        <textarea
          id="knowledge-text" value={value} onChange={e => onChange(e.target.value)} rows={14}
          className={`${INPUT} font-mono text-small`} spellCheck
        />
      ) : (
        <div role="tabpanel" className="min-h-[8rem] rounded-lg border border-border-subtle bg-surface-1 px-3 py-2">
          {value.trim() === '' ? <p className="text-small text-text-muted">Nothing to preview yet.</p> : <MarkdownMessage content={value} embed={embed} />}
        </div>
      )}
    </Field>
  )
}
