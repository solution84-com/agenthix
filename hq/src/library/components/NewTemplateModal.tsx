import { useState, useRef } from 'react'
import { useAction } from 'wasp/client/operations'
import { createBoardTemplate } from 'wasp/client/operations'
import type { BoardTemplateColumn } from '../boardTemplateService'

const STATUS_OPTIONS = [
  { value: 'TODO', label: 'Todo' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
] as const

const PALETTE = [
  '#6b7280','#3b82f6','#f59e0b','#10b981',
  '#a855f7','#ef4444','#ec4899','#14b8a6',
]

const STATUS_CATEGORIES: Array<'TODO' | 'IN_PROGRESS' | 'DONE'> = ['TODO', 'IN_PROGRESS', 'DONE']

function makeColumn(order: number): BoardTemplateColumn {
  return { name: `column_${order}`, label: 'New Column', status: 'TODO', color: PALETTE[order % PALETTE.length], order, description: '' }
}

interface Props { onClose: () => void }

export function NewTemplateModal({ onClose }: Props) {
  const createTpl = useAction(createBoardTemplate)

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [columns, setColumns] = useState<BoardTemplateColumn[]>([
    { name: 'todo',        label: 'To Do',        status: 'TODO',        color: '#6b7280', order: 0, description: '' },
    { name: 'in_progress', label: 'In Progress',  status: 'IN_PROGRESS', color: '#3b82f6', order: 1, description: '' },
    { name: 'done',        label: 'Done',         status: 'DONE',        color: '#10b981', order: 2, description: '' },
  ])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = columns[selectedIdx]

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = '1px'
    const cs = getComputedStyle(el)
    const lineH = parseFloat(cs.lineHeight) || 20
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    const maxH = lineH * 3 + pad
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px'
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden'
  }

  function updateSelected(patch: Partial<BoardTemplateColumn>) {
    setColumns(prev => prev.map((s, i) => i === selectedIdx ? { ...s, ...patch } : s))
  }

  function addColumn() {
    const next = makeColumn(columns.length)
    setColumns(prev => [...prev, next])
    setSelectedIdx(columns.length)
  }

  function removeColumn(idx: number) {
    if (columns.length <= 1) return
    setColumns(prev => prev.filter((_, i) => i !== idx))
    setSelectedIdx(Math.min(idx, columns.length - 2))
  }

  const statusCoverage = STATUS_CATEGORIES.map(s => ({
    status: s,
    covered: columns.some(st => st.status === s),
  }))
  const isValid = statusCoverage.every(c => c.covered) && name.trim().length > 0

  async function save() {
    if (!isValid) return
    setSaving(true)
    setError(null)
    try {
      await createTpl({ name: name.trim(), description: desc.trim(), columns })
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm flex items-center justify-center">
      <div className="w-[780px] max-h-[88vh] bg-surface-1 border border-border rounded-2xl flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border-subtle">
          <div className="flex-1 flex gap-3">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Template name…"
              className="bg-transparent text-small font-semibold text-text-primary placeholder:text-text-muted outline-none w-[200px]"
            />
            <textarea
              value={desc}
              onChange={e => { setDesc(e.target.value); autoResize(e.target) }}
              placeholder="Brief description…"
              rows={1}
              className="bg-transparent text-small text-text-secondary placeholder:text-text-muted outline-none resize-none flex-1 leading-5"
              style={{ height: '20px', overflowY: 'hidden' }}
            />
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary ml-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — two panel */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: column list */}
          <div className="w-[220px] flex-shrink-0 border-r border-border-subtle flex flex-col">
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {columns.map((s, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedIdx(i)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group transition-colors ${
                    i === selectedIdx ? 'bg-surface-3' : 'hover:bg-surface-hover'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-small text-text-primary flex-1 truncate">{s.label}</span>
                  <span className={`text-micro px-1 py-0.5 rounded flex-shrink-0 ${
                    s.status === 'DONE' ? 'bg-success/10 text-success' :
                    s.status === 'IN_PROGRESS' ? 'bg-accent/10 text-accent' :
                    'bg-surface-2 text-text-muted'
                  }`}>
                    {s.status === 'IN_PROGRESS' ? 'WIP' : s.status === 'DONE' ? 'Done' : 'Todo'}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); removeColumn(i) }}
                    className="opacity-0 group-hover:opacity-100 text-text-muted/70 hover:text-danger ml-1 transition-all"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-border-subtle">
              <button
                onClick={addColumn}
                className="w-full text-micro text-text-muted hover:text-text-secondary py-2 rounded-lg border border-dashed border-border hover:border-border transition-colors"
              >
                + Add Column
              </button>
            </div>
          </div>

          {/* Right: column detail */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {selected ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-micro font-medium text-text-muted uppercase tracking-wide">Column Label</label>
                  <input
                    value={selected.label}
                    onChange={e => updateSelected({ label: e.target.value, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-small text-text-primary outline-none focus:border-success/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-micro font-medium text-text-muted uppercase tracking-wide">Status Category</label>
                  <select
                    value={selected.status}
                    onChange={e => updateSelected({ status: e.target.value as any })}
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-small text-text-primary outline-none focus:border-success/50"
                  >
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-micro font-medium text-text-muted uppercase tracking-wide">Color</label>
                  <div className="flex gap-2">
                    {PALETTE.map(c => (
                      <button
                        key={c}
                        onClick={() => updateSelected({ color: c })}
                        className={`w-6 h-6 rounded-full transition-transform ${selected.color === c ? 'scale-125 ring-2 ring-border' : 'hover:scale-110'}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-micro font-medium text-text-muted uppercase tracking-wide">Description <span className="normal-case text-text-muted">(agent-readable)</span></label>
                  <textarea
                    value={selected.description}
                    onChange={e => { updateSelected({ description: e.target.value }); autoResize(e.target) }}
                    onFocus={e => autoResize(e.target)}
                    placeholder="Describe what work belongs in this column…"
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-small text-text-primary placeholder:text-text-muted outline-none focus:border-success/50 resize-none leading-relaxed"
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-micro font-medium text-text-muted uppercase tracking-wide">Transition Hint <span className="normal-case text-text-muted">(optional)</span></label>
                  <textarea
                    value={selected.hint ?? ''}
                    onChange={e => { updateSelected({ hint: e.target.value || undefined }); autoResize(e.target) }}
                    onFocus={e => autoResize(e.target)}
                    placeholder="Move here when…"
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-small text-text-primary placeholder:text-text-muted outline-none focus:border-success/50 resize-none leading-relaxed"
                    rows={1}
                  />
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.autoQueue ?? false}
                    onChange={e => updateSelected({ autoQueue: e.target.checked })}
                    className="accent-emerald-500"
                  />
                  <span className="text-small text-text-secondary">Auto-queue agent when task enters this column</span>
                </label>
              </>
            ) : (
              <p className="text-small text-text-muted">Select a column to edit</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle">
          <div className="flex gap-3">
            {statusCoverage.map(c => (
              <span key={c.status} className={`flex items-center gap-1.5 text-micro font-medium ${c.covered ? 'text-success' : 'text-danger'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${c.covered ? 'bg-success' : 'bg-danger'}`} />
                {c.status === 'IN_PROGRESS' ? 'In Progress' : c.status === 'TODO' ? 'Todo' : 'Done'}
              </span>
            ))}
          </div>
          {error && <p className="text-micro text-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-small text-text-muted hover:text-text-secondary border border-border rounded-lg">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!isValid || saving}
              className="px-4 py-2 text-small font-semibold bg-success text-on-accent rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-success transition-colors"
            >
              {saving ? 'Saving…' : 'Create Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
