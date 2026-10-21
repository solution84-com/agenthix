import { useState, type ReactNode } from 'react'
import { ToolStateToggle, SetAllControl } from '../tabs/ToolStateToggle'
import { offeredStates, type DraftPattern, type DraftTool } from './permissionsModel'
import { toolLabel } from './toolLabels'
import type { ToolState } from './permissionsTypes'

const STATE_WORD: Record<ToolState, string> = { always: 'Always', ask: 'Ask', never: 'Never' }
const GROUP_HEADING = 'flex items-center justify-between border-b border-border-subtle pb-1 pt-4 text-small font-medium text-text-secondary'

/** A line under a tool or pattern, below the organisation: what the organisation set, and whether this level narrows it. */
function OrganisationNote({ limit, bypassed, narrowed }: { limit: ToolState; bypassed: boolean; narrowed: boolean }) {
  return (
    <small className="block text-micro text-text-muted">
      Organisation: {bypassed ? 'Bypassed' : STATE_WORD[limit]}
      {narrowed && <> · <b className="font-medium text-accent">narrowed</b></>}
    </small>
  )
}

export function Row({ title, hint, mono, note, state, limit, readOnly, onChange, onRemove }: {
  title: string
  hint?: string
  mono?: boolean
  note?: ReactNode
  state: ToolState
  limit: ToolState
  readOnly: boolean
  onChange: (next: ToolState) => void
  onRemove?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className={`block truncate text-body text-text-primary ${mono ? 'font-mono text-small' : ''}`}>{title}</span>
        {hint && <small className="block text-micro text-text-muted">{hint}</small>}
        {note}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <ToolStateToggle state={state} offered={offeredStates(limit)} disabled={readOnly} onChange={onChange} label={title} />
        {onRemove && !readOnly && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${title}`} className="rounded px-1 text-text-muted hover:text-danger">×</button>
        )}
      </span>
    </div>
  )
}

export function ToolRow({ tool, narrowing, bypassed, readOnly, onChange }: {
  tool: DraftTool
  narrowing: boolean
  bypassed: boolean
  readOnly: boolean
  onChange: (next: ToolState) => void
}) {
  const { label, hint } = toolLabel(tool.name)
  const narrowed = narrowing && tool.state !== tool.limit
  return (
    <Row
      title={label} hint={hint} state={tool.state} limit={tool.limit} readOnly={readOnly} onChange={onChange}
      note={narrowing && <OrganisationNote limit={tool.limit} bypassed={bypassed} narrowed={narrowed} />}
    />
  )
}

export function PatternRow({ pattern, narrowing, readOnly, onChange, onRemove }: {
  pattern: DraftPattern
  narrowing: boolean
  readOnly: boolean
  onChange: (next: ToolState) => void
  onRemove: () => void
}) {
  const narrowed = narrowing && pattern.state !== pattern.limit
  return (
    <Row
      title={pattern.pattern} mono state={pattern.state} limit={pattern.limit} readOnly={readOnly} onChange={onChange}
      onRemove={!narrowing || pattern.added ? onRemove : undefined}
      note={narrowing && !pattern.added && <OrganisationNote limit={pattern.limit} bypassed={false} narrowed={narrowed} />}
    />
  )
}

export function GroupHeading({ title, right, onSetAll }: { title: string; right?: string; onSetAll?: (s: ToolState) => void }) {
  return (
    <div className={GROUP_HEADING}>
      <span>{title}</span>
      <span className="flex items-center gap-3 text-small font-normal text-text-muted">
        {right}
        {onSetAll && <SetAllControl onSetAll={onSetAll} />}
      </span>
    </div>
  )
}

/** "＋ Add a command pattern" (organisation) or "＋ Block a command here" (narrower): a pattern, matched by prefix. */
export function AddPattern({ label, onAdd }: { label: string; onAdd: (pattern: string) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="mt-1 rounded text-small text-accent hover:underline">{label}</button>
  }
  const add = () => {
    if (!text.trim()) return
    onAdd(text)
    setText('')
    setOpen(false)
  }
  return (
    <div className="mt-1 space-y-1">
      <div className="flex gap-2">
        <input
          autoFocus value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          aria-label="Command pattern" placeholder="e.g. git  or  npm run"
          className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-1 px-3 py-1.5 font-mono text-small text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <button type="button" onClick={add} disabled={!text.trim()} className="rounded-lg border border-border bg-surface-1 px-3 py-1 text-small font-medium text-text-primary hover:bg-surface-hover disabled:opacity-40">Add</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 text-small text-text-muted hover:text-text-primary">Cancel</button>
      </div>
      <p className="text-micro text-text-muted">A command that starts with it. A command no pattern matches follows Any other command.</p>
    </div>
  )
}
