import { useState, type ReactNode } from 'react'
import { TASK_BUTTON, TASK_BUTTON_PRIMARY } from '../tasks/TasksToolParts'
import type { BoardTemplateOption, NewBoardInput } from './types'

function Choice({ chosen, title, children, onPick }: { chosen: boolean; title: string; children?: ReactNode; onPick: () => void }) {
  return (
    <button
      type="button" role="radio" aria-checked={chosen} onClick={onPick}
      className={`rounded-xl border p-2.5 text-left text-small ${chosen ? 'border-accent bg-accent/10' : 'border-border hover:border-accent'}`}
    >
      <b className="block text-text-primary">{title}</b>
      <span className="text-text-secondary">{children}</span>
    </button>
  )
}

const LABEL = 'pb-1 pt-3 text-micro font-medium uppercase tracking-wide text-text-muted'

/** New board, in place (every screen reviewed spec §3): a name, Workflow or Sprints, and columns from a template. */
export function NewBoardForm({ templates, renderTemplateDetail, onCreate, onCancel }: {
  templates: BoardTemplateOption[]
  /** What a template's card says under its name, for example its columns. */
  renderTemplateDetail?: (template: BoardTemplateOption) => ReactNode
  onCreate: (input: NewBoardInput) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<NewBoardInput['kind']>('WORKFLOW')
  const [templateId, setTemplateId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const create = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await onCreate({ name: name.trim(), kind, templateId })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work')
      setBusy(false)
    }
  }
  return (
    <form className="px-4 pb-6" onSubmit={e => { e.preventDefault(); void create() }}>
      <p className={LABEL}>Name</p>
      <input
        autoFocus value={name} aria-label="Board name" placeholder="Bugs" onChange={e => setName(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-body text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <p className={LABEL}>Kind</p>
      <div role="radiogroup" aria-label="Kind" className="grid grid-cols-2 gap-2">
        <Choice chosen={kind === 'WORKFLOW'} title="Workflow" onPick={() => setKind('WORKFLOW')}>Columns tasks move through</Choice>
        <Choice chosen={kind === 'SPRINTS'} title="Sprints" onPick={() => setKind('SPRINTS')}>Columns, and two-week sprints planned from its backlog</Choice>
      </div>
      <p className={LABEL}>Columns from</p>
      <div role="radiogroup" aria-label="Columns from" className="grid gap-2 @md:grid-cols-2">
        {templates.map(t => (
          <Choice key={t.id} chosen={templateId === t.id} title={t.name} onPick={() => setTemplateId(t.id)}>
            {renderTemplateDetail?.(t) ?? t.description ?? ''}
          </Choice>
        ))}
        <Choice chosen={templateId === ''} title="Your own" onPick={() => setTemplateId('')}>To do · In progress · Done, edit after</Choice>
      </div>
      <div className="flex gap-2 pt-4">
        <button type="submit" className={TASK_BUTTON_PRIMARY} disabled={!name.trim() || busy}>{busy ? 'Creating…' : 'Create'}</button>
        <button type="button" className={TASK_BUTTON} onClick={onCancel}>Cancel</button>
      </div>
      {error && <p role="alert" className="pt-2 text-small text-danger">{error}</p>}
    </form>
  )
}
